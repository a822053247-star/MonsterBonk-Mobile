import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {Combat,ENEMY_TYPES,type EnemyKind} from '../src/combat';
import {CAPTURE_RATES,EnemyCapture,SEAL_SECONDS} from '../src/enemy-capture';
import {CaptureCollection,COLLECTION_KEY} from '../src/capture-collection';
import {StarSealCaptureSystem} from '../src/visuals/star-seal-capture';
function fixture(random=()=>0,onCaught=(_kind:EnemyKind)=>{}) {
 const combat=new Combat([],32,()=>.5);combat.automaticSpawning=false;combat.reset();combat.captureEnabled=true;combat.captureSpawnRoll=()=>true;
 return {combat,capture:new EnemyCapture(random,onCaught)};
}
function finish(c:EnemyCapture){for(let i=0;i<150;i++)c.step(1/60);}
test('all eighteen fixed species rates are distinct and within 20–60 percent',()=>{
 const rates=Object.values(CAPTURE_RATES);expect(Object.keys(CAPTURE_RATES).sort()).toEqual(Object.keys(ENEMY_TYPES).sort());
 expect(new Set(rates).size).toBe(18);expect(Math.min(...rates)).toBe(.2);expect(Math.max(...rates)).toBe(.6);
});
for(const kind of Object.keys(CAPTURE_RATES) as EnemyKind[])test(`${kind} timing and species chance settle exactly once without kill rewards`,()=>{
 for(const success of [true,false]){
  let saved=0;const {combat,capture}=fixture(()=>success?0:CAPTURE_RATES[kind],()=>saved++);
  const e=combat.spawn(kind,0,2,0)!;e.spawnTime=0;e.hp=combat.enemyHealth(e)*.4;
  const kills=combat.kills,gold=combat.goldEarned;
  expect(capture.attempt(combat,{x:0,z:0})).toBe(true);expect(e.captureLocked).toBe(true);expect(capture.chances).toBe(Infinity);
  capture.step(SEAL_SECONDS*.6);expect(capture.submit()).toBe(true);expect(capture.submit()).toBe(false);
  finish(capture);finish(capture);
  expect(e.active).toBe(false);expect(e.captureLocked).toBe(false);expect(saved).toBe(success?1:0);
  expect(combat.kills).toBe(kills);expect(combat.goldEarned).toBe(gold);expect(combat.orbs.some(o=>o.active)).toBe(false);
 }
});
test('health, distance, rank, birth protection and line of sight gates with unlimited seals',()=>{
 const {combat,capture}=fixture();const e=combat.spawn('normal',0,2,0)!;e.spawnTime=0;
 expect(capture.attempt(combat,{x:0,z:0})).toBe(false);e.hp=1;
 e.rank='boss';expect(capture.attempt(combat,{x:0,z:0})).toBe(false);e.rank='elite';expect(capture.attempt(combat,{x:0,z:0})).toBe(false);e.rank=undefined;
 e.spawnTime=1;expect(capture.attempt(combat,{x:0,z:0})).toBe(false);e.spawnTime=0;
 expect(capture.attempt(combat,{x:16,z:0})).toBe(false);
 combat.obstacles=[{x:0,z:1,radius:.4}];expect(capture.attempt(combat,{x:0,z:0})).toBe(false);combat.obstacles=[];
 expect(capture.attempt(combat,{x:0,z:0})).toBe(true);capture.cancel();capture.step(3);
 expect(capture.attempt(combat,{x:0,z:0})).toBe(true);expect(capture.chances).toBe(Infinity);
});
test('early click and timeout exhaust five retries before removing the target without rewards',()=>{
 for(const early of [true,false]){const {combat,capture}=fixture();const e=combat.spawn('normal',0,2,0)!;e.spawnTime=0;e.hp=3;
 capture.attempt(combat,{x:0,z:0});
 for(let round=0;round<6;round++){
  if(early)capture.submit();else capture.step(SEAL_SECONDS);
  if(round<5){capture.step(3);expect(e.active).toBe(true);expect(capture.pending?.retriesLeft).toBe(4-round);}
  else {finish(capture);finish(capture);}
 }
 expect(e.active).toBe(false);expect(e.hp).toBe(3);expect(e.captureLocked).toBe(false);expect(capture.caught).toEqual({});
 expect(combat.kills).toBe(0);expect(combat.goldEarned).toBe(0);expect(combat.orbs.some(o=>o.active)).toBe(false);}
});

test('lethal hits enter capture state, resist all later damage and reset on pool reuse',()=>{
 const {combat,capture}=fixture();const e=combat.spawn('sand-shell',0,2,0)!;e.spawnTime=0;
 const damage=(amount:number,origin:'player'|'spore'='player')=>(combat as any).damageEnemy(e,amount,0,0,origin);
 expect(e.captureState).toBe('unavailable');expect(capture.eligible(combat,e)).toBe(false);
 damage(combat.enemyHealth(e)*.2);expect(capture.eligible(combat,e)).toBe(false);
 damage(99999);expect(e.active).toBe(true);expect(e.hp).toBe(combat.enemyHealth(e)*.4);
 expect(e.captureState).toBe('ready');expect(capture.eligible(combat,e)).toBe(true);
 const hp=e.hp,hits=combat.hits;damage(99999);damage(99999,'spore');
 expect(e.hp).toBe(hp);expect(combat.hits).toBe(hits);expect(combat.kills).toBe(0);
 e.burnTime=2;e.burnClock=0;e.burnDamage=99999;
 (combat as any).updateBurns(1);expect(e.burnTime).toBe(2);expect(e.hp).toBe(hp);
 e.hp=combat.enemyHealth(e);expect(capture.eligible(combat,e)).toBe(true);
 combat.clearWave();expect(e.captureState).toBe('unavailable');
 const reused=combat.spawn('sand-shell',0,2,0)!;expect(reused).toBe(e);
 reused.spawnTime=0;expect(reused.captureState).toBe('unavailable');expect(capture.eligible(combat,reused)).toBe(false);
 combat.reset();expect(reused.captureState).toBe('unavailable');
});

test('disabled capture modes, elites and bosses retain normal lethal damage',()=>{
 for(const rank of [undefined,'elite','boss'] as const){
  const {combat,capture}=fixture();const e=combat.spawn('normal',0,2,0)!;e.spawnTime=0;e.rank=rank;
  if(!rank)combat.captureEnabled=false;
  (combat as any).damageEnemy(e,99999,0,0);
  expect(e.active).toBe(false);expect(e.hp).toBe(0);expect(combat.kills).toBe(1);
  expect(capture.eligible(combat,e)).toBe(false);
 }
});
test('only target is protected; battle continues; cancel and reuse restore safe state',()=>{
 const {combat,capture}=fixture();combat.encounters.beginWave(1);
 const target=combat.spawn('normal',0,2,0)!;target.spawnTime=0;target.hp=3;
 const other=combat.spawn('fast',6,6,0)!;other.spawnTime=0;const x=other.x;
 capture.attempt(combat,{x:0,z:0});const pos={x:target.x,z:target.z};
 for(let i=0;i<30;i++)combat.update(1/60,{x:0,z:0});
 expect(target.x).toBe(pos.x);expect(target.z).toBe(pos.z);expect(target.hp).toBe(3);expect(other.x).not.toBe(x);
 capture.step(0);expect(capture.pending?.time).toBe(0);
 target.active=false;const reused=combat.spawn('normal',0,2,0)!;expect(reused).toBe(target);expect(reused.captureLocked).toBe(false);
 capture.step(.1);expect(capture.pending).toBeUndefined();expect(reused.active).toBe(true);
});
test('collection survives restart, rejects malformed records and deduplicates receipts',()=>{
 const map=new Map<string,string>();const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)}};
 const a=new CaptureCollection(storage);expect(a.add('normal','run:1')).toBe(true);expect(a.add('normal','run:1')).toBe(false);
 expect(new CaptureCollection(storage).data.counts).toEqual({normal:1});
 new EnemyCapture();expect(new CaptureCollection(storage).owns('normal')).toBe(true);
 map.set(COLLECTION_KEY,JSON.stringify({version:1,counts:{normal:-3,fast:Infinity,tank:2,unknown:99},receipts:[]}));
 expect(new CaptureCollection(storage).data.counts).toEqual({tank:2});
 map.set(COLLECTION_KEY,'bad JSON');expect(new CaptureCollection(storage).data.counts).toEqual({});
 const fail=new CaptureCollection({getItem:()=>null,setItem:()=>{throw Error('full')}});fail.add('normal','1');expect(fail.saved).toBe(false);expect(fail.owns('normal')).toBe(true);
});
test('VFX freezes, resolves both branches, cancels and reuses its fixed pool',()=>{
 const scene=new THREE.Scene(),target=new THREE.Object3D();scene.add(target);const vfx=new StarSealCaptureSystem(scene,1);
 let completed=0;
 for(const success of [true,false]){const s=vfx.start({target,onComplete:()=>completed++});success?s.succeed():s.fail();vfx.update(1,true);expect(s.phase).toBe('startup');for(let i=0;i<150;i++)vfx.update(1/60);expect(s.result).toBe(success?'success':'failure');}
 vfx.start({target,onComplete:()=>completed++});vfx.clear();expect(completed).toBe(2);expect(target.scale.x).toBe(1);vfx.dispose();expect(vfx.group.parent).toBeNull();
});
