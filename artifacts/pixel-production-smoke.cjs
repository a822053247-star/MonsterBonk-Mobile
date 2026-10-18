const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [], failures = [], assets = new Set(), observations = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(response.url());
    if (response.url().includes('/assets/pixel/')) assets.add(response.url().split('/assets/pixel/')[1]);
  });
  try {
    await page.goto('http://127.0.0.1:4176/');
    await page.locator('#start-party').tap();
    await page.waitForTimeout(6500);
    assert.equal(await page.locator('.dash-control').isVisible(), false);
    assert.equal(await page.evaluate(() => '__monsterbonk' in window), false);
    assert.equal(await page.locator('#game-canvas').evaluate(el => getComputedStyle(el).imageRendering), 'pixelated');
    const box = await page.locator('#joystick').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 35, y, id: 1 }] });
    await page.waitForTimeout(1000);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'artifacts/pixel-production-844.png' });
    observations.push({ viewport: '844x390', hp: await page.locator('#health-value').textContent(), kills: await page.locator('#kill-value').textContent() });
    await page.locator('#pause').tap(); const frozen = await page.locator('#timer').textContent();
    await page.waitForTimeout(200); assert.equal(await page.locator('#timer').textContent(), frozen);
    await page.locator('#restart').tap();
    assert.equal(await page.locator('#health-value').textContent(), '100 / 100');
    await page.locator('#pause').tap(); await page.locator('#back-menu').tap();
    await page.setViewportSize({ width: 568, height: 320 });
    await page.locator('#start-party').tap(); await page.waitForTimeout(6100);
    await page.screenshot({ path: 'artifacts/pixel-production-568.png' });
    observations.push({ viewport: '568x320', hp: await page.locator('#health-value').textContent(), kills: await page.locator('#kill-value').textContent() });
    assert.deepEqual([...assets].sort(), ['creatures/paopaoyuan.png', 'creatures/yacishou.png', 'creatures/yanrong-base.png']);
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    const result = { passed: true, browser: 'desktop Chromium software WebGL / phone viewport', actualDeviceTest: false, assets: [...assets], errors, failures, observations };
    fs.writeFileSync('artifacts/pixel-production-smoke.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
