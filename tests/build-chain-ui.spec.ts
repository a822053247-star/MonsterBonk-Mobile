import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('four real build demonstrations support seeking, playback and phone layout',async({page},info)=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text())});
  await page.setViewportSize({width:1120,height:850});
  await page.goto('/build-chain-preview.html');
  await page.waitForFunction(()=>!!(window as any).buildChainPreview);
  await page.evaluate(()=>(window as any).buildChainPreview.pause());
  await expect.poll(()=>page.evaluate(()=>{
    const v=(window as any).buildChainPreview.inspect().view;
    return v.fire.loaded&&v.elemental.loaded&&v.reactions.loaded;
  })).toBe(true);
  const poses:number[]=[];
  for(let i=0;i<4;i++) {
    await page.evaluate(i=>(window as any).buildChainPreview.pose(i,1.4),i);
    const snapshot=await page.evaluate(()=>(window as any).buildChainPreview.inspect());
    expect(snapshot.combat.kills).toBeGreaterThan(0);poses.push(snapshot.combat.kills);
    if(i===1)expect(snapshot.combat.triggerRelics.maxGeneration).toBe(3);
    if(i>=2)expect(snapshot.combat.triggerRelics.steamBursts).toBeGreaterThan(0);
  }
  expect(poses[1]).toBeGreaterThan(poses[0]);
  await page.locator('#next-frame').click();await expect(page.locator('#play')).toHaveText('播放');
  await page.locator('#replay').click();await expect(page.locator('#time')).toHaveText('0.00 秒');
  await page.locator('#play').click();await expect.poll(()=>page.evaluate(()=>(window as any).buildChainPreview.inspect().time)).toBeGreaterThan(0);
  await page.locator('#play').click();
  // The first actual render uses the same state as replay, with no visual damage mutation.
  if(info.project.name==='chromium') {
    mkdirSync('artifacts',{recursive:true});
    await page.evaluate(()=>(window as any).buildChainPreview.pose(3,.72));
    await page.screenshot({path:'artifacts/build-chain-preview-desktop.png'});
    // Capture a short real-render sequence for the user-facing animation.
    const dir='test-results/build-chain-frames';mkdirSync(dir,{recursive:true});
    for(let frame=0;frame<40;frame++) {
      await page.evaluate(frame=>(window as any).buildChainPreview.pose(3,.15+frame*.06),frame);
      await page.locator('.stage').screenshot({path:`${dir}/${String(frame).padStart(3,'0')}.png`});
    }
  }
  for(const size of [{width:375,height:812},{width:844,height:390}]) {
    await page.setViewportSize(size);await page.evaluate(()=>(window as any).buildChainPreview.pose(2,.8));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
    const button=await page.locator('#play').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
    await page.locator('#next-frame').focus();await page.keyboard.press('Enter');
    if(info.project.name==='chromium'&&size.width===375)await page.screenshot({path:'artifacts/build-chain-preview-phone.png',fullPage:true});
  }
  expect(errors).toEqual([]);
});

test('preview honors reduced motion and steam art works in real upgrades',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/build-chain-preview.html');
  await expect(page.locator('#play')).toHaveText('播放');
  await page.locator('#next-frame').click();await expect(page.locator('#time')).not.toHaveText('0.00 秒');
  await page.route('**/chain-art-harness',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
  </script></body></html>`}));
  await page.goto('/chain-art-harness');await page.locator('#start-fusion').click();
  await page.evaluate(async()=>{
    const g=(window as any).game;g.sleep();g.combat.grantUpgrade('bubble-weapon');
    const {renderUpgradeCards}=await import('/src/ui.ts');
    g.combat.progression.pendingChoices=1;g.combat.progression.currentOffers=['draft-boiling-core'];
    renderUpgradeCards(g.combat.progression,1);document.getElementById('upgrade-screen')!.hidden=false;
  });
  await expect(page.locator('[data-skill="draft-boiling-core"] .skill-illustration')).toHaveCount(2);
  for(const image of await page.locator('[data-skill="draft-boiling-core"] .skill-illustration').all())await expect(image).toHaveClass(/art-loaded/);
});
