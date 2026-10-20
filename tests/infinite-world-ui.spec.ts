import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/infinite-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import { createUI } from '/src/ui.ts'; import { Game } from '/src/game.ts';
    createUI(document.getElementById('app')); window.game = new Game();
  </script></body></html>` }));
});

async function start(page: Page) {
  await page.goto('/infinite-harness?seed=forest-42');
  await page.locator('#start-infinite').click();
  await page.waitForFunction(() => (window as any).game?.inspect().world.layout === 'infinite-pixel-meadow');
}

test('endless mode crosses original world boundary and streams exactly nine chunks', async ({ page }) => {
  await start(page);
  const results = await page.evaluate(() => {
    const game = (window as any).game;
    game.sleep();
    const positions = [[0, 0], [33, 0], [110, 0], [160, -90], [-145, -145], [-1, 0], [0, 0]];
    return positions.map(([x, z]) => {
      game.position.set(x, 0, z);
      game.previousPosition.copy(game.position);
      game.step(1 / 60);
      const info = game.inspect();
      return { x: info.position.x, z: info.position.z, chunks: info.world.chunks,
        layout: info.world.layout, obstacles: info.world.obstacles, seed: info.world.seed };
    });
  });
  expect(results.every(r => r.chunks === 9 && r.layout === 'infinite-pixel-meadow' && r.obstacles > 0)).toBe(true);
  expect(results[1].x).toBeGreaterThan(32);
  expect(results[2].x).toBeGreaterThan(100);
  expect(results[4].x).toBeLessThan(-135);
  expect(new Set(results.map(r => r.seed))).toEqual(new Set(['forest-42']));
});

test('teleporting across many chunks does not accumulate chunk groups or materials', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    const captures: number[] = [];
    for (let i = 0; i < 80; i++) {
      const x = (i % 2 ? -1 : 1) * (i + 2) * 64, z = (i % 3 - 1) * 128;
      g.position.set(x, 0, z); g.previousPosition.copy(g.position);
      g.step(1 / 60);
      captures.push(g.world.group.getObjectByName('无尽草场').children.length);
    }
    g.monster.root.position.copy(g.position);
    g.placeCamera(true);
    g.renderer.render(g.scene, g.camera);
    return { max: Math.max(...captures), min: Math.min(...captures), scene: g.inspect().world };
  });
  expect(result.min).toBe(9);
  expect(result.max).toBe(9);
  expect(result.scene.chunks).toBe(9);
});

test('menu keeps finite random meadow and original boundary', async ({ page }) => {
  await start(page);
  await page.locator('#pause').click();
  await page.locator('#back-menu').click();
  await page.locator('#start-party').click();
  await page.waitForFunction(() => (window as any).game.inspect().world.layout === 'random-pixel-meadow');
  const state = await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    g.position.set(45, 0, 0); g.previousPosition.copy(g.position); g.step(1 / 60);
    return { layout: g.inspect().world.layout, x: g.position.x, endless: g.combat.infiniteWorld };
  });
  expect(state.layout).toBe('random-pixel-meadow');
  expect(state.x).toBeLessThan(33);
  expect(state.endless).toBe(false);
});
