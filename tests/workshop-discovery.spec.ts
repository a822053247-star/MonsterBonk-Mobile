import {test,expect} from '@playwright/test';

test('workshop events and the local preset appear offscreen with a discoverable guide',async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:568,height:320});
  await page.route('**/workshop-discovery-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();</script></body></html>`}));
  await page.goto('/workshop-discovery-harness');await page.locator('#start-infinite').waitFor();
  await page.evaluate(()=>(window as any).game.start('classic',true,false,'infinite','lost-workshop'));
  await expect(page.locator('#world-loading')).toBeHidden({timeout:20000});
  const guide=page.locator('.workshop-guide');await expect(guide).toBeVisible();await expect(guide).toContainText('元素工坊');
  const result=await page.evaluate(async()=>{
    const g=(window as any).game,view=g.cameraFootprint(),e=g.exploration.event;
    const outside=(p:any)=>Math.abs(p.x-view.x)>view.halfWidth+2.5||Math.abs(p.z-view.z)>view.halfDepth+2.5;
    const {EndlessExploration}=await import('/src/endless-exploration.ts');
    const natural=new EndlessExploration();g.run.waveElapsed=8;g.combat.clearWave();
    natural.step(1/60,g.run,g.combat,g.position,[],true,view);
    return {preset:outside(e),natural:outside(natural.event),kind:natural.event?.kind};
  });
  expect(result).toEqual({preset:true,natural:true,kind:'lost-workshop'});
  const box=(await guide.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(568);
  const clock=(await page.locator('.run-status').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(clock.y+clock.height+18);
  await page.locator('#pause').click();await expect(guide).toBeHidden();await page.locator('#resume').click();
  await page.evaluate(()=>{const g=(window as any).game,e=g.exploration.event;g.position.set(e.x,0,e.z);g.previousPosition.copy(g.position);});
  await expect(page.locator('#exploration-interact')).toBeVisible();await expect(guide).toBeHidden();
  await expect(page.locator('#exploration-interact')).toHaveText('按E 使用工坊');
});
