import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';

const state=(page:Page)=>page.evaluate(()=>(window as unknown as {game:Game}).game?.inspect());
test.use({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{
  await page.route('**/fox-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
    window.gaitProbe=()=>{
      const g=window.game;g.sleep();const m=g.monster.modelView,mesh=m.asset.getObjectByName('Yanrong'),s=mesh.skeleton,p=mesh.geometry.attributes.position,w=mesh.geometry.attributes.skinWeight,j=mesh.geometry.attributes.skinIndex;
      m.walk.setEffectiveWeight(1);let min=Infinity,max=-Infinity,maxWeightError=0;
      const legs=['FrontRight','FrontLeft','RearRight','RearLeft'].map(name=>({name,bone:s.bones.findIndex(b=>b.name===name+'Paw'),indices:[],minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity}));
      for(let i=0;i<p.count;i++){let sum=0;for(let k=0;k<4;k++){const weight=w.getComponent(i,k);sum+=weight;const leg=legs.find(l=>l.bone===j.getComponent(i,k));if(leg&&weight>.95&&p.getY(i)<.035)leg.indices.push(i)}maxWeightError=Math.max(maxWeightError,Math.abs(1-sum))}
      const point=mesh.position.clone();let first,last;
      for(let frame=0;frame<=72;frame++){
        m.mixer.setTime(frame/100);m.asset.updateWorldMatrix(true,true);
        for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,point);min=Math.min(min,point.y);max=Math.max(max,point.y)}
        for(const leg of legs){let y=0,z=0;for(const i of leg.indices){mesh.getVertexPosition(i,point);y+=point.y;z+=point.z}y/=leg.indices.length;z/=leg.indices.length;leg.minY=Math.min(leg.minY,y);leg.maxY=Math.max(leg.maxY,y);leg.minZ=Math.min(leg.minZ,z);leg.maxZ=Math.max(leg.maxZ,z)}
        mesh.getVertexPosition(legs[0].indices[0],point);if(frame===0)first=point.toArray();if(frame===72)last=point.toArray();
      }
      m.reset();return {min,max,maxWeightError,bones:s.bones.length,triangles:mesh.geometry.index.count/3,legs:legs.map(l=>({name:l.name,vertices:l.indices.length,lift:l.maxY-l.minY,stride:l.maxZ-l.minZ})),first,last};
    };
    window.simulateVisual=(visual)=>{const g=window.game;g.monster.setVisual(visual);g.start('horn-trial');g.sleep();g.combat.random=()=>.4;g.combat.spawn('normal',0,4,0);g.input.keys.add('KeyD');for(let i=0;i<90;i++){g.step(1/60);g.monster.animate(1/60,1,false,i/60)}const s=g.inspect();return {position:s.position,combat:s.combat,cooldown:s.cooldown,elapsed:s.elapsed}};
  </script></body></html>`}));
});
async function open(page:Page){await page.goto('/fox-harness');await page.waitForFunction(()=>'game' in window);await expect.poll(async()=>(await state(page))?.creature.model?.loaded).toBe(true);}

test('all four repaired paws stride and lift, weights normalize, soles stay grounded and the loop closes',async({page})=>{
  await open(page);
  const probe=await page.evaluate(()=>(window as unknown as {gaitProbe:()=>{min:number;max:number;maxWeightError:number;bones:number;triangles:number;legs:{name:string;vertices:number;lift:number;stride:number}[];first:number[];last:number[]}}).gaitProbe());
  expect(probe.bones).toBe(14);expect(probe.triangles).toBe(9948);expect(probe.maxWeightError).toBeLessThan(1e-6);
  expect(probe.min).toBeGreaterThan(-.003);expect(probe.max).toBeLessThan(.9);
  for(const leg of probe.legs){expect(leg.vertices,leg.name).toBeGreaterThan(20);expect(leg.stride,leg.name).toBeGreaterThan(.07);expect(leg.lift,leg.name).toBeGreaterThan(.02);}
  probe.first.forEach((n,i)=>expect(probe.last[i]).toBeCloseTo(n,5));
});

test('real game model has phone size, movement blending, pause and restart without resource growth',async({page},info)=>{
  await open(page);await page.locator('#start-trial').tap();
  expect((await state(page)).creature.visual).toBe('gltf');expect((await state(page)).creature.model?.height).toBeGreaterThan(2.6);
  await page.keyboard.down('d');await expect.poll(async()=>(await state(page)).creature.model?.blend).toBeGreaterThan(.8);
  await page.keyboard.up('d');await expect.poll(async()=>(await state(page)).creature.model?.blend).toBeLessThan(.05);
  await page.locator('#pause').tap();const frozen=await state(page);await page.waitForTimeout(200);expect(await state(page)).toEqual(frozen);
  for(let i=0;i<3;i++){await page.locator('#restart').tap();await page.locator('#pause').tap();}
  const after=await state(page);expect(after.geometries).toBe(frozen.geometries);expect(after.textures).toBe(frozen.textures);
  await page.locator('#resume').tap();
  for(const size of [{width:844,height:390},{width:568,height:320}]){
    await page.setViewportSize(size);expect((await state(page)).creature.visual).toBe('gltf');
    if(info.project.name==='chromium')await page.screenshot({path:'artifacts/fox-game-'+size.width+'.png'});
  }
});

test('GLB and procedural views give identical gameplay; missing model falls back to sprite',async({page})=>{
  await open(page);
  const outcomes=await page.evaluate(()=>{const w=window as unknown as {simulateVisual:(v:string)=>unknown};return [w.simulateVisual('gltf'),w.simulateVisual('procedural')]});
  expect(outcomes[0]).toEqual(outcomes[1]);
  await page.route('**/yanrong-repaired.glb',route=>route.abort());await page.goto('/fox-harness');
  await page.waitForFunction(()=>'game' in window);
  await expect.poll(async()=>(await state(page))?.creature.model?.failed).toBe(true);
  await expect.poll(async()=>(await state(page))?.creature.visual).toBe('sprite');
  await page.locator('#start').tap();await expect.poll(async()=>(await state(page)).elapsed).toBeGreaterThan(.1);
});
