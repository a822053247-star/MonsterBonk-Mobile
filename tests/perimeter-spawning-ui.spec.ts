import { test, expect } from '@playwright/test';

test('real camera births stay outside the viewport and approaching enemies leave room to move',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:720});
  await page.route('**/perimeter-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.probe=(wave,seconds)=>{
      g.sleep();g.combat.clearWave();g.run.waveIndex=wave-1;g.run.waveElapsed=0;g.position.set(0,0,0);g.combat.invulnerability=10000;
      for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      g.monster.root.position.copy(g.position);g.placeCamera(true);g.camera.updateMatrixWorld();
      document.getElementById('welcome').hidden=true;
      let inView=0,ordinary=0,maxPulse=0;const seen=new Set();
      for(let i=0;i<seconds*60;i++){
        g.step(1/60);let pulse=0;
        for(const e of g.combat.enemies)if(e.active&&!seen.has(e.id)){
          seen.add(e.id);if(e.rank||e.kind==='draft-treasure-runner')continue;
          ordinary++;pulse++;const p=g.position.clone().set(e.x,1.2,e.z).project(g.camera);
          if(Math.abs(p.x)<=1&&Math.abs(p.y)<=1)inView++;
        }
        maxPulse=Math.max(maxPulse,pulse);
      }
      g.sleep();g.partyView.render(1,g.visualTime);g.placeCamera(true);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera);
      return {ordinary,inView,maxPulse,active:g.combat.enemies.filter(e=>e.active).length,viewport:g.combat.spawnViewport};
    };
  </script></body></html>`}));
  await page.goto('/perimeter-harness?world=fixed');await page.locator('#start-fusion').click();
  await page.evaluate(()=>(window as any).game.sleep());
  await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().batches.filter((b:any)=>b.loaded).length)).toBe(6);
  for(const [size,wave,seconds] of [[{width:1280,height:720},1,20],[{width:844,height:390},5,28]] as const) {
    await page.setViewportSize(size);
    const state=await page.evaluate(({wave,seconds})=>(window as any).probe(wave,seconds),{wave,seconds});
    expect(state.ordinary).toBeGreaterThan(5);expect(state.inView).toBe(0);expect(state.maxPulse).toBe(1);
    expect(state.active).toBeLessThanOrEqual(wave===1?36:112);
    if(info.project.name==='chromium')await page.screenshot({path:`artifacts/difficulty-wave-${wave}.png`});
  }
  expect(errors).toEqual([]);
});
