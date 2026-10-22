import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/world-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.probe=()=>({state:g.inspect(),obstacles:g.world.obstacles.map(o=>({...o})),pixelVisible:g.world.group.getObjectByName('像素草场').visible,boundaryVisible:g.world.group.getObjectByName('闯关区域隔离')?.visible,boundaryPosts:g.world.group.getObjectByName('闯关区域隔离')?.getObjectByName('围栏立柱')?.count??0});
    window.waterProbe=()=>{g.sleep();g.position.set(7,0,-7);g.previousPosition.copy(g.position);g.input.keys.add('KeyD');for(let i=0;i<120;i++)g.step(1/60);g.input.keys.clear();return {x:g.position.x,z:g.position.z,party:g.party.inspect()}};
    window.boundaryProbe=(x,z)=>{g.sleep();g.input.keys.clear();g.velocity.set(0,0);g.groundInput.set(0,0);g.position.set(x,0,z);g.previousPosition.copy(g.position);g.monster.root.position.copy(g.position);g.party.syncLeader(g.position,0);g.step(1/60);return {x:g.position.x,z:g.position.z}};
    window.preview=(x,z)=>{g.sleep();g.combat.reset('classic');g.position.set(x,0,z);g.previousPosition.copy(g.position);g.monster.root.position.copy(g.position);g.party.syncLeader(g.position,0);g.party.placeCompanions(g.world.obstacles,32.3);g.partyView.render(1,0);g.world.update(x,z);g.placeCamera(true);g.renderer.render(g.scene,g.camera);document.getElementById('welcome').hidden=true};
  </script></body></html>` }));
});

test('sample loads, preserves an open start, and returns to the original map for old modes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/world-harness?world=fixed');
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'ready');
  const legacy = await page.evaluate(() => (window as any).probe());
  await page.locator('#start-party').click();
  const sample = await page.evaluate(() => (window as any).probe());
  expect(sample.state.world.layout).toBe('fixed-pixel-meadow');
  expect(sample.state.party).toHaveLength(1);
  expect(sample.state.party[0].species).toBe('yanrong');
  expect(sample.pixelVisible).toBe(true);
  expect(sample.boundaryVisible).toBe(true);
  expect(sample.boundaryPosts).toBeGreaterThan(0);
  expect(sample.obstacles.every((o: { x: number; z: number; radius: number }) => Math.hypot(o.x, o.z) - o.radius > 6)).toBe(true);
  await page.locator('#pause').click(); await page.locator('#back-menu').click();
  await page.locator('#start').click();
  const old = await page.evaluate(() => (window as any).probe());
  expect(old.state.world.layout).toBe('legacy');
  expect(old.obstacles).toEqual(legacy.obstacles);
  expect(errors).toEqual([]);
});


test('player can reach the square corners but cannot cross any rectangular edge', async ({ page }) => {
  await page.goto('/world-harness?world=fixed');
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'ready');
  await page.locator('#start-party').click();

  const corner = await page.evaluate(() => (window as any).boundaryProbe(31.6, 31.6));
  expect(corner.x).toBeGreaterThan(31);
  expect(corner.z).toBeGreaterThan(31);

  const clipped = await page.evaluate(() => (window as any).boundaryProbe(40, -40));
  expect(clipped.x).toBeCloseTo(31.68, 2);
  expect(clipped.z).toBeCloseTo(-31.68, 2);
  expect(Math.abs(clipped.x) + 0.62).toBeLessThanOrEqual(32.3 + .001);
  expect(Math.abs(clipped.z) + 0.62).toBeLessThanOrEqual(32.3 + .001);
});

test('water blocks Yanrong and no followers are created', async ({ page }) => {
  await page.goto('/world-harness?world=fixed');
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'ready');
  await page.locator('#start-party').click();
  const result = await page.evaluate(() => (window as any).waterProbe());
  expect(Math.hypot(result.x - 14, result.z + 7)).toBeGreaterThanOrEqual(5.3 + .62 - .001);
  expect(result.x).toBeLessThan(9);
  expect(result.party).toHaveLength(1);
  for (const member of result.party) expect(Math.hypot(member.x - 14, member.z + 7)).toBeGreaterThan(5.3);
});

test('failed assets and explicit legacy override retain a visible collidable original world', async ({ page }) => {
  await page.route('**/assets/world/**', route => route.abort());
  await page.goto('/world-harness?world=fixed');
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'fallback');
  await page.locator('#start-party').click();
  expect(await page.evaluate(() => (window as any).probe().state.world.layout)).toBe('legacy');
  await page.unroute('**/assets/world/**');
  await page.goto('/world-harness?world=legacy');
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'ready');
  await page.locator('#start-party').click();
  expect(await page.evaluate(() => (window as any).probe().state.world.layout)).toBe('legacy');
});

test('desktop and short phone previews retain readable scale and bounded draw calls', async ({ page }) => {
  await page.goto('/world-harness?world=fixed');
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'ready');
  await page.locator('#start-party').click();
  await page.waitForFunction(() => (window as any).game.inspect().partyVisual.members.every((m: any) => m.loaded));
  for (const [name, width, height, x, z] of [['start', 1280, 720, 0, 0], ['shore', 1280, 720, 7, -2], ['phone', 844, 390, 0, 0]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(([x,z]) => (window as any).preview(x,z), [x,z]);
    expect(await page.evaluate(() => (window as any).game.inspect().drawCalls)).toBeLessThan(110);
    await page.screenshot({ path: 'artifacts/world-sample-' + name + '.png' });
  }
});
