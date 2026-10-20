import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/music-harness*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); window.game=new Game();
  </script></body></html>` }));
  await page.goto('/music-harness?world=fixed');
  await page.waitForFunction(() => !!(window as any).game);
  await page.locator('#start-fusion').click();
  const supported = await page.evaluate(() => (window as any).game.audio.inspect().supported);
  if (supported) await expect.poll(async () => (await audio(page)).state).toBe('running');
  await page.evaluate(() => {
    const g = (window as any).game; g.sleep(); g.wake = () => {};
  });
  if (supported) await expect.poll(async () => (await audio(page)).state).toBe('suspended');
  await page.evaluate(() => (window as any).game.audio.setActive(true));
  if (supported) await expect.poll(async () => (await audio(page)).state).toBe('running');
});

const audio = (page: Page) => page.evaluate(() => (window as any).game.audio.inspect());
async function wave(page: Page, wave: number) {
  await page.evaluate(w => {
    const g = (window as any).game;
    g.run.waveIndex = w - 1; g.run.waveElapsed = 1;
    g.syncRunPhase();
  }, wave);
}

test('real Ogg tracks loop for waves 3–5 and 6, share pause/mute and reset on restart', async ({ page }) => {
  test.skip(!(await audio(page)).supported, 'This browser runtime does not provide Web Audio');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  expect(await audio(page)).toMatchObject({ track: 'original', playingTrack: 'original', looping: true });
  await wave(page, 2);
  expect((await audio(page)).playingTrack).toBe('original');
  await wave(page, 3);
  await expect.poll(async () => (await audio(page)).playingTrack).toBe('grassland');
  const starts = (await audio(page)).musicStarts;
  const decoded = await page.evaluate(() => {
    const a = (window as any).game.audio;
    return { duration: a.loop.buffer.duration, channels: a.loop.buffer.numberOfChannels, bytes: a.loop.buffer.length * a.loop.buffer.numberOfChannels * 4 };
  });
  expect(decoded.duration).toBeGreaterThan(1);
  await test.info().attach('decoded-grassland', { body: JSON.stringify(decoded), contentType: 'application/json' });
  for (const n of [4, 5]) await wave(page, n);
  expect(await audio(page)).toMatchObject({ playingTrack: 'grassland', musicStarts: starts });
  await page.locator('#pause').click();
  await expect.poll(async () => (await audio(page)).state).toBe('suspended');
  expect((await audio(page)).active).toBe(false);
  await page.locator('#resume').click();
  await expect.poll(async () => (await audio(page)).state).toBe('running');
  expect((await audio(page)).musicStarts).toBe(starts);
  await page.evaluate(() => (window as any).game.audio.configure(false, true));
  expect(await audio(page)).toMatchObject({ music: false, sound: true });
  await page.evaluate(() => (window as any).game.audio.configure(true, true));
  expect((await audio(page)).musicStarts).toBe(starts);
  await wave(page, 6);
  await expect.poll(async () => (await audio(page)).playingTrack).toBe('boss');
  expect((await audio(page)).looping).toBe(true);
  await page.evaluate(() => (window as any).game.endRun('defeat'));
  expect((await audio(page)).active).toBe(false);
  await page.locator('#gameover-restart').click();
  expect(await audio(page)).toMatchObject({ track: 'original', playingTrack: 'original' });
  expect(errors).toEqual([]);
});

test('a late grassland download cannot replace Boss music or restart it', async ({ page }) => {
  test.skip(!(await audio(page)).supported, 'This browser runtime does not provide Web Audio');
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/assets/music/bgm-grassland.ogg', async route => { await gate; await route.continue(); });
  const requested = page.waitForRequest('**/assets/music/bgm-grassland.ogg');
  await wave(page, 3); await requested;
  await wave(page, 6);
  await expect.poll(async () => (await audio(page)).playingTrack).toBe('boss');
  const starts = (await audio(page)).musicStarts;
  release();
  await expect.poll(async () => (await audio(page)).loadedTracks).toContain('grassland');
  expect(await audio(page)).toMatchObject({ playingTrack: 'boss', musicStarts: starts });
  await page.evaluate(() => (window as any).game.showMenu());
  expect(await audio(page)).toMatchObject({ track: 'original', playingTrack: 'original' });
});

test('missing music leaves the existing loop and combat usable', async ({ page }) => {
  test.skip(!(await audio(page)).supported, 'This browser runtime does not provide Web Audio');
  await page.route('**/assets/music/BossBattle.ogg', route => route.fulfill({ status: 404, body: '' }));
  await wave(page, 6);
  await expect.poll(async () => (await audio(page)).failedTracks).toContain('boss');
  expect(await audio(page)).toMatchObject({ playingTrack: 'original', state: 'running', looping: true });
  expect(await page.evaluate(() => { const g = (window as any).game; g.step(1 / 60); return g.run.waveElapsed; })).toBeGreaterThan(1);
  await page.unroute('**/assets/music/BossBattle.ogg');
  await wave(page, 5); await wave(page, 6);
  await expect.poll(async () => (await audio(page)).playingTrack).toBe('boss');
});

test('muting defers loading; a download completed during pause waits for resume', async ({ page }) => {
  test.skip(!(await audio(page)).supported, 'This browser runtime does not provide Web Audio');
  let release!: () => void, requests = 0;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/assets/music/bgm-grassland.ogg', async route => { requests++; await gate; await route.continue(); });
  await page.evaluate(() => (window as any).game.audio.configure(false, true));
  await wave(page, 3);
  expect(requests).toBe(0);
  expect((await audio(page)).playingTrack).toBe('original');
  const requested = page.waitForRequest('**/assets/music/bgm-grassland.ogg');
  await page.evaluate(() => (window as any).game.audio.configure(true, true));
  await requested;
  await page.locator('#pause').click();
  release();
  await expect.poll(async () => (await audio(page)).loadedTracks).toContain('grassland');
  expect(await audio(page)).toMatchObject({ active: false, playingTrack: 'original' });
  await page.locator('#resume').click();
  await expect.poll(async () => (await audio(page)).playingTrack).toBe('grassland');
  expect(requests).toBe(1);
});

test('wave selection works without Web Audio and does not block combat', async ({ page }) => {
  for (const [n, track] of [[1, 'original'], [3, 'grassland'], [4, 'grassland'], [5, 'grassland'], [6, 'boss']] as const) {
    await wave(page, n);
    expect((await audio(page)).track).toBe(track);
  }
  expect(await page.evaluate(() => { const g = (window as any).game; g.step(1 / 60); return g.run.waveElapsed; })).toBeGreaterThan(1);
});
