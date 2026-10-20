import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/boundary-harness*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game=new Game();
  </script></body></html>` }));
  await page.goto(info.title.includes('random map') ? '/boundary-harness?seed=first-wave-stall' : '/boundary-harness?world=fixed');
  await page.waitForFunction(() => !!(window as any).game);
  await page.locator('#start-fusion').click();
});

for (const control of ['keyboard', 'joystick']) test(`held ${control} movement and a living enemy carry across the first boundary`, async ({ page }) => {
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    for (const e of g.combat.enemies) e.active = false;
    for (const o of g.combat.orbs) o.active = false;
    g.run.waveElapsed = 65 - .01;
    const enemy = g.combat.spawn('tank', -12, -12, 0); enemy.hp = 37;
    (window as any).carriedEnemy = enemy;
    Object.assign(g.combat.orbs[0], { active: true, value: 8, x: 15, z: 15, previousX: 15, previousZ: 15 });
  });
  if (control === 'keyboard') await page.keyboard.down('KeyD');
  else {
    const box = (await page.locator('#joystick').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
  }
  const state = await page.evaluate(() => {
    const g = (window as any).game, x = g.position.x, z = g.position.z;
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    return { wave: g.run.wave, phase: g.run.phase, rest: g.run.restElapsed, enemyActive: (window as any).carriedEnemy.active,
      enemyHp: (window as any).carriedEnemy.hp, looseXp: g.combat.orbs[0].active, choices: g.combat.progression.pendingChoices,
      moved: Math.hypot(g.position.x - x, g.position.z - z) };
  });
  if (control === 'keyboard') await page.keyboard.up('KeyD'); else await page.mouse.up();
  expect(state).toMatchObject({ wave: 2, phase: 'fighting', rest: 0, enemyActive: true, enemyHp: 37, looseXp: true, choices: 0 });
  expect(state.moved).toBeGreaterThan(.5);
  await expect(page.locator('#welcome h2')).toContainText('第 2 波');
});

for (const looseExperience of [0, 96]) test(`wave boundary with ${looseExperience} loose XP keeps catch-up work bounded`, async ({ page }) => {
  const result = await page.evaluate((xp) => {
    const g = (window as any).game; g.sleep();
    g.run.waveIndex = 1; g.run.prepare(g.combat, g.position);
    for (const e of g.combat.enemies) e.active = false;
    for (const o of g.combat.orbs) o.active = false;
    for (let i = 0; i < xp; i++) Object.assign(g.combat.orbs[i], { active: true, value: 1, x: 15, z: 15, previousX: 15, previousZ: 15 });
    let calls = 0, hudMs = 0, combatRenders = 0;
    const original = g.updateHUD.bind(g);
    g.updateHUD = () => { const t = performance.now(); original(); hudMs += performance.now() - t; calls++; };
    const render = g.combatView.render.bind(g.combatView);
    g.combatView.render = (...args: any[]) => { combatRenders++; return render(...args); };
    const start = performance.now();
    g.run.waveElapsed = g.run.definition.seconds - .001;
    g.step(1 / 60);
    const boundaryMs = performance.now() - start;
    let choices = 0;
    while (g.mode === 'upgrading' && choices < 20) {
      g.chooseUpgrade(g.combat.progression.offers[0]); choices++;
    }
    g.sleep();
    if (g.run.phase === 'fighting') g.step(1 / 60);
    const experience = g.combat.progression.totalExperience;
    calls = 0; hudMs = 0;
    // One delayed display frame requires five fixed simulation ticks, as on a
    // phone recovering from a slow boundary frame. Use the real frame callback.
    g.lastTime = 1000; g.renderTime = 1000; g.accumulator = 0;
    g.frame(1000 + 1000 / 12);
    g.sleep();
    const catchUpCalls = calls;
    for (let i = 0; i < 211; i++) g.step(1 / 60);
    return { boundaryMs, hudMs, choices, experience, catchUpCalls, calls, combatRenders, wave: g.run.wave, phase: g.run.phase, title: document.querySelector('#welcome h2')!.textContent };
  }, looseExperience);
  await test.info().attach('boundary-work', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.catchUpCalls).toBeLessThanOrEqual(1);
  expect(result.calls).toBeLessThanOrEqual(5);
  expect(result.combatRenders).toBe(0);
  expect(result.phase).toBe('fighting');
  expect(result.wave).toBe(3);
  expect(result.title).toContain('第 3 波');
  expect(result.experience).toBe(looseExperience);
  expect(result.choices > 0).toBe(looseExperience > 0);
});

test('live animation loop completes a later intermission without repeated HUD or effect rebuilds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    g.run.waveIndex = 1; g.run.prepare(g.combat, g.position);
    for (const e of g.combat.enemies) e.active = false;
    for (const o of g.combat.orbs) o.active = false;
    g.run.waveElapsed = g.run.definition.seconds - .001;
    g.step(1 / 60);
    const counts = (window as any).restWork = { hud: 0, combat: 0, clears: 0 };
    for (const [owner, name, key] of [[g, 'updateHUD', 'hud'], [g.combatView, 'render', 'combat'], [g.combatView, 'clear', 'clears']] as const) {
      const original = owner[name].bind(owner);
      owner[name] = (...args: any[]) => {
        if (g.run.phase === 'intermission') counts[key]++;
        return original(...args);
      };
    }
    g.wake();
  });
  await page.waitForFunction(() => (window as any).game.run.wave === 3, { timeout: 12_000 });
  expect(await page.evaluate(() => (window as any).restWork)).toEqual({ hud: 3, combat: 0, clears: 0 });
  await expect(page.locator('#run-wave')).toContainText('第 3 / 6 波');
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect(errors).toEqual([]);
});

for (const map of ['fixed map', 'random map']) test(`a played first wave on ${map} with a mixed fusion build continues into wave two`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const boundary = await page.evaluate(() => {
    const g = (window as any).game; g.sleep();
    for (const id of ['leaf-weapon', 'chain', 'vitality', 'haste', 'damage']) g.combat.grantUpgrade(id);
    for (let i = 0; i < 4000 && g.run.wave === 1; i++) {
      g.combat.invulnerability = 10;
      g.step(1 / 60);
      while (g.mode === 'upgrading') g.chooseUpgrade(g.combat.progression.offers[0]);
      g.sleep();
      if (i % 60 === 0) {
        g.combatView.render(1, i / 60, g.position);
        g.partyView.render(1, i / 60);
        g.renderer.render(g.scene, g.camera);
      }
    }
    const state = { mode: g.mode, phase: g.run.phase, wave: g.run.wave, rest: g.run.restElapsed, time: g.run.waveElapsed, kills: g.combat.kills };
    g.wake();
    return state;
  });
  await test.info().attach('played-boundary', { body: JSON.stringify(boundary), contentType: 'application/json' });
  expect(boundary.phase).toBe('fighting');expect(boundary.wave).toBe(2);expect(boundary.rest).toBe(0);
  await page.waitForFunction(() => (window as any).game.run.wave === 2, { timeout: 12_000 });
  const before = await page.evaluate(() => { const p = (window as any).game.position; return { x: p.x, z: p.z }; });
  await page.keyboard.down('KeyD');
  await expect.poll(async () => {
    // Loose XP now stays on the field and may legitimately pause for an upgrade
    // after the boundary. Choose it, as during the simulated first wave above.
    await page.evaluate(() => {
      const g = (window as any).game;
      while (g.mode === 'upgrading') g.chooseUpgrade(g.combat.progression.offers[0]);
    });
    await page.keyboard.down('KeyD');
    return page.evaluate((p) => {
    const g = (window as any).game;
    return Math.hypot(g.position.x - p.x, g.position.z - p.z);
    }, before);
  }).toBeGreaterThan(.3);
  await page.keyboard.up('KeyD');
  const joystick = (await page.locator('#joystick').boundingBox())!;
  const start = await page.evaluate(() => { const p = (window as any).game.position; return { x: p.x, z: p.z }; });
  await page.mouse.move(joystick.x + joystick.width / 2, joystick.y + joystick.height / 2);
  await page.mouse.down();
  await page.mouse.move(joystick.x + joystick.width * .8, joystick.y + joystick.height / 2);
  await expect.poll(async () => {
    await page.evaluate(() => {
      const g = (window as any).game;
      while (g.mode === 'upgrading') g.chooseUpgrade(g.combat.progression.offers[0]);
    });
    // An actual upgrade deliberately releases pointer capture; start a fresh
    // drag after choosing. Held movement across the boundary is tested above.
    await page.mouse.up();
    await page.mouse.move(joystick.x + joystick.width / 2, joystick.y + joystick.height / 2);
    await page.mouse.down();
    await page.mouse.move(joystick.x + joystick.width * .8, joystick.y + joystick.height / 2);
    return page.evaluate((p) => {
    const g = (window as any).game;
    return Math.hypot(g.position.x - p.x, g.position.z - p.z);
    }, start);
  }).toBeGreaterThan(.3);
  await page.mouse.up();
  expect(errors).toEqual([]);
});
