import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const pair of [['thorn-wheel', 'tidal-blade'], ['thorn-wheel', 'thunder-bud'], ['tidal-blade', 'thunder-bud']]) {
  test(`six-wave mobile pressure: ${pair.join(' + ')} keeps pools bounded and boss warning visible`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 844, height: 390 });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/new-weapon-pressure-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
      <!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
      import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
      createUI(document.getElementById('app'));window.game=new Game();</script></body></html>` }));
    await page.goto('/new-weapon-pressure-harness?world=fixed'); await page.locator('#start-fusion').click();
    await page.evaluate(pair => {
      const g = (window as any).game, c = g.combat; g.sleep(); g.wake = () => {};
      c.reset(); c.automaticSpawning = false; c.obstacles = []; c.invulnerability = 10000;
      g.position.set(0, 0, 0); g.previousPosition.copy(g.position); g.party.syncLeader(g.position, 0);
      for (const id of pair) for (let i = 0; i < 5; i++) c.grantUpgrade(`${id}-weapon`);
      for (const id of ['damage', 'haste', 'range']) for (let i = 0; i < 5; i++) c.grantUpgrade(id);
      c.grantUpgrade('split-on-hit'); c.grantUpgrade('overload-core');
      document.getElementById('welcome')!.hidden = true; g.placeCamera(true);
    }, pair);
    await page.waitForFunction(() => {
      const v = (window as any).game.combatView.inspect();
      return [...v.blades.atlases, ...v.thunder.atlases].every((a: any) => a.loaded);
    });
    // Load the real boss sprite before measuring warning occlusion or GPU resources.
    await page.evaluate(() => {
      const g = (window as any).game, c = g.combat; c.encounters.beginWave(6);
      const boss = c.encounters.spawnBoss(c, g.position); boss.spawnTime = 0;
      g.combatView.render(1, 0, g.position);
    });
    await page.waitForFunction(() => (window as any).game.combatView.inspect().encounters.boss?.atlases.some((a: any) => a.asset === 'crownthorn-directions' && a.loaded));
    const rows = [];
    for (let wave = 1; wave <= 6; wave++) {
      const row = await page.evaluate(wave => {
        const g = (window as any).game, c = g.combat, v = g.combatView;
        c.clearTransientEffects(); for (const e of c.enemies) e.active = false;
        g.run.waveIndex = wave - 1;
        c.encounters.beginWave(wave);
        const count = [36, 52, 72, 92, 112, 72][wave - 1];
        for (let i = 0; i < count; i++) {
          const angle = i * 2.399963, radius = 2.2 + i % 9 * .6;
          const e = c.spawn(i % 6 === 0 ? 'tank' : i % 4 === 0 ? 'fast' : 'normal', Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
          e.hp = 100000;
        }
        // Preset density fixture, deliberately protected; this is not a survival/win-rate probe.
        for (const a of c.runBuild.attacks) a.cooldown = a.attackId === 'spark' ? 10000 : 0;
        for (let i = 0; i < 22; i++) c.update(1 / 60, g.position);
        if (wave === 6) {
          const boss = c.encounters.spawnBoss(c, g.position);
          Object.assign(boss, { x: 8, z: 0, previousX: 8, previousZ: 0, spawnTime: 0, hp: 100000 });
          c.encounters.bossState = 'dash-windup'; c.encounters.bossTime = .3; c.encounters.aimX = -1; c.encounters.aimZ = 0;
        }
        g.partyView.render(1, 0); g.updateHUD(); v.detail = 4; v.render(1, c.elapsed, g.position);
        const draw = () => g.renderer.render(g.scene, g.camera);
        const parts = [v.bladeWeaponsView.group, v.thunderWeaponView.group];
        parts.forEach(p => p.visible = false); draw(); const baseCalls = g.renderer.info.render.calls;
        parts.forEach(p => p.visible = true);
        const start = performance.now(); draw(); const renderMs = performance.now() - start;
        const extraCalls = g.renderer.info.render.calls - baseCalls;
        const resources = { ...g.renderer.info.memory };
        const high = v.inspect();
        let warning: { baseline: number; retained: number; ratio: number } | null = null;
        if (wave === 6) {
          const lane = v.encounters.lane, gl = g.renderer.getContext();
          const pixels = () => {
            draw(); const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p); return p;
          };
          const a = pixels(); lane.visible = false; const b = pixels();
          parts.forEach(p => p.visible = false); lane.visible = true; const d = pixels(); lane.visible = false; const e = pixels();
          parts.forEach(p => p.visible = true); lane.visible = true;
          let baseline = 0, retained = 0;
          for (let i = 0; i < a.length; i += 4) if (Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2]) > 12) {
            baseline++; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) retained++;
          }
          warning = { baseline, retained, ratio: retained / Math.max(1, baseline) };
        }
        const before = JSON.stringify(c.inspect()); v.detail = 2; v.render(1, c.elapsed, g.position); draw();
        const low = v.inspect();
        return { wave, count, extraCalls, renderMs, resources, resourcesAfter: { ...g.renderer.info.memory }, warning,
          unchanged: before === JSON.stringify(c.inspect()),
          atlases: [...high.blades.atlases, ...high.thunder.atlases, ...low.blades.atlases, ...low.thunder.atlases] };
      }, wave);
      expect(row.unchanged).toBe(true); expect(row.extraCalls).toBeLessThanOrEqual(8);
      expect(row.resourcesAfter).toEqual(row.resources);
      for (const atlas of row.atlases) expect(atlas.count).toBeLessThanOrEqual(atlas.capacity);
      if (row.warning) { expect(row.warning.baseline).toBeGreaterThan(100); expect(row.warning.ratio).toBeGreaterThan(.85); }
      rows.push(row);
    }
    await page.screenshot({ path: `artifacts/new-weapon-balance/dense-${pair.join('-')}.png` });
    const report = { environment: 'Desktop software WebGL at 844x390; renderMs is diagnostic, not physical-phone FPS.', rows };
    await mkdir('artifacts/new-weapon-balance', { recursive: true });
    await writeFile(`artifacts/new-weapon-balance/pressure-${pair.join('-')}.json`, JSON.stringify(report, null, 2) + '\n');
    await info.attach('six-wave-pressure', { body: JSON.stringify(report), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}
