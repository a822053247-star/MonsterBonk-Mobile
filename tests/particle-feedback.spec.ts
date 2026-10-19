import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, failed = false) {
  await page.setViewportSize({width:844,height:390});
  if (failed) await page.route('**/particles/kenney-feedback.png', route => route.abort());
  await page.route('**/feedback-harness*', route => route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.sleep();g.updateHUD();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera)};
    window.arrange=()=>{
      g.sleep();const c=g.combat;c.reset();c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;
      c.grantUpgrade('bubble-weapon');c.grantUpgrade('leaf-weapon');
      const target=c.spawn('tank',7,0,0);target.hp=10000;
      for(const [i,species,attack] of [[0,'yanrong','spark'],[1,'bubblesalamander','bubble'],[2,'sproutspike','leaf']]){
        c.fireBolts({x:-3,z:i*1.8-2},target,18,1,10,0,species,attack);
      }
      c.update(.04,g.position);
      for(const [i,kind] of ['hit','water','thorn','burst'].entries()){
        c.effect(-4+i*2.5,-2,kind);const e=c.effects.find(e=>e.active&&e.kind===kind);e.time-=.08;
      }
      document.getElementById('welcome').hidden=true;window.draw();
    };
    window.state=()=>JSON.stringify({combat:g.combat.inspect(),effects:g.combat.effects,shots:g.combat.projectiles});
  </script></body></html>`}));
  await page.goto('/feedback-harness?world=fixed');
  await page.locator('#start-fusion').click();
  await expect.poll(()=>page.evaluate(failed=>(window as any).game.combatView.inspect().feedback?.[failed?'failed':'loaded'],failed)).toBe(true);
  await page.evaluate(()=>(window as any).arrange());
}

test('feedback uses real event clocks, one bounded GPU batch, preserves combat and stops with lifecycle', async ({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text())});
  await open(page);
  const initial=await page.evaluate(()=>{const w=window as any,g=w.game,before=w.state();w.draw();return {same:before===w.state(),feedback:g.combatView.inspect().feedback,geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,calls:g.renderer.info.render.calls,fallback:g.combatView.boltTrails.count}});
  expect(initial.same).toBe(true);expect(initial.feedback.loaded).toBe(true);
  expect(initial.feedback.trails).toBeGreaterThanOrEqual(3);
  expect(initial.feedback.frames).toEqual(expect.arrayContaining([0,1,2,3,4,5]));
  expect(initial.feedback.count).toBeLessThanOrEqual(48);expect(initial.feedback.nearest).toBe(true);
  expect(initial.feedback.depthWrite).toBe(false);expect(initial.fallback).toBe(0);
  expect(initial.feedback.opacity.every((a:number)=>a>0&&a<=1)).toBe(true);
  const changedPixels=await page.evaluate(()=>{
    const g=(window as any).game,r=g.renderer,gl=r.getContext(),size=gl.drawingBufferWidth*gl.drawingBufferHeight*4;
    const withFeedback=new Uint8Array(size),withoutFeedback=new Uint8Array(size);
    r.render(g.scene,g.camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,withFeedback);
    g.combatView.feedback.mesh.visible=false;r.render(g.scene,g.camera);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,withoutFeedback);
    let changed=0;for(let i=0;i<size;i+=4)if(withFeedback[i]!==withoutFeedback[i]||withFeedback[i+1]!==withoutFeedback[i+1]||withFeedback[i+2]!==withoutFeedback[i+2])changed++;
    (window as any).draw();return changed;
  });
  expect(changedPixels).toBeGreaterThan(10);
  if(browserName==='chromium')await page.screenshot({path:'artifacts/particle-feedback-first-batch.png'});
  const stress=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;
    c.effects.forEach((e:any,i:number)=>Object.assign(e,{active:true,kind:'hit',x:i*2,z:0,duration:.32,time:.24,fusionId:undefined}));
    c.projectiles.forEach((s:any,i:number)=>Object.assign(s,{active:true,x:i*.1,z:3,previousX:i*.1,previousZ:3,vx:18,vz:0,distance:2,life:1,hopTargetId:undefined}));
    const before=w.state();g.combatView.detail=4;w.draw();const high=g.combatView.inspect().feedback;
    const calls=g.renderer.info.render.calls;g.combatView.feedback.mesh.visible=false;g.renderer.render(g.scene,g.camera);const without=g.renderer.info.render.calls;
    g.combatView.detail=2;w.draw();const low=g.combatView.inspect().feedback;
    for(let i=0;i<120;i++)w.draw();
    return {high,low,same:before===w.state(),extraCalls:calls-without,textures:g.renderer.info.memory.textures,geometries:g.renderer.info.memory.geometries};
  });
  expect(stress.same).toBe(true);expect(stress.extraCalls).toBe(1);
  expect(stress.high.trails).toBe(24);expect(stress.high.impacts).toBe(6);
  expect(stress.low.trails).toBe(12);expect(stress.low.impacts).toBe(3);
  expect(stress.high.count).toBeLessThanOrEqual(48);expect(stress.low.count).toBeLessThan(stress.high.count);
  expect(stress.textures).toBe(initial.textures);expect(stress.geometries).toBe(initial.geometries);
  await page.locator('#pause').click();
  const frozen=await page.evaluate(()=>JSON.stringify((window as any).game.combatView.inspect().feedback));
  await page.evaluate(()=>(window as any).game.step(1));await page.waitForTimeout(100);
  expect(await page.evaluate(()=>JSON.stringify((window as any).game.combatView.inspect().feedback))).toBe(frozen);
  await page.locator('#resume').click();
  await page.evaluate(()=>{const w=window as any,g=w.game;g.sleep();g.combat.projectiles.forEach((s:any)=>s.active=false);g.combat.effects.forEach((e:any)=>e.time=0);g.combat.update(.01,g.position);w.draw()});
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().feedback.count)).toBe(0);
  const lifecycle=await page.evaluate(()=>{
    const w=window as any,g=w.game,mesh=g.combatView.feedback.mesh;
    g.start('classic',true,false,'legacy-party');g.sleep();w.arrange();
    const legacy=g.combatView.inspect().feedback.count;
    g.start('classic',true,false,'fusion');g.sleep();g.combatView.clear();
    const cleared=g.combatView.inspect().feedback.count,reused=mesh===g.combatView.feedback.mesh;
    g.dispose();return {legacy,cleared,reused,detached:mesh.parent===null};
  });
  expect(lifecycle).toEqual({legacy:0,cleared:0,reused:true,detached:true});
  expect(errors).toEqual([]);
});

test('missing feedback atlas retains existing trail and hit fallback and real damage',async({page})=>{
  await open(page,true);
  const state=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;const target=c.enemies.find((e:any)=>e.active),hp=target.hp;
    c.damageEnemy(target,10,0,0);w.draw();
    return {feedback:g.combatView.inspect().feedback,trails:g.combatView.boltTrails.count,sparks:g.combatView.sparks.count,damage:hp-target.hp};
  });
  expect(state.feedback.failed).toBe(true);expect(state.feedback.count).toBe(0);
  expect(state.trails).toBeGreaterThan(0);expect(state.sparks).toBeGreaterThan(0);expect(state.damage).toBe(10);
});
