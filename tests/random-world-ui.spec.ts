import { test, expect, type Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => (window as any).snapshot());
test.beforeEach(async ({ page }) => {
  await page.route('**/random-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.snapshot=()=>{const ground=g.world.group.getObjectByName('样板草地与泥路');let hash=2166136261;const data=ground.material.map.image.toDataURL();for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619)>>>0;return {world:g.inspect().world,obstacles:g.world.obstacles.map(o=>({...o})),terrain:hash,textures:g.inspect().textures,geometries:g.inspect().geometries,party:g.inspect().party}};
    window.preview=overview=>{g.sleep();document.getElementById('welcome').hidden=true;g.monster.root.position.copy(g.position);g.partyView.render(1,0);g.placeCamera(true);if(overview){g.camera.left=-37;g.camera.right=37;g.camera.top=21;g.camera.bottom=-21;g.camera.updateProjectionMatrix()}g.world.update(0,0);g.renderer.render(g.scene,g.camera)};
    window.birth=()=>{g.sleep();g.combat.reset('classic');for(let i=0;i<160;i++)g.step(1/60);return {navigation:g.combat.useNavigation,player:{x:g.position.x,z:g.position.z},obstacles:g.world.obstacles.map(o=>({...o})),enemies:g.combat.enemies.filter(e=>e.active).map(e=>({...e}))}};
  </script></body></html>` }));
});

async function open(page: Page, query = '') {
  await page.goto('/random-harness' + query);
  await page.waitForFunction(() => (window as any).game?.inspect().world.status === 'ready');
  await page.locator('#start-party').click();
  await page.waitForFunction(() => (window as any).game.inspect().partyVisual.members[0]?.loaded);
}

test('a replay link reproduces the rendered terrain, collision map and seed across reloads', async ({ page }) => {
  await open(page, '?seed=forest-42');
  const first = await snapshot(page);
  expect(first.world.layout).toBe('random-pixel-meadow');
  expect(first.world.generation.valid).toBe(true);
  expect(first.party).toHaveLength(1);
  await page.locator('#pause').click();
  await expect(page.locator('#map-replay')).toContainText('forest-42');
  const link = (await page.locator('#map-replay').getAttribute('href'))!;
  await open(page, new URL(link).search);
  const replay = await snapshot(page);
  expect(replay.world).toEqual(first.world);
  expect(replay.obstacles).toEqual(first.obstacles);
  expect(replay.terrain).toBe(first.terrain);
});

test('restart preserves the map; new adventures vary it without growing GPU resources', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const first = await snapshot(page);
  await page.locator('#pause').click(); await page.locator('#restart').click();
  const retry = await snapshot(page);
  expect(retry.world.seed).toBe(first.world.seed); expect(retry.terrain).toBe(first.terrain);
  const seeds = new Set<string>([first.world.seed]);
  for (let i = 0; i < 6; i++) {
    await page.locator('#pause').click(); await page.locator('#back-menu').click(); await page.locator('#start-party').click();
    const next = await snapshot(page);
    seeds.add(next.world.seed);
    expect(next.world.generation.valid).toBe(true);
    expect(next.world.generation.reachable).toBe(next.world.generation.walkable);
    expect(next.textures).toBeLessThanOrEqual(first.textures + 2);
    expect(next.geometries).toBeLessThanOrEqual(first.geometries + 1);
  }
  expect(seeds.size).toBe(7); expect(errors).toEqual([]);
});

test('pinned seeds remain pinned on new adventures; fixed override still uses the curated sample', async ({ page }) => {
  await open(page, '?seed=42');
  const first = await snapshot(page);
  await page.locator('#pause').click(); await page.locator('#back-menu').click(); await page.locator('#start-party').click();
  expect((await snapshot(page)).obstacles).toEqual(first.obstacles);
  await open(page, '?world=fixed&seed=42');
  expect((await snapshot(page)).world.layout).toBe('fixed-pixel-meadow');
  await page.locator('#pause').click(); await expect(page.locator('#map-replay')).toBeHidden();
});

test('movement and safe automatic spawns use the current map after regeneration', async ({ page }) => {
  await open(page);
  for (let run = 0; run < 3; run++) {
    await page.keyboard.down('d');
    await expect.poll(async () => page.evaluate(() => (window as any).game.inspect().position.x)).toBeGreaterThan(.8);
    await page.keyboard.up('d');
    const state = await page.evaluate(() => (window as any).birth());
    expect(state.navigation).toBe(true); expect(state.enemies).toHaveLength(1);
    const enemy = state.enemies[0];
    expect(enemy.spawnTime).toBeGreaterThan(.6);
    expect(Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z)).toBeGreaterThanOrEqual(8 - .001);
    expect(state.obstacles.every((o: any) => Math.hypot(enemy.x - o.x, enemy.z - o.z) >= o.radius + 1.1)).toBe(true);
    await page.locator('#pause').click(); await page.locator('#back-menu').click(); await page.locator('#start-party').click();
  }
});

test('different seeds render different regions and fit phone replay controls', async ({ page }) => {
  const invalidAtlasRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/Tileset/Decorations/Variants/Grass.png')) invalidAtlasRequests.push(request.url());
  });
  const views: number[] = [];
  for (const seed of ['forest-42', 'shore-19']) {
    await open(page, '?seed=' + seed);
    views.push((await snapshot(page)).terrain);
    await page.evaluate(() => (window as any).preview(true));
    await page.screenshot({ path: 'artifacts/random-map-' + seed + '.png' });
  }
  expect(views[0]).not.toBe(views[1]);
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page, '?seed=forest-42');
  await page.evaluate(() => (window as any).preview(false));
  await page.screenshot({ path: 'artifacts/random-map-phone.png' });
  await page.locator('#pause').click();
  const box = (await page.locator('#map-replay').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/random-map-replay.png' });
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page, '?seed=' + encodeURIComponent('a' + '🌲'.repeat(63)));
  await expect(page.locator('#map-seed')).not.toContainText('\uFFFD');
  await page.locator('#pause').click();
  const short = (await page.locator('#map-replay').boundingBox())!;
  expect(short.y).toBeGreaterThanOrEqual(0); expect(short.y + short.height).toBeLessThanOrEqual(320);
  expect(invalidAtlasRequests).toEqual([]);
});
