import { test, expect } from '@playwright/test';

test('hit knockback does not reverse enemy art, while chasing can still turn it', async ({ page }) => {
  await page.route('**/hit-facing-harness*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
  </script></body></html>` }));
  await page.goto('/hit-facing-harness?world=fixed');
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-fusion').click();
  await page.waitForFunction(() => ['normal', 'fast', 'tank'].every(kind => (window as any).game.combatView.pixelEnemies.ready(kind)));
  const result = await page.evaluate(() => {
    const g = (window as any).game; g.sleep(); const c = g.combat;
    return ['normal', 'fast', 'tank'].map(kind => {
    c.reset(); g.combatView.clear(); c.automaticSpawning = false; c.useNavigation = false; c.obstacles = [];
    c.runBuild.attacks[0].cooldown = 100;
    const e = c.spawn(kind, 6, 0, 0); e.hp = 1000;
    const render = () => { g.combatView.render(1, c.elapsed, g.position); return g.combatView.pixelEnemies.directions.get(e.id).facing; };
    c.update(1 / 60, g.position); const before = render();
    // Invoke the shared damage path used by projectiles, AoE and horn hits.
    c.damageEnemy(e, 1, 1, 0);
    const afterDamage = render();
    c.update(1 / 60, g.position); const afterHit = render();
    const pushedBack = e.x > e.previousX, hurt = e.flash > 0, hp = e.hp;
    const flash = e.flash; e.flash = 0; const withoutFlash = render(); e.flash = flash;
    for (let i = 0; i < 90; i++) c.update(1 / 60, { x: 10, z: 0 });
    return { kind, before, afterDamage, afterHit, withoutFlash, turned: render(), pushedBack, hurt, hp };
    });
  });
  for (const state of result) {
    expect(state.pushedBack, state.kind).toBe(true); expect(state.hurt).toBe(true); expect(state.hp).toBe(999);
    expect(state.afterDamage).toBe(state.before); expect(state.withoutFlash).toBe(state.afterHit);
    expect(state.afterHit, state.kind).toBe(state.before);
    expect(state.turned, state.kind).not.toBe(state.before);
  }
});
