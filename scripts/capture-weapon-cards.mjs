import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const groups = [
  ['thorn-wheel-weapon', 'tidal-blade-weapon', 'thunder-bud-weapon'],
  ['frost-crystal-weapon', 'shatter-ring', 'glacier-trail'],
];
const output = 'artifacts/weapon-cards';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/weapon-card-capture', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
      import '/src/style.css';
      import {createUI,renderUpgradeCards} from '/src/ui.ts';
      import {Progression} from '/src/progression.ts';
      import {RunBuild} from '/src/run-build.ts';
      createUI(document.getElementById('app'));
      const p=new Progression();p.build=new RunBuild();p.build.reset('yanrong');p.reset(true);
      window.showCards=ids=>{
        p.currentOffers=ids;p.level=2;p.pendingChoices=1;renderUpgradeCards(p,42);
        document.getElementById('welcome').hidden=true;document.getElementById('upgrade-screen').hidden=false;
        document.querySelectorAll('.skill-card').forEach(card=>card.disabled=false);
      };
    </script></body></html>` }));
  await page.goto('http://127.0.0.1:5173/weapon-card-capture', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.showCards === 'function');
  for (let i = 0; i < groups.length; i++) {
    await page.evaluate(ids => window.showCards(ids), groups[i]);
    await page.waitForFunction(() => [...document.querySelectorAll('#upgrade-cards img')].every(img => img.complete && img.naturalWidth > 0));
    await page.locator('#upgrade-cards').screenshot({ path: `${output}/cards-${i + 1}.png`, animations: 'disabled' });
    for (const id of groups[i]) await page.locator('[data-skill="' + id + '"]').screenshot({ path: `${output}/${id}.png`, animations: 'disabled' });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured six real upgrade cards in ${output}`);
} finally { await browser.close(); }
