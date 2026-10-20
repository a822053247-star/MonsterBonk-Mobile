import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 844, height: 390 } });

test.beforeEach(async ({ page }) => {
  await page.route('**/shop-art-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI,renderRunShop} from '/src/ui.ts';import {Game} from '/src/game.ts';import {RunShop} from '/src/shop.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.openShop=()=>{g.sleep();g.combat.hp=40;for(const e of g.combat.enemies)e.active=false;g.run.waveElapsed=g.run.definition.seconds-.001;g.step(1/60);g.run.coins=200;g.run.shop=new RunShop(g.combat,901,()=>0);renderRunShop(g.run,g.combat)};
    window.redrawShop=()=>renderRunShop(g.run,g.combat);
    window.emptyShop=()=>{for(const skill of g.combat.progression.pool)g.combat.progression.ranks[skill.id]=skill.maxRank;g.combat.hp=g.combat.maxHp;g.run.shop=new RunShop(g.combat,902,()=>0);renderRunShop(g.run,g.combat)};
  </script></body></html>` }));
});

async function open(page: import('@playwright/test').Page) {
  await page.goto('/shop-art-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').click();
  await page.evaluate(() => (window as any).openShop());
  await expect(page.locator('#shop-screen')).toBeVisible();
}

test('new relics show supplied icons and can be bought from the actual shop', async ({ page }, info) => {
  await open(page);
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.grantUpgrade('leaf-weapon');
    g.run.shop.offers = ['draft-martyr-core','draft-kindling-flask','draft-thorn-testament'].map(id => {
      const skill = c.progression.skills.find((s: any) => s.id === id);
      return { kind:'reward', skill:id, title:skill.title, benefit:skill.benefit, tradeoff:skill.tradeoff, price:70, sold:false };
    });
    (window as any).redrawShop();
  });
  for(const id of ['draft-martyr-core','draft-kindling-flask','draft-thorn-testament']) {
    await expect(page.locator(`[data-skill="${id}"] .shop-illustration img`)).toHaveClass(/art-loaded/);
  }
  for(const size of [{width:844,height:390},{width:568,height:320},{width:1280,height:720}]) {
    await page.setViewportSize(size);
    for(const body of await page.locator('.shop-item-body').all()) {
      expect(await body.evaluate(el => el.scrollHeight <= el.clientHeight+1 && el.scrollWidth <= el.clientWidth+1)).toBe(true);
    }
    await page.screenshot({path:`artifacts/trigger-relics-shop-${size.width}-${info.project.name}.png`});
  }
  await page.locator('[data-buy="0"]').click();
  await expect(page.locator('#shop-coins')).toHaveText('130 金币');
  expect(await page.evaluate(() => (window as any).game.combat.runBuild.relics)).toContain('draft-martyr-core');
});

test('remaining relics show supplied icons and can be bought from the actual shop', async ({ page }, info) => {
  await open(page);
  await page.evaluate(() => {
    const g = (window as any).game, c = g.combat;
    c.grantUpgrade('bubble-weapon');
    g.run.shop.offers = ['draft-bubble-spore','draft-echo-bone-dice','draft-slaughter-hourglass'].map(id => {
      const skill = c.progression.skills.find((s: any) => s.id === id);
      return { kind:'reward', skill:id, title:skill.title, benefit:skill.benefit, tradeoff:skill.tradeoff, price:70, sold:false };
    });
    (window as any).redrawShop();
  });
  for(const id of ['draft-bubble-spore','draft-echo-bone-dice','draft-slaughter-hourglass']) {
    await expect(page.locator(`[data-skill="${id}"] .shop-illustration img`)).toHaveClass(/art-loaded/);
  }
  for(const size of [{width:844,height:390},{width:568,height:320},{width:1280,height:720}]) {
    await page.setViewportSize(size);
    for(const body of await page.locator('.shop-item-body').all()) {
      expect(await body.evaluate(el => el.scrollHeight <= el.clientHeight+1 && el.scrollWidth <= el.clientWidth+1)).toBe(true);
    }
    await page.screenshot({path:`artifacts/remaining-relics-shop-${size.width}-${info.project.name}.png`});
  }
  await page.locator('[data-buy="0"]').click();
  await expect(page.locator('#shop-coins')).toHaveText('130 金币');
  expect(await page.evaluate(() => (window as any).game.combat.runBuild.relics)).toContain('draft-bubble-spore');
});

test('cards reflect real offers, show weapons, relics and healing art, and fit safe-area phones', async ({ page }, info) => {
  await open(page);
  const offers = await page.evaluate(() => (window as any).game.run.shop.items);
  await expect(page.locator('.shop-item')).toHaveCount(4);
  for (let index = 0; index < offers.length; index++) {
    const card = page.locator('.shop-item').nth(index);
    const title = offers[index].kind === 'reward' && offers[index].skill?.endsWith('-weapon')
      ? offers[index].title.replace(/^获得/, '').replace(/强化$/, '') : offers[index].title;
    await expect(card.locator('h3')).toHaveText(title);
    await expect(card.locator('h3 textPath')).toHaveText(title);
    await expect(card.locator('.shop-benefit')).toHaveText(offers[index].benefit);
    await expect(card.locator('.shop-price')).toHaveText(`${offers[index].price} 金币`);
  }
  await expect(page.locator('.shop-item').nth(2)).toHaveAttribute('data-category', 'relic');
  await expect(page.locator('.shop-item').nth(3)).toHaveAttribute('data-kind', 'heal');
  for (const image of await page.locator('.shop-illustration img,.shop-slot-art,.shop-panel-art').all()) await expect(image).toHaveClass(/art-loaded/);
  await page.screenshot({ path: `artifacts/forest-shop-${info.project.name}.png` });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-left', '44px');
    document.documentElement.style.setProperty('--safe-right', '44px');
    document.documentElement.style.setProperty('--safe-bottom', '21px');
  });
  const panel = (await page.locator('.shop-panel').boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(44);
  expect(panel.x + panel.width).toBeLessThanOrEqual(524);
  expect(panel.y + panel.height).toBeLessThanOrEqual(299);
  await expect(page.locator('#shop-next')).toBeInViewport();
  const display = (await page.locator('.shop-display').boundingBox())!;
  const header = (await page.locator('.shop-header').boundingBox())!;
  const actions = (await page.locator('.shop-actions').boundingBox())!;
  expect(header.y + header.height).toBeLessThanOrEqual(display.y);
  expect(actions.y).toBeGreaterThanOrEqual(display.y + display.height);
  await page.screenshot({ path: `artifacts/forest-shop-small-${info.project.name}.png` });
  for (const card of await page.locator('.shop-item').all()) {
    expect(await card.evaluate(el => {
      const body = el.querySelector('.shop-item-body') as HTMLElement;
      const price = el.querySelector('.shop-price')!.getBoundingClientRect();
      const buy = el.querySelector('.shop-buy')!.getBoundingClientRect();
      const label = el.querySelector('.shop-buy-label')!.getBoundingClientRect();
      const title = el.querySelector('h3')!.getBoundingClientRect();
      const type = el.querySelector('.shop-item-type')!.getBoundingClientRect();
      const art = el.querySelector('.shop-illustration')!.getBoundingClientRect();
      return body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1
        && price.right <= label.left && body.getBoundingClientRect().bottom <= buy.top + 1
        && art.top >= title.bottom + 12 && art.top >= type.bottom + 6;
    })).toBe(true);
  }
});

test('desktop shop scales merchandise and text to the browser viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const panel = (await page.locator('.shop-panel').boundingBox())!;
    expect(panel.width).toBeGreaterThan(viewport.width * .9);
    for (const card of await page.locator('.shop-item').all()) {
      await expect(card).toBeInViewport({ ratio: 1 });
      const box = (await card.boundingBox())!;
      expect(box.height).toBeGreaterThan(viewport.height * .65);
      expect(await card.locator('.shop-benefit').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
      expect(await card.locator('.shop-illustration').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(110);
    }
    await expect(page.locator('#shop-next')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `artifacts/forest-shop-desktop-${viewport.width}.png` });
  }
});

test('purchases replace invalid offers, reject stale tokens, heal correctly and retain sold prices', async ({ page }) => {
  await open(page);
  const token = await page.locator('[data-buy="0"]').getAttribute('data-shop-token');
  await expect(page.locator('.shop-item').nth(2)).toHaveAttribute('data-skill', 'specialist-badge');
  await page.locator('[data-buy="0"]').click();
  await expect(page.locator('[data-buy="0"]')).toHaveText('已购买');
  await expect(page.locator('[data-buy="0"]')).toBeDisabled();
  await expect(page.locator('.shop-item').nth(0).locator('.shop-price')).toHaveText('35 金币');
  await expect(page.locator('.shop-item').nth(0).locator('.shop-item-type')).toHaveText('新武器');
  await expect(page.locator('#shop-coins')).toHaveText('165 金币');
  await expect(page.locator('.shop-item').nth(2)).not.toHaveAttribute('data-skill', 'specialist-badge');
  await page.locator('[data-buy="1"]').evaluate((button, stale) => button.setAttribute('data-shop-token', stale!), token);
  await page.locator('[data-buy="1"]').click();
  await expect(page.locator('#shop-coins')).toHaveText('165 金币');
  await expect(page.locator('#shop-message')).toContainText('商品已变化');
  await page.locator('[data-buy="3"]').click();
  await expect(page.locator('#shop-health')).toHaveText('生命 75 / 100');
  await expect(page.locator('#shop-coins')).toHaveText('147 金币');
  await page.locator('#shop-refresh').click();
  await expect(page.locator('#shop-refresh')).toHaveText('刷新商品 · 10 金币');
  await expect(page.locator('#shop-coins')).toHaveText('142 金币');
  await page.evaluate(() => { (window as any).game.run.coins = 0; (window as any).redrawShop(); });
  for (const button of await page.locator('.shop-buy').all()) { await expect(button).toBeDisabled(); await expect(button).toHaveText('金币不足'); }
  await expect(page.locator('#shop-refresh')).toBeDisabled();
  await page.locator('#shop-next').click();
  await expect(page.locator('#shop-screen')).toBeHidden();
});

test('empty offers and missing art keep useful text, disabled purchases and a working next-wave action', async ({ page }) => {
  await page.route('**/assets/ui/**', route => route.abort());
  await open(page);
  for (const fallback of await page.locator('.shop-art-fallback').all()) await expect(fallback).toBeVisible();
  await expect(page.locator('#shop-coins')).toHaveText('200 金币');
  await page.evaluate(() => (window as any).emptyShop());
  await expect(page.locator('.shop-item[data-kind="empty"]')).toHaveCount(4);
  for (const button of await page.locator('.shop-buy').all()) { await expect(button).toBeDisabled(); await expect(button).toHaveText('暂无适用商品'); }
  await expect(page.locator('#shop-refresh')).toBeDisabled();
  await page.locator('#shop-next').click();
  await expect(page.locator('#shop-screen')).toBeHidden();
});
