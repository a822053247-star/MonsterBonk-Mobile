import { test, expect } from '@playwright/test';
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { resolveFusions, FUSION_RECIPES, ELEMENTAL_RULES } from '../src/fusion';
import { emptyRanks, type SkillId } from '../src/progression';

const origin={x:0,z:0};
function fixture(species:SpeciesId,enabled=true,obstacles:{x:number;z:number;radius:number}[]=[]) {
  const rolls:number[]=[],c=new Combat(obstacles,32,()=>rolls.shift()??.999);
  c.party=new PartySystem();c.party.reset([species]);c.fusionEnabled=enabled;c.reset();
  function learn(id:SkillId){const p=c.progression,candidates=p.skills.filter(s=>p.ranks[s.id]<s.maxRank),index=candidates.findIndex(s=>s.id===id);expect(index).toBeGreaterThanOrEqual(0);
    for(let i=candidates.length-1;i>0;i--)rolls.push(((i===index?0:i)+.1)/(i+1));p.gainExperience(p.threshold-p.experience);expect(p.offers).toContain(id);expect(c.chooseUpgrade(id)).toBe(true);}
  function fire(){const target=c.spawn('tank',5,0,0)!;c.update(.001,origin);const shot=c.projectiles.find(s=>s.active)!;expect(shot).toBeTruthy();c.party!.leader.attackCooldown=999;return {target,shot};}
  function impact(shot:typeof c.projectiles[number],target:typeof c.enemies[number]){Object.assign(shot,{x:target.x,z:target.z,previousX:target.x,previousZ:target.z});c.update(.001,origin);}
  return {c,learn,fire,impact};
}

test('only four new recipes exist, modifiers form independent water/grass fusions and do not leak to legacy pools',()=>{
  expect(FUSION_RECIPES.map(f=>f.id)).toEqual(['burst-seed','deep-bubble','chain-bubble','thorn-scatter','jump-thorn']);
  const ranks={...emptyRanks(),area:1,chain:1,'split-on-hit':1};
  expect(resolveFusions('bubble',ranks).map(f=>f.id)).toEqual(['deep-bubble','chain-bubble']);
  expect(resolveFusions('leaf',ranks).map(f=>f.id)).toEqual(['thorn-scatter','jump-thorn']);
  expect(resolveFusions('spark',ranks).map(f=>f.id)).toEqual(['burst-seed']);
  for(const species of ['bubblesalamander','sproutspike'] as const){const {c}=fixture(species,false);expect(c.progression.skills).toHaveLength(8);expect(c.fusions).toEqual([]);}
});

test('base water slow expires, refreshes without stacking, and legacy bubbles do not acquire it',()=>{
  const f=fixture('bubblesalamander'),{target,shot}=f.fire();f.impact(shot,target);expect(target.hp).toBe(85);expect(target.slowTime).toBe(ELEMENTAL_RULES.slowDuration);
  target.knockX=target.knockZ=0;const x=target.x;f.c.update(.1,origin);expect(x-target.x).toBeCloseTo(.75*.55*.1);
  target.knockX=target.knockZ=0;f.c.update(1.5,origin);expect(target.slowTime).toBe(0);
  const legacy=fixture('bubblesalamander',false),e=legacy.fire();legacy.impact(e.shot,e.target);expect(e.target.slowTime).toBe(0);
});

test('deep bubble damages and slows neighbors once per impact, excludes the direct victim and spawned enemies',()=>{
  const f=fixture('bubblesalamander');f.learn('area');const {target,shot}=f.fire(),neighbor=f.c.spawn('tank',5,2,0)!,warning=f.c.spawn('tank',5,-2,1)!;
  f.impact(shot,target);expect(target.hp).toBe(85);expect(neighbor.hp).toBe(94);expect(warning.hp).toBe(100);expect(neighbor.slowTime).toBe(1.5);
  expect(f.c.effects.some(e=>e.active&&e.kind==='water'&&e.radius===2.2)).toBe(true);
  f.c.update(.01,origin);expect(neighbor.hp).toBe(94);
});

test('leaf sweep pierces one additional enemy in the same tick, never hits the same victim twice',()=>{
  const f=fixture('sproutspike'),{target,shot}=f.fire(),second=f.c.spawn('tank',7,0,0)!,third=f.c.spawn('tank',10,0,0)!;
  Object.assign(shot,{x:2,z:0,vx:18,vz:0,life:1});f.c.update(.5,origin);
  expect(target.hp).toBe(84);expect(second.hp).toBe(84);expect(third.hp).toBe(100);expect(shot.active).toBe(false);
  expect(shot.hitIds).toEqual([target.id,second.id]);
});

for(const species of ['bubblesalamander','sproutspike'] as const)test(species+' chain physically flies to two fresh targets, respects cap and decays damage',()=>{
  const f=fixture(species);f.learn('chain');const {target,shot}=f.fire(),second=f.c.spawn('tank',8,2,0)!,third=f.c.spawn('tank',9,-2,0)!;
  f.impact(shot,target);expect(shot.active).toBe(true);expect(shot.bounces).toBe(1);expect(shot.hitIds).toEqual([target.id]);
  const initialDamage=species==='bubblesalamander'?15:16;
  expect(shot.damage).toBeCloseTo(initialDamage*.8);
  for(let i=0;i<80&&shot.active;i++)f.c.update(.01,origin);
  expect(shot.hitIds).toEqual([target.id,second.id,third.id]);expect(shot.bounces).toBe(0);expect(shot.active).toBe(false);
  expect(second.hp).toBeCloseTo(100-initialDamage*.8);expect(third.hp).toBeCloseTo(100-initialDamage*.64);
});

test('scatter spawns three weaker children next tick, ignores original and never recursively splits',()=>{
  const f=fixture('sproutspike');f.learn('split-on-hit');const {target,shot}=f.fire();f.impact(shot,target);
  const children=f.c.projectiles.filter(s=>s.active&&s.generation===1);expect(children).toHaveLength(3);
  for(const child of children){expect(child.age).toBe(0);expect(child.damage).toBeCloseTo(6.4);expect(child.ignoreEnemyId).toBe(target.id);expect(child.scatter).toBe(false);expect(child.bounces).toBe(0);}
  const next=f.c.spawn('tank',9,3,0)!;for(const child of children)Object.assign(child,{x:next.x,z:next.z});f.c.update(.001,origin);
  expect(f.c.childShots).toBe(3);expect(next.hp).toBeCloseTo(80.8);expect(target.hp).toBe(84);
});

test('both water recipes share one impact AoE; grass split and chain coexist without child recursion',()=>{
  const water=fixture('bubblesalamander');water.learn('area');water.learn('chain');const w=water.fire(),near=water.c.spawn('tank',5,2,0)!;water.impact(w.shot,w.target);expect(near.hp).toBe(94);expect(w.shot.bounces).toBe(1);
  const grass=fixture('sproutspike');grass.learn('split-on-hit');grass.learn('chain');const g=grass.fire();grass.c.spawn('tank',8,2,0);grass.impact(g.shot,g.target);expect(grass.c.childShots).toBe(3);expect(g.shot.bounces).toBe(1);expect(g.shot.scatter).toBe(false);
});

test('cover blocks elemental impacts and chain targets; full pools degrade safely without dropping direct damage',()=>{
  const blocked=fixture('sproutspike',true,[{x:7,z:0,radius:.8}]);blocked.learn('chain');const b=blocked.fire();blocked.c.spawn('tank',9,0,0);blocked.impact(b.shot,b.target);expect(b.shot.bounces).toBe(2);
  const f=fixture('sproutspike');f.learn('split-on-hit');const {target,shot}=f.fire();for(const s of f.c.projectiles)if(s!==shot)Object.assign(s,{active:true,life:10,bornTick:0,generation:0,x:-25,z:0,vx:0,vz:0});
  for(const e of f.c.effects)Object.assign(e,{active:true,time:10,duration:10});f.impact(shot,target);expect(target.hp).toBe(84);expect(f.c.childShots).toBe(0);expect(f.c.projectiles.length).toBe(COMBAT_LIMITS.projectiles);
});

test('death, choice and zero time freeze elemental clocks; reset clears slow, recipes, hits and projectiles',()=>{
  const f=fixture('bubblesalamander');f.learn('chain');const {target,shot}=f.fire();f.c.spawn('tank',8,2,0);f.impact(shot,target);
  const snapshot=()=>JSON.stringify([f.c.projectiles,f.c.enemies,f.c.effects]);
  let before=snapshot();f.c.update(0,origin);expect(snapshot()).toBe(before);
  f.c.progression.gainExperience(f.c.progression.threshold);before=snapshot();f.c.update(.5,origin);expect(snapshot()).toBe(before);
  f.c.hp=0;f.c.update(.5,origin);expect(snapshot()).toBe(before);
  f.c.reset();expect(f.c.fusions).toEqual([]);expect(f.c.projectiles.some(s=>s.active)).toBe(false);expect(f.c.spawn('tank',5,0,0)!.slowTime).toBe(0);
});

test('elemental deaths use the shared kill and XP path exactly once and snapshots do not change in flight',()=>{
 const f=fixture('bubblesalamander');f.learn('area');const {target,shot}=f.fire(),neighbor=f.c.spawn('tank',5,2,0)!;target.hp=15;neighbor.hp=6;
 f.impact(shot,target);expect(f.c.kills).toBe(2);expect(f.c.orbs.filter(o=>o.active).reduce((n,o)=>n+o.value,0)).toBe(16);f.c.update(.01,origin);expect(f.c.kills).toBe(2);
 const plain=fixture('bubblesalamander'),p=plain.fire();plain.learn('area');plain.impact(p.shot,p.target);expect(plain.c.effects.some(e=>e.active&&e.kind==='water'&&e.radius===2.2)).toBe(false);
});
