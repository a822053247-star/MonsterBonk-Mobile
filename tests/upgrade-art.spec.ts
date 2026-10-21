import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 844, height: 390 } });

test.beforeEach(async ({ page }) => {
  await page.route('**/upgrade-art-harness', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';
    import {createUI,renderUpgradeCards} from '/src/ui.ts';
    import {Progression} from '/src/progression.ts';
    import {RunBuild} from '/src/run-build.ts';
    import {UPGRADE_ART} from '/src/upgrade-art.ts';
    createUI(document.getElementById('app'));
    const p=new Progression();p.reset(true);p.build=new RunBuild();p.build.reset('yanrong');
    const catalog=p.pool; // Fixture only: inspect all definitions, including locked rewards.
    const liveSkills=Object.getOwnPropertyDescriptor(Progression.prototype,'skills').get;
    Object.defineProperty(p,'skills',{get:()=>{const live=liveSkills.call(p);return catalog.map(skill=>live.find(s=>s.id===skill.id)??skill)}});
    window.artCatalog={ids:catalog.map(s=>s.id),artIds:Object.keys(UPGRADE_ART)};
    window.showCards=(ids,base='spark',weapons)=>{
      p.fusionBase=base;p.build=undefined;
      if(weapons){p.build=new RunBuild();p.build.reset(weapons[0]==='leaf'?'sproutspike':weapons[0]==='bubble'?'bubblesalamander':'yanrong');for(const weapon of weapons.slice(1))p.build.acquire(weapon)}
      p.currentOffers=ids;p.level=3;p.pendingChoices=2;renderUpgradeCards(p,27);
      document.getElementById('menu').hidden=true;document.getElementById('upgrade-screen').hidden=false;
      document.querySelectorAll('.skill-card').forEach(card=>card.disabled=false);
    };
  </script></body></html>` }));
  await page.goto('/upgrade-art-harness');
  await page.waitForFunction(() => 'showCards' in window);
});

async function show(page: import('@playwright/test').Page, ids: string[], base = 'spark', weapons?: string[]) {
  await page.evaluate(({ ids, base, weapons }) => (window as any).showCards(ids, base, weapons), { ids, base, weapons });
}

test('three supplied trigger-relic icons and their limits remain readable on mobile', async ({ page }, info) => {
  await show(page, ['draft-martyr-core', 'draft-kindling-flask', 'draft-thorn-testament']);
  for (const id of ['draft-martyr-core', 'draft-kindling-flask', 'draft-thorn-testament']) {
    const card = page.locator(`[data-skill="${id}"]`);
    await expect(card).toHaveAttribute('data-category', 'relic');
    await expect(card.locator('.skill-illustration')).toHaveClass(/art-loaded/);
    await expect(card.locator('.skill-illustration')).toHaveAttribute('src',new RegExp(`${id}.png$`));
    await expect(card.locator('.skill-tradeoff')).toBeVisible();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:`artifacts/trigger-relics-cards-${info.project.name}.png`});
});

test('remaining three supplied relic icons and their limits remain readable on mobile', async ({ page }, info) => {
  await show(page, ['draft-bubble-spore', 'draft-echo-bone-dice', 'draft-slaughter-hourglass']);
  for (const id of ['draft-bubble-spore', 'draft-echo-bone-dice', 'draft-slaughter-hourglass']) {
    const card = page.locator(`[data-skill="${id}"]`);
    await expect(card).toHaveAttribute('data-category', 'relic');
    await expect(card.locator('.skill-illustration')).toHaveClass(/art-loaded/);
    await expect(card.locator('.skill-illustration')).toHaveAttribute('src',new RegExp(`${id}.png$`));
    await expect(card.locator('.skill-tradeoff')).toBeVisible();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:`artifacts/remaining-relics-cards-${info.project.name}.png`});
});

test('card motion follows rarity, preserves pointer feedback and respects reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await show(page, ['damage', 'overload-core', 'berserk-route']);
  const normal=page.locator('[data-skill="damage"]'), rare=page.locator('[data-skill="overload-core"]'), legendary=page.locator('[data-skill="berserk-route"]');
  await expect(normal).toHaveCSS('animation-name','card-arrive');
  const pseudo=(selector:string, element:string) => page.locator(selector).evaluate((el,pseudo) => {
    const css=getComputedStyle(el,pseudo);return {animation:css.animationName,pointer:css.pointerEvents,opacity:css.opacity,display:css.display};
  },element);
  expect(await pseudo('[data-skill="overload-core"]','::before')).toMatchObject({animation:'rare-breathe',pointer:'none'});
  expect(await pseudo('[data-skill="berserk-route"]','::after')).toMatchObject({animation:'legendary-drift',pointer:'none'});
  await expect(normal).toHaveAttribute('data-offer','27');
  await page.waitForTimeout(210);
  await rare.hover();await page.mouse.down();
  await expect.poll(()=>pseudo('[data-skill="overload-core"]','::before')).toMatchObject({animation:'none',opacity:'0.85'});
  await page.mouse.up();await rare.focus();await page.keyboard.press('Tab');
  await expect(legendary).toBeFocused();
  await expect.poll(()=>pseudo('[data-skill="berserk-route"]','::before')).toMatchObject({animation:'none',opacity:'0.85'});
  await page.locator('#upgrade-screen').evaluate(el=>el.hidden=true);
  expect(await pseudo('[data-skill="overload-core"]','::before')).toMatchObject({animation:'none'});
  expect(await pseudo('[data-skill="berserk-route"]','::after')).toMatchObject({animation:'none'});
  await page.locator('#upgrade-screen').evaluate(el=>el.hidden=false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(normal).toHaveCSS('animation-name','none');
  expect(await pseudo('[data-skill="overload-core"]','::before')).toMatchObject({animation:'none'});
  expect(await pseudo('[data-skill="berserk-route"]','::after')).toMatchObject({animation:'none',display:'none'});
  await expect(legendary).toBeEnabled();
  if(info.project.name==='chromium'){
    await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#upgrade-panel').focus();
    await page.mouse.move(0,0);await page.waitForTimeout(600);
    await page.screenshot({path:'artifacts/card-motion-chromium.png'});
  }
});

test('all 41 real IDs are covered, element variants follow equipped weapons, categories stay data-driven', async ({ page }) => {
  const catalog = await page.evaluate(() => (window as any).artCatalog);
  expect(catalog.ids).toHaveLength(41);
  expect([...catalog.artIds].sort()).toEqual([...catalog.ids].sort());
  for (let index = 0; index < catalog.ids.length; index += 3) {
    await show(page, catalog.ids.slice(index, index + 3));
    for (const frame of await page.locator('.skill-frame').all()) await expect(frame).toHaveAttribute('src', /card-frames\/common.png$/);
    for (const image of await page.locator('.skill-frame,.skill-card-meta img,.skill-illustration').all()) {
      await expect(image).toHaveClass(/art-loaded/);
    }
  }
  for (const [base, split, chain] of [['spark', 'fire', null], ['leaf', 'thorn', 'grass'], ['bubble', null, 'water']]) {
    await show(page, ['split-on-hit', 'chain', 'area'], base!);
    if (split) await expect(page.locator('[data-skill="split-on-hit"] .skill-illustration')).toHaveAttribute('src', new RegExp(`split-on-hit-${split}.png$`));
    if (chain) await expect(page.locator('[data-skill="chain"] .skill-illustration')).toHaveAttribute('src', new RegExp(`chain-bounce-${chain}.png$`));
  }
  await show(page, ['split-on-hit', 'chain', 'damage'], 'spark', ['spark', 'bubble', 'leaf']);
  await expect(page.locator('[data-skill="split-on-hit"] .skill-illustration')).toHaveCount(2);
  await expect(page.locator('[data-skill="chain"] .skill-illustration')).toHaveCount(2);
  await show(page, ['spark-weapon', 'bubble-weapon', 'leaf-weapon']);
  for (const [id, element] of [['spark', 'fire'], ['bubble', 'water'], ['leaf', 'grass']]) {
    await expect(page.locator(`[data-skill="${id}-weapon"]`)).toHaveAttribute('data-element', element);
    await expect(page.locator(`[data-skill="${id}-weapon"] .skill-frame`)).toHaveAttribute('src', /card-frames\/common.png$/);
  }
  await show(page, ['overload-core', 'berserk-route', 'haste']);
  await expect(page.locator('[data-skill="overload-core"]')).toHaveAttribute('data-category', 'relic');
  await expect(page.locator('[data-skill="berserk-route"]')).toHaveAttribute('data-category', 'evolution');
  await expect(page.locator('[data-skill="haste"] .skill-illustration')).toHaveClass(/art-loaded/);
  await expect(page.locator('[data-skill="haste"] .skill-art-fallback')).toBeHidden();
  await expect(page.locator('[data-skill="haste"]')).toHaveAttribute('data-offer', '27');
  await expect(page.locator('[data-skill="overload-core"] .skill-tradeoff')).toContainText('所有武器攻击间隔 +20%');
});

test('real art loads and short landscape cards keep visible copy and safe-area bounds', async ({ page }, info) => {
  await show(page, ['damage', 'multishot', 'vitality']);
  for (const image of await page.locator('.skill-illustration,.skill-frame').all()) await expect(image).toHaveClass(/art-loaded/);
  await page.screenshot({ path: `artifacts/upgrade-art-${info.project.name}.png` });
  await show(page, ['overload-core', 'berserk-route', 'pursuit-route']);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-left', '44px');
    document.documentElement.style.setProperty('--safe-right', '44px');
    document.documentElement.style.setProperty('--safe-bottom', '21px');
  });
  for (const card of await page.locator('.skill-card').all()) {
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(524);
    expect(box.y + box.height).toBeLessThanOrEqual(299);
    expect(await card.evaluate(el => ['h3', '.skill-benefit', '.skill-preview', '.skill-tradeoff'].every(selector => {
      const text = el.querySelector(selector) as HTMLElement;
      const parent = el.getBoundingClientRect(), rect = text.getBoundingClientRect();
      return rect.bottom <= parent.bottom && text.scrollWidth <= text.clientWidth + 1;
    }))).toBe(true);
  }
  await page.screenshot({ path: `artifacts/upgrade-art-small-${info.project.name}.png` });
});

test('failed illustrations, gems and frames keep an intact selectable fallback card', async ({ page }) => {
  await page.route('**/assets/ui/**', route => route.abort());
  await show(page, ['damage', 'haste', 'bubble-weapon']);
  await expect(page.locator('.skill-illustration.art-loaded')).toHaveCount(0);
  await expect(page.locator('.skill-card.frame-ready')).toHaveCount(0);
  for (const card of await page.locator('.skill-card').all()) {
    await expect(card.locator('.skill-art-fallback')).toBeVisible();
    await expect(card.locator('h3')).not.toBeEmpty();
    await expect(card).toBeEnabled();
    expect(await card.locator('.skill-frame').evaluate(el => getComputedStyle(el).opacity)).toBe('0');
  }
});

test('all reward copy fits without overlapping effects, previews or costs at both phone sizes', async ({ page }) => {
  const ids: string[] = await page.evaluate(() => (window as any).artCatalog.ids);
  for (const width of [844, 568]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 320 });
    for (let index = 0; index < ids.length; index += 3) {
      await show(page, ids.slice(index, index + 3));
      for (const image of await page.locator('.skill-illustration').all()) await expect(image).toHaveClass(/art-loaded/);
      const issues = await page.locator('.skill-card').evaluateAll(cards => cards.flatMap(card => {
        const title = card.querySelector('h3')!.getBoundingClientRect();
        const art = card.querySelector('.skill-emblem')!.getBoundingClientRect();
        const image = card.querySelector('.skill-illustration')?.getBoundingClientRect();
        const effect = card.querySelector('.skill-benefit')!.getBoundingClientRect();
        const preview = card.querySelector('.skill-preview')!.getBoundingClientRect();
        const meta = card.querySelector('.skill-card-meta')!.getBoundingClientRect();
        const cost = card.querySelector('.skill-tradeoff')?.getBoundingClientRect();
        const failures = [];
        if (title.bottom > art.top + 1) failures.push('title/art');
        if (art.bottom > effect.top + 1) failures.push('art/effect');
        if (image && (image.left < art.left - 1 || image.right > art.right + 1 || image.top < art.top - 1 || image.bottom > art.bottom + 1)) failures.push('image/slot');
        if (effect.bottom > preview.top + 1) failures.push('effect/preview');
        if (preview.bottom > meta.top + 1) failures.push('preview/level');
        if (cost && meta.bottom > cost.top + 1) failures.push('level/cost');
        return failures.map(failure => card.getAttribute('data-skill') + ': ' + failure);
      }));
      expect(issues).toEqual([]);
    }
  }
});

test('mixed magic and weapon rewards share frame geometry and keep their title and illustration apart', async ({ page }, info) => {
  await show(page, ['movement', 'spark-weapon', 'leaf-weapon'], 'spark', ['spark']);
  await expect(page.locator('[data-skill="spark-weapon"] h3')).toHaveAttribute('aria-label', '火花弹强化');
  for (const frame of await page.locator('.skill-frame').all()) await expect(frame).toHaveClass(/art-loaded/);
  for (const image of await page.locator('.skill-illustration').all()) await expect(image).toHaveClass(/art-loaded/);
  const sizes = await page.locator('.skill-frame').evaluateAll(frames => frames.map(frame => {
    const box = frame.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)];
  }));
  expect(sizes.every(size => JSON.stringify(size) === JSON.stringify(sizes[0]))).toBe(true);
  await page.screenshot({ path: `artifacts/upgrade-unified-frames-${info.project.name}.png` });
});
