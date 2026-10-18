import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

const state = (page: Page) => page.evaluate(() => (window as unknown as { game: Game }).game.inspect());
type Fixture = {
  parity: () => string; visualProbe: () => { unchanged: boolean; originalHidden: boolean; placeholderCount: number };
  occlusion: () => { front: number[]; back: number[]; corner: number[] };
  disposeProbe: () => { cache: { textures: number; references: number }; children: number };
  cacheProbe: () => Promise<{ shared: boolean; during: { textures: number; references: number }; released: { textures: number; references: number } }>;
};
test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/pixel-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import * as THREE from '/node_modules/three/build/three.module.js';
    import {PixelTextureCache,PixelSpriteRenderer} from '/src/pixel-sprite.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.parity=()=>{g.sleep();g.start('classic',true);g.sleep();let seed=1234;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);g.combat.random=g.combat.progression.random=random;g.combat.spawn('tank',0,6,0);g.input.keys.add('KeyD');for(let i=0;i<150;i++)g.step(1/60);return JSON.stringify({p:g.inspect().position,c:g.inspect().combat,party:g.inspect().party})};
    window.visualProbe=()=>{g.sleep();const before=JSON.stringify({p:g.inspect().position,c:g.inspect().combat,party:g.inspect().party});g.partyView.render(.5,3);g.placeCamera(true);return {unchanged:before===JSON.stringify({p:g.inspect().position,c:g.inspect().combat,party:g.inspect().party}),originalHidden:!g.monster.root.visible,placeholderCount:g.partyView.bodies.filter(b=>b.visible).length}};
    window.disposeProbe=()=>{g.dispose();g.dispose();return {cache:g.partyView.cache.inspect(),children:g.partyView.group.children.length}};
    window.cacheProbe=async()=>{const c=new PixelTextureCache();const a=new PixelSpriteRenderer('yanrong',c),b=new PixelSpriteRenderer('yanrong',c);for(let i=0;i<200&&!a.ready;i++)await new Promise(r=>setTimeout(r,10));const result={shared:a.material.map===b.material.map&&a.ready,during:c.inspect()};a.dispose();b.dispose();return {...result,released:c.inspect()}};
    window.occlusion=()=>{g.sleep();g.placeCamera(true);const view=g.partyView.pixels[0],sprite=view.sprite,h=view.height;
      const foot=sprite.getWorldPosition(new THREE.Vector3());const up=new THREE.Vector3(0,1,0).applyQuaternion(g.camera.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(g.camera.quaternion);
      const center=foot.clone().addScaledVector(up,h*.5),forward=g.camera.getWorldDirection(new THREE.Vector3());
      const cover=new THREE.Mesh(new THREE.PlaneGeometry(h*1.4,h*1.4),new THREE.MeshBasicMaterial({color:'#00ffff',toneMapped:false,fog:false}));cover.quaternion.copy(g.camera.quaternion);g.scene.add(cover);
      const gl=g.renderer.getContext(),pixel=new Uint8Array(4);const read=p=>{g.renderer.render(g.scene,g.camera);const n=p.clone().project(g.camera);gl.readPixels(Math.round((n.x*.5+.5)*gl.drawingBufferWidth),Math.round((n.y*.5+.5)*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return Array.from(pixel)};
      cover.position.copy(center).addScaledVector(forward,.5);const back=read(center),corner=read(center.clone().addScaledVector(right,-h*.45).addScaledVector(up,h*.43));
      cover.position.copy(center).addScaledVector(forward,-.5);const front=read(center);cover.removeFromParent();cover.geometry.dispose();cover.material.dispose();return {front,back,corner}};
  </script></body></html>` })) ;
});

async function open(page: Page, query = '') {
  await page.goto('/pixel-harness' + (query ? query + '&world=fixed' : '?world=fixed'));
  await page.waitForFunction(() => 'game' in window);
  await page.locator('#start-party').tap();
}
async function ready(page: Page) {
  await expect.poll(async () => (await state(page)).partyVisual.members.filter(m => m?.loaded).length).toBe(1);
}

test('single Yanrong PNG retains aspect, nearest sampling, foot anchor and readable phone scale', async ({ page }) => {
  await open(page); await ready(page);
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(100);
    const s = await state(page), members = s.partyVisual.members;
    expect(s.partyVisual.leader).toBe('pixel');
    expect(s.partyVisual.cache).toEqual({ textures: 1, references: 1 });
    for (const m of members) {
      expect(m).toBeDefined();
      expect(m!.width / m!.height).toBeCloseTo(m!.aspect, 6);
      expect(m!.sourceSize).toEqual([1254, 1254]);
      expect(m!.center).toEqual([0.5, 0]);
      expect(m!.footOffset).toBeLessThanOrEqual(0.061);
      expect(m!.nearest).toBe(true); expect(m!.mipmaps).toBe(false);
      expect(m!.depthTest && m!.depthWrite).toBe(true); expect(m!.alphaTest).toBeGreaterThan(0);
    }
    expect(s.party).toHaveLength(1);
    expect(members[0]!.height / s.camera.height * viewport.height).toBeGreaterThanOrEqual(55);
  }
  expect(await page.evaluate(() => (window as unknown as Fixture).visualProbe())).toEqual({ unchanged: true, originalHidden: true, placeholderCount: 0 });
});

test('pixel view and original fallback produce identical party movement, collisions, attacks and XP', async ({ page }) => {
  await open(page); await ready(page);
  const pixel = await page.evaluate(() => (window as unknown as Fixture).parity());
  await open(page, '?partyVisual=legacy');
  expect((await state(page)).partyVisual.enabled).toBe(false);
  expect(await page.evaluate(() => (window as unknown as Fixture).parity())).toBe(pixel);
});

test('transparent corners reveal terrain, opaque art writes depth and real cover occludes it', async ({ page }) => {
  await open(page); await ready(page);
  const pixels = await page.evaluate(() => (window as unknown as Fixture).occlusion());
  expect(pixels.back[0]).toBeGreaterThan(100);
  expect(pixels.front[0]).toBeLessThan(25); expect(pixels.front[1]).toBeGreaterThan(180);
  expect(pixels.corner[0]).toBeLessThan(25); expect(pixels.corner[1]).toBeGreaterThan(180);
});

test('missing art falls back per creature while movement and auto attacks continue', async ({ page }) => {
  await page.route('**/assets/pixel/creatures/*.png', route => route.abort());
  await open(page);
  await expect.poll(async () => (await state(page)).partyVisual.members.filter(m => m?.failed).length).toBe(1);
  expect((await state(page)).partyVisual.leader).toBe('original');
  expect(await page.evaluate(() => (window as unknown as Fixture).visualProbe())).toMatchObject({ originalHidden: false, placeholderCount: 0 });
  const result = JSON.parse(await page.evaluate(() => (window as unknown as Fixture).parity()));
  expect(result.p.x).toBeGreaterThan(2); expect(result.party.every((m: { shotsFired: number }) => m.shotsFired > 0)).toBe(true);
});

test('same-species sprites share textures and disposal releases leases, materials and groups', async ({ page }) => {
  await open(page); await ready(page);
  expect(await page.evaluate(() => (window as unknown as Fixture).cacheProbe())).toEqual({ shared: true, during: { textures: 1, references: 2 }, released: { textures: 0, references: 0 } });
  expect(await page.evaluate(() => (window as unknown as Fixture).disposeProbe())).toEqual({ cache: { textures: 0, references: 0 }, children: 0 });
});

test('disposing during PNG loading never reattaches late resources', async ({ page }) => {
  await page.route('**/assets/pixel/creatures/*.png', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.continue().catch(() => {}); });
  await open(page);
  expect(await page.evaluate(() => (window as unknown as Fixture).disposeProbe())).toMatchObject({ cache: { textures: 0, references: 0 } });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as Fixture).disposeProbe())).toMatchObject({ cache: { textures: 0, references: 0 }, children: 0 });
});
