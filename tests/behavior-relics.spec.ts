import {test,expect} from '@playwright/test';
import {existsSync,mkdirSync} from 'node:fs';
import {Combat,WEAPON,COMBAT_LIMITS} from '../src/combat';
import {PartySystem,type SpeciesId} from '../src/party';
import {FACTORY_RELICS} from '../src/content/relic-registry';
import {FIRST_RELIC_BATCH,SECOND_RELIC_BATCH} from '../src/content/relics/behavior-relics';
import {validateRelicContent} from '../src/content/content-validation';
import {relicMetadata} from '../src/content/relic-effects';
import {VFX_PRESETS} from '../src/visuals/vfx-presets';
import type {BaseAttackId} from '../src/fusion';
import type {RelicId} from '../src/relics';

const definitions=[...FIRST_RELIC_BATCH,...SECOND_RELIC_BATCH];
const origin={x:0,z:0};
function fixture(species:SpeciesId='yanrong'){
 const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.party.reset([species]);c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
 for(const a of c.runBuild.attacks)a.cooldown=10000;return c;
}
function advance(c:Combat,seconds:number){for(let t=0;t<seconds-1e-9;){const dt=Math.min(1/120,seconds-t);c.update(dt,origin);t+=dt;}}
function target(c:Combat,x=5,z=0,hp=1000){const e=c.spawn('normal',x,z,0)!;e.hp=hp;return e;}
function source(c:Combat,attack:BaseAttackId='spark',damage=100){return (c as any).newRelicSource(attack,c.runBuild.rules(attack),damage);}
function hit(c:Combat,e:Combat['enemies'][number],attack:BaseAttackId='spark',damage=100,s=source(c,attack,damage)){
 (c as any).damageEnemy(e,damage,0,0,'player',s);return s;
}
function shot(c:Combat,e:Combat['enemies'][number],attack:BaseAttackId='spark',damage=100){
 const p=c.projectiles.find(p=>!p.active)!;Object.assign(p,{active:true,x:e.x,z:e.z,previousX:e.x,previousZ:e.z,vx:18,vz:0,
  life:1,distance:0,damage,baseDamage:damage,attackId:attack,attackRules:c.runBuild.rules(attack),relicSource:source(c,attack,damage),generation:0,age:0,
  elemental:attack!=='spark',burst:false,hitIds:[],damageIds:[],fusionIds:[],pierces:0,ignoreEnemyId:0,hopTargetId:0,homing:false});return p;
}
function own(c:Combat,id:RelicId){expect(c.grantUpgrade(id)).toBe(true);for(const a of c.runBuild.attacks)a.cooldown=10000;}

for(const d of definitions)test(`${d.id}: registry, prerequisites, real mechanic and bounded recursion`,()=>{
 expect(FACTORY_RELICS[d.id]).toBeDefined();expect(existsSync(`public/${d.art.png}`)).toBe(true);
 expect(validateRelicContent([d],{weapons:['spark','bubble','leaf','flame-sweep'],vfx:VFX_PRESETS,assetExists:p=>existsSync(`public/${p}`)})).toEqual([]);
 expect(relicMetadata(d).benefit.length).toBeGreaterThan(5);
 const c=fixture(d.id==='returning-crown'||d.id==='spore-crown'||d.id==='wet-vines'?'sproutspike':d.id==='tidal-magnet'?'bubblesalamander':'yanrong');
 if(d.id==='tidal-magnet'){expect(c.progression.canGrant(d.id)).toBe(false);c.grantUpgrade('area');}
 if(d.id==='wet-vines'){expect(c.progression.canGrant(d.id)).toBe(false);c.grantUpgrade('bubble-weapon');}
 if(['returning-crown','spore-crown','tidal-magnet','wet-vines'].includes(d.id))expect(fixture().progression.canGrant(d.id)).toBe(false);
 own(c,d.id);expect(c.grantUpgrade(d.id)).toBe(false);
 switch(d.id){
 case 'mirror-prism':{
  const a=target(c),b=target(c,7);const p=shot(c,a);hit(c,a,'spark',100,p.relicSource);
  c.relicBehaviors.projectileHit(p,a,a.x,a.z);const child=c.projectiles.find(p=>p.active&&p.generation===1)!;
  expect(child.damage).toBe(50);expect(child.relicSource!.rootDamage).toBe(100);
  c.relicBehaviors.projectileHit(p,a,a.x,a.z);c.relicBehaviors.projectileHit(child,b,b.x,b.z);
  expect(c.projectiles.filter(p=>p.generation===1&&p.active)).toHaveLength(1);advance(c,.2);expect(b.hp).toBeLessThan(1000);break;
 }
 case 'returning-crown':{
  const a=target(c,5),b=target(c,3);const p=shot(c,a,'leaf');p.hitIds=[a.id];p.damageIds=[a.id];p.distance=10.5;p.flightRange=10.5;p.x=6;p.previousX=6;
  c.relicBehaviors.prepare(p,.001);expect(p.returning).toBe(true);expect(p.damage).toBe(40);
  const old=a.hp;advance(c,.2);expect(a.hp).toBe(old);expect(b.hp).toBe(960);expect(p.relicSource?.behavior).toBe(true);break;
 }
 case 'tidal-magnet':{
  const a=target(c,6),boss=target(c,6,1);boss.rank='boss';const s=source(c,'bubble');
  c.relicBehaviors.areaHit(5,0,1.8,s);expect(a.x).toBeCloseTo(5.3);expect(boss.x).toBe(6);
  c.relicBehaviors.areaHit(5,0,1.8,s);expect(a.x).toBeCloseTo(5.3);
  c.elapsed+=1.5;c.relicBehaviors.areaHit(5,0,1.8,{...s,behavior:true});expect(a.x).toBeCloseTo(5.3);break;
 }
 case 'hive-fuse':{
  const a=target(c);const p=shot(c,a);for(let i=0;i<12;i++)c.relicBehaviors.projectileHit(p,a,a.x,a.z);
  expect(c.relicBehaviors.zones.filter(z=>z.active)).toHaveLength(2);for(const p of c.projectiles)p.active=false;
  const old=a.hp;advance(c,.69);expect(a.hp).toBe(old);advance(c,.02);expect(a.hp).toBe(old-110);
  expect(c.relicBehaviors.zones.filter(z=>z.active)).toHaveLength(0);break;
 }
 case 'ember-sigil':{
  const a=target(c),s=hit(c,a);hit(c,a);expect(c.relicBehaviors.zones.filter(z=>z.active)).toHaveLength(1);
  const before=a.hp;advance(c,1.21);expect(a.hp).toBeCloseTo(before-42);expect(c.relicBehaviors.zones.some(z=>z.active)).toBe(false);
  hit(c,a,'spark',14,{...s,behavior:true});expect(c.relicBehaviors.zones.some(z=>z.active)).toBe(false);break;
 }
 case 'spore-crown':{
  const a=target(c,5,0,1),b=target(c,5.5);const s=hit(c,a,'leaf');expect(c.relicBehaviors.zones.filter(z=>z.active)).toHaveLength(1);
  advance(c,1.61);expect(b.hp).toBeCloseTo(952);expect(c.relicBehaviors.zones.some(z=>z.active)).toBe(false);
  const child=target(c,5,0,1);hit(c,child,'leaf',12,{...s,behavior:true});expect(c.relicBehaviors.zones.some(z=>z.active)).toBe(false);break;
 }
 case 'back-mirror':{
  const a=target(c);const p=shot(c,a);p.x=p.previousX=0;p.vx=WEAPON.speed;p.vz=0;
  for(let i=0;i<3;i++)c.relicBehaviors.cast('spark',false);expect(c.projectiles.filter(p=>p.active)).toHaveLength(1);
  c.relicBehaviors.cast('spark',false);const child=c.projectiles.find(p=>p.generation===1)!;expect(child.vx).toBeLessThan(0);expect(child.damage).toBe(50);
  const back=target(c,-2);advance(c,.15);expect(back.hp).toBe(950);expect(child.relicSource?.behavior).toBe(true);break;
 }
 case 'slaughter-drum':{
  const b=target(c,2);for(let i=0;i<6;i++)hit(c,target(c,7+i,0,1));expect(b.hp).toBe(965);
  for(let i=0;i<6;i++)hit(c,target(c,7+i,1,1));expect(b.hp).toBe(965);
  c.elapsed=8;for(let i=0;i<6;i++)hit(c,target(c,7+i,2,1),'spark',100,{...source(c),behavior:true});expect(b.hp).toBe(965);break;
 }
 case 'wet-vines':{
  const a=target(c);a.wetTime=3;hit(c,a,'leaf');expect(a.wetTime).toBe(0);expect(c.relicBehaviors.slowFactor(a)).toBe(.2);
  a.wetTime=3;hit(c,a,'leaf');expect(a.wetTime).toBe(3);
  const b=target(c,7);b.rank='boss';b.wetTime=3;hit(c,b,'leaf');expect(c.relicBehaviors.slowFactor(b)).toBe(.9);
  c.elapsed=.71;expect(c.relicBehaviors.slowFactor(a)).toBe(1);break;
 }
 case 'blood-pact':{
  expect(c.maxHp).toBe(85);expect(c.hp).toBe(85);c.hp=34;expect(c.relicBehaviors.intervalFactor()).toBe(.75);
  const attack=c.runBuild.attacks[0];attack.cooldown=1;c.update(.075,origin);expect(attack.cooldown).toBeCloseTo(.9);
  c.hp=10;for(let i=0;i<8;i++)hit(c,target(c,5+i,0,1));expect(c.hp).toBe(13);
  c.elapsed+=1;hit(c,target(c,5,3,1));expect(c.hp).toBe(14);c.hp=35;expect(c.relicBehaviors.intervalFactor()).toBe(1);break;
 }
 }
 expect(c.projectiles).toHaveLength(COMBAT_LIMITS.projectiles);expect(c.effects).toHaveLength(COMBAT_LIMITS.effects);
 const generated={...source(c),behavior:true};const a=target(c,10,8);
 c.relicBehaviors.hit(a,generated);expect(c.relicBehaviors.zones.filter(z=>z.active).length).toBeLessThanOrEqual(5);
 c.reset();expect(c.runBuild.relics).toEqual([]);expect(c.relicBehaviors.zones.some(z=>z.active)).toBe(false);expect(c.maxHp).toBe(100);
});

test('one real browser smoke: projectile, zone, status and automatic card/shop/build art',async({page},testInfo)=>{
 test.setTimeout(60000);mkdirSync('artifacts/stage3',{recursive:true});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/main.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = window.__relicGame = new Game();')});});
 await page.goto('/?world=fixed');await page.locator('#start-fusion').click();
 await page.waitForFunction(()=> (window as any).__relicGame.combatView.inspectElemental()?.loaded);
 const state=await page.evaluate(async()=>{
  const g=(window as any).__relicGame;g.sleep();g.wake=()=>{};const c=g.combat;
  c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;g.run.prepare=()=>{};c.invulnerability=10000;
  c.grantUpgrade('bubble-weapon');c.grantUpgrade('leaf-weapon');c.grantUpgrade('mirror-prism');c.grantUpgrade('ember-sigil');c.grantUpgrade('wet-vines');
  for(const a of c.runBuild.attacks)a.cooldown=10000;
  const a=c.spawn('normal',-4,2,0),b=c.spawn('normal',-6,2,0);a.hp=b.hp=1000;
  a.wetTime=3;c.fireBolts(g.position,a,100,1,10.5,0,'sproutspike','leaf');
  for(let i=0;i<30;i++)g.step(1/120);
  const bound=(a.vineUntil??0)>c.elapsed;
  c.fireBolts(g.position,a,100,1,10.5,0,'yanrong','spark');for(let i=0;i<30;i++)g.step(1/120);
  g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);
  return {bound,zone:c.relicBehaviors.zones.some((z:any)=>z.active),refracted:c.projectiles.some((p:any)=>p.active&&p.relicSource?.behavior),limits:c.inspect().limits};
 });
 expect(state.bound).toBe(true);expect(state.zone).toBe(true);expect(state.refracted).toBe(true);
 await page.evaluate(()=>{const g=(window as any).__relicGame;g.welcome.hidden=true;g.updateHUD();});
 await page.screenshot({path:testInfo.outputPath('smoke-combat.png')});
 const lifecycle=await page.evaluate(()=>{
  const g=(window as any).__relicGame,c=g.combat;g.pause('特效暂停检查');const age=c.elapsed;g.step(.2);const paused=c.elapsed===age;
  g.resume();for(let i=0;i<60;i++)g.step(1/120);
  g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);
  return {paused,zone:c.relicBehaviors.zones.some((z:any)=>z.active),visual:g.combatView.inspect()};
 });
 expect(lifecycle.paused).toBe(true);expect(lifecycle.zone).toBe(true);
 expect(lifecycle.visual.reactions.outlines).toBeGreaterThan(0);
 await page.screenshot({path:testInfo.outputPath('smoke-area.png')});
 await page.evaluate(()=>{const g=(window as any).__relicGame;g.combatView.detail=2;g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);});
 await page.screenshot({path:testInfo.outputPath('smoke-area-low.png')});
 await page.evaluate(()=>{
  const g=(window as any).__relicGame,c=g.combat;c.reset();c.grantUpgrade('bubble-weapon');c.grantUpgrade('leaf-weapon');c.grantUpgrade('area');
  for(let seed=1;seed<500;seed++){c.progression.reset(true);let n=seed;c.progression.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};c.progression.ranks.area=1;
   c.progression.gainExperience(c.progression.threshold);if(c.progression.offers.some((id:string)=>id==='mirror-prism'||id==='ember-sigil'||id==='blood-pact'))break;}
  g.openUpgrade();
 });
 await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('.skill-illustration')).every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:testInfo.outputPath('smoke-cards.png')});
 const card=page.locator('.skill-card[data-skill="mirror-prism"],.skill-card[data-skill="ember-sigil"],.skill-card[data-skill="blood-pact"]').first();
 const chosen=await card.getAttribute('data-skill');await expect(card).toBeEnabled();await card.click();
 await page.locator('#pause').click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('.build-relic-icon')).every(i=>i.complete&&i.naturalWidth>0));
 await expect(page.locator('#build-relics img')).toHaveCount(1);
 await page.locator('#build-relics').scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath('smoke-build.png')});await page.locator('#resume').click();
 const shopId=await page.evaluate(()=>{
  const g=(window as any).__relicGame,c=g.combat,run=g.run;
  run.waveIndex=4;run.coins=200;run.phase='intermission';run.intermissionRemaining=0;
  const rare=c.progression.skills.filter((s:any)=>s.category&&c.progression.canGrant(s.id));
  const wanted=rare.findIndex((s:any)=>['mirror-prism','ember-sigil','blood-pact'].includes(s.id));
  run.random=()=> (wanted+.1)/rare.length;run.updateRest(.01,c);g.mode='playing';g.syncRunPhase();
  return run.shop.items.find((i:any)=>['mirror-prism','ember-sigil','blood-pact'].includes(i.skill))?.skill;
 });
 expect(shopId).toBeTruthy();expect(shopId).not.toBe(chosen);
 await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('#shop-screen img')).every(i=>i.complete&&i.naturalWidth>0));
 await expect(page.locator(`.shop-item[data-skill="${shopId}"] .shop-illustration img`)).toHaveCount(1);
 await page.screenshot({path:testInfo.outputPath('smoke-shop.png')});
 await page.locator(`.shop-item[data-skill="${shopId}"] button`).click();
 expect(await page.evaluate(id=>(window as any).__relicGame.combat.runBuild.relics.includes(id),shopId)).toBe(true);
 expect(errors).toEqual([]);
});
