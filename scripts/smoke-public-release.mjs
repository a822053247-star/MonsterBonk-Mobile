import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Run against the packaged production site, not Vite's development build.
const base = process.argv[2] ?? 'http://127.0.0.1:5177/';
const browser = await chromium.launch({args:['--enable-unsafe-swiftshader']});
try {
  const context = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await context.addInitScript(() => localStorage.setItem('monsterbonk-settings',JSON.stringify({quality:'battery',music:false,sound:false,gameSpeed:10})));
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const [region,title] of [['meadow','繁花草甸'],['ruins','晶石遗迹'],['snowfield','永恒雪原'],['volcano','熔岩火山']]) {
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('#start-infinite').waitFor();
    assert.equal(await page.locator('.menu-footer').isVisible(),false,'Public test footer must be hidden');
    for(const id of ['open-new-feature-test','open-item-test','start-capture-test','start-enemy-test','open-legacy'])assert.equal(await page.locator('#'+id).isVisible(),false,id);
    await page.locator('#menu-settings').click();
    assert.deepEqual(await page.locator('#game-speed-setting option').evaluateAll(a=>a.map(e=>e.value)),['1','2']);
    assert.equal(await page.locator('#game-speed-setting').inputValue(),'2','Old 10x settings must clamp to 2x');
    await page.locator('#save-settings').click();
    await page.locator('#endless-start-region').selectOption(region);
    await page.locator('#start-infinite').click();
    await page.locator('#world-loading').waitFor({state:'hidden',timeout:90000});
    await page.waitForFunction(()=>document.getElementById('timer')?.textContent!=='00:00',{},{timeout:90000});
    assert.equal(await page.locator('#region-status').textContent(),title,'Map must load without fallback');
    assert.equal(await page.locator('#game-speed').textContent(),'2×');
    await page.locator('#game-speed').click();
    assert.equal(await page.locator('#game-speed').textContent(),'1×');
    assert.deepEqual(errors,[],'No uncaught runtime errors');
    console.log(`PASS production ${region}: hidden test entries, 2x cap, map loaded and timer advancing`);
  }
  await context.close();
} finally { await browser.close(); }
