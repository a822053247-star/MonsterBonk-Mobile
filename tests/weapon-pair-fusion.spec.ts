import {test,expect} from '@playwright/test';
import {Combat,COMBAT_LIMITS,type Enemy} from '../src/combat';
import {PartySystem} from '../src/party';
import {RunBuild} from '../src/run-build';
import {PAIR_IDS,pairSources,pairLevel,WEAPON_PAIR_RECIPES,type WeaponPairId} from '../src/weapon-pair-fusion';
import {mkdirSync,writeFileSync} from 'node:fs';

const origin={x:0,z:0};
function fixture(id:WeaponPairId,fused=true){
 let seed=31;const c=new Combat([],32.3,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
 c.party=new PartySystem();c.fusionEnabled=true;c.reset();c.automaticSpawning=false;c.encounters.enabled=false;c.useNavigation=false;c.invulnerability=10000;
 const b=c.runBuild;b.reset(pairSources(id)[0]==='bubble'?'bubblesalamander':'yanrong');
 b.acquire(pairSources(id)[1]);for(const a of b.attacks)a.level=3;
 if(fused)expect(b.fusePair(id)).toBe(true);
 const internals=c as any;internals.moveEnemy=()=>{};
 return {c,b,internals};
}
function enemy(c:Combat,x:number,z=0){const e=c.spawn('tank',x,z,0)!;e.hp=100000;return e;}
function fire(c:Combat,e:Enemy){
 const a=c.runBuild.attacks[0],rules=c.runBuild.rules(a.attackId);
 expect((c as any).fireBolts(origin,e,100,1,10.5,0,'yanrong',a.attackId,{index:0,rules,fusions:[]})).toBe(true);
 const shot=c.projectiles.find(p=>p.active)!;
 for(const attack of c.runBuild.attacks)attack.cooldown=10000;
 return shot;
}
function step(c:Combat,time:number){for(let i=0;i<Math.round(time*120);i++)c.update(1/120,origin);}

test('unlock, formula, atomic replacement, free slot and untouched third weapon',()=>{
 for(const id of PAIR_IDS){
  const {b}=fixture(id,false);b.attacks[0].level=2;expect(b.availablePairs()).not.toContain(id);expect(b.fusePair(id)).toBe(false);
  b.attacks[0].level=3;b.acquire('flame-sweep');const third=b.attacks[2];third.cooldown=.37;third.shotsFired=17;
  b.skillRanks={'split-on-hit':1,chain:1};b.addRelic('hunter-eye');const ranks=b.skillRanks;
  expect(b.fusePair(id)).toBe(true);expect(b.attacks).toHaveLength(2);expect(b.attacks[0]).toMatchObject({slot:0,level:3,pairId:id});
  expect(b.attacks[1]).toBe(third);expect(third).toMatchObject({cooldown:.37,shotsFired:17});expect(b.skillRanks).toBe(ranks);expect(b.relics).toContain('hunter-eye');
  expect(b.fusePair(id)).toBe(false);for(const source of pairSources(id)){expect(b.acquire(source)).toBe(false);expect(b.hasOrigin(source)).toBe(true);}
 }
 for(const [a,b,result] of [[3,3,3],[3,4,4],[4,4,5],[5,5,5]])expect(pairLevel(a,b)).toBe(result);
 const build=new RunBuild();build.reset('yanrong');build.acquire('bubble');build.acquire('leaf');build.attacks[1].level=build.attacks[2].level=3;
 expect(build.fusePair('bramble-tide')).toBe(true);expect(build.acquire('flame-sweep')).toBe(true);expect(build.attacks.find(a=>a.attackId==='flame-sweep')!.slot).toBe(2);
});

for(const id of PAIR_IDS){
 test(`${id}: real projectile, bounded direct hits, configured area/control and refreshable burn`,()=>{
  const {c,b}=fixture(id);const a=enemy(c,3),near=enemy(c,3,.9),far=enemy(c,3,4);const shot=fire(c,a);
  step(c,.2);expect(a.hp).toBeCloseTo(99900);expect(far.hp).toBe(100000);
  const recipe=WEAPON_PAIR_RECIPES[id];
  if(recipe.radius){expect(near.hp).toBeCloseTo(100000-100*recipe.splash);expect(a.pairSlowFactor).toBe(recipe.slow);expect(near.pairSlowUntil).toBeGreaterThan(c.elapsed);}
  if(recipe.burnDuration){
   expect(a.pairBurnTime).toBeGreaterThan(1);const oldDamage=a.pairBurnDamage;const before=a.hp;
   (c as any).pairHit(shot,a,a.x,a.z);expect(a.pairBurnTime).toBe(1.2);expect(a.pairBurnDamage).toBe(oldDamage);
   step(c,1.25);expect(before-a.hp).toBeCloseTo(30);expect(a.pairBurnTime).toBe(0);
  }
  const interval=b.rules(b.attacks[0].attackId).intervalMultiplier;b.upgrade(b.attacks[0].attackId);expect(b.rules(b.attacks[0].attackId).intervalMultiplier).toBe(interval);
 });
 test(`${id}: acquired skills, lineage relics, no recursive children, bounded pool`,()=>{
  const {c,b}=fixture(id);for(const key of ['damage','haste','range','multishot','area','chain','split-on-hit'] as const){c.progression.ranks[key]=1;}
  b.addRelic('hunter-eye');b.addRelic('shattered-core');b.addRelic('tidal-pearl');
  expect(b.capabilities(b.attacks[0].attackId).origins).toEqual(expect.arrayContaining([...pairSources(id)]));
  const a=enemy(c,3);enemy(c,3,.9);enemy(c,5,0);enemy(c,6,0);fire(c,a);step(c,.65);
  expect(c.projectiles.length).toBe(COMBAT_LIMITS.projectiles);
  expect(c.projectiles.every(p=>(p.generation??0)<=1)).toBe(true);expect(c.childShots).toBeLessThanOrEqual(6);
  expect(c.progression.skills.some(s=>pairSources(id).some(source=>s.id===`${source}-weapon`))).toBe(false);
  expect(c.progression.skills.some(s=>s.id===`${id}-weapon`)).toBe(true);
  if(id==='bramble-tide')expect(c.projectiles.filter(p=>p.active&&p.hopTargetId)).toHaveLength(0);
  for(const p of c.projectiles)p.active=true;expect((c as any).fireBolts(origin,a,100,1,10.5)).toBe(false);
 });
}

test('blazing-thorn pierces at most three victims; acquired chain replaces straight piercing',()=>{
 for(const chain of [false,true]){const {c}=fixture('blazing-thorn');if(chain)c.progression.ranks.chain=1;
  const targets=[2,3,4,5,6].map(x=>enemy(c,x));fire(c,targets[0]);step(c,.7);
  expect(targets.filter(e=>e.hp<100000)).toHaveLength(3);
 }
});

test('fusion offer is guaranteed and cancel/normal reward preserves weapons; confirm consumes one choice',()=>{
 const {c,b}=fixture('steam-comet',false),p=c.progression;p.gainExperience(p.threshold);
 expect(p.offers).toContain('weapon-pair-fusion');expect(p.pick('weapon-pair-fusion')).toBe(false);expect(b.attacks).toHaveLength(2);
 expect(c.confirmWeaponPair('steam-comet')).toBe(true);expect(p.pendingChoices).toBe(0);expect(p.ranks['steam-comet-weapon']).toBe(3);expect(c.confirmWeaponPair('steam-comet')).toBe(false);
 const declined=fixture('steam-comet',false);declined.c.progression.gainExperience(8);const ordinary=declined.c.progression.offers.find(id=>id!=='weapon-pair-fusion')!;
 expect(declined.c.chooseUpgrade(ordinary)).toBe(true);expect(declined.b.attacks.every(a=>!a.pairId)).toBe(true);
 c.reset();expect(b.attacks.some(a=>a.pairId)).toBe(false);
 const old=new Combat();old.reset('horn-trial');expect(old.progression.skills.some(s=>s.id==='weapon-pair-fusion')).toBe(false);
});

test('fixed seed 31: ten second single/group damage comparison without changing base weapons',()=>{
 const rows=[];
 for(const id of PAIR_IDS)for(const group of [false,true]){
  const values=[];
  for(const fused of [false,true]){const {c,internals}=fixture(id,fused);let damage=0;const original=internals.damageEnemy.bind(c);
   internals.damageEnemy=(e:Enemy,d:number,...args:any[])=>{if(e.active)damage+=Math.min(e.hp,d);return original(e,d,...args);};
   enemy(c,5);if(group){enemy(c,5,.9);enemy(c,5,-.9);enemy(c,6,0);enemy(c,7,0);}
   step(c,10);values.push(Number(damage.toFixed(2)));expect(damage).toBeGreaterThan(0);
  }
  rows.push({id,scenario:group?'group-5':'single',before:values[0],after:values[1],ratio:Number((values[1]/values[0]).toFixed(3))});
 }
 mkdirSync('artifacts/weapon-pair-fusion',{recursive:true});writeFileSync('artifacts/weapon-pair-fusion/damage-comparison.json',JSON.stringify({seed:31,seconds:10,hz:120,level:3,rows},null,2));
 console.log(JSON.stringify(rows));
 expect(rows.find(r=>r.id==='steam-comet'&&r.scenario==='single')!.ratio).toBeGreaterThan(.8);
 expect(rows.find(r=>r.id==='steam-comet'&&r.scenario==='group-5')!.ratio).toBeGreaterThan(1);
});

test('real upgrades affect pair damage, haste, volley, range and area; levels do not change interval/radius',()=>{
 const {c,b}=fixture('steam-comet');const a=b.attacks[0],before=b.rules(a.attackId);
 for(const id of ['damage','haste','range','multishot','area'] as const)expect(c.grantUpgrade(id)).toBe(true);
 expect(c.stats.damageMultiplier).toBe(1.2);expect(c.stats.attackRateMultiplier).toBe(1.15);expect(c.stats.projectileCount).toBe(2);expect(c.stats.rangeMultiplier).toBe(1.15);
 b.upgrade(a.attackId);b.upgrade(a.attackId);const after=b.rules(a.attackId);expect(after.damageMultiplier).toBeGreaterThan(before.damageMultiplier);expect(after.intervalMultiplier).toBe(before.intervalMultiplier);expect(after.areaMultiplier).toBe(before.areaMultiplier);
 a.cooldown=0;const target=enemy(c,3);step(c,.08);expect(c.projectiles.filter(p=>p.active&&p.attackRules?.pairId==='steam-comet').length).toBe(2);
 expect(c.projectiles.find(p=>p.active)!.damage).toBeCloseTo(46*1.34*1.2);expect(target.hp).toBe(100000);
});

test('source-specific fire/water/leaf relic events survive fusion; explosion adapter fires once',()=>{
 for(const id of PAIR_IDS){const {c,b}=fixture(id);const e=enemy(c,3);enemy(c,3,.8);enemy(c,3,-.8);enemy(c,3,1.1);
  for(const relic of ['draft-kindling-flask','draft-thorn-testament','draft-bubble-spore','venom-insignia','ember-sigil','resonant-aftershock'] as const)b.addRelic(relic);
  fire(c,e);step(c,.2);
  if(pairSources(id).includes('spark'))expect(e.burnTime).toBeGreaterThan(0);
  if(pairSources(id).includes('bubble'))expect(e.wetTime).toBeGreaterThan(0);
  if(pairSources(id).includes('leaf'))expect(e.venomUntil).toBeGreaterThan(c.elapsed);
  if(id==='steam-comet'){step(c,.2);expect(c.effects.some(e=>e.active&&e.vfxPresetId==='resonant-aftershock')).toBe(true);}
  const source=(c as any).newRelicSource(b.attacks[0].attackId,b.rules(b.attacks[0].attackId),100);
  const victim=enemy(c,5);victim.hp=1;(c as any).damageEnemy(victim,100,0,0,'player',source);step(c,.1);
  expect(c.projectiles.length).toBe(COMBAT_LIMITS.projectiles);
  if(pairSources(id).includes('leaf'))expect(c.projectiles.some(p=>p.relicSource?.kind==='testament')).toBe(true);
  if(pairSources(id).includes('bubble'))expect(c.projectiles.some(p=>p.relicSource?.kind==='bubble-spore')).toBe(true);
 }
});

test('fusion preserves evolution/XP/coins and reversed source order; death cancels active statuses and copies',()=>{
 const {c,b}=fixture('steam-comet',false);b.reset('bubblesalamander');b.acquire('spark');for(const a of b.attacks)a.level=3;
 c.progression.ranks['split-on-hit']=1;expect(b.evolve('pursuit-route')).toBe(true);b.addRelic('draft-echo-bone-dice');c.goldEarned=37;
 c.progression.gainExperience(8);const xp=c.xp;expect(c.confirmWeaponPair('steam-comet')).toBe(true);expect(c.xp).toBe(xp);expect(c.goldEarned).toBe(37);expect(b.evolution).toBe('pursuit-route');expect(b.attacks[0].attackId).toBe('bubble');
 const e=enemy(c,3);fire(c,e);step(c,.2);expect(e.pairSlowUntil).toBeGreaterThan(c.elapsed);
 c.invulnerability=0;c.hitPlayer(10000);expect(c.hp).toBe(0);expect(c.projectiles.filter(p=>p.active&&p.attackRules?.pairId)).toHaveLength(0);expect(e.pairSlowUntil).toBe(0);
 c.reset();expect(b.attacks.some(a=>a.pairId)).toBe(false);expect(b.evolution).toBeUndefined();
});

test('copied pair attacks retain inherent area but cannot split or re-trigger relics',()=>{
 const {c,b}=fixture('steam-comet');c.progression.ranks['split-on-hit']=1;b.addRelic('draft-echo-bone-dice');
 const target=enemy(c,3),other=enemy(c,3,.8),attack=b.attacks[0];
 expect((c as any).fireBolts(origin,target,50,1,10.5,0,'yanrong',attack.attackId,{index:0,rules:b.rules(attack.attackId),fusions:[],copied:true})).toBe(true);
 for(const a of b.attacks)a.cooldown=10000;step(c,.2);
 expect(target.hp).toBeCloseTo(99950);expect(other.hp).toBeCloseTo(100000-22.5);expect(c.childShots).toBe(0);expect(c.relicTelemetry.echoes).toBe(0);
});

test('in-flight pair skill snapshots and unrelated ongoing salvos survive optional fusion',()=>{
 const f=fixture('steam-comet');const target=enemy(f.c,3),other=enemy(f.c,3,2.35);fire(f.c,target);f.c.progression.ranks.area=1;f.c.progression.ranks['split-on-hit']=1;step(f.c,.2);
 expect(other.hp).toBe(100000);expect(f.c.childShots).toBe(0);
 const {c,b,internals}=fixture('steam-comet',false);b.acquire('leaf');const third=b.attacks[2];third.cooldown=.42;
 const salvo={attackId:'leaf',index:1,total:3};internals.salvo=salvo;c.progression.gainExperience(8);
 expect(c.confirmWeaponPair('steam-comet')).toBe(true);expect(internals.salvo).toBe(salvo);expect(third.cooldown).toBe(.42);
});
