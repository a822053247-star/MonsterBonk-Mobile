import {test,expect} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {Combat,COMBAT_LIMITS} from '../src/combat';
import {PartySystem} from '../src/party';
import {RunFlow} from '../src/run-flow';
import {GIGAPACK_BATCH_11_15,GIGAPACK_BATCH_16_20} from '../src/content/relics/gigapack-relics';
import {GIGAPACK_CLIPS} from '../src/visuals/gigapack-clips';
import {GIGAPACK_BINDINGS} from '../src/visuals/gigapack-presets';
import type {BaseAttackId} from '../src/fusion';
import type {RelicId} from '../src/relics';

const origin={x:0,z:0}, definitions=[...GIGAPACK_BATCH_11_15,...GIGAPACK_BATCH_16_20];
const specification=JSON.parse(readFileSync('docs/monsterbonk_gigapack_relics_11_20_spec.json','utf8'));
function fixture(){const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.party.reset(['yanrong']);c.fusionEnabled=true;c.automaticSpawning=false;c.reset();c.runBuild.attacks[0].cooldown=10000;return c;}
function target(c:Combat,x=4,z=0,hp=1000){const e=c.spawn('normal',x,z,0)!;e.hp=hp;return e;}
function own(c:Combat,id:RelicId){if(id==='venom-insignia')c.grantUpgrade('leaf-weapon');expect(c.grantUpgrade(id)).toBe(true);expect(c.grantUpgrade(id)).toBe(false);for(const a of c.runBuild.attacks)a.cooldown=10000;}
function source(c:Combat,attack:BaseAttackId='spark',damage=100){return (c as any).newRelicSource(attack,c.runBuild.rules(attack),damage);}
function hit(c:Combat,e:Combat['enemies'][number],attack:BaseAttackId='spark',damage=100,s=source(c,attack,damage)){(c as any).damageEnemy(e,damage,0,0,'player',s);return s;}
function advance(c:Combat,seconds:number){for(let t=0;t<seconds-1e-9;){const dt=Math.min(1/120,seconds-t);c.update(dt,origin);t+=dt;}}
function cast(c:Combat,attack:BaseAttackId='spark',damage=100){c.relicBehaviors.cast(attack,attack==='flame-sweep',damage);}
function fire(c:Combat,e:Combat['enemies'][number]){expect((c as any).fireBolts(origin,e,100,1,10.5,0,'yanrong','spark')).toBe(true);cast(c);return c.projectiles.find(p=>p.active&&p.age===0)!;}

for(const d of definitions)test(`${d.id}: trigger, limits, derived exclusion and lifecycle`,()=>{
 const c=fixture();own(c,d.id);const b=c.relicBehaviors.gigapack;
 const spec=specification.relics.find((r:any)=>r.id===d.id);expect(d.title).toBe(spec.title);expect(d.tags).toEqual(spec.tags);
 expect(existsSync(`public/${d.art.png}`)).toBe(true);
 switch(d.id){
 case 'storm-relay':{
  const a=target(c),x=target(c,5),y=target(c,6),outside=target(c,8);
  for(let i=0;i<3;i++)hit(c,a);expect(x.hp).toBe(1000);hit(c,a);expect(x.hp).toBe(955);expect(y.hp).toBe(955);expect(outside.hp).toBe(1000);
  for(let i=0;i<4;i++)hit(c,a,'spark',1);expect(x.hp).toBe(955);
  c.elapsed=4;hit(c,a,'spark',10);hit(c,a,'bubble',20);expect(x.hp).toBe(946);
  c.elapsed=8;hit(c,a,'spark',1,{...source(c),behavior:true});hit(c,a,'bubble',10);expect(x.hp).toBe(946);
  c.elapsed=11;hit(c,a,'spark',10);expect(x.hp).toBe(946);break;
 }
 case 'void-vessel':{
  const a=target(c),x=target(c,5);c.hitPlayer(8);expect(c.hp).toBe(100);expect(b.inspect().charge).toBe(true);
  c.invulnerability=0;c.hitPlayer(8);expect(c.hp).toBe(92);
  hit(c,a,'spark',100,{...source(c),copied:true});expect(b.inspect().charge).toBe(true);
  hit(c,a);expect(a.hp).toBe(740);expect(x.hp).toBe(940);expect(b.inspect().charge).toBe(false);
  c.elapsed=16;c.invulnerability=0;c.hitPlayer(8);expect(c.hp).toBe(92);break;
 }
 case 'warp-eye':{
  const near=target(c,2),far=target(c,8);target(c,10);for(let i=0;i<5;i++){fire(c,near);c.projectiles.forEach(p=>p.active=false);}
  const p=fire(c,near);expect(p.x).toBeCloseTo(6.9);expect(p.previousX).toBe(p.x);expect(p.previousZ).toBe(p.z);expect(c.projectiles.filter(p=>p.active)).toHaveLength(1);
  advance(c,.1);expect(near.hp).toBe(1000);expect(far.hp).toBe(900);
  c.projectiles.forEach(p=>p.active=false);c.enemies.forEach(e=>e.active=false);for(let i=0;i<6;i++)cast(c);expect(b.inspect().rangedCasts).toBe(12);break;
 }
 case 'reaper-decree':{
  const big=target(c,5,0,2000),less=target(c,4,1,500);for(let i=0;i<8;i++)hit(c,target(c,12,1,1));
  expect(b.inspect().pendingDecree).toBe(true);advance(c,.59);expect(big.active).toBe(true);advance(c,.02);expect(big.active).toBe(false);expect(less.active).toBe(true);expect(b.inspect().reaperKills).toBe(0);
  c.enemies.forEach(e=>e.active=false);c.elapsed=6;const elite=target(c,4);elite.rank='elite';for(let i=0;i<8;i++)hit(c,target(c,12,1,1));expect(elite.hp).toBeCloseTo(986.5);
  expect(b.inspect().pendingDecree).toBe(false);break;
 }
 case 'rhythm-seal':{
  const a=target(c,2),edge=target(c,2,1),back=target(c,-2),far=target(c,4);for(let i=0;i<7;i++)cast(c);
  expect(a.hp).toBe(945);expect(edge.hp).toBe(945);expect(back.hp).toBe(1000);expect(far.hp).toBe(1000);
  for(let i=0;i<7;i++)cast(c);expect(a.hp).toBe(945);c.elapsed=4.5;for(let i=0;i<7;i++)cast(c,'flame-sweep',200);expect(a.hp).toBe(835);break;
 }
 case 'alchemist-ledger':{
  const run=new RunFlow(()=>.5);c.goldEarned=5;(run as any).collectGold(c);expect(c.xp).toBe(0);
  run.coins-=4;c.goldEarned=6;(run as any).collectGold(c);expect(c.xp).toBe(5);
  c.goldEarned=60;(run as any).collectGold(c);expect(c.xp).toBe(15);expect(b.inspect().coinRemainder).toBe(0);
  b.earnedCoins(0,2);expect(c.xp).toBe(15);b.earnedCoins(6,2);expect(c.xp).toBe(20);
  c.clearWave();b.earnedCoins(6,2);expect(c.xp).toBe(25);break;
 }
 case 'venom-insignia':{
  expect(fixture().progression.canGrant(d.id)).toBe(false);
  const a=target(c),x=target(c,5);hit(c,a,'leaf');expect(a.venomUntil).toBe(3);expect(x.hp).toBe(1000);
  hit(c,a,'spark',100,{...source(c),copied:true});expect(a.venomUntil).toBe(3);
  hit(c,a,'bubble');expect(a.hp).toBe(650);expect(x.hp).toBe(950);expect(a.venomUntil).toBe(0);
  hit(c,a,'leaf',1);hit(c,a,'spark',1);expect(x.hp).toBe(950);
  c.elapsed=1.2;hit(c,a,'flame-sweep',100);expect(x.hp).toBe(900);
  hit(c,a,'leaf',1);c.elapsed=5;hit(c,a,'spark',1);expect(x.hp).toBe(900);break;
 }
 case 'heart-keeper':{
  for(let i=0;i<40;i++)hit(c,target(c,4,0,1));expect(b.inspect().petals).toBe(3);
  c.hitPlayer(10);expect(c.hp).toBe(94);expect(b.inspect().petals).toBe(2);expect(b.inspect().heartKills).toBe(0);
  c.hitPlayer(10);expect(c.hp).toBe(94);expect(b.inspect().petals).toBe(2);
  c.invulnerability=0;c.hitPlayer(1);expect(c.hp).toBe(97);c.clearWave();expect(b.inspect().petals).toBe(1);
  c.invulnerability=0;c.hitPlayer(1);expect(c.hp).toBe(100);expect(b.inspect().petals).toBe(0);
  c.effects.forEach(e=>e.active=false);c.hp=100;c.invulnerability=0;c.hitPlayer(0);expect(c.effects.some(e=>e.active&&e.vfxPresetId==='heart-keeper')).toBe(false);break;
 }
 case 'smokescreen-feather':{
  const a=target(c,0,1),elite=target(c,1,0),boss=target(c,1,1);elite.rank='elite';boss.rank='boss';a.intent='windup';a.intentTime=1;
  b.dash(0,0);b.update(0);expect(b.slowFactor(a)).toBe(.6);expect(b.slowFactor(elite)).toBe(.8);expect(b.slowFactor(boss)).toBe(1);expect(a.hp).toBe(1000);expect(a.intent).toBe('windup');
  b.dash(5,5);expect(b.inspect().smoke?.x).toBe(0);c.elapsed=1.49;b.update(0);c.elapsed=1.51;b.update(0);expect(b.inspect().smoke).toBeUndefined();expect(b.slowFactor(a)).toBe(.6);c.elapsed=2;expect(b.slowFactor(a)).toBe(1);break;
 }
 case 'levelup-salute':{
  const enemies=Array.from({length:5},(_,i)=>target(c,3+i*.5));b.choiceConfirmed();b.choiceConfirmed();expect(enemies[0].hp).toBe(1000);
  c.progression.pendingChoices=1;c.update(.2,origin);expect(enemies[0].hp).toBe(1000);c.progression.pendingChoices=0;c.update(.01,origin);
  expect(enemies.slice(0,4).map(e=>e.hp)).toEqual([987.4,987.4,987.4,987.4]);expect(enemies[4].hp).toBe(1000);expect(b.inspect().pendingSalute).toBe(false);
  c.enemies.forEach(e=>e.active=false);b.choiceConfirmed();advance(c,3.01);expect(b.inspect().pendingSalute).toBe(false);
  b.choiceConfirmed();c.clearTransientEffects();expect(b.inspect().pendingSalute).toBe(false);break;
 }
 }
 expect(c.enemies).toHaveLength(COMBAT_LIMITS.enemies);expect(c.effects).toHaveLength(COMBAT_LIMITS.effects);expect(c.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);
 c.reset();expect(b.inspect()).toMatchObject({charge:false,casts:0,rangedCasts:0,petals:0,pendingDecree:false,pendingSalute:false,coinAwards:0});
});

test('all 11 spritesheets match real metadata bounds, frame ordering, PNG dimensions and 15 FPS guide',()=>{
 for(const [id,clip] of Object.entries(GIGAPACK_CLIPS)){
  const png=readFileSync(`public/${clip.url}`);expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([clip.width,clip.height]);
  const lines=readFileSync(`public/${clip.metadata}`,'utf8').trim().split(/\r?\n/);expect(clip.frames).toHaveLength(lines.length);
  lines.forEach((line,i)=>{const m=line.match(/frame(\d+)\.png = (\d+) (\d+) (\d+) (\d+)/)!;expect(Number(m[1])).toBe(i);expect(clip.frames[i]).toEqual(m.slice(2).map(Number));});
  expect(clip.fps).toBe(15);expect(Object.values(GIGAPACK_BINDINGS)).toContain(id);
 }
});

test('saturated VFX cannot cancel damage; derived budget cannot be bypassed',()=>{
 const c=fixture();own(c,'storm-relay');const a=target(c),x=target(c,5);
 for(const e of c.effects)Object.assign(e,{active:true,kind:'steam',time:10,duration:10});
 for(let i=0;i<4;i++)hit(c,a);expect(x.hp).toBe(955);
 c.elapsed=4;(c as any).childrenThisTick=6;
 for(let i=0;i<4;i++)hit(c,a,'spark',1);expect(x.hp).toBe(955);expect(c.balanceTelemetry.derivedDenied).toBeGreaterThan(0);
});

test('decree identity cannot execute a reused pool slot; pending salute clears on death',()=>{
 const c=fixture();own(c,'reaper-decree');own(c,'levelup-salute');
 const doomed=target(c,5,0,2000);for(let i=0;i<8;i++)hit(c,target(c,12,0,1));
 hit(c,doomed,'spark',3000);const replacement=target(c,5,0,3000);expect(replacement).toBe(doomed);
 advance(c,.61);expect(replacement.hp).toBe(3000);
 c.relicBehaviors.gigapack.choiceConfirmed();c.hitPlayer(1000);expect(c.relicBehaviors.gigapack.inspect().pendingSalute).toBe(false);
});
