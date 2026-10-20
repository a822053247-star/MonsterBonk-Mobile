import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.setViewportSize({width:1739,height:863});
  await page.route('**/hud-readable-harness*', route => route.fulfill({
    contentType:'text/html; charset=utf-8',
    body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
      import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
      createUI(document.getElementById('app'));window.game=new Game();
      window.updateHud=()=>{const g=window.game;g.sleep();g.updateHUD();};
    </script></body></html>`
  }));
  await page.goto('/hud-readable-harness?world=fixed');
  await page.locator('#start-fusion').click();
  await page.evaluate(() => (window as any).updateHud());
});

test('desktop HP is prominent; exactly below half turns HP and the bar red with a non-verbal pulse',async ({page})=>{
  await page.evaluate(()=>{const g=(window as any).game;g.combat.hp=50;(window as any).updateHud()});
  await expect(page.locator('#hud')).not.toHaveClass(/critical-health/);
  await expect(page.locator('.health-track')).not.toHaveClass(/low-health/);
  await page.evaluate(()=>{const g=(window as any).game;g.combat.hp=49;(window as any).updateHud()});
  await expect(page.locator('#hud')).toHaveClass(/critical-health/);
  await expect(page.locator('.health-track')).toHaveClass(/low-health/);
  await expect(page.locator('#health-value')).toHaveText('49 / 100');
  expect(await page.locator('#health-value').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 139, 123)');
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuetext','49 / 100，生命值不足一半');
  const effect=page.locator('#low-health-effect');
  await expect(effect).toHaveAttribute('aria-hidden','true');
  expect(await effect.evaluate(el=>getComputedStyle(el).animationName)).toContain('hud-danger-pulse');
  expect(await effect.evaluate(el=>el.textContent)).toBe('');
  const hpSize=await page.locator('#health-value').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(hpSize).toBeGreaterThanOrEqual(28);
  await page.screenshot({path:'artifacts/hud-readable-danger-desktop.png'});
  await page.evaluate(()=>{const g=(window as any).game;g.combat.hp=75;(window as any).updateHud()});
  await expect(page.locator('#hud')).not.toHaveClass(/critical-health/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{const g=(window as any).game;g.combat.hp=10;(window as any).updateHud()});
  expect(await effect.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('main HUD only shows wave and elapsed timer; levels and XP progress stay synced',async({page})=>{
  await expect(page.locator('#creature-name')).toHaveCount(0);
  await expect(page.locator('.run-label, .explore-label, .location-label')).toHaveCount(0);
  await expect(page.locator('#run-gold')).toBeHidden();
  await expect(page.locator('#run-wave')).toContainText('第 1 / 6 波');
  await expect(page.locator('#timer')).toBeVisible();
  await page.evaluate(()=>{
    const g=(window as any).game;
    g.combat.progression.gainExperience(3);(window as any).updateHud();
  });
  await expect(page.locator('#level-value')).toContainText('Lv.1');
  await expect(page.locator('#xp-progress')).toHaveText('3 / 8');
  await expect(page.locator('#xp-track')).toHaveAttribute('aria-valuenow','3');
  await expect(page.locator('#xp-track')).toHaveAttribute('aria-valuemax','8');
  const layout=await page.evaluate(()=>{
    const rect=(selector:string)=>{const box=document.querySelector(selector)!.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height}};
    return {health:rect('.health-panel'),portrait:rect('#creature-portrait'),bar:rect('.health-track'),
      xp:rect('.xp-row'),level:rect('#level-value'),wave:rect('.run-status'),
      button:rect('#pause'),statsVisible:getComputedStyle(document.querySelector('.combat-stats')!).display};
  });
  expect(layout.health.width).toBeGreaterThanOrEqual(510);
  expect(layout.portrait.height).toBeGreaterThan(110);
  expect(layout.bar.width).toBeGreaterThan(290);
  expect(layout.bar.height).toBeGreaterThan(40);
  expect(layout.level.y).toBeGreaterThan(layout.portrait.y+layout.portrait.height*.65);
  expect(layout.xp.y).toBeGreaterThan(layout.bar.y);
  expect(layout.wave.height).toBeGreaterThan(90);
  expect(layout.button.width).toBeGreaterThanOrEqual(85);
  expect(layout.statsVisible).toBe('none');
  await page.screenshot({path:'artifacts/hud-readable-normal-desktop.png'});
});

test('landscape phone HUD scales safely, buttons remain usable and wave stays clear',async({page})=>{
  for(const [width,height] of [[844,390],[568,320]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-left','44px');
      document.documentElement.style.setProperty('--safe-right','44px');(window as any).updateHud()});
    const health=(await page.locator('.health-block').boundingBox())!;
    const actions=(await page.locator('.hud-actions').boundingBox())!;
    const timer=(await page.locator('.run-status').boundingBox())!;
    expect(health.x).toBeGreaterThanOrEqual(44);
    expect(actions.x+actions.width).toBeLessThanOrEqual(width-44+1);
    // Cards and buttons cannot overlap. On narrow phones the time moves below them.
    expect(health.x+health.width).toBeLessThan(actions.x);
    const collide=health.x < timer.x+timer.width && health.x+health.width > timer.x &&
      health.y < timer.y+timer.height && health.y+health.height > timer.y;
    expect(collide).toBe(false);
    for(const sel of ['#pause','#settings','#fullscreen','#game-speed']){
      const box=(await page.locator(sel).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});
