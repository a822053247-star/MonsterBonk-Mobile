import { test, expect } from '@playwright/test';

test('Kenney shockwave follows combat clocks, stays pooled and clears with the scene', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/shockwave-harness*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>` }));
  await page.goto('/shockwave-harness?world=fixed');
  await page.locator('#start-fusion').click();
  await page.evaluate(() => (window as any).game.sleep());
  await page.waitForFunction(() => (window as any).game.combatView.shockwaveView.ready);
  const result = await page.evaluate(() => {
    const g = (window as any).game, view = g.combatView.shockwaveView, c = g.combat;
    c.reset(); c.automaticSpawning = false;
    const wave = c.shockwaves[0];
    Object.assign(wave, { active: true, x: g.position.x, z: g.position.z, age: .25, radius: 3.2, previousRadius: 3, maxRadius: 6 });
    const before = JSON.stringify(c.inspect());
    g.placeCamera(true); g.partyView.render(1, g.visualTime);
    g.combatView.render(1, g.visualTime, g.position); g.renderer.render(g.scene, g.camera);
    const memory = { ...g.renderer.info.memory }, slot = view.slots[0];
    const opacity = slot.ring.material.opacity;
    for (let i = 0; i < 60; i++) view.render(c.shockwaves, 1, 4);
    const stable = before === JSON.stringify(c.inspect()) && opacity === slot.ring.material.opacity;
    const fullCount = slot.dust.count;
    view.render(c.shockwaves, 1, 2); const lowCount = slot.dust.count;
    view.render(c.shockwaves, 1, 4);
    return { stable, fullCount, lowCount, memory, fallback: g.combatView.waveRings.count,
      rings: view.slots.length, visible: slot.group.visible };
  });
  expect(result).toMatchObject({ stable: true, fullCount: 12, lowCount: 6, fallback: 0, rings: 2, visible: true });
  await page.screenshot({ path: 'artifacts/grassland-shockwave.png' });
  expect(await page.evaluate(() => {
    const view = (window as any).game.combatView.shockwaveView;
    view.clear(); const cleared = view.slots.every((s: any) => !s.group.visible);
    view.dispose(); return cleared && view.group.parent === null;
  })).toBe(true);
  expect(errors).toEqual([]);
});
