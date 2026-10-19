import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CrownthornAnimator, CROWNTHORN_CLIPS } from '../src/crownthorn-animation';
import { FACING_ORDER } from '../src/creature-animation';

const basis = { rightX: 1, rightZ: 0, upX: 0, upZ: -1 };
test('projected eight directions, mirroring and independent front combat poses', () => {
  const a = new CrownthornAnimator();
  for (let i = 0; i < 8; i++) {
    a.reset(); const angle = i*Math.PI/4;
    a.step(.1, Math.cos(angle), Math.sin(angle), basis);
    expect(a.inspect()).toMatchObject({ facing: FACING_ORDER[i], renderedFacing: FACING_ORDER[i], mirror: [3,4,5].includes(i) });
    a.play('dash'); a.step(.1, Math.cos(angle), Math.sin(angle), basis);
    expect(a.inspect()).toMatchObject({ facing: FACING_ORDER[i], renderedFacing: 'down', mirror: false });
    a.play(null); expect(a.inspect().renderedFacing).toBe(FACING_ORDER[i]);
  }
  a.reset(); a.step(.1, 1, 0, { rightX: 0, rightZ: 1, upX: 1, upZ: 0 });
  expect(a.facing).toBe('up');
  a.play('death'); a.step(100, 0, 0, basis);
  expect(a.inspect()).toMatchObject({ frame: 5, finished: true });
  const frozen = a.inspect(); a.step(0, 1, 1, basis); expect(a.inspect()).toEqual(frozen);
  a.play('death', true); expect(a.inspect().frame).toBe(0);
  for (const [action, clip] of Object.entries(CROWNTHORN_CLIPS)) {
    a.reset(); a.play(action as keyof typeof CROWNTHORN_CLIPS);
    const frames: number[] = [];
    for (let frame = 0; frame < clip.expected; frame++) {
      frames.push(a.inspect().frame);
      expect(a.inspect().complete).toBe(true);
      a.step(1/clip.fps, 0, 0, basis);
    }
    expect(frames).toEqual(Array.from({length:clip.expected},(_,i)=>i));
    expect(a.inspect().frame).toBe(clip.loop ? 0 : clip.expected-1);
  }
});

test('replacement sources have complete distinct slots, matching hashes and valid anchors', () => {
  const audit = JSON.parse(readFileSync('public/assets/pixel/boss/Crownthorn/runtime/audit.json', 'utf8'));
  for (const [key, source] of Object.entries(audit.sources) as [string, any][]) {
    expect(createHash('sha256').update(readFileSync(source.path)).digest('hex')).toBe(source.sha256);
    const png = readFileSync(`public/assets/pixel/boss/Crownthorn/runtime/${key}.png`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512*source.expected,512]);
    expect(source.usableFrames).toEqual(Array.from({length:source.expected},(_,i)=>i));
    expect(source.frames.every((f:any) => f.usable)).toBe(true);
    if (key !== 'directions') expect(source.usableFrames).toEqual(CROWNTHORN_CLIPS[key as keyof typeof CROWNTHORN_CLIPS].frames);
    for (const f of source.frames) if (f.usable) {
      const [x,y,w,h] = f.destination;
      expect(x).toBeGreaterThanOrEqual(4); expect(y).toBeGreaterThanOrEqual(4); expect(x+w).toBeLessThanOrEqual(508); expect(y+h).toBe(480);
      expect(f.touchesSourceEdge).toBe(0);
    } else expect(f.reason).toBeTruthy();
  }
  expect(audit.sources['spread-cast'].preservedParticlePixels).toBe(8146);
});

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/crownthorn-preview.html');
  await expect.poll(() => page.evaluate(() => (window as any).__crownthorn?.inspect().atlases.filter((a:any) => a.loaded).length)).toBe(8);
}
test('real renderer shows eight directions, front actions, fixed foot anchor, pause and reset', async ({ page, browserName }) => {
  await ready(page);
  await expect(page.locator('details')).toContainText('七套动作帧数完整');
  await expect(page.locator('details')).not.toContainText('部分帧不可用');
  const inspect = () => page.evaluate(() => (window as any).__crownthorn.inspect());
  const hashes = new Set<number>();
  for (const facing of FACING_ORDER) {
    await page.locator('#direction').selectOption(facing);
    await expect.poll(async () => (await inspect()).facing).toBe(facing);
    const s = await inspect(); expect(s.rotation).toBe(0); expect(s.anchor).toEqual([.5,.0625]);
    expect(s.mirror).toBe(facing.includes('left')); expect(s.fallback).toBe(false);
    expect(s.atlases.every((a:any) => a.nearest && !a.mipmaps)).toBe(true);
    const pixels = await page.evaluate(() => (window as any).__crownthorn.pixels());
    expect(pixels.bodyPixels).toBeGreaterThan(100); hashes.add(pixels.hash);
  }
  expect(hashes.size).toBe(8);
  await page.locator('#action').selectOption('death');
  await expect.poll(async () => (await inspect()).finished).toBe(true);
  expect(await inspect()).toMatchObject({ frame: 5, renderedFrame: 5, renderedFacing: 'down', facing: 'up-right' });
  await page.locator('#action').selectOption('idle'); await page.locator('#pause').click();
  const before = await inspect(); await page.waitForTimeout(150); expect(await inspect()).toEqual(before);
  if (browserName === 'chromium') await page.screenshot({ path: 'artifacts/crownthorn-preview.png' });
  await page.locator('#reset').click(); expect(await inspect()).toMatchObject({ facing: 'down', action: null });
  await page.setViewportSize({ width:390,height:844 });
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  expect((await page.evaluate(() => (window as any).__crownthorn.pixels())).bodyPixels).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (browserName === 'chromium') await page.screenshot({ path: 'artifacts/crownthorn-preview-mobile.png' });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await inspect(); await page.waitForTimeout(120); expect(await inspect()).toEqual(hidden);
});

test('decoded atlas frames have clear cell edges, fixed foot line and empty rejected slots', async ({ page }) => {
  await ready(page);
  const samples = await page.evaluate(async () => {
    const audit = await (await fetch('/assets/pixel/boss/Crownthorn/runtime/audit.json')).json();
    const result:any[] = [];
    for (const [key, source] of Object.entries(audit.sources) as [string,any][]) {
      const image = new Image(); image.src = `/assets/pixel/boss/Crownthorn/runtime/${key}.png`; await image.decode();
      const c = document.createElement('canvas'); c.width=image.width; c.height=image.height;
      const ctx = c.getContext('2d')!; ctx.drawImage(image,0,0); const pixels=ctx.getImageData(0,0,c.width,c.height).data;
      for (const frame of source.frames) {
        let bottom=0, edge=0, visible=0;
        for(let y=0;y<512;y++) for(let x=0;x<512;x++) if(pixels[(y*c.width+frame.frame*512+x)*4+3]>=24) {
          bottom=Math.max(bottom,y+1); visible++; if(x<4||x>=508||y<4||y>=508)edge++;
        }
        result.push({usable:frame.usable,bottom,edge,visible});
      }
    }
    return result;
  });
  expect(samples).toHaveLength(37);
  for(const s of samples) { expect(s.edge).toBe(0); if(s.usable) { expect(s.bottom).toBe(480); expect(s.visible).toBeGreaterThan(1000); } else expect(s.visible).toBe(0); }
});

test('failed atlases expose real fallback; dispose releases shared references and rejects late loads', async ({ page }) => {
  await page.route('**/Crownthorn/runtime/death.png', route => route.abort());
  await page.goto('/crownthorn-preview.html');
  await expect.poll(() => page.evaluate(() => (window as any).__crownthorn?.inspect().atlases.filter((a:any)=>a.failed).length)).toBe(1);
  await page.locator('#action').selectOption('death');
  await expect.poll(() => page.evaluate(() => (window as any).__crownthorn.inspect().visible)).toBe(true);
  expect(await page.evaluate(() => (window as any).__crownthorn.inspect())).toMatchObject({ fallback:true,renderedFrame:0 });
  await expect(page.locator('#status')).toContainText('加载失败');
  await page.evaluate(() => (window as any).__crownthorn.dispose());
  expect(await page.evaluate(() => (window as any).__crownthorn.inspect())).toMatchObject({ disposed:true,visible:false,textures:{textures:0,references:0} });
  await page.route('**/Crownthorn/runtime/*.png', async route => { await new Promise(r=>setTimeout(r,200)); await route.continue().catch(()=>{}); });
  await page.reload(); await page.waitForFunction(() => '__crownthorn' in window);
  await page.evaluate(() => (window as any).__crownthorn.dispose()); await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__crownthorn.inspect())).toMatchObject({ disposed:true,visible:false,textures:{textures:0,references:0} });
});
