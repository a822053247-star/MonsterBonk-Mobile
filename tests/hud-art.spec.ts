import { test, expect } from '@playwright/test';

test('forest HUD keeps live values, weapon artwork and safe touch targets on landscape phones', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/hud-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.sleep();g.updateHUD();g.renderer.render(g.scene,g.camera)};
  </script></body></html>` }));
  await page.goto('/hud-harness?world=fixed');
  await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const w = window as any, g = w.game;
    g.sleep();g.combat.hp=24;g.combat.progression.gainExperience(3);
    g.combat.runBuild.acquire('bubble');g.combat.runBuild.acquire('leaf');
    document.getElementById('welcome')!.hidden=true;w.draw();
  });
  await expect(page.locator('.health-frame-art')).toHaveClass(/art-loaded/);
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '24');
  await expect(page.locator('#xp-track')).toHaveAttribute('aria-valuenow', '3');
  expect(await page.locator('#health-fill').evaluate(el => el.getBoundingClientRect().width / el.parentElement!.clientWidth)).toBeCloseTo(.24, 2);
  expect(await page.locator('#health-fill').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('233, 149, 100');
  await expect(page.locator('#hud-extra-weapons img.art-loaded')).toHaveCount(2);
  if (browserName === 'chromium') await page.screenshot({ path: 'artifacts/hud-forest-chromium.png' });
  await page.evaluate(() => {
    const w=window as any,g=w.game;g.run.waveIndex=5;g.run.prepare(g.combat,g.position);
    g.combat.encounters.boss.spawnTime=0;g.combat.encounters.boss.hp=1000;
    g.combat.encounters.bossState='recover';w.draw();
  });
  await expect(page.locator('#encounter-name')).toContainText('狂暴');
  for (const width of [844, 568]) {
    await page.setViewportSize({width,height:width===844?390:320});
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-left','44px');
      document.documentElement.style.setProperty('--safe-right','44px');
      document.documentElement.style.setProperty('--safe-bottom','21px');
      (window as any).draw();
    });
    const boss=(await page.locator('#encounter-status').boundingBox())!;
    for(const selector of ['.health-block','.hud-actions','#joystick']) {
      const other=(await page.locator(selector).boundingBox())!;
      expect(boss.x>=other.x+other.width || boss.x+boss.width<=other.x || boss.y>=other.y+other.height || boss.y+boss.height<=other.y).toBe(true);
    }
    expect(boss.x).toBeGreaterThanOrEqual(44);expect(boss.x+boss.width).toBeLessThanOrEqual(width-44);
    for(const selector of ['#pause','#settings']) {
      const rect=(await page.locator(selector).boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(48);expect(rect.height).toBeGreaterThanOrEqual(48);
    }
  }
  if(browserName==='chromium') await page.screenshot({path:'artifacts/hud-boss-small-chromium.png'});
  // A missing decoration must leave the live bars and original icons readable.
  await page.route('**/missing-hud-art.png', route => route.abort());
  await page.locator('.health-frame-art, #hud-extra-weapons img').evaluateAll(images => {
    images.forEach(image => (image as HTMLImageElement).src='/missing-hud-art.png');
  });
  await expect(page.locator('.health-frame-art')).not.toHaveClass(/art-loaded/);
  await expect(page.locator('#hud-extra-weapons .icon').first()).toBeVisible();
  await expect(page.locator('#health-value')).toHaveText('24 / 100');
  expect(await page.locator('.health-panel').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(243, 230, 201)');
});
