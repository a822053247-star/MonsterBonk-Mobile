import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

const state = (page: Page) => page.evaluate(() => (window as unknown as { game: Game }).game.inspect());
type Fixture = {
  arrange: () => { unchanged: boolean; body: number; eyes: number; horns: number; armor: number; shadows: number; warnings: number; bars: number; target: number; lanes: number; arrows: number; shapes: { kind: string; ratio: number; footError: number }[] };
  parity: () => string;
  pixels: () => { back: number[]; corner: number[]; front: number[]; hurt: number[]; otherBefore: number[]; otherAfter: number[] };
  pool: () => { counts: number[]; calls: number[]; stable: boolean; cleared: number; cache: { textures: number; references: number } };
  destroy: () => { cache: { textures: number; references: number }; batches: unknown[]; children: number };
};
test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/enemy-pixel-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import * as THREE from '/node_modules/three/build/three.module.js';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    const draw=()=>{g.placeCamera(true);g.partyView.render(1,g.elapsed);g.combatView.render(1,g.elapsed,g.position);g.renderer.render(g.scene,g.camera)};
    window.arrange=()=>{g.sleep();g.combat.reset('horn-trial');g.party.syncLeader(g.position,0);g.party.placeCompanions(g.world.obstacles,32.3);
      const normal=g.combat.spawn('normal',-3,3,0),fast=g.combat.spawn('fast',3,3,0);g.combat.spawn('tank',0,6,0);g.combat.spawn('normal',-4,6,.75);
      normal.hp=15;fast.intent='windup';g.combat.targetId=normal.id;
      // A stable arranged render scene: resize must not restart the simulation.
      g.mode='paused';g.welcome.style.display='none';document.getElementById('trial-status').hidden=true;
      const before=JSON.stringify({c:g.combat.inspect(),p:g.party.inspect()});draw();const v=g.combatView;
      const shapes=[];if(v.pixelEnemies)for(const [kind,batch] of v.pixelEnemies.batches){if(!batch.mesh.count)continue;const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();batch.mesh.getMatrixAt(0,m);m.decompose(p,q,s);const e=g.combat.enemies.find(e=>e.active&&e.kind===kind&&e.spawnTime===0);const foot=p.clone().project(g.camera),ground=new THREE.Vector3(e.x,0,e.z).project(g.camera);shapes.push({kind,ratio:s.x/s.y,footError:Math.abs(foot.y-ground.y)*innerHeight/2})}
      return {unchanged:before===JSON.stringify({c:g.combat.inspect(),p:g.party.inspect()}),body:v.body.count,eyes:v.eyes.count,horns:v.horns.count,armor:v.armor?.count??0,shadows:v.shadows.count,warnings:v.warnings.count,bars:v.healthBack.count,target:v.target.count,lanes:v.pounceLanes.count,arrows:v.pounceArrows.count,shapes}};
    window.parity=()=>{g.start('classic',true);g.sleep();let seed=123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);g.combat.random=g.combat.progression.random=random;
      g.combat.spawn('normal',0,6,0);g.combat.spawn('fast',3,6,0);g.combat.spawn('tank',-5,6,0);g.input.keys.add('KeyD');for(let i=0;i<150;i++)g.step(1/60);
      return JSON.stringify({p:g.inspect().position,c:g.inspect().combat,party:g.inspect().party})};
    window.pixels=()=>{window.arrange();g.combat.enemies.find(e=>e.active&&e.spawnTime>0).spawnTime=0;draw();const v=g.combatView.pixelEnemies,b=v.batches.get('normal'),m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();b.mesh.getMatrixAt(0,m);m.decompose(p,q,scale);
      const up=new THREE.Vector3(0,1,0).applyQuaternion(g.camera.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(g.camera.quaternion),center=p.clone().addScaledVector(up,scale.y*.5),forward=g.camera.getWorldDirection(new THREE.Vector3());
      const cover=new THREE.Mesh(new THREE.PlaneGeometry(scale.y*1.5,scale.y*1.5),new THREE.MeshBasicMaterial({color:'#00ffff',toneMapped:false,fog:false}));cover.quaternion.copy(g.camera.quaternion);g.scene.add(cover);
      const gl=g.renderer.getContext(),pixel=new Uint8Array(4);const read=point=>{draw();const n=point.clone().project(g.camera);gl.readPixels(Math.round((n.x*.5+.5)*gl.drawingBufferWidth),Math.round((n.y*.5+.5)*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return Array.from(pixel)};
      cover.position.copy(center).addScaledVector(forward,.5);const back=read(center),corner=read(center.clone().addScaledVector(right,-scale.y*.45).addScaledVector(up,scale.y*.43));
      cover.position.copy(center).addScaledVector(forward,-.5);const front=read(center);cover.removeFromParent();cover.geometry.dispose();cover.material.dispose();
      const other=new THREE.Vector3(),otherScale=new THREE.Vector3();b.mesh.getMatrixAt(1,m);m.decompose(other,q,otherScale);other.addScaledVector(up,otherScale.y*.5);const otherBefore=read(other);
      g.combat.enemies.find(e=>e.active&&e.kind==='normal'&&e.spawnTime===0).flash=.16;const hurt=read(center),otherAfter=read(other);return {back,corner,front,hurt,otherBefore,otherAfter}};
    window.pool=()=>{g.sleep();g.combat.reset('classic');const v=g.combatView;g.combat.spawn('normal',0,5,0);draw();const first=g.renderer.info.render.calls,resources=[g.renderer.info.memory.geometries,g.renderer.info.memory.textures];
      for(let i=0;i<100;i++)g.combat.spawn('normal',Math.sin(i)*8,Math.cos(i)*8,0);draw();const counts=v.pixelEnemies.inspect().batches.map(b=>b.count),full=g.renderer.info.render.calls;
      g.combat.reset();v.clear();draw();const result={counts,calls:[first,full],stable:resources[0]===g.renderer.info.memory.geometries&&resources[1]===g.renderer.info.memory.textures,cleared:v.pixelEnemies.inspect().batches.reduce((s,b)=>s+b.count,0),cache:v.pixelEnemies.inspect().cache};return result};
    window.destroy=()=>{const v=g.combatView.pixelEnemies;g.dispose();return {...v.inspect(),children:v.group.children.length}};
  </script></body></html>` })) ;
});
async function open(page: Page, query = '') { await page.goto('/enemy-pixel-harness' + (query ? query + '&world=fixed' : '?world=fixed')); await page.waitForFunction(() => 'game' in window); await page.locator('#start-party').tap(); }
async function ready(page: Page) { const enabled = (await state(page)).enemyVisual.enabled; await expect.poll(async () => (await state(page)).enemyVisual.batches?.filter(b => b.loaded).length).toBe(enabled ? 3 : 1); }

test('three fixed-capacity pixel batches preserve proportions, anchors and all existing enemy cues', async ({ page }, info) => {
  await open(page); await ready(page);
  await expect.poll(async () => (await state(page)).partyVisual.members.filter(m => m?.loaded).length).toBe(1);
  await page.waitForTimeout(100);
  for (const viewport of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    const probe = await page.evaluate(() => (window as unknown as Fixture).arrange());
    const { shapes, ...cues } = probe;
    expect(cues).toEqual({ unchanged: true, body: 0, eyes: 0, horns: 0, armor: 0, shadows: 3, warnings: 1, bars: 1, target: 1, lanes: 1, arrows: 1 });
    const visual = (await state(page)).enemyVisual;
    expect(visual.cache).toEqual({ textures: 3, references: 3 });
    expect(visual.batches!.map(b => b.count)).toEqual([1, 1, 1]);
    for (const b of visual.batches!) {
      expect(b.capacity).toBe(48); expect(b.nearest).toBe(true); expect(b.mipmaps).toBe(false);
      expect(b.depthTest && b.depthWrite).toBe(true); expect(b.alphaTest).toBeGreaterThan(0);
      expect(b.aspect).toBeCloseTo(b.crop[2] / b.crop[3], 8);
      expect(shapes.find(s => s.kind === b.kind)!.ratio).toBeCloseTo(b.aspect, 6);
      expect(shapes.find(s => s.kind === b.kind)!.footError).toBeLessThan(1);
      expect(b.height / (await state(page)).camera.height * viewport.height).toBeGreaterThan(25);
    }
    if (info.project.name === 'chromium') await page.screenshot({ path: 'artifacts/enemy-tank-layout-' + viewport.width + '.png' });
  }
});

test('pixel and legacy enemy displays give identical movement, combat and experience with no new monster types', async ({ page }) => {
  await open(page); await ready(page); const result = await page.evaluate(() => (window as unknown as Fixture).parity());
  await open(page, '?enemyVisual=legacy'); expect((await state(page)).enemyVisual.enabled).toBe(false);
  expect(await page.evaluate(() => (window as unknown as Fixture).parity())).toBe(result);
});

test('one missing enemy texture only falls back that kind and retains original body parts', async ({ page }) => {
  await page.route('**/enemies/direction/grass-monster-directions/runtime.normalized.png', route => route.abort());
  await page.route('**/enemies/grass-monster.png', route => route.abort());
  await open(page);
  await expect.poll(async () => (await state(page)).enemyVisual.batches?.find(b => b.kind === 'normal')?.failed).toBe(true);
  await expect.poll(async () => (await state(page)).enemyVisual.batches?.find(b => b.kind === 'fast')?.loaded).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Fixture).arrange())).toMatchObject({ body: 1, eyes: 2, horns: 2, armor: 0 });
  expect((await state(page)).enemyVisual.batches!.map(b => b.count)).toEqual([0, 1, 1]);
});

test('real depth buffer handles transparent cutouts, foreground cover and visible per-instance hit flash', async ({ page }) => {
  await open(page); await ready(page);
  const p = await page.evaluate(() => (window as unknown as Fixture).pixels());
  expect(p.back[0]).toBeGreaterThan(40);
  expect(p.front[0]).toBeLessThan(25); expect(p.front[1]).toBeGreaterThan(180);
  expect(p.corner[0]).toBeLessThan(25); expect(p.corner[1]).toBeGreaterThan(180);
  expect(p.hurt[0]).toBeGreaterThan(p.back[0] + 20);
  expect(p.otherAfter).toEqual(p.otherBefore);
});

test('48 enemies reuse the same batches and textures, clear on reset and release on disposal', async ({ page }) => {
  await open(page); await ready(page);
  await expect.poll(async () => (await state(page)).partyVisual.members.filter(m => m?.loaded).length).toBe(1);
  const p = await page.evaluate(() => (window as unknown as Fixture).pool());
  expect(p.counts).toEqual([48, 0, 0]); expect(p.calls[1]).toBe(p.calls[0]); expect(p.stable).toBe(true);
  expect(p.cleared).toBe(0); expect(p.cache).toEqual({ textures: 3, references: 3 });
  expect(await page.evaluate(() => (window as unknown as Fixture).destroy())).toEqual({ cache: { textures: 0, references: 0 }, directionStates: 0, batches: [], children: 0 });
});

test('disposing during enemy PNG loading prevents late resource attachment', async ({ page }) => {
  await page.route('**/assets/pixel/enemies/**', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.continue().catch(() => {}); });
  await open(page);
  expect(await page.evaluate(() => (window as unknown as Fixture).destroy())).toMatchObject({ cache: { textures: 0, references: 0 }, batches: [], children: 0 });
  await page.waitForTimeout(600);
  expect((await state(page)).enemyVisual.batches).toBeUndefined();
});


test('tank never uses removed blue geometry in legacy mode or after PNG failure', async ({ page }) => {
  await open(page, '?enemyVisual=legacy'); await ready(page);
  expect(await page.evaluate(() => (window as unknown as Fixture).arrange())).toMatchObject({ body: 2, eyes: 4, horns: 4, armor: 0 });
  expect((await state(page)).enemyVisual.batches!.map(b => b.count)).toEqual([0, 0, 1]);
  expect(await page.evaluate(() => 'armor' in (window as unknown as { game: any }).game.combatView)).toBe(false);
  await page.route('**/enemies/rock-armor-bug.png', route => route.abort());
  await page.route('**/enemies/direction/rock-armor-bug-directions/runtime.normalized.png', route => route.abort());
  await open(page);
  await expect.poll(async () => (await state(page)).enemyVisual.batches?.find(b => b.kind === 'tank')?.failed).toBe(true);
  await expect.poll(async () => (await state(page)).enemyVisual.batches?.filter(b => b.loaded).length).toBe(2);
  expect(await page.evaluate(() => (window as unknown as Fixture).arrange())).toMatchObject({ body: 0, eyes: 0, horns: 0, armor: 0 });
  expect((await state(page)).enemyVisual.batches!.map(b => b.count)).toEqual([1, 1, 1]);
});
