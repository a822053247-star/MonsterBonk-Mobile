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

test('endless exploration shares the EXACT six-wave build, species, upgrades and shop flow of start challenge', async ({ page }) => {
  await page.goto('/infinite-harness?seed=forest-42');
  // Choose a nondefault species to catch regressions to the old one-creature prototype.
  await page.locator('#choose-creature').click();
  await page.locator('[data-creature="sproutspike"]').click();
  await page.locator('#start-selected-creature').click();
  const snapshot = () => page.evaluate(() => {
    const g = (window as any).game;
    const combat = g.combat;
    return { mode: g.inspect().mode, species: g.party.leader.species,
      runActive: !!g.run, wave: g.run?.wave, phase: g.run?.phase,
      shopAvailable: !!g.run?.buy, fusion: combat.fusionEnabled, usesRunBuild: combat.usesRunBuild,
      weaponIds: combat.runBuild.attacks.map((a: any) => a.attackId),
      upgradeCards: combat.progression.fusionBase,
      sixWaveHud: !document.getElementById('run-wave')!.hidden,
      world: g.inspect().world.layout };
  });
  const challenge = await snapshot();
  await page.locator('#pause').click();
  await page.locator('#back-menu').click();
  await page.locator('#start-infinite').click();
  await page.waitForFunction(() => (window as any).game?.inspect().world.layout === 'infinite-pixel-meadow');
  const endless = await snapshot();
  expect(challenge.world).toBe('random-pixel-meadow');
  expect(endless.world).toBe('infinite-pixel-meadow');
  const { world: _challengeWorld, ...expected } = challenge;
  const { world: _endlessWorld, ...actual } = endless;
  expect(actual).toEqual(expected);
  expect(endless).toMatchObject({ species: 'sproutspike', runActive: true, wave: 1,
    phase: 'fighting', shopAvailable: true, fusion: true, usesRunBuild: true, sixWaveHud: true });
});

test('pixel terrain matches the challenge map 16px/unit and shares its pixel-art atlases', async ({ page }) => {
  await start(page);
  const view = await page.evaluate(() => {
    const g = (window as any).game, terrain = g.world.group.getObjectByName('无尽草场');
    const chunks = terrain.children;
    const first = chunks[0];
    const ground = first.children.find((child: any) => child.name === '像素草地与泥路') as any;
    const sprites = first.children.filter((child: any) => child.isInstancedMesh) as any[];
    return { chunks: chunks.length, width: ground.material.map.image.width,
      height: ground.material.map.image.height,
      generateMipmaps: ground.material.map.generateMipmaps,
      hasSpriteArt: sprites.length > 0,
      nativeArtWidth: sprites.map(s => s.material.map.image.width),
      nativeArtHeight: sprites.map(s => s.material.map.image.height) };
  });
  expect(view).toMatchObject({ chunks: 9, width: 1024, height: 1024,
    generateMipmaps: false, hasSpriteArt: true });
  expect(view.nativeArtWidth.every(x => x > 0 && x <= 32)).toBe(true);
  expect(view.nativeArtHeight.every(x => x > 0 && x <= 32)).toBe(true);
});

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

test('held movement walks over the original boundary without interrupting combat', async ({ page }) => {
  await start(page);
  const state = await page.evaluate(() => {
    const g = (window as any).game;
    g.sleep();
    g.position.set(30, 0, 0);
    g.previousPosition.copy(g.position);
    g.input.keys.add('KeyD');
    for (let i = 0; i < 120; i++) g.step(1 / 60);
    g.input.keys.delete('KeyD');
    return { x: g.position.x, world: g.inspect().world, hp: g.combat.hp, elapsed: g.combat.elapsed };
  });
  expect(state.x).toBeGreaterThan(34);
  expect(state.world.chunks).toBe(9);
  expect(state.world.layout).toBe('infinite-pixel-meadow');
  expect(state.elapsed).toBeGreaterThan(1);
  expect(state.hp).toBeGreaterThan(0);
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


test('crossing many chunk boundaries reuses the same nine GPU chunk slots', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(() => {
    const game = (window as any).game;
    game.sleep();
    const terrain = game.world.group.getObjectByName('无尽草场') as any;
    const original = [...terrain.children] as any[];
    const textures = new Set(original.map(chunk =>
      chunk.children.find((child: any) => child.name === '像素草地与泥路').material.map));
    const sprites = new Set(original.flatMap(chunk => chunk.children.filter((child: any) => child.isInstancedMesh)));
    let stable = true;
    const positions = [[64, 0], [128, 0], [128, 64], [128, 128],
      [0, 128], [-128, 64], [-128, -64], [0, 0]];
    for (const [x, z] of positions) {
      game.position.set(x, 0, z);
      game.previousPosition.copy(game.position);
      game.step(1 / 60);
      stable &&= terrain.children.length === 9 && terrain.children.every((chunk: any) => {
        const ground = chunk.children.find((child: any) => child.name === '像素草地与泥路');
        return original.includes(chunk) && textures.has(ground.material.map) &&
          chunk.children.filter((child: any) => child.isInstancedMesh).every((mesh: any) => sprites.has(mesh));
      });
    }
    return { stable, chunks: terrain.children.length, textures: textures.size, sprites: sprites.size };
  });
  expect(result).toEqual({ stable: true, chunks: 9, textures: 9, sprites: 36 });
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
