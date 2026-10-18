// Arranged encounter in the real dev Game, not a mockup or a production scene.
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.route('**/horn-capture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
      import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
      createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>` }));
    await page.goto('http://127.0.0.1:5173/horn-capture');
    await page.waitForFunction(() => window.game?.inspect().creature.sprite?.loaded);
    await page.locator('#start-trial').tap();
    await page.evaluate(() => {
      const g = window.game; g.sleep(); g.elapsed = 8;
      g.combat.enemies.forEach(e => e.active = false); g.combat.projectiles.forEach(e => e.active = false);
      g.combat.spawnClock = g.combat.fireClock = Infinity;
      g.combat.spawn('fast', 3.5, -3.5, 0); g.combat.spawn('tank', -3, 1.8, 0); g.combat.spawn('normal', 5, 2, 0);
      g.combat.update(1/60, g.position); g.updateHUD(); g.monster.animate(0, 0, false, 8); g.placeCamera(true);
      g.combatView.render(1, 8, g.position); g.renderer.render(g.scene, g.camera);
    });
    await page.screenshot({ path: 'artifacts/horn-trial-duel.png', animations: 'disabled' });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
