import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CreatureAnimator, FACING_ORDER, clipFrame } from '../src/creature-animation';

test('companion clips use audited frames, correct diagonal orientation and last-heading idle', () => {
  const basis={rightX:1,rightZ:0,upX:0,upZ:-1};
  for(const [species,prefix,count] of [['bubblesalamander','paopaoyuan',24],['sproutspike','yacishou',23]] as const) {
    const audit=JSON.parse(readFileSync('public/assets/pixel/creatures/animation/'+prefix+'.normalization.json','utf8'));
    let usable=0;
    for(const source of Object.values(audit.sources) as any[]) {
      expect(createHash('sha256').update(readFileSync(source.path)).digest('hex')).toBe(source.sha256);
      for(const f of source.frames) if(f.usable){usable++;expect(f.touchesSourceEdge).toBe(0);expect(f.destination[1]+f.destination[3]).toBe(240);}
    }
    expect(usable).toBe(count);
    const animator=new CreatureAnimator(species);
    for(let i=0;i<8;i++) {
      animator.reset();const angle=i*Math.PI/4;
      animator.step(.125,Math.cos(angle)*4.6,Math.sin(angle)*4.6,basis);
      const facing=FACING_ORDER[i],clip=animator.clip;
      expect(clip.facing).toBe(facing);expect(clip.asset.startsWith(prefix)).toBe(true);
      expect(clip.mirror).toBe(facing==='down-right'?species==='sproutspike':facing==='down-left'?species!=='sproutspike':facing.includes('left'));
      expect(new Set(Array.from({length:16},(_,n)=>clipFrame(clip,n/8))).size).toBe(clip.frameCount);
      animator.step(.1,0,0,basis);expect(animator.facing).toBe(facing);expect(animator.clip.name).toBe('idle-'+facing);
      expect(animator.clip.frameCount).toBe(facing==='down'?4:1);
    }
    expect(animator.clips.walks.down.frameCount).toBe(species==='sproutspike'?3:4);
  }
});

test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
test.beforeEach(async({page})=>{
  await page.route('**/companions-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI}from'/src/ui.ts';import{Game}from'/src/game.ts';import * as THREE from '/node_modules/three/build/three.module.js';
    import{PixelTextureCache,PixelSpriteRenderer}from'/src/pixel-sprite.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.monster.root.position.copy(g.position);g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.drive=(x,y,n=30)=>{g.sleep();g.combat.spawnClock=100000;g.input.sample=()=>({x,y});for(let i=0;i<n;i++)g.step(1/60);g.welcome.style.display='none';window.draw()};
    window.frames=()=>g.partyView.inspect().members.slice(1).map(m=>m.animation);
    window.capture=()=>JSON.stringify({position:g.position.toArray(),members:g.party.inspect(),animations:window.frames()});
    window.preview=async()=>{
      const cache=new PixelTextureCache(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-6,6,3,-3,.1,20);camera.position.z=10;scene.background=new THREE.Color('#173c32');
      const renderer=new THREE.WebGLRenderer();renderer.setSize(768,384);const views=['bubblesalamander','sproutspike'].map((s,i)=>{const p=new PixelSpriteRenderer(s,cache);p.setAnimationEnabled(true);p.group.position.x=i?2.4:-2.4;scene.add(p.group);return p});
      for(let i=0;i<300&&!views.every(p=>p.inspect().animation.atlases.every(a=>a.loaded||a.failed));i++)await new Promise(r=>setTimeout(r,10));
      const hashes=[new Set(),new Set()],sizes=[new Set(),new Set()],basis={rightX:1,rightZ:0,upX:0,upZ:-1};
      for(let frame=0;frame<8;frame++){
        for(let i=0;i<2;i++){const p=views[i];p.stepAnimation(.125,4.6,0,basis);p.render(2.3,true,0);sizes[i].add(JSON.stringify([p.inspect().width,p.inspect().center,p.inspect().footOffset]));}
        renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(768*384*4);gl.readPixels(0,0,768,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        for(let i=0;i<2;i++){let hash=2166136261;for(let y=0;y<384;y++)for(let x=i*384;x<(i+1)*384;x++)for(let k=0;k<4;k++)hash=Math.imul(hash^pixels[(y*768+x)*4+k],16777619)>>>0;hashes[i].add(hash);}
      }
      const loaded=views.map(p=>p.inspect());const result={hashes:hashes.map(s=>s.size),sizes:sizes.map(s=>s.size),cache:cache.inspect(),loaded};
      views.forEach(p=>p.dispose());renderer.dispose();return {...result,released:cache.inspect()};
    };
  </script></body></html>`}));
});
async function open(page:Page,missing=false){
  await page.goto('/companions-harness?world=fixed');await page.waitForFunction(()=>'game'in window);await page.locator('#start-legacy-party').tap();
  await expect.poll(()=>page.evaluate(()=>(window as any).frames().length)).toBe(2);
  await expect.poll(()=>page.evaluate((missing)=>(window as any).frames().every((f:any)=>f.atlases.length===2&&f.atlases.every((a:any)=>a.loaded||(missing&&a.failed))),missing)).toBe(true);
}

test('actual companion GPU frames change independently with stable size and release every texture',async({page})=>{
  await page.goto('/companions-harness?world=fixed');await page.waitForFunction(()=>'preview'in window);
  const result=await page.evaluate(()=>(window as any).preview());
  expect(result.hashes).toEqual([4,4]);expect(result.sizes).toEqual([1,1]);expect(result.cache).toEqual({textures:6,references:6});expect(result.released).toEqual({textures:0,references:0});
});

test('real legacy formation animates followers and freezes on pause, background, death and restart',async({page})=>{
  await open(page);await page.evaluate(()=>(window as any).drive(1,0,40));
  let frames=await page.evaluate(()=>(window as any).frames());for(const f of frames){expect(f.enabled).toBe(true);expect(f.moving).toBe(true);expect(f.renderedFrame).toBeGreaterThanOrEqual(0);}
  for(const viewport of [{width:844,height:390},{width:568,height:320}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>(window as any).drive(-1,.4,35));await page.screenshot({path:'artifacts/companions-moving-'+viewport.width+'.png'});
  }
  await page.evaluate(()=>(window as any).drive(0,0,180));frames=await page.evaluate(()=>(window as any).frames());for(const f of frames)expect(f.moving).toBe(false);
  await page.locator('#pause').tap();const frozen=await page.evaluate(()=>(window as any).capture());await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).capture())).toBe(frozen);
  await page.locator('#resume').tap();await page.evaluate(()=>{const g=(window as any).game;g.sleep();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const background=await page.evaluate(()=>(window as any).frames());await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).frames())).toEqual(background);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.locator('#resume').tap();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.combat.hp=0;g.step(1/60)});frames=await page.evaluate(()=>(window as any).frames());for(const f of frames)expect(f.moving).toBe(false);
  await page.evaluate(()=>{const g=(window as any).game;g.input.sample=()=>({x:0,y:0});document.getElementById('gameover-restart')!.addEventListener('click',()=>g.sleep(),{once:true})});await page.locator('#gameover-restart').tap();
  frames=await page.evaluate(()=>(window as any).frames());for(const f of frames)expect(f).toMatchObject({moving:false,time:0,facing:'down'});
  expect(await page.evaluate(()=>{const g=(window as any).game;g.dispose();return g.partyView.inspect().cache})).toEqual({textures:0,references:0});
});

test('missing companion atlases keep original static PNGs visible without disabling movement',async({page})=>{
  await page.route('**/assets/pixel/creatures/animation/{paopaoyuan,yacishou}*.png',route=>route.abort());await open(page,true);
  await page.evaluate(()=>(window as any).drive(1,0,30));
  const members=await page.evaluate(()=>(window as any).game.partyView.inspect().members.slice(1));
  for(const m of members){expect(m.loaded).toBe(true);expect(m.animation.renderedFrame).toBe(-1);expect(m.animation.atlases.every((a:any)=>a.failed)).toBe(true);expect(m.animation.moving).toBe(true);expect(m.animation.asset).toBe(m.species);}
});

test('legacy Yanrong leader visibly walks through frames, keeps heading when stopping',async({page})=>{
  await open(page);
  const sample=await page.evaluate(()=>{
    const w=window as any,g=w.game,start=g.position.x;
    w.drive(1,0,30);
    const frames=[];
    for(let i=0;i<8;i++){w.drive(1,0,8);frames.push(g.partyView.inspect().members[0].animation.renderedFrame);}
    return {distance:g.position.x-start,animation:g.partyView.inspect().members[0].animation,frames};
  });
  expect(sample.distance).toBeGreaterThan(1);
  expect(sample.animation.enabled,'三兽编队的焰绒必须启用逐帧动画').toBe(true);
  expect(sample.animation).toMatchObject({moving:true,facing:'right',asset:'yanrong-walk'});
  expect(new Set(sample.frames).size).toBe(4);
  await page.evaluate(()=>(window as any).drive(0,0,90));
  expect(await page.evaluate(()=>(window as any).game.partyView.inspect().members[0].animation)).toMatchObject({moving:false,facing:'right',clip:'idle-right'});
  await page.screenshot({path:'artifacts/legacy-yanrong-animation-fixed.png'});
});
