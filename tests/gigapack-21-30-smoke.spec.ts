import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
test('one real browser flow: aftershock, satellite, homing star shower and existing XP magnet',async({page})=>{
 test.setTimeout(60000);mkdirSync('artifacts/gigapack-21-30',{recursive:true});await page.setViewportSize({width:844,height:390});
 const errors:string[]=[];const failedAssets:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.url().includes('/effects/')&&r.status()>=400)failedAssets.push(r.url());});
 await page.route('**/src/main.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = window.__batch30Game = new Game();')});});
 await page.goto('/?world=fixed');await page.locator('#start-fusion').click();await page.waitForFunction(()=>(window as any).__batch30Game?.combatView.inspectElemental()?.loaded);
 await page.evaluate(()=>{
  const w=window as any,g=w.__batch30Game,c=g.combat;g.sleep();g.wake=()=>{};g.run.prepare=()=>{};g.run.update=()=>{};
  w.batchPrepare=(ids:string[])=>{c.reset();c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;c.encounters.enabled=false;c.invulnerability=10000;g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);
   if(ids.includes('resonant-aftershock'))c.grantUpgrade('split-on-hit');if(ids.includes('blazing-satellite'))c.grantUpgrade('flame-sweep-weapon');if(ids.includes('prism-shower'))c.grantUpgrade('multishot');
   for(const id of ids)c.grantUpgrade(id);for(const a of c.runBuild.attacks)a.cooldown=10000;g.welcome.hidden=true;};
  w.batchEnemy=(x:number,z:number,hp=1000)=>{const e=c.spawn('normal',x,z,0);e.hp=hp;return e;};
  w.batchStep=(seconds:number)=>{for(let t=0;t<seconds-1e-9;t+=1/120)c.update(1/120,g.position);g.visualTime+=seconds;};
  w.batchDraw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);g.updateHUD();};
 });
 for(const id of ['resonant-aftershock','blazing-satellite','prism-shower','starlit-magnet']){
  await page.evaluate(id=>{const w=window as any;w.batchPrepare([id]);w.batchDraw();},id);
  await page.waitForFunction(id=>(window as any).__batch30Game.combatView.inspect().gigapack.some((b:any)=>b.loaded&&b.url.includes(id==='resonant-aftershock'?'epic_explosion':id==='blazing-satellite'?'fire_looping_004B':id==='prism-shower'?'round_sparkle_burst':'status_sparkling')),id);
  const state=await page.evaluate(async id=>{
   const w=window as any,g=w.__batch30Game,c=g.combat;
   if(id==='resonant-aftershock'){
    const a=w.batchEnemy(3,0),b=w.batchEnemy(3.8,.5),d=w.batchEnemy(3.8,-.5);const events:any[]=[];
    const original=c.damageEnemy.bind(c);c.damageEnemy=(e:any,damage:number,dx:number,dz:number,origin:any,s:any)=>{if(s?.suppressRelics)events.push({damage,root:s.rootId});return original(e,damage,dx,dz,origin,s);};
    c.fireBolts(g.position,a,100,1,10.5,0,'yanrong','spark');w.batchStep(.57);w.batchDraw();c.damageEnemy=original;
    return {aftershock:events.some(e=>e.damage===40),hits:[b.hp,d.hp],effects:c.effects.filter((e:any)=>e.active&&e.vfxPresetId===id).length};
   }
   if(id==='blazing-satellite'){
    const {flameSweepStats}=await import('/src/flame-sweep.ts');
    w.batchEnemy(1.6,0);w.batchEnemy(1.7,.55);w.batchEnemy(1.7,-.55);
    const sweep=flameSweepStats(1),attack={attackId:'flame-sweep',damage:36,range:sweep.radius,rules:c.runBuild.rules('flame-sweep'),fusions:[],sweep};
    const fired=c.performSweep(g.position,attack);if(fired)c.recordWeaponCast(attack);w.batchStep(.2);w.batchDraw();
    const fx=c.effects.find((e:any)=>e.active&&e.vfxPresetId===id);return {active:c.relicBehaviors.gigapack.inspect().satellite,count:c.effects.filter((e:any)=>e.active&&e.vfxPresetId===id).length,radius:Math.hypot(fx.x-c.anchorX,fx.z-c.anchorZ)};
   }
   if(id==='prism-shower'){
    const a=w.batchEnemy(9.5,0,100);w.batchEnemy(9.5,-1.5,100);w.batchEnemy(9.5,-4);w.batchEnemy(7,2);
    c.fireBolts(g.position,a,100,2,10.5,0,'yanrong','spark');
    let triggered=false;for(let i=0;i<100;i++){w.batchStep(1/120);if(c.projectiles.some((p:any)=>p.active&&p.vfxPresetId===id)){triggered=true;break;}}
    w.batchDraw();return {triggered,shards:c.projectiles.filter((p:any)=>p.active&&p.vfxPresetId===id).map((p:any)=>({damage:p.damage,homing:p.homing,suppressed:p.relicSource.suppressRelics})),effects:c.effects.filter((e:any)=>e.active&&e.vfxPresetId===id).length};
   }
   for(let i=0;i<15;i++)Object.assign(c.orbs[i],{active:true,x:4+Math.cos(i)*.7,z:Math.sin(i)*1.7,previousX:4+Math.cos(i)*.7,previousZ:Math.sin(i)*1.7,value:2,magnetized:false});
   const orbs=c.orbs.slice(0,15),values=orbs.map((o:any)=>o.value);
   for(let i=0;i<7;i++){const e=w.batchEnemy(12,0,1);c.damageEnemy(e,100,0,0,'player',c.newRelicSource('spark',c.runBuild.rules('spark'),100));}
   const magnetized=orbs.filter((o:any)=>o.magnetized).length;w.batchStep(.04);w.batchDraw();return {magnetized,values,after:orbs.map((o:any)=>o.value),xp:c.xp};
  },id);
  if(id==='resonant-aftershock'){expect(state.aftershock).toBe(true);expect(state.effects).toBe(1);}
  if(id==='blazing-satellite'){expect(state.active).toBe(true);expect(state.count).toBe(1);expect(state.radius).toBeCloseTo(2.2);}
  if(id==='prism-shower'){expect(state.triggered).toBe(true);expect(state.shards).toHaveLength(3);expect(state.shards!.every((s:any)=>s.damage===30&&s.homing&&s.suppressed)).toBe(true);}
  if(id==='starlit-magnet'){expect(state.magnetized).toBe(12);expect(state.after).toEqual(state.values);expect(state.xp).toBe(0);}
  await page.evaluate(()=>(window as any).batchDraw());
  const raster=await page.evaluate(()=>{
   const g=(window as any).__batch30Game,group=g.combatView.gigapack.group;const canvas=document.createElement('canvas');canvas.width=g.renderer.domElement.width;canvas.height=g.renderer.domElement.height;const ctx=canvas.getContext('2d')!;
   ctx.drawImage(g.renderer.domElement,0,0);const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;group.visible=false;g.renderer.render(g.scene,g.camera);ctx.drawImage(g.renderer.domElement,0,0);const b=ctx.getImageData(0,0,canvas.width,canvas.height).data;group.visible=true;g.renderer.render(g.scene,g.camera);
   let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)count++;return count;
  });
  expect(raster,`${id} must draw real atlas pixels`).toBeGreaterThan(10);
  await page.screenshot({path:`artifacts/gigapack-21-30/${id}.png`});
 }
 const lifecycle=await page.evaluate(()=>{const g=(window as any).__batch30Game,c=g.combat;g.pause('检查暂停');const time=c.elapsed;g.step(.2);const paused=c.elapsed===time;c.reset();g.combatView.clear();return {paused,state:c.relicBehaviors.gigapack.inspect(),batches:g.combatView.inspect().gigapack};});
 expect(lifecycle.paused).toBe(true);expect(lifecycle.state.satellite).toBe(false);expect(lifecycle.batches.every((b:any)=>b.count===0&&b.capacity===48)).toBe(true);expect(errors).toEqual([]);expect(failedAssets).toEqual([]);
});
