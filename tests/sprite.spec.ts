import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

type Harness = { game: Game; spriteProbe: () => { aspect: number; ratio: number; center: number[]; footError: number; shadowY: number; shadowAlpha: number; ghostCapacity: number; depthTest: boolean; depthWrite: boolean; alphaTest: number; uploadedSize: number[] }; parity: () => boolean; occlusion: () => { front: number[]; back: number[]; corner: number[] }; animateProbe: () => { stretched: boolean; ghosts: number; flash: number; unchanged: boolean } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Harness).game.inspect());

test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/sprite-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.spriteProbe=()=>{const v=g.monster.spriteView,s=v.sprite;g.monster.animate(0,0,false,0);g.placeCamera(true);g.scene.updateMatrixWorld(true);
      const foot=g.position.clone().copy(g.monster.root.position).add(s.position).project(g.camera),ground=g.monster.root.position.clone().project(g.camera);
      const c=v.shadowTexture.image.getContext('2d');return {aspect:v.aspect,ratio:s.scale.x/s.scale.y,center:s.center.toArray(),footError:Math.abs(foot.y-ground.y)*innerHeight/2,shadowY:v.shadow.position.y,shadowAlpha:c.getImageData(32,32,1,1).data[3],ghostCapacity:v.ghosts.length,depthTest:v.material.depthTest,depthWrite:v.material.depthWrite,alphaTest:v.material.alphaTest,uploadedSize:[v.texture.image.width,v.texture.image.height]}};
    window.parity=()=>{const results=[];for(const mode of ['sprite','procedural']){g.monster.setVisual(mode);g.start();g.sleep();g.combat.random=()=>.4;g.combat.spawn('normal',0,4,0);g.input.keys.add('KeyD');for(let i=0;i<90;i++)g.step(1/60);const s=g.inspect();results.push(JSON.stringify({position:s.position,elapsed:s.elapsed,cooldown:s.cooldown,combat:s.combat}));}return results[0]===results[1]};
    window.animateProbe=()=>{g.sleep();const before=JSON.stringify({p:g.inspect().position,c:g.inspect().combat});const v=g.monster.spriteView;g.monster.animate(1/60,1,true,0,0,.8);return {stretched:v.sprite.scale.y>v.height,ghosts:v.inspect().ghosts,flash:v.material.opacity,unchanged:before===JSON.stringify({p:g.inspect().position,c:g.inspect().combat})}};
    window.occlusion=()=>{g.sleep();g.placeCamera(true);g.monster.animate(0,0,false,0);const v=g.monster.spriteView;
      const center=g.position.clone().copy(g.monster.root.position).add(g.position.clone().set(0,1,0).applyQuaternion(g.camera.quaternion).multiplyScalar(v.height*.5));
      const forward=g.camera.getWorldDirection(g.position.clone());const ground=g.world.group.getObjectByName('中央草场');const cover=ground.clone();cover.geometry=ground.geometry.clone();cover.material=ground.material.clone();cover.material.color.set('#00ffff');cover.material.toneMapped=false;cover.quaternion.copy(g.camera.quaternion);cover.scale.set(v.height/240,v.height/240,1);g.scene.add(cover);
      const gl=g.renderer.getContext(),pixel=new Uint8Array(4);const read=(point)=>{g.renderer.render(g.scene,g.camera);const ndc=point.clone().project(g.camera);gl.readPixels(Math.round((ndc.x*.5+.5)*gl.drawingBufferWidth),Math.round((ndc.y*.5+.5)*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return Array.from(pixel)};
      cover.position.copy(center).addScaledVector(forward,.5);const back=read(center);const cornerPoint=center.clone().add(g.position.clone().set(-v.height*.43,v.height*.43,0).applyQuaternion(g.camera.quaternion));const corner=read(cornerPoint);
      cover.position.copy(center).addScaledVector(forward,-.5);const front=read(center);cover.removeFromParent();cover.geometry.dispose();cover.material.dispose();return {front,back,corner}};
  </script></body></html>` }));
});

async function openSprite(page: Page) {
  await page.goto('/sprite-harness');
  await expect.poll(async () => (await state(page))?.creature.sprite?.loaded).toBe(true);
  await page.locator('#start').tap();
}

test('complete sprite keeps its aspect, ground anchor, soft shadow and phone size', async ({ page }) => {
  await openSprite(page);
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    const probe = await page.evaluate(() => (window as unknown as Harness).spriteProbe());
    expect(probe.ratio).toBeCloseTo(probe.aspect, 6); expect(probe.center).toEqual([0.5, 0]);
    expect(probe.footError).toBeLessThan(1); expect(probe.shadowY).toBeLessThan(0.04);
    expect(probe.shadowAlpha).toBeGreaterThan(30); expect(probe.shadowAlpha).toBeLessThan(100);
    expect(probe.ghostCapacity).toBe(3); expect(probe.depthTest && probe.depthWrite).toBe(true); expect(probe.alphaTest).toBeGreaterThan(0);
    expect(Math.max(...probe.uploadedSize)).toBeLessThanOrEqual(1024);
    const current = await state(page); const pixels = current.creature.sprite!.height / current.camera.height * viewport.height;
    expect(pixels).toBeGreaterThanOrEqual(55); expect(pixels).toBeLessThan(70);
  }
});

test('sprite and 3D fallback give identical movement, targeting, damage and XP results', async ({ page }) => {
  await openSprite(page);
  expect(await page.evaluate(() => (window as unknown as Harness).parity())).toBe(true);
});

test('real depth buffer occludes behind cover and transparent corners reveal the scene', async ({ page }) => {
  await openSprite(page);
  const pixels = await page.evaluate(() => (window as unknown as Harness).occlusion());
  expect(pixels.back[0]).toBeGreaterThan(100); // painted orange/cream face
  expect(pixels.front[0]).toBeLessThan(25); expect(pixels.front[1]).toBeGreaterThan(80); // opaque cyan cover
  expect(pixels.corner[0]).toBeLessThan(25); expect(pixels.corner[1]).toBeGreaterThan(80); // transparent PNG corner
});

test('dash afterimages, stretch and hurt flash affect visuals only and restart clears them', async ({ page }) => {
  await openSprite(page);
  const probe = await page.evaluate(() => (window as unknown as Harness).animateProbe());
  expect(probe).toMatchObject({ stretched: true, ghosts: 1, unchanged: true }); expect(probe.flash).toBeLessThan(1);
  await page.evaluate(() => { const g = (window as unknown as { game: { start: () => void } }).game; g.start(); });
  expect((await state(page)).creature.sprite?.ghosts).toBe(0);
  await page.locator('#dash').tap();
  await expect.poll(async () => (await state(page)).creature.sprite?.ghosts).toBeGreaterThan(0);
  await page.locator('#pause').tap(); const frozen = await state(page);
  await page.waitForTimeout(250); expect(await state(page)).toEqual(frozen);
});

test('missing PNG falls back safely and explicit 3D mode does not request the image', async ({ page }) => {
  await page.route('**/assets/characters/yanrong-base.png', route => route.abort());
  await page.goto('/sprite-harness');
  await expect.poll(async () => (await state(page))?.creature.sprite?.failed).toBe(true);
  expect((await state(page)).creature.visual).toBe('procedural');
  await page.locator('#start').tap(); await expect.poll(async () => (await state(page)).elapsed).toBeGreaterThan(0.1);
  let requests = 0; page.on('request', request => { if (request.url().includes('yanrong-base.png')) requests++; });
  await page.goto('/sprite-harness?character=3d');
  await expect.poll(async () => (await state(page))?.creature.visual).toBe('procedural');
  expect((await state(page)).creature.sprite).toBeUndefined(); expect(requests).toBe(0);
});
