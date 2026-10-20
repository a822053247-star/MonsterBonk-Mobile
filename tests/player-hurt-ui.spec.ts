import {test,expect} from '@playwright/test';

test('all three pixel leaders visibly recoil and blink after actual body damage through the Game render path',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:844,height:390});
  await page.route('**/player-hurt-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.drawHurt=()=>{
      g.sleep();const step=g.step;g.step=()=>{};g.mode='playing';g.renderTime=0;g.lastTime=performance.now();
      g.frame(g.lastTime+1);g.sleep();g.mode='paused';g.step=step;
      return g.partyView.inspect().members[0];
    };
    window.arrangeHurt=species=>{
      g.sleep();g.party.reset([species]);g.combat.reset();g.combat.encounters.beginWave(2);g.combat.obstacles=[];g.combat.automaticSpawning=false;g.combat.useNavigation=false;
      g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);
      for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      g.welcome.hidden=true;return window.drawHurt();
    };
    window.touchEnemy=()=>{
      const e=g.combat.spawn('normal',.4,0,0);e.swarm=true;g.combat.update(1/60,g.position);
      return {hp:g.combat.hp,view:window.drawHurt()};
    };
  </script></body></html>`}));
  await page.goto('/player-hurt-harness?world=fixed');await page.locator('#start-fusion').click();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.wake=()=>{};});
  for(const species of ['yanrong','bubblesalamander','sproutspike']){
    await page.evaluate(species=>(window as any).arrangeHurt(species),species);
    await expect.poll(()=>page.evaluate(()=>(window as any).drawHurt().loaded)).toBe(true);
    const before=await page.evaluate(()=>(window as any).drawHurt());
    const hit=await page.evaluate(()=>(window as any).touchEnemy());
    expect(hit.hp).toBe(97);
    expect(hit.view.hurtPose.scale[0]).toBeGreaterThan(before.hurtPose.scale[0]);
    expect(hit.view.hurtPose.scale[1]).toBeLessThan(before.hurtPose.scale[1]);
    const recoil=await page.evaluate(()=>{const w=window as any;w.game.combat.hurtFlash=.16;return w.drawHurt()});
    expect(Math.abs(recoil.hurtPose.rotation)).toBeGreaterThan(.01);
    await page.screenshot({path:`artifacts/player-hurt-${species}-${info.project.name}.png`});
    const blink=await page.evaluate(()=>{const w=window as any;w.game.combat.hurtFlash=0;w.game.combat.invulnerability=.2;w.game.visualTime=.001;return w.drawHurt()});
    expect(blink.hurtPose.opacity).toBe(.5);
    const restored=await page.evaluate(()=>{const w=window as any;w.game.combat.invulnerability=0;return w.drawHurt()});
    expect(restored.hurtPose.opacity).toBe(1);expect(restored.hurtPose.rotation).toBe(0);
    expect(restored.hurtPose.scale).toEqual(before.hurtPose.scale);
  }
  expect(errors).toEqual([]);
});
