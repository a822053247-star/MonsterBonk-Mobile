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

test('endless exploration shares combat/build systems but uses endless survival rules', async ({ page }) => {
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
      endlessRules: g.run?.endless, waveLabel: g.run?.waveLabel,
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
  const { world: _challengeWorld, endlessRules: _campaignRules, waveLabel: _campaignLabel, ...expected } = challenge;
  const { world: _endlessWorld, endlessRules: _endlessRules, waveLabel: _endlessLabel, ...actual } = endless;
  expect(actual).toEqual(expected);
  expect(challenge.endlessRules).toBe(false);
  expect(challenge.waveLabel).toBe('第 1 / 6 波');
  expect(endless.endlessRules).toBe(true);
  expect(endless.waveLabel).toContain('第 1 波');
  expect(endless).toMatchObject({ species: 'sproutspike', runActive: true, wave: 1,
    phase: 'fighting', shopAvailable: true, fusion: true, usesRunBuild: true, sixWaveHud: true });
});

test('HD pixel terrain and all seven scenery batches use nearest sampling', async ({ page }) => {
  await start(page);
  const view = await page.evaluate(() => {
    const g = (window as any).game, terrain = g.world.group.getObjectByName('无尽草场');
    const chunks = terrain.children;
    const first = chunks[0];
    const ground = first.children.find((child: any) => child.name === '像素草地与沙地') as any;
    const sprites = first.children.filter((child: any) => child.isInstancedMesh) as any[];
    return { chunks: chunks.length, width: ground.material.map.image.width,
      height: ground.material.map.image.height,
      generateMipmaps: ground.material.map.generateMipmaps,
      nearestSampling: ground.material.map.minFilter === 1003 && ground.material.map.magFilter === 1003,
      spriteCount: sprites.length, childCount: first.children.length,
      pixelSprites: sprites.every(s => s.material.map.magFilter === 1003 && s.material.map.minFilter === 1003),
      scenery: chunks.flatMap((c: any) => c.children.filter((s: any) => s.isInstancedMesh)).reduce((n: number, s: any) => n + s.count, 0) };
  });
  expect(view).toMatchObject({ chunks: 9, width: 1024, height: 1024,
    generateMipmaps: false, nearestSampling: true, pixelSprites: true, spriteCount: 7, childCount: 8 });
  expect(view.scenery).toBeGreaterThan(100);
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
      chunk.children.find((child: any) => child.name === '像素草地与沙地').material.map));
    const sprites = new Set(original.flatMap(chunk => chunk.children.filter((child: any) => child.isInstancedMesh)));
    let stable = true;
    const positions = [[64, 0], [128, 0], [128, 64], [128, 128],
      [0, 128], [-128, 64], [-128, -64], [0, 0]];
    for (const [x, z] of positions) {
      game.position.set(x, 0, z);
      game.previousPosition.copy(game.position);
      game.step(1 / 60);
      stable &&= terrain.children.length === 9 && terrain.children.every((chunk: any) => {
        const ground = chunk.children.find((child: any) => child.name === '像素草地与沙地');
        return original.includes(chunk) && textures.has(ground.material.map) &&
          chunk.children.filter((child: any) => child.isInstancedMesh).every((mesh: any) => sprites.has(mesh));
      });
    }
    return { stable, chunks: terrain.children.length, textures: textures.size, sprites: sprites.size };
  });
  expect(result).toEqual({ stable: true, chunks: 9, textures: 9, sprites: 63 });
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


test('all chunk edges use the same absolute terrain field and revisits restore identical pixels', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const { sampleInfiniteSurface } = await import('/src/infinite-world.ts');
    const g = (window as any).game; g.sleep();
    const terrain = g.world.group.getObjectByName('无尽草场');
    const snapshot = () => {
      const chunk = terrain.getObjectByName('chunk:0:0');
      return chunk.children[0].material.map.image.toDataURL();
    };
    const original = snapshot();
    let matches = true;
    for (const chunk of terrain.children) {
      const canvas = chunk.children[0].material.map.image;
      const ctx = canvas.getContext('2d');
      for (let p = 0; p < 1024; p += 8) for (const [x, y] of [[p, 0], [0, p]]) {
        const kind = sampleInfiniteSurface('forest-42', chunk.position.x + x / 16, chunk.position.z + y / 16);
        const color = [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
        matches &&= color === ({ grass: '53,155,70', soil: '196,157,73', sand: '197,179,84' })[kind];
      }
    }
    g.world.update(200, -200); g.world.update(0, 0);
    return { matches, restored: snapshot() === original };
  });
  expect(result).toEqual({ matches: true, restored: true });
});

test('native device resolution survives battery mode, adaptive load and resize', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route('**/hd-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body><div id="app"></div><script type="module">
    import '/src/style.css'; import { createUI } from '/src/ui.ts'; import { Game } from '/src/game.ts';
    createUI(document.getElementById('app')); window.game = new Game();
  </script></body></html>` }));
  await page.goto('/hd-harness?seed=forest-42');
  await page.locator('#start-infinite').click();
  const check = () => page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    g.quality.setMode('battery'); g.quality.scale = .65; g.applyGraphics();
    const canvas = document.querySelector('canvas')!;
    return { ratio: g.renderer.getPixelRatio(), width: canvas.width, height: canvas.height,
      expectedWidth: window.innerWidth * window.devicePixelRatio,
      expectedHeight: window.innerHeight * window.devicePixelRatio };
  });
  for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.querySelector('canvas')!.width === innerWidth * devicePixelRatio);
    const value = await check();
    expect(value.ratio).toBe(2);
    expect(value.width).toBe(value.expectedWidth); expect(value.height).toBe(value.expectedHeight);
  }
  await context.close();
});

test('trees stones and cacti stop the player while flowers and grass remain walkable', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const { generateInfiniteChunk } = await import('/src/infinite-world.ts');
    const g = (window as any).game; g.sleep();
    const layout = generateInfiniteChunk('forest-42', 0, 0);
    const blocked = [layout.trees[0], layout.rocks[0], layout.cacti[0]].map(p => {
      const x = p.x - 32, z = p.z - 32;
      const obstacle = g.world.obstacles.find((o: any) => Math.hypot(o.x - x, o.z - z) < .001);
      g.position.set(x + .01, 0, z); g.previousPosition.copy(g.position); g.step(1 / 60);
      return Math.hypot(g.position.x - x, g.position.z - z) >= obstacle.radius + .619;
    });
    const walkable = [layout.flowers[0], layout.grass[0]].map(p => {
      const x = p.x - 32, z = p.z - 32;
      g.position.set(x, 0, z); g.previousPosition.copy(g.position); g.step(1 / 60);
      return Math.hypot(g.position.x - x, g.position.z - z) < .001;
    });
    return { blocked, walkable };
  });
  expect(result).toEqual({ blocked: [true, true, true], walkable: [true, true] });
});
