import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

const state = (page: Page) => page.evaluate(() => (window as unknown as { game: Game }).game.inspect());
const animation = async (page: Page) => (await state(page)).partyVisual.members[0]!.animation;
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/animation-harness*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import * as THREE from '/node_modules/three/build/three.module.js';
    import {PixelTextureCache,PixelSpriteRenderer} from '/src/pixel-sprite.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.monster.root.position.copy(g.position);g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.drive=(x,y,n=30)=>{g.sleep();g.combat.spawnClock=100000;g.input.sample=()=>({x,y});for(let i=0;i<n;i++)g.step(1/60);g.welcome.style.display='none';window.draw()};
    window.home=()=>{g.position.set(0,0,0);g.previousPosition.copy(g.position);g.velocity.set(0,0);g.party.syncLeader(g.position,0);g.monster.root.position.copy(g.position)};
    window.pixelHash=()=>{const saved=g.scene.children.map(o=>[o,o.visible]),children=g.partyView.group.children.map(o=>[o,o.visible]),bg=g.scene.background;
      for(const [o]of saved)o.visible=o===g.partyView.group;for(const [o]of children)o.visible=o===g.partyView.pixels[0].group;g.scene.background=new THREE.Color('#173c32');
      g.renderer.render(g.scene,g.camera);const gl=g.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let hash=2166136261;for(const byte of pixels)hash=Math.imul(hash^byte,16777619)>>>0;
      for(const [o,v]of saved)o.visible=v;for(const [o,v]of children)o.visible=v;g.scene.background=bg;g.renderer.render(g.scene,g.camera);return hash};
    window.parity=()=>{g.start('classic',true,false,'fusion');g.sleep();let seed=1234;g.combat.random=g.combat.progression.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);g.combat.spawn('tank',7,4,0);
      g.input.sample=()=>({x:.43,y:-.82});for(let i=0;i<180;i++)g.step(1/60);return JSON.stringify({position:g.inspect().position,combat:g.combat.inspect(),party:g.party.inspect()})};
    window.offer=()=>{g.sleep();g.combat.progression.gainExperience(8);g.step(1/60)};
    window.shared=async()=>{const cache=new PixelTextureCache(),a=new PixelSpriteRenderer('yanrong',cache),b=new PixelSpriteRenderer('yanrong',cache);a.setAnimationEnabled(true);b.setAnimationEnabled(true);
      for(let i=0;i<300&&(!a.animations.get('yanrong-walk').entry.ready||!b.animations.get('yanrong-diagonal').entry.ready);i++)await new Promise(r=>setTimeout(r,10));
      const basis={rightX:1,rightZ:0,upX:0,upZ:-Math.SQRT1_2};a.stepAnimation(.125,4.6,0,basis);b.stepAnimation(.25,-4.6,0,basis);a.render(2.65,true,0);b.render(2.65,true,0);
      const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-5,5,2.5,-2.5,.1,20);camera.position.z=10;scene.background=new THREE.Color('#173c32');a.group.position.x=-2.5;b.group.position.x=2.5;scene.add(a.group,b.group);
      const renderer=new THREE.WebGLRenderer();renderer.setSize(640,320);const gl=renderer.getContext();
      const read=()=>{renderer.render(scene,camera);const p=new Uint8Array(640*320*4);gl.readPixels(0,0,640,320,gl.RGBA,gl.UNSIGNED_BYTE,p);return p};
      const first=read();b.stepAnimation(.125,-4.6,0,basis);b.render(2.65,true,0);const second=read();let leftChanged=0,rightChanged=0;
      for(let y=0;y<320;y++)for(let x=0;x<640;x++)for(let k=0;k<3;k++)if(first[(y*640+x)*4+k]!==second[(y*640+x)*4+k]){if(x<320)leftChanged++;else rightChanged++;}
      b.resetAnimation();b.stepAnimation(.125,-4.6,0,basis);b.render(2.65,true,0);const mirror=read();let mismatch=0;
      for(let y=0;y<320;y++)for(let x=0;x<320;x++)for(let k=0;k<3;k++)if(mirror[(y*640+x)*4+k]!==mirror[(y*640+639-x)*4+k])mismatch++;
      const result={sameTexture:a.material.map===b.material.map,offset:a.material.map.offset.toArray(),leftChanged,rightChanged,mirrorError:mismatch/(320*320*3),cache:cache.inspect()};
      a.dispose();b.dispose();renderer.dispose();return {...result,released:cache.inspect()}};
  </script></body></html>` }));
});
async function open(page: Page, query = '') {
  await page.goto('/animation-harness?world=fixed' + query); await page.waitForFunction(() => 'game' in window); await page.locator('#start-fusion').tap();
  await expect.poll(async () => (await animation(page)).atlases.filter(a => a.loaded).length).toBe(2);
}
async function drive(page: Page, x: number, y: number, ticks = 30) { await page.evaluate(([x,y,n]) => (window as any).drive(x,y,n), [x,y,ticks]); }

test('real V5 leader renders all projected directions, mirrors left and retains heading when stopping', async ({ page }) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('THREE.WebGLProgram'))errors.push(m.text());});
  await open(page);
  const directions = [['down',0,1],['up',0,-1],['right',1,0],['left',-1,0],['down-right',1,1],['down-left',-1,1],['up-right',1,-1],['up-left',-1,-1]] as const;
  for(const viewport of [{width:844,height:390},{width:568,height:320}]) {
    await page.setViewportSize(viewport);
    for(const [name,x,y]of directions) {
      await page.evaluate(()=>(window as any).home());await drive(page,x,y);
      const a=await animation(page);expect(a.facing).toBe(name);expect(a.moving).toBe(true);expect(a.mirror).toBe(x<0);
      expect(a.asset).toBe(name.includes('-')?'yanrong-diagonal':'yanrong-walk');expect(a.renderedFrame).toBeGreaterThanOrEqual(0);
      await page.screenshot({path:'artifacts/yanrong-walk-'+name+'-'+viewport.width+'.png'});
      await drive(page,0,0,60);expect(await animation(page)).toMatchObject({facing:name,moving:false,clip:'idle-'+name});
    }
  }
  expect(errors).toEqual([]);
});

test('visible GPU pixels change across real walking/idle frames, with stable foot, size and frame sequence', async ({ page }) => {
  await open(page);await drive(page,1,0,30);
  const hashes=new Set<number>(),frames=new Set<number>(),scales:number[][]=[];
  for(let i=0;i<8;i++) {
    await drive(page,1,0,8);hashes.add(await page.evaluate(()=>(window as any).pixelHash()));frames.add((await animation(page)).renderedFrame);
    scales.push(await page.evaluate(()=>{const p=(window as any).game.partyView.pixels[0];return [...p.sprite.scale.toArray(),...p.sprite.center.toArray(),p.sprite.position.y]}));
    await page.screenshot({path:'artifacts/yanrong-step-'+i+'.png'});
  }
  expect(hashes.size).toBe(4);expect(frames.size).toBe(4);for(const scale of scales)expect(scale).toEqual(scales[0]);
  await drive(page,0,1,30);await drive(page,0,0,60);const idle=new Set<number>();
  for(let i=0;i<4;i++){await drive(page,0,0,18);idle.add(await page.evaluate(()=>(window as any).pixelHash()));}
  expect(idle.size).toBeGreaterThanOrEqual(3);
});

test('actual collision displacement controls animation and animated/static visuals have identical combat and positions', async ({ page }) => {
  await open(page);await drive(page,0,-1,15);
  await page.evaluate(()=>{const g=(window as any).game;g.combat.spawn('tank',g.position.x,g.position.z+6,0)});await drive(page,0,-1,15);
  expect((await state(page)).combat.shotsFired).toBeGreaterThan(0);expect((await animation(page)).facing).toBe('up');
  const animated=await page.evaluate(()=>(window as any).parity());
  await page.goto('/animation-harness?world=fixed&creatureAnimation=static');await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();
  // Static override intentionally requests no atlases; compare through the same actual Game steps.
  expect(await page.evaluate(()=>(window as any).parity())).toBe(animated);
  await page.goto('/animation-harness?world=fixed');await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();
  await expect.poll(async ()=>(await animation(page)).atlases.filter(a=>a.loaded).length).toBe(2);
  await page.evaluate(()=>{const g=(window as any).game;g.world.obstacles.splice(0,g.world.obstacles.length,{x:2,z:0,radius:1});});
  await drive(page,1,0,120);expect((await state(page)).position.x).toBeCloseTo(.38,5);expect(await animation(page)).toMatchObject({moving:false,facing:'right'});
});

test('pause, choices, background and death freeze frames; restart resets the real leader', async ({ page }) => {
  await open(page);await drive(page,0,-1);await page.locator('#pause').tap();let before=await animation(page);await page.waitForTimeout(180);expect(await animation(page)).toEqual(before);
  await page.locator('#resume').tap();await page.evaluate(()=>(window as any).offer());before=await animation(page);await page.waitForTimeout(200);expect(await animation(page)).toEqual(before);
  await expect(page.locator('.skill-card').first()).toBeEnabled();await page.locator('.skill-card').first().tap();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});before=await animation(page);await page.waitForTimeout(180);expect(await animation(page)).toEqual(before);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.locator('#resume').tap();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.combat.hp=0;g.step(1/60)});expect((await animation(page)).moving).toBe(false);before=await animation(page);await page.waitForTimeout(180);expect(await animation(page)).toEqual(before);
  await page.evaluate(()=>{const g=(window as any).game;g.input.sample=()=>({x:0,y:0});document.getElementById('gameover-restart')!.addEventListener('click',()=>g.sleep(),{once:true});});
  await page.locator('#gameover-restart').tap();expect(await animation(page)).toMatchObject({facing:'down',moving:false,time:0,frame:12});
});

test('missing diagonal falls back to a mirrored side; both missing atlases retain the original PNG', async ({ page }) => {
  await page.route('**/yanrong-diagonal-walk.normalized.png',r=>r.abort());
  await page.goto('/animation-harness?world=fixed');await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();
  await expect.poll(async ()=>(await animation(page)).atlases.find(a=>a.asset==='yanrong-walk')?.loaded).toBe(true);
  await drive(page,-1,-1);expect(await animation(page)).toMatchObject({facing:'up-left',asset:'yanrong-walk'});
  expect((await animation(page)).uv[2]).toBeLessThan(0);
  await page.route('**/yanrong-animation-sheet.normalized.png',r=>r.abort());
  await page.goto('/animation-harness?world=fixed');await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();
  await expect.poll(async ()=>(await animation(page)).atlases.filter(a=>a.failed).length).toBe(2);
  await expect.poll(async ()=>(await state(page)).partyVisual.leader).toBe('pixel');await drive(page,1,0);
  expect(await animation(page)).toMatchObject({asset:'yanrong',renderedFrame:-1});expect((await state(page)).position.x).toBeGreaterThan(1);
});

test('shared atlases render independent real frames/mirrors without shared UV mutations and release all leases', async ({ page }) => {
  await open(page);const p=await page.evaluate(()=>(window as any).shared());
  expect(p).toMatchObject({sameTexture:true,offset:[0,0],leftChanged:0,cache:{textures:3,references:6},released:{textures:0,references:0}});
  expect(p.rightChanged).toBeGreaterThan(100);expect(p.mirrorError).toBeLessThan(.015);
});

test('disposal during animation loading releases leases and late callbacks never reattach', async ({ page }) => {
  await page.route('**/creatures/animation/*.normalized.png',async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.continue().catch(()=>{});});
  await page.goto('/animation-harness?world=fixed');await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();
  expect(await page.evaluate(()=>{const g=(window as any).game;g.dispose();return g.partyView.cache.inspect()})).toEqual({textures:0,references:0});
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>{const v=(window as any).game.partyView;return {cache:v.cache.inspect(),children:v.group.children.length}})).toEqual({cache:{textures:0,references:0},children:0});
});
