import { test, expect } from '@playwright/test';

test('pink weapons, overhead marks, bloom, death links and echo use supplied art without generic fire',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/i.test(m.text()))errors.push(m.text());});
  await page.route('**/dream-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`
    <!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import {ATTACKS} from '/src/run-build.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{document.getElementById("world-loading").hidden=true;g.placeCamera(true);g.party.syncLeader(g.position,0);g.partyView.render(1,g.combat.elapsed);g.monster.root.visible=!g.partyView.hasPixelLeader;g.updateHUD();g.combatView.render(1,g.combat.elapsed,g.position);g.renderer.render(g.scene,g.camera)};
    window.reset=()=>{g.sleep();g.wake=()=>{};const c=g.combat;c.reset();c.automaticSpawning=false;c.obstacles=[];c.invulnerability=10000;
      g.position.set(0,0,0);g.previousPosition.copy(g.position);c.grantUpgrade('dream-dart-weapon');c.grantUpgrade('resonance-seed-weapon');
      for(const a of c.runBuild.attacks)a.cooldown=10000;document.getElementById('welcome').hidden=true;};
    window.target=(x,z=0)=>{const e=g.combat.spawn('normal',x,z,0);e.hp=1000;return e;};
    window.fire=(e,id)=>{const c=g.combat,r=c.runBuild.rules(id);c.fireBolts({x:0,z:0},e,ATTACKS[id].damage*r.damageMultiplier,1,11,0,'yanrong',id);return c.projectiles.find(s=>s.active&&s.attackId===id)};
    window.emit=(e,id)=>{const s=window.fire(e,id);for(let i=0;i<200&&s.active;i++)g.combat.update(1/120,g.position)};
    window.step=n=>{for(let i=0;i<n;i++)g.combat.update(1/120,g.position)};
    </script></html>`}));
  await page.goto('/dream-harness?world=fixed',{waitUntil:'domcontentloaded'});await page.locator('#start-fusion').click();
  await page.evaluate(()=>(window as any).reset());
  await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().dream.atlases.every((a:any)=>a.loaded)),{timeout:45000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().batches.find((b:any)=>b.kind==='normal')?.loaded),{timeout:30000}).toBe(true);
  const flight=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat,e=w.target(5);
    w.target(5,1.8);w.target(6.5,-1);w.target(7,1.6);w.emit(e,'dream-dart');w.emit(e,'dream-dart');
    w.fire(e,'dream-dart');w.step(9);w.draw();w.main=e;
    return {state:c.dream.inspect(),view:g.combatView.inspect().dream,fire:g.combatView.firePixels.mesh.count};
  });
  expect(flight.state.marks.some((m:any)=>m.stacks===2)).toBe(true);expect(flight.view.atlases[0].count).toBeGreaterThan(0);
  expect(flight.view.atlases[2].count).toBeGreaterThan(0);expect(flight.fire).toBe(0);
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('#hud-extra-weapons img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.evaluate(()=>(window as any).draw());
  await page.screenshot({path:'artifacts/dream/dream-dart-and-marks.png'});
  const bloom=await page.evaluate(()=>{const w=window as any,c=w.game.combat;for(let i=0;i<120&&!c.dream.telemetry.blooms;i++)w.step(1);w.step(15);w.draw();return{state:c.dream.inspect(),view:w.game.combatView.inspect().dream};});
  expect(bloom.state.blooms).toBe(1);expect(bloom.view.atlases[3].count).toBeGreaterThan(0);
  await page.screenshot({path:'artifacts/dream/three-mark-bloom.png'});
  const links=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;w.reset();for(let i=1;i<5;i++)c.grantUpgrade('resonance-seed-weapon');
    const enemies=Array.from({length:5},(_,i)=>w.target(4.2+i*.85));w.emit(enemies[0],'resonance-seed');
    const p=enemies[0];for(const [i,dx,dz] of [[1,1.5,-1.2],[2,2.4,.8],[3,.2,2.3],[4,3.6,2.5]]){
      enemies[i].x=enemies[i].previousX=p.x+dx;enemies[i].z=enemies[i].previousZ=p.z+dz;
    }
    enemies[0].hp=1;w.emit(enemies[0],'spark');w.step(6);w.draw();
    return{state:c.dream.inspect(),view:g.combatView.inspect().dream};
  });
  expect(links.state.transfers).toBe(1);expect(links.state.transferHits).toBe(3);expect(links.view.links).toBe(3);
  await page.screenshot({path:'artifacts/dream/resonance-seed-links.png'});
  const echo=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;w.reset();
    const e=w.target(5);w.target(5,1.7);w.target(7,1);w.target(6,-1.8);
    w.emit(e,'resonance-seed');w.emit(e,'dream-dart');w.emit(e,'dream-dart');
    c.grantUpgrade('sakura-echo');w.step(20);w.draw();
    return{state:c.dream.inspect(),view:g.combatView.inspect().dream};
  });
  expect(echo.state.pulses).toBe(1);expect(echo.state.extensions).toBeGreaterThan(0);
  await expect(page.locator('#hud-extra-weapons img[alt="绯樱回响"]')).toBeVisible();
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('#hud-extra-weapons img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.evaluate(()=>(window as any).draw());
  await page.screenshot({path:'artifacts/dream/sakura-echo-topdown.png'});
  await page.setViewportSize({width:844,height:390});
  const low=await page.evaluate(()=>{const w=window as any,g=w.game,before=JSON.stringify(g.combat.inspect());g.combatView.detail=2;w.draw();return{same:before===JSON.stringify(g.combat.inspect()),view:g.combatView.inspect().dream};});
  expect(low.same).toBe(true);for(const a of low.view.atlases)expect(a.count).toBeLessThanOrEqual(a.capacity);
  expect(low.view.petals).toBeLessThanOrEqual(256);expect(low.view.links).toBeLessThanOrEqual(128);
  await page.screenshot({path:'artifacts/dream/sakura-echo-mobile.png'});
  const cleared=await page.evaluate(()=>{const w=window as any,g=w.game;g.combat.clearTransientEffects();w.draw();return{state:g.combat.dream.inspect(),view:g.combatView.inspect().dream};});
  expect(cleared.state).toMatchObject({marks:[],pending:0,effects:0});expect(cleared.view.atlases.every((a:any)=>a.count===0)).toBe(true);
  expect(cleared.view.petals+cleared.view.stars+cleared.view.links).toBe(0);expect(errors).toEqual([]);
});
