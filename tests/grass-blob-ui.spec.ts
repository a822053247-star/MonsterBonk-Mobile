import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test('grass roll, fixed warning and existing thorn atlas render on desktop and phone',async({page},info)=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1000,height:650});
  await page.route('**/grass-blob-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><div id="grass-label" style="position:fixed;left:30px;top:25px;color:#fff0bd;background:#153124df;padding:12px 20px;border-radius:10px;font:16px sans-serif;z-index:100;pointer-events:none">草团 · 滚动接近 → 扎根 → 草刺绽放</div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.drawGrass=()=>{g.sleep();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera)};
    window.arrangeGrass=()=>{
      g.sleep();g.combat.clearWave();g.combat.encounters.beginWave(2);g.combat.obstacles=[];g.combat.useNavigation=false;
      g.combat.automaticSpawning=false;g.combat.hp=100;g.combat.invulnerability=10000;
      g.position.set(0,0,0);g.party.syncLeader(g.position,Math.PI/2);
      for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      const e=window.grass=g.combat.spawn('normal',5,0,0);e.hp=e.maxHp=200;e.swarm=true;
      g.welcome.hidden=true;document.querySelector('.hud').style.visibility='hidden';
      g.camera.zoom=1.65;g.camera.updateProjectionMatrix();window.drawGrass();
    };
    window.stepGrass=seconds=>{for(let i=0;i<Math.round(seconds*60);i++){g.party.syncLeader(g.position,0);g.combat.update(1/60,g.position);g.visualTime+=1/60}window.drawGrass();return {intent:window.grass.intent,grass:g.combatView.inspect().grass}};
  </script></body></html>`}));
  await page.goto('/grass-blob-harness?world=fixed');await page.locator('#start-fusion').click();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.wake=()=>{};});
  await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().grass.thorns.loaded)).toBe(true);
  await page.evaluate(()=>(window as any).arrangeGrass());
  await page.evaluate(()=>(window as any).stepGrass(.15));
  const pivot=await page.evaluate(()=>{
    const w=window as any,g=w.game,v=g.combatView.pixelEnemies;
    const batch=v.batches.get('normal'),m=batch.mesh.instanceMatrix.array,e=w.grass;
    const center=200/256/2,height=v.height('normal')*.975/2,up=g.camera.matrixWorld.elements;
    return {angle:batch.rolls[0],center:[m[12]+m[4]*center,m[13]+m[5]*center,m[14]+m[6]*center],
      expected:[e.x+up[4]*height,.035+up[5]*height,e.z+up[6]*height]};
  });
  expect(pivot.angle).toBeCloseTo(Math.sin(Math.PI/4)*.14);
  pivot.center.forEach((value:number,i:number)=>expect(value).toBeCloseTo(pivot.expected[i],4));
  const crowdedAngle=await page.evaluate(()=>{
    const w=window as any;
    for(let i=0;i<24;i++)w.game.combat.spawn('normal',10+(i%4)*.3,5+Math.floor(i/4)*.3,0);
    w.drawGrass();return w.game.combatView.inspect().batches.find((b:any)=>b.kind==='normal').rolls[0];
  });
  expect(crowdedAngle).toBeCloseTo(pivot.angle*12/25);
  await page.evaluate(()=>(window as any).arrangeGrass());
  let warnings=0,bursts=0;
  if(info.project.name==='chromium')mkdirSync('artifacts/grass-blob-frames',{recursive:true});
  for(let frame=0;frame<66;frame++){
    const state=await page.evaluate(()=>(window as any).stepGrass(.1));
    warnings=Math.max(warnings,state.grass.warnings);bursts=Math.max(bursts,state.grass.bursts);
    if(info.project.name==='chromium')await page.screenshot({path:`artifacts/grass-blob-frames/${String(frame).padStart(3,'0')}.png`});
    if(state.grass.warnings)await expect(page.locator('#grass-label')).toBeVisible();
  }
  expect(warnings).toBe(1);expect(bursts).toBe(1);
  await page.setViewportSize({width:568,height:320});
  await page.evaluate(()=>{(window as any).arrangeGrass();const e=(window as any).grass;e.x=e.previousX=1.1;});
  const mobile=await page.evaluate(()=>(window as any).stepGrass(.1));
  expect(mobile.grass.warnings).toBe(1);
  await page.screenshot({path:`artifacts/grass-blob-warning-${info.project.name}.png`});
  const strike=await page.evaluate(()=>(window as any).stepGrass(.75));
  expect(strike.grass.bursts).toBe(1);expect(strike.grass.thorns.count).toBe(6);
  expect(strike.grass.thorns.frames.every((f:number)=>f>=17&&f<=22)).toBe(true);
  await page.screenshot({path:`artifacts/grass-blob-strike-${info.project.name}.png`});
  // Genuine knockback removes the warning and creates no false strike tail.
  await page.evaluate(()=>{const w=window as any;w.arrangeGrass();w.grass.x=w.grass.previousX=1.1;w.stepGrass(.1);w.game.combat.damageEnemy(w.grass,1,1,0);w.drawGrass()});
  const interrupted=await page.evaluate(()=>(window as any).game.combatView.inspect().grass);
  expect(interrupted.warnings).toBe(0);expect(interrupted.bursts).toBe(0);
  expect(errors).toEqual([]);
});
