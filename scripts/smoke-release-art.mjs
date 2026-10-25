import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { releaseAssets } from './release-assets.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5177/';
const browser = await chromium.launch({args:['--enable-unsafe-swiftshader']});
try {
  const context = await browser.newContext({serviceWorkers:'block'});
  const page = await context.newPage();
  // A same-origin empty page isolates image decoding from gameplay/network contention.
  const harness = new URL('art-check.html', base).href;
  await page.route(harness, route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Release image check</title>'}));
  await page.goto(harness);
  const failures = await page.evaluate(async ({base,paths}) => {
    const failures = [];
    let cursor = 0;
    await Promise.all(Array.from({length:4}, async () => {
      while(cursor < paths.length) {
        const path = paths[cursor++];
        const image = new Image();
        image.src = new URL(path,base).href;
        try {
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
        } catch { failures.push(path); }
      }
    }));
    return failures;
  }, {base,paths:[...releaseAssets]});
  assert.deepEqual(failures,[], 'All registered card/effect images must decode from the published site');
  console.log(`PASS browser decoding: ${releaseAssets.size} card, fusion and effect images`);
  await context.close();
} finally { await browser.close(); }
