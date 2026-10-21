import {test,expect} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {Combat,COMBAT_LIMITS,type Projectile,type Enemy} from '../src/combat';
import {PartySystem} from '../src/party';
import {ATTACKS} from '../src/run-build';
import {GIGAPACK_BATCH_21_25,GIGAPACK_BATCH_26_30} from '../src/content/relics/advanced-relics';
import {GIGAPACK_CLIPS} from '../src/visuals/gigapack-clips';
import {assertFusionPreservesRelics,inheritWeaponCapabilities,weaponCapabilities} from '../src/content/weapon-traits';
import {meetsRequirements} from '../src/content/content-types';
import type {RelicId} from '../src/relics';
import type {BaseAttackId} from '../src/fusion';
const origin={x:0,z:0};
const definitions=[...GIGAPACK_BATCH_21_25,...GIGAPACK_BATCH_26_30];
const spec=JSON.parse(readFileSync('docs/monsterbonk_gigapack_relics_21_30_spec.json','utf8'));
function fixture(){const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.party.reset(['yanrong']);c.fusionEnabled=true;c.automaticSpawning=false;c.reset();c.runBuild.attacks[0].cooldown=10000;return c;}
function enemy(c:Combat,x=5,z=0,hp=1000){const e=c.spawn('normal',x,z,0)!;e.hp=hp;return e;}
function source(c:Combat,attack:BaseAttackId='spark',damage=100){return (c as any).newRelicSource(attack,c.runBuild.rules(attack),damage);}
function hit(c:Combat,e:Enemy,id:BaseAttackId='spark',damage=100,s=source(c,id,damage)){(c as any).damageEnemy(e,damage,0,0,'player',s);return s;}
function advance(c:Combat,seconds:number){for(let t=0;t<seconds-1e-8;){const dt=Math.min(1/120,seconds-t);c.update(dt,origin);t+=dt;}}
function own(c:Combat,id:RelicId){
 if(id==='resonant-aftershock')c.grantUpgrade('split-on-hit');if(id==='reverse-tide')c.grantUpgrade('bubble-weapon');
 if(id==='blazing-satellite')c.grantUpgrade('flame-sweep-weapon');if(id==='prism-shower')c.grantUpgrade('multishot');
 expect(c.grantUpgrade(id)).toBe(true);expect(c.grantUpgrade(id)).toBe(false);for(const a of c.runBuild.attacks)a.cooldown=10000;
}
function pellet(c:Combat,id:BaseAttackId='spark',castId=1):Projectile{
 const p=c.projectiles.find(p=>!p.active)!;const s=source(c,id);s.castId=castId;
 Object.assign(p,{active:true,x:0,z:0,previousX:0,previousZ:0,vx:18,vz:0,age:0,damage:100,baseDamage:100,life:1,distance:0,attackId:id,relicSource:s,generation:0,returning:false,hitIds:[],damageIds:[],fusionIds:[],pierces:0,homing:false});return p;
}
for(const d of definitions)test(`${d.id}: exact spec, actual trigger and edge conditions`,()=>{
 const c=fixture();own(c,d.id);const b=c.relicBehaviors.gigapack;
 const item=spec.relics.find((r:any)=>r.id===d.id);expect(d.title).toBe(item.title);expect(d.tags).toEqual(item.tags);expect(existsSync(`public/${d.art.png}`)).toBe(true);
 switch(d.id){
 case 'resonant-aftershock':{
  const e=enemy(c,5),s=source(c);s.kind='explosion';
  b.explosion(5,0,1,100,s);expect(b.inspect().aftershock).toBe(false);
  b.explosion(5,0,2,100,{...s,copied:true});expect(b.inspect().aftershock).toBe(false);
  b.explosion(5,0,2,100,s);expect(b.inspect().aftershock).toBe(true);advance(c,.27);expect(e.hp).toBe(1000);advance(c,.02);expect(e.hp).toBe(960);
  c.elapsed=3;b.explosion(5,0,2,100,s);expect(b.inspect().aftershock).toBe(false);break;
 }
 case 'reverse-tide':{
  const center=enemy(c,5),a=enemy(c,6),elite=enemy(c,5,1),boss=enemy(c,5,-1);elite.rank='elite';boss.rank='boss';a.intent='windup';a.intentTime=.8;
  for(let i=0;i<3;i++)hit(c,center,'bubble',1);expect(a.x).toBe(6);hit(c,center,'bubble',1);
  expect(a.x).toBeCloseTo(6.8);expect(elite.z).toBeCloseTo(1.25);expect(boss.z).toBe(-1);expect(a.hp).toBe(1000);expect(a.intent).toBe('windup');expect(a.intentTime).toBe(.8);
  for(let i=0;i<4;i++)hit(c,center,'bubble',1,{...source(c,'bubble'),copied:true});expect(a.x).toBeCloseTo(6.8);break;
 }
 case 'charge-chamber':{
  advance(c,1.49);expect(b.inspect().chamber).toBe(false);advance(c,.02);expect(b.inspect().chamber).toBe(true);
  const a=enemy(c,4),x=enemy(c,5);const p=pellet(c);c.relicBehaviors.projectileHit(p,a,4,0);expect(p.pierces).toBe(1);expect(a.hp).toBe(945);expect(x.hp).toBe(945);expect(b.inspect().chamber).toBe(false);
  c.relicBehaviors.projectileHit(p,a,4,0);expect(x.hp).toBe(945);p.active=false;advance(c,4.99);expect(b.inspect().chamber).toBe(false);advance(c,.02);expect(b.inspect().chamber).toBe(true);break;
 }
 case 'azure-ward':{
  advance(c,5.99);expect(b.inspect().ward).toBe(false);advance(c,.02);expect(b.inspect().ward).toBe(true);
  c.grantUpgrade('void-vessel');c.hitPlayer(10);expect(c.hp).toBe(100);expect(b.inspect().ward).toBe(true);
  c.invulnerability=0;c.hitPlayer(10);expect(c.hp).toBe(94);expect(b.inspect().ward).toBe(false);c.invulnerability=0;c.hitPlayer(10);expect(c.hp).toBe(84);
  advance(c,9.99);expect(b.inspect().ward).toBe(false);advance(c,.02);expect(b.inspect().ward).toBe(true);break;
 }
 case 'swift-weave':{
  const a=enemy(c);for(let i=0;i<4;i++)hit(c,a,'spark',1);expect(b.intervalFactor()).toBe(1);
  for(let i=0;i<3;i++)hit(c,enemy(c,5+i,1),'spark',1);expect(b.intervalFactor()).toBe(.82);const until=b.inspect().swiftUntil;
  for(let i=0;i<4;i++)hit(c,enemy(c,5+i,-1),'spark',1);expect(b.inspect().swiftUntil).toBe(until);advance(c,2.51);expect(b.intervalFactor()).toBe(1);break;
 }
 case 'pristine-halo':{
  const far=enemy(c),near=enemy(c,2);for(let i=0;i<4;i++)hit(c,far,'spark',1);expect(near.hp).toBe(1000);
  hit(c,far,'spark',100);expect(near.hp).toBe(965);expect(b.inspect().haloHits).toBe(0);
  hit(c,far,'spark',1);c.hitPlayer(1);expect(b.inspect().haloHits).toBe(0);for(let i=0;i<5;i++)hit(c,far,'spark',1);expect(near.hp).toBe(965);break;
 }
 case 'blazing-satellite':{
  const a=enemy(c,5);for(let i=0;i<3;i++)hit(c,a,'flame-sweep',1);expect(b.inspect().satellite).toBe(false);
  hit(c,enemy(c,5,1),'flame-sweep',1);hit(c,enemy(c,5,-1),'flame-sweep',1);expect(b.inspect().satellite).toBe(true);
  const contact=enemy(c,2.2);b.update(0);expect(contact.hp).toBe(1000-ATTACKS['flame-sweep'].damage*.25);b.update(0);expect(contact.hp).toBe(1000-ATTACKS['flame-sweep'].damage*.25);
  c.elapsed=3.01;b.update(0);expect(b.inspect().satellite).toBe(false);break;
 }
 case 'prism-shower':{
  const a=enemy(c,5),x=enemy(c,6),p=pellet(c),q=pellet(c);c.relicBehaviors.projectileHit(p,a,5,0);c.relicBehaviors.projectileHit(p,x,6,0);
  expect(c.projectiles.filter(p=>p.vfxPresetId==='prism-shower'&&p.active)).toHaveLength(0);
  c.relicBehaviors.projectileHit(q,x,6,0);const shards=c.projectiles.filter(p=>p.vfxPresetId==='prism-shower'&&p.active);expect(shards).toHaveLength(3);expect(shards.every(p=>p.damage===30&&p.homing&&p.relicSource?.suppressRelics)).toBe(true);
  c.relicBehaviors.projectileHit(q,a,5,0);c.relicBehaviors.projectileHit(shards[0],a,5,0);expect(c.projectiles.filter(p=>p.vfxPresetId==='prism-shower'&&p.active)).toHaveLength(3);break;
 }
 case 'scarlet-reprisal':{
  enemy(c,5);c.hitPlayer(1);const snapshot={attackId:'spark',damage:100,range:10.5,rules:c.runBuild.rules('spark'),fusions:[]};
  (c as any).recordWeaponCast(snapshot);expect(b.inspect().reprisalUntil).toBe(0);advance(c,.13);
  const copied=c.projectiles.filter(p=>p.active&&p.relicSource?.copied);expect(copied).toHaveLength(1);expect(copied[0].damage).toBe(50);expect(copied[0].relicSource?.suppressRelics).toBe(true);expect(c.relicTelemetry.echoes).toBe(1);
  (c as any).recordWeaponCast(snapshot);advance(c,.13);expect(c.relicTelemetry.echoes).toBe(1);c.invulnerability=0;c.hitPlayer(1);expect(b.inspect().reprisalUntil).toBe(0);break;
 }
 case 'starlit-magnet':{
  for(let i=0;i<15;i++)Object.assign(c.orbs[i],{active:true,x:5,z:i*.01,previousX:5,previousZ:i*.01,value:2,magnetized:false});
  Object.assign(c.orbs[15],{active:true,x:7,z:0,value:3,magnetized:false});
  const original=c.orbs.slice(0,16),values=original.map(o=>o.value);
  for(let i=0;i<7;i++)hit(c,enemy(c,12,0,1));expect(original.filter(o=>o.magnetized)).toHaveLength(12);expect(c.orbs[15].magnetized).toBe(false);expect(original.map(o=>o.value)).toEqual(values);expect(c.xp).toBe(0);expect(b.inspect().magnetKills).toBe(0);break;
 }
 }
 expect(c.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);expect(c.effects).toHaveLength(COMBAT_LIMITS.effects);c.reset();expect(b.inspect()).toMatchObject({aftershock:false,chamber:false,ward:false,haloHits:0,satellite:false,reprisalUntil:0,magnetKills:0});
});

test('ten exact new png/txt resources and all parsed rectangles exist; no guessed grid',()=>{
 for(const r of spec.relics){const clip=(GIGAPACK_CLIPS as any)[r.vfx.clip];expect(clip).toBeDefined();expect(clip.url).toBe('assets/pixel/effects/Super Pixel Effects Gigapack (Free Version)/'+r.vfx.spritesheet.slice(8));
  const png=readFileSync('public/'+clip.url);expect([clip.width,clip.height]).toEqual([png.readUInt32BE(16),png.readUInt32BE(20)]);
  const rects=readFileSync('public/'+clip.metadata,'utf8').trim().split(/\r?\n/).map(l=>l.split('=')[1].trim().split(/\s+/).map(Number));expect(clip.frames).toEqual(rects);expect(clip.fps).toBe(15);
 }
});
test('future fusion must retain owned relics, parent tags, original identities and trigger events',()=>{
 const parents=[weaponCapabilities('spark',{'split-on-hit':1}),weaponCapabilities('flame-sweep')],merged=inheritWeaponCapabilities(parents);
 const before={relics:['resonant-aftershock','blazing-satellite'] as RelicId[],weapons:parents,events:['explosion','primary-hit','origin:spark','origin:flame-sweep']};
 const after={...before,weapons:[merged]};expect(()=>assertFusionPreservesRelics(before,after)).not.toThrow();
 expect(()=>assertFusionPreservesRelics(before,{...after,relics:[]})).toThrow();expect(()=>assertFusionPreservesRelics(before,{...after,events:['primary-hit']})).toThrow();
 expect(()=>assertFusionPreservesRelics(before,{...after,weapons:[weaponCapabilities('spark')]})).toThrow();
 expect(meetsRequirements({weaponTags:['fire','melee']},{weapons:['bubble'],ranks:{},capabilities:[merged]})).toBe(true);
 expect(meetsRequirements({projectile:true},{weapons:['flame-sweep'],ranks:{},capabilities:[merged]})).toBe(true);
 const c=fixture();own(c,'charge-chamber');const events=['primary-hit','primary-cast','primary-projectile','explosion','kill','hp-loss','dash','level-choice','coin-earned'];
 c.runBuild.registerFusionCapabilities('bubble',['spark','leaf'],[...events,'origin:spark','origin:leaf']);
 expect(()=>c.runBuild.registerFusionCapabilities('flame-sweep',['bubble','flame-sweep'],[...events,'origin:bubble','origin:flame-sweep'])).toThrow();
 expect(()=>c.runBuild.registerFusionCapabilities('flame-sweep',['bubble','flame-sweep'],[...events,'origin:spark','origin:leaf','origin:flame-sweep'])).not.toThrow();
});

for(const attack of ['spark','bubble'] as const)test(`charged ${attack} really crosses the first victim and hits a second without duplicate hits`,()=>{
 const c=fixture();own(c,'charge-chamber');if(attack==='bubble'){c.grantUpgrade('bubble-weapon');c.grantUpgrade('chain');for(const a of c.runBuild.attacks)a.cooldown=10000;}
 advance(c,1.51);const first=enemy(c,3),second=enemy(c,5);
 (c as any).fireBolts(origin,first,100,1,10.5,0,'yanrong',attack);advance(c,.4);
 expect(first.hp).toBe(845);expect(second.hp).toBeLessThan(1000);
});
test('new derived damage cannot feed other relics and saturated projectile budget cannot spawn shards',()=>{
 const c=fixture();own(c,'pristine-halo');own(c,'starlit-magnet');c.grantUpgrade('blood-pact');
 const far=enemy(c,5),close=enemy(c,2,0,1);for(let i=0;i<5;i++)hit(c,far);
 expect(close.active).toBe(false);expect(c.relicBehaviors.gigapack.inspect().magnetKills).toBe(0);
 const x=fixture();own(x,'prism-shower');const a=enemy(x),b=enemy(x,6),p=pellet(x),q=pellet(x);
 for(const shot of x.projectiles)shot.active=true;
 x.relicBehaviors.projectileHit(p,a,5,0);x.relicBehaviors.projectileHit(q,b,6,0);
 expect(x.projectiles.filter(p=>p.vfxPresetId==='prism-shower')).toHaveLength(0);
});
test('distinct-target windows retain the latest hit time for a repeatedly hit target',()=>{
 const c=fixture();own(c,'swift-weave');const a=enemy(c,5);hit(c,a,'spark',1);
 c.elapsed=2;hit(c,a,'spark',1);c.elapsed=3;hit(c,enemy(c,6),'spark',1);c.elapsed=4;hit(c,enemy(c,7),'spark',1);hit(c,enemy(c,8),'spark',1);
 expect(c.relicBehaviors.gigapack.intervalFactor()).toBe(.82);
 const x=fixture();own(x,'blazing-satellite');const first=enemy(x);hit(x,first,'flame-sweep',1);x.elapsed=2;hit(x,first,'flame-sweep',1);x.elapsed=3.5;hit(x,enemy(x,6),'flame-sweep',1);hit(x,enemy(x,7),'flame-sweep',1);
 expect(x.relicBehaviors.gigapack.inspect().satellite).toBe(true);
});
