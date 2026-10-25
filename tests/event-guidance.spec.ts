import {test,expect} from '@playwright/test';

test('altar starts outside the viewport with a guide; runner prompts stay unique',async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:844,height:390});
  await page.route('**/event-guidance-harness*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();</script></body></html>`}));
  await page.goto('/event-guidance-harness');
  await page.locator('#start-infinite').click();
  await expect(page.locator('#world-loading')).toBeHidden({timeout:20000});
  await page.locator('#pause').click();
  const result=await page.evaluate(async()=>{
    const g=(window as any).game;
    // Exercise real view classes in a controlled battle, without waiting three waves.
    const [{EndlessAltarEvent},{RunFlow},{AltarGuide},{TreasureTrackerView},{Combat}]=await Promise.all([
      import('/src/endless-altar.ts'),import('/src/run-flow.ts'),import('/src/altar-guide.ts'),
      import('/src/treasure-tracker-view.ts'),import('/src/combat.ts')]);
    const run=new RunFlow(Math.random,'endless');run.waveIndex=2;run.waveElapsed=8;
    const altar=new EndlessAltarEvent();
    const view={x:0,z:0,halfWidth:20,halfDepth:12};
    const change=altar.update(run,{x:0,z:0},[],view);
    g.placeCamera(true);const camera=g.camera;
    const guide=new AltarGuide();guide.render(true,altar.position,{x:0,z:0},camera);
    const guideText=guide.root.textContent,rect=guide.root.getBoundingClientRect();
    guide.dispose();
    const c=new Combat([],64);c.automaticSpawning=false;c.encounters.beginWave(2);
    for(const [x,z] of [[2,1],[4,1],[50,0],[-50,0]])c.spawn('draft-treasure-runner',x,z,0);
    const tracker=new TreasureTrackerView(c,()=>2.4);tracker.setView(camera,720,24);tracker.render(1);
    const visible=tracker.inspect();
    for(const e of c.enemies)if(e.active){e.x=e.previousX=50+e.id;e.z=e.previousZ=0;}
    tracker.render(1);const outside=tracker.inspect();
    tracker.clear();const cleared=tracker.inspect();tracker.dispose();
    return {change,position:altar.position,guideText,guideFits:rect.left>=0&&rect.right<=innerWidth,
      visible,outside,cleared,playing:g.inspect().mode};
  });
  expect(result.change).toBe('spawn');
  expect(result.position.z+8).toBeLessThan(-12);
  expect(result.guideText).toContain('元素祭坛');expect(result.guideFits).toBe(true);
  expect(result.visible.runners).toBeGreaterThan(1);expect(result.visible.prompts).toBe(1);
  expect(result.outside.offscreen).toBe(1);expect(result.outside.prompts).toBe(1);
  expect(result.cleared.prompts).toBe(0);
  await page.locator('#exploration-controls').evaluate(el=>{el.hidden=false;el.classList.add('is-countdown');});
  await page.locator('#exploration-detail').evaluate(el=>{el.hidden=false;el.textContent='打开宝箱仅剩 20 秒';});
  expect(await page.locator('#exploration-detail').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
});
