import {test,expect} from '@playwright/test';
import {Combat} from '../src/combat';
import {PartySystem} from '../src/party';
import {COLORED_BARRAGE_IDS,COLORED_BARRAGES,COLORED_BARRAGE_LIMITS,coloredBarrageStats} from '../src/colored-barrage';
import {TREASURE_ROLL_SKILLS,upgradePreview} from '../src/progression';

function fixture(){
  const c=new Combat([],100,()=>.5);c.party=new PartySystem();c.party.reset(['yanrong']);c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  c.captureSpawnRoll=()=>false;for(const attack of c.runBuild.attacks)attack.cooldown=10000;return c;
}
function advance(c:Combat,seconds:number){for(let t=0;t<seconds-1e-8;t+=1/60)c.coloredBarrages.update(Math.min(1/60,seconds-t),{},1);}
function target(c:Combat,x:number,z:number,hp=1000){const e=c.spawn('tank',x,z,0);e.hp=hp;e.spawnTime=0;return e;}

test('four independent three-rank skills enter formal rewards and retain weapon slots',()=>{
  const c=fixture(),slots=c.runBuild.attacks.length;
  for(const id of COLORED_BARRAGE_IDS){
    const skill=c.progression.skills.find(s=>s.id===id)!;expect(skill).toBeTruthy();expect(skill.maxRank).toBe(3);
    expect(TREASURE_ROLL_SKILLS.some(s=>s.id===id)).toBe(true);
    for(let rank=1;rank<=3;rank++){
      expect(upgradePreview(skill,c.progression.ranks,true)).toContain(`${coloredBarrageStats(id,rank).count}枚`);
      expect(c.grantUpgrade(id)).toBe(true);expect(c.progression.ranks[id]).toBe(rank);
    }
    expect(c.grantUpgrade(id)).toBe(false);
  }
  expect(c.runBuild.attacks.length).toBe(slots);
  expect(new Combat().progression.skills.some(s=>COLORED_BARRAGE_IDS.includes(s.id as any))).toBe(false);
});

test('all four coexist with staggered starts, bounded cadence and no missed-cooldown barrage after a hold',()=>{
  const c=fixture(),ranks=Object.fromEntries(COLORED_BARRAGE_IDS.map(id=>[id,3]));
  const launches:{time:number;id:string}[]=[];
  for(let tick=0;tick<1800;tick++){
    const before=c.coloredBarrages.telemetry.casts;c.coloredBarrages.update(1/60,ranks,1,tick<60);
    if(c.coloredBarrages.telemetry.casts>before){
      const cast=c.coloredBarrages.inspect().castsActive.at(-1);
      // Cast slots are reused, so select the globally newest instance.
      const newest=[...c.coloredBarrages.inspect().castsActive].sort((a,b)=>b.castId-a.castId)[0];
      expect(cast).toBeTruthy();launches.push({time:tick/60,id:newest.id});
    }
    expect(c.coloredBarrages.inspect().activeShots).toBeLessThanOrEqual(COLORED_BARRAGE_LIMITS.shots);
  }
  expect(new Set(launches.map(c=>c.id)).size).toBe(4);expect(launches[0].time).toBeGreaterThanOrEqual(1);
  for(let i=1;i<launches.length;i++)expect(launches[i].time-launches[i-1].time).toBeGreaterThanOrEqual(.6-1e-7);
  for(const id of COLORED_BARRAGE_IDS){
    const own=launches.filter(c=>c.id===id);expect(own.length).toBeGreaterThan(3);
    for(let i=1;i<own.length;i++)expect(own[i].time-own[i-1].time).toBeGreaterThanOrEqual(COLORED_BARRAGES[id].interval-1/60-1e-7);
  }
});

test('frost uses swept collision, three-target pierce and one direct hit per enemy while applying chill',()=>{
  const c=fixture(),enemies=[2,4,6,8].map(z=>target(c,0,z));
  c.coloredBarrages.cast('frost-barrage',1);
  const shots=c.coloredBarrages.shots.filter(s=>s.active);for(const s of shots)if(s!==shots[2])s.active=false;
  advance(c,.55);
  expect(enemies.map(e=>e.hp)).toEqual([984,984,984,1000]);
  expect(enemies.slice(0,3).every(e=>e.chillTime===1.2)).toBe(true);
  advance(c,.4);expect(enemies.map(e=>e.hp)).toEqual([984,984,984,1000]);
});

test('returning leaves can hit once outward and once inward, snapshot global damage and follow the moving player',()=>{
  const c=fixture(),e=target(c,0,3);
  c.coloredBarrages.cast('leaf-barrage',1,2);advance(c,.3);expect(e.hp).toBe(974);
  advance(c,.9);expect(e.hp).toBe(948);
  c.anchorX=2;advance(c,.5);expect(e.hp).toBe(948);expect(c.coloredBarrages.inspect().activeShots).toBe(0);
});

test('purple arcs bend in opposite directions and rose stars distribute toward low-health targets',()=>{
  const c=fixture();c.coloredBarrages.cast('arc-barrage',1);
  const arc=c.coloredBarrages.shots.filter(s=>s.active),angles=arc.map(s=>s.angle);advance(c,.2);
  expect(arc[0].angle).toBeLessThan(angles[0]);expect(arc[1].angle).toBeGreaterThan(angles[1]);
  c.coloredBarrages.clear();
  const high=target(c,0,8,1000),a=target(c,-4,8,40),b=target(c,4,8,20),d=target(c,6,8,60);
  c.coloredBarrages.cast('rose-barrage',1);
  const stars=c.coloredBarrages.shots.filter(s=>s.active);
  expect(stars.map(s=>s.targetId)).toEqual([b.id,a.id,d.id]);expect(stars.some(s=>s.targetId===high.id)).toBe(false);
  const shot=stars[0],angle=shot.angle;shot.target!.id+=1000;shot.target!.x=-8;
  advance(c,.1);expect(shot.angle).toBeCloseTo(angle,8);
});

test('rank multipliers and capture protection apply through the real damage path without weapon-derived reactions',()=>{
  for(const [rank,multiplier] of [[undefined,1],['elite',.7],['boss',.4]] as const){
    const c=fixture(),e=target(c,0,3);e.rank=rank;
    c.coloredBarrages.cast('frost-barrage',1);advance(c,.3);expect(e.hp).toBeCloseTo(1000-16*multiplier);
  }
  const c=fixture();c.captureEnabled=true;c.captureSpawnRoll=()=>true;
  const e=c.spawn('normal',0,3,0);e.spawnTime=0;e.hp=1;expect(c.isCaptureReady(e)).toBe(true);
  c.coloredBarrages.cast('frost-barrage',3);advance(c,.5);expect(e.hp).toBe(1);expect(e.chillTime).toBe(0);
  const legacy=new Combat();expect(legacy.progression.skills.some(s=>s.id==='frost-barrage')).toBe(false);
});

test('frost salvos cooperate with later water hits while equipped fire relics do not add burns or copies',()=>{
  const c=fixture(),e=target(c,0,3);
  expect(c.grantUpgrade('draft-kindling-flask')).toBe(true);
  expect(c.grantUpgrade('split-on-hit')).toBe(true);
  c.coloredBarrages.cast('frost-barrage',1);advance(c,.3);
  expect(e.chillTime).toBe(1.2);expect(e.burnTime??0).toBe(0);expect(c.childShots).toBe(0);
  c.runBuild.acquire('bubble');
  const source=(c as any).newRelicSource('bubble',c.runBuild.rules('bubble'),1);
  (c as any).damageEnemy(e,1,0,0,'player',source);
  expect(e.freezeTime).toBe(1.25);expect(e.wetTime).toBe(0);
});

test('pool refusal is atomic; freeze, clear, death and reset retain bounded clean state',()=>{
  const c=fixture();
  for(let i=0;i<4;i++)expect(c.coloredBarrages.cast('arc-barrage',3)).toBe(true);
  const before=c.coloredBarrages.inspect();expect(c.coloredBarrages.cast('rose-barrage',3)).toBe(false);
  expect(c.coloredBarrages.inspect().activeShots).toBe(before.activeShots);
  c.coloredBarrages.update(0,{},1);expect(c.coloredBarrages.inspect().castsActive).toEqual(before.castsActive);
  c.hp=0;c.update(.5,{x:0,z:0});expect(c.coloredBarrages.inspect().castsActive).toEqual(before.castsActive);
  c.clearTransientEffects();expect(c.coloredBarrages.inspect().activeShots).toBe(0);
  c.reset();expect(c.coloredBarrages.inspect()).toMatchObject({casts:0,hits:0,activeShots:0,clocks:[0,0,0,0]});
  c.coloredBarrages.cast('rose-barrage',3);c.clearWave();expect(c.coloredBarrages.inspect().activeShots).toBe(0);
});
