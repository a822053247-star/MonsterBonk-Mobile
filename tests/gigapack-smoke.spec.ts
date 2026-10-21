import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test('Gigapack real combat: lightning, same-shot warp, poison, dash smoke and queued fireworks',async({page},testInfo)=>{
 test.setTimeout(60000);mkdirSync('artifacts/gigapack',{recursive:true});
 await page.setViewportSize({width:844,height:390});
 const errors:string[]=[];const missing:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.url().includes('/effects/')&&r.status()>=400)missing.push(r.url());});
 await page.route('**/src/main.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = window.__gigaGame = new Game();')});});
 await page.goto('/?world=fixed');await page.locator('#start-fusion').click();
 await page.waitForFunction(()=>(window as any).__gigaGame?.combatView.inspectElemental()?.loaded);
 await page.evaluate(()=>{
  const w=window as any,g=w.__gigaGame,c=g.combat;g.sleep();g.wake=()=>{};
  c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;c.encounters.enabled=false;
  g.run.prepare=()=>{};g.run.update=()=>{};c.invulnerability=10000;
  c.grantUpgrade('bubble-weapon');c.grantUpgrade('leaf-weapon');
  for(const id of ['storm-relay','warp-eye','venom-insignia','smokescreen-feather','levelup-salute'])c.grantUpgrade(id);
  g.welcome.hidden=true;
  w.gigaDraw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);g.updateHUD();};
  w.gigaClear=()=>{for(const pool of [c.enemies,c.projectiles,c.effects,c.orbs])for(const e of pool)e.active=false;c.relicBehaviors.reset();c.progression.pendingChoices=0;for(const a of c.runBuild.attacks)a.cooldown=10000;};
  w.gigaTarget=(x:number,z:number)=>{const e=c.spawn('normal',x,z,0);e.hp=1000;return e;};
  w.gigaHit=(e:any,id:string,damage=50)=>c.damageEnemy(e,damage,0,0,'player',c.newRelicSource(id,c.runBuild.rules(id),damage));
  w.gigaStep=(seconds:number)=>{for(let t=0;t<seconds-1e-9;t+=1/120)c.update(1/120,g.position);g.visualTime+=seconds;};
 });
 const cases=['storm-relay','warp-eye','venom-insignia','smokescreen-feather','levelup-salute'];
 for(const id of cases){
  if(id==='smokescreen-feather'){await expect(page.locator('#dash')).toBeVisible();await page.keyboard.press('Space');}
  const state=await page.evaluate(id=>{
   const w=window as any,g=w.__gigaGame,c=g.combat;w.gigaClear();
   if(id==='storm-relay'){
    const a=w.gigaTarget(-2,0),b=w.gigaTarget(-3,-1),d=w.gigaTarget(-3,1);
    for(let i=0;i<4;i++)w.gigaHit(a,'spark');w.gigaStep(.22);w.gigaDraw();return {hits:[b.hp,d.hp]};
   }
   if(id==='warp-eye'){
    const near=w.gigaTarget(2,0),far=w.gigaTarget(6,0);
    for(let i=0;i<6;i++){
     c.projectiles.forEach((p:any)=>p.active=false);c.fireBolts(g.position,near,50,1,10.5,0,'yanrong','spark');
     c.recordWeaponCast({attackId:'spark',damage:50,range:10.5,rules:c.runBuild.rules('spark'),fusions:[]});
    }
    const p=c.projectiles.find((p:any)=>p.active);const state={count:c.projectiles.filter((p:any)=>p.active).length,x:p.x,previousX:p.previousX,nearHp:near.hp,farHp:far.hp};
    w.gigaStep(.42);w.gigaDraw();return state;
   }
   if(id==='venom-insignia'){
    const a=w.gigaTarget(-2,1),b=w.gigaTarget(-3,1),marked=w.gigaTarget(2,-1);
    w.gigaHit(a,'leaf');w.gigaHit(marked,'leaf');w.gigaHit(a,'bubble');w.gigaStep(.35);w.gigaDraw();return {splash:b.hp,mark:marked.venomUntil>c.elapsed};
   }
   if(id==='smokescreen-feather'){
    const e=w.gigaTarget(0,1);g.step(1/120);w.gigaStep(.25);w.gigaDraw();return {slow:c.relicBehaviors.slowFactor(e),hp:e.hp,dashCooldown:g.cooldown,smoke:c.relicBehaviors.gigapack.inspect().smoke};
   }
   const e=Array.from({length:5},(_,i)=>w.gigaTarget(-3+i*1.5,-1));
   // Confirm a real offer through Combat.chooseUpgrade, then allow a combat tick to deliver.
   c.progression.gainExperience(8);const choice=c.progression.offers[0];const accepted=c.chooseUpgrade(choice);
   while(c.progression.awaitingChoice)c.chooseUpgrade(c.progression.offers[0]);
   const before=e.map((x:any)=>x.hp);w.gigaStep(.35);w.gigaDraw();return {accepted,before,after:e.map((x:any)=>x.hp),pending:c.relicBehaviors.gigapack.inspect().pendingSalute};
  },id);
  if(id==='storm-relay')expect(state.hits).toEqual([977.5,977.5]);
  if(id==='warp-eye'){expect(state.count).toBe(1);expect(state.x).toBeCloseTo(4.9);expect(state.previousX).toBe(state.x);expect(state.nearHp).toBe(1000);}
  // Leaf -> bubble also legitimately activates the owned cross-weapon relay (25 poison + 22.5 lightning).
  if(id==='venom-insignia'){expect(state.splash).toBe(952.5);expect(state.mark).toBe(true);}
  if(id==='smokescreen-feather'){expect(state.slow).toBe(.6);expect(state.hp).toBe(1000);expect(state.dashCooldown).toBeGreaterThan(0);expect(state.smoke?.x).toBe(0);expect(state.smoke?.z).toBe(0);}
  if(id==='levelup-salute'){expect(state.accepted).toBe(true);expect(state.pending).toBe(false);expect(state.after!.filter((hp:number)=>hp<1000)).toHaveLength(4);}
  await page.waitForFunction(id=>{const entries=(window as any).__gigaGame.combatView.inspect().gigapack;return entries.some((b:any)=>b.url.includes(id==='storm-relay'?'lightning_strike':id==='warp-eye'?'scifi_warp':id==='venom-insignia'?'spell_poison':id==='smokescreen-feather'?'looping_smoke':'round_firework')&&b.loaded);},id);
  await page.evaluate(()=>(window as any).gigaDraw());
  const rendered=await page.evaluate(()=>(window as any).__gigaGame.combatView.inspect().gigapack);
  expect(rendered.some((b:any)=>b.count>0)).toBe(true);expect(rendered.every((b:any)=>b.count<=b.capacity&&!b.failed)).toBe(true);
  const changedPixels=await page.evaluate(()=>{
   const g=(window as any).__gigaGame,group=g.combatView.gigapack.group;
   const canvas=document.createElement('canvas');canvas.width=g.renderer.domElement.width;canvas.height=g.renderer.domElement.height;
   const ctx=canvas.getContext('2d')!;
   ctx.drawImage(g.renderer.domElement,0,0);const before=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   group.visible=false;g.renderer.render(g.scene,g.camera);ctx.drawImage(g.renderer.domElement,0,0);const after=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   group.visible=true;g.renderer.render(g.scene,g.camera);
   let changed=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>20)changed++;
   return changed;
  });
  expect(changedPixels,`${id}: atlas pixels must reach the actual framebuffer`).toBeGreaterThan(20);
  await page.screenshot({path:testInfo.outputPath(`${id}.png`)});
 }
 const paused=await page.evaluate(()=>{const g=(window as any).__gigaGame,c=g.combat;g.pause('检查暂停');const elapsed=c.elapsed;g.step(.2);return c.elapsed===elapsed;});
 expect(paused).toBe(true);expect(errors).toEqual([]);expect(missing).toEqual([]);
});
