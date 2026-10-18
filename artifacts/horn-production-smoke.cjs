const { chromium, webkit } = require('@playwright/test');
const fs = require('node:fs/promises');
(async () => {
  const results = [];
  for (const name of ['chromium', 'webkit']) {
    const browser = await (name === 'chromium' ? chromium : webkit).launch(name === 'chromium' ? { args: ['--enable-unsafe-swiftshader'] } : {});
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/'); await page.locator('#start-trial').waitFor();
    const diagnosticsAbsent = await page.evaluate(() => !('__monsterbonk' in window));
    if (name === 'chromium') await page.screenshot({ path: 'artifacts/horn-production-menu.png' });
    await page.locator('#start-trial').tap();
    await page.waitForFunction(() => Number(document.getElementById('kill-value').textContent) > 0, {}, { timeout: 20000 });
    await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
    await page.locator('#dash').tap(); await page.waitForTimeout(350);
    if (name === 'chromium') await page.screenshot({ path: 'artifacts/horn-production-playing.png' });
    await page.locator('#pause').tap(); const timer = await page.locator('#timer').textContent();
    await page.waitForTimeout(200); if (timer !== await page.locator('#timer').textContent()) throw Error('Paused timer advanced');
    await page.locator('#restart').tap();
    if (!await page.locator('#trial-status').isVisible() || !/0\/6/.test(await page.locator('#trial-progress').textContent())) throw Error('Trial restart failed');
    await page.locator('#pause').tap(); await page.locator('#back-menu').tap(); await page.locator('#start').tap();
    const classic = !await page.locator('#trial-status').isVisible();
    const errorScreen = await page.locator('#error-screen').isVisible();
    if (!classic || !diagnosticsAbsent || errors.length || errorScreen) throw Error(JSON.stringify({ classic, diagnosticsAbsent, errors, errorScreen }));
    results.push({ browser: name, viewport: '844x390', diagnosticsAbsent, trialStartRestartAndClassicReturn: true, autoAttackKillObserved: true, pausedTimerFrozen: true, errors });
    await browser.close();
  }
  await fs.writeFile('artifacts/horn-production-smoke.json', JSON.stringify({ environment: 'Windows desktop browser emulation; no physical phone test or FPS claim', results }, null, 2));
  console.log(results);
})().catch(e => { console.error(e); process.exitCode = 1; });
