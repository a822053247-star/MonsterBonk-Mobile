import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 844, height: 390 } });
test.beforeEach(async ({ page }) => {
  await page.route('**/result-art-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.finishResult=kind=>{
      g.sleep();g.combat.clearWave();g.combat.grantUpgrade('damage');g.combat.grantUpgrade('split-on-hit');g.combat.grantUpgrade('overload-core');g.combat.grantUpgrade('pursuit-route');
      g.combat.hp=64;g.combat.kills=42;g.combat.progression.totalExperience=137;g.run.coins=23;g.run.earned=115;g.run.combatElapsed=180.4;g.run.restElapsed=36.2;
      if(kind==='victory'){
        g.run.waveIndex=5;g.run.completedWaves=5;g.run.prepare(g.combat,g.position);const boss=g.combat.encounters.boss;boss.spawnTime=0;g.combat.damageEnemy(boss,boss.hp,0,0);g.combat.encounters.beforeTick(1.1);g.run.update(.01,g.combat,g.position);
      }else if(kind==='timeout'){
        g.run.waveIndex=5;g.run.completedWaves=5;g.run.waveElapsed=90;g.run.resolveBoundary(g.combat);
      }else{g.combat.hp=0;g.run.update(.01,g.combat,g.position)}
      if((g.run.phase==='won')!==(kind==='victory'))throw new Error('Fixture outcome mismatch: '+g.run.phase);
      g.endRun(kind==='victory'?'victory':'defeat');
    };
    window.resultSnapshot=()=>({kills:g.combat.kills,xp:g.combat.xp,total:g.run.totalElapsed,wave:g.run.wave,earned:g.run.earned,coins:g.run.coins});
  </script></body></html>` }));
});
async function finish(page: import('@playwright/test').Page, kind: string) {
  await page.goto('/result-art-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').click();
  await page.evaluate(kind => (window as any).finishResult(kind), kind);
  await expect(page.locator('#gameover-screen')).toBeVisible();
}

test('victory motion is one shot and reduced motion removes it without delaying actions', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await finish(page,'victory');
  await expect(page.locator('.result-card')).toHaveCSS('animation-name','victory-arrive');
  await expect(page.locator('.result-card')).toHaveCSS('animation-iteration-count','1');
  await expect(page.locator('#gameover-restart')).toBeEnabled();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.result-card')).toHaveCSS('animation-name','none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await finish(page,'defeat');
  await expect(page.locator('.result-card')).toHaveCSS('animation-name','none');
});

test('real victory shows crown, exact current scores and complete build without invented reward', async ({ page }, info) => {
  await finish(page, 'victory');
  const snapshot = await page.evaluate(() => (window as any).resultSnapshot());
  await expect(page.locator('#gameover-screen')).toHaveAttribute('data-outcome', 'victory');
  await expect(page.locator('#result-victory-art')).toBeVisible();
  await expect(page.locator('#result-victory-art')).toHaveClass(/art-loaded/);
  await expect(page.locator('#result-defeat-art')).toBeHidden();
  await expect(page.locator('#result-kills')).toHaveText(String(snapshot.kills));
  await expect(page.locator('#result-xp')).toHaveText(String(snapshot.xp));
  const seconds = Math.floor(snapshot.total);
  await expect(page.locator('#result-time')).toHaveText(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
  await expect(page.locator('#result-weapons')).toContainText('火花弹 1级');
  await expect(page.locator('#result-skills')).toContainText('魔力浓缩 1级');
  await expect(page.locator('#result-fusions')).toContainText('爆裂火种');
  await expect(page.locator('#result-relics')).toContainText('过载核心');
  await expect(page.locator('#result-relics')).toContainText('追猎火种');
  await expect(page.locator('#result-run')).toContainText(`本局获得 ${snapshot.earned} 金币`);
  await expect(page.locator('#result-challenge')).toBeHidden();
  await page.screenshot({ path: `artifacts/adventure-report-victory-${info.project.name}.png` });
  await page.locator('#gameover-restart').click();
  await expect(page.locator('#gameover-screen')).toBeHidden();
  expect(await page.evaluate(() => (window as any).game.combat.runBuild.relics)).toEqual([]);
});

test('health and timeout defeats show real reasons, soft badge, and no victory art or stars', async ({ page }, info) => {
  for (const kind of ['health', 'timeout']) {
    await finish(page, kind);
    await expect(page.locator('#gameover-screen')).toHaveAttribute('data-outcome', 'defeat');
    await expect(page.locator('#result-message')).toContainText(kind === 'health' ? '生命耗尽' : '未能在 90 秒内击败');
    await expect(page.locator('#result-defeat-art')).toHaveClass(/art-loaded/);
    await expect(page.locator('#result-defeat-art')).toBeVisible();
    await expect(page.locator('#result-victory-art')).toBeHidden();
    await expect(page.locator('#result-challenge')).toBeHidden();
    await expect(page.locator('.result-card')).not.toHaveClass(/victorious/);
    await expect(page.locator('#gameover-screen')).not.toContainText('通关奖励');
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-left', '44px');
      document.documentElement.style.setProperty('--safe-right', '44px');
      document.documentElement.style.setProperty('--safe-bottom', '21px');
    });
    await expect(page.locator('#gameover-restart')).toBeInViewport();
    await expect(page.locator('#gameover-menu')).toBeInViewport();
    const card = (await page.locator('.result-card').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(44);
    expect(card.x + card.width).toBeLessThanOrEqual(524);
    expect(card.y + card.height).toBeLessThanOrEqual(299);
    const clean = await page.locator('.result-body').evaluate(body => {
      body.scrollTop = body.scrollHeight;
      const report = body.parentElement!, border = getComputedStyle(report);
      const outer = report.getBoundingClientRect(), inner = body.getBoundingClientRect();
      const last = body.querySelector('#result-relics')!.getBoundingClientRect();
      return inner.left >= outer.left + parseFloat(border.borderLeftWidth)
        && inner.top >= outer.top + parseFloat(border.borderTopWidth)
        && inner.right <= outer.right - parseFloat(border.borderRightWidth)
        && inner.bottom <= outer.bottom - parseFloat(border.borderBottomWidth)
        && body.scrollWidth <= body.clientWidth
        && last.bottom <= inner.bottom + 1;
    });
    expect(clean).toBe(true);
    await page.screenshot({ path: `artifacts/adventure-report-${kind}-${info.project.name}.png` });
    await page.locator('#gameover-menu').click();
    await expect(page.locator('#menu')).toBeVisible();
  }
});

test('missing report images retain readable live data, fallback emblem and usable actions', async ({ page }) => {
  await page.route('**/assets/ui/result/**', route => route.abort());
  await finish(page, 'health');
  await expect(page.locator('.result-art-fallback')).toBeVisible();
  await expect(page.locator('#result-heading')).toBeVisible();
  await expect(page.locator('#result-kills')).toHaveText('42');
  await expect(page.locator('#result-xp')).toHaveText('137');
  await page.locator('#gameover-menu').click();
  await expect(page.locator('#menu')).toBeVisible();
});
