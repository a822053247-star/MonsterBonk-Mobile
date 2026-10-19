import{test,expect,type Page}from'@playwright/test';
test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
test.beforeEach(async({page})=>{await page.route('**/enemy-motion-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
import '/src/style.css';import{createUI}from'/src/ui.ts';import{Game}from'/src/game.ts';import * as THREE from '/node_modules/three/build/three.module.js';createUI(document.getElementById('app'));const g=window.game=new Game();
window.draw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
window.arrange=(one=false)=>{g.sleep();g.run=undefined;g.combat.reset();g.combat.automaticSpawning=false;for(const a of g.combat.runBuild.attacks)a.cooldown=1e9;g.combat.hp=1e9;g.combat.spawnClock=1e9;g.party.leader.attackCooldown=1e9;const rows=one?[['normal',-3,3]]:[['normal',-5,3],['fast',5,3],['normal',-2,6],['fast',2,6],['tank',0,-6]];for(const[k,x,z]of rows)g.combat.spawn(k,x,z,0);g.welcome.style.display='none';window.draw()};
window.run=(ticks)=>{g.sleep();for(let i=0;i<ticks;i++)g.step(1/60);window.draw()};
window.gpu=()=>{const visible=g.scene.children.map(o=>[o,o.visible]),bg=g.scene.background,group=g.combatView.group,children=group.children.map(o=>[o,o.visible]);for(const[o]of visible)o.visible=o===group;for(const[o]of children)o.visible=o===g.combatView.pixelEnemies.group;g.scene.background=new THREE.Color('#173b2e');g.renderer.render(g.scene,g.camera);const gl=g.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let count=0,light=0,hash=2166136261;for(let i=0;i<p.length;i+=4){if(p[i]!==p[0]||p[i+1]!==p[1]||p[i+2]!==p[2]){count++;light+=p[i]+p[i+1]+p[i+2];}for(let k=0;k<3;k++)hash=Math.imul(hash^p[i+k],16777619)>>>0;}for(const[o,v]of visible)o.visible=v;for(const[o,v]of children)o.visible=v;g.scene.background=bg;g.renderer.render(g.scene,g.camera);return{count,light:light/Math.max(1,count),hash}};
window.motion=()=>{const e=g.combat.enemies.find(e=>e.active),v=g.combatView.pixelEnemies,b=v.batches.get(e.kind),m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();b.mesh.getMatrixAt(0,m);m.decompose(p,q,s);const forward=new THREE.Vector3(0,0,1).applyQuaternion(q),cameraForward=new THREE.Vector3(0,0,1).applyQuaternion(g.camera.quaternion);return{position:p.toArray(),scale:s.toArray(),quaternion:q.toArray(),normalDot:forward.dot(cameraForward)}};
</script></body></html>`}));});
async function open(page:Page){await page.goto('/enemy-motion-harness?world=fixed');await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.pixelEnemies.inspect().batches.filter((b:any)=>b.loaded).length)).toBe(3);}
test('PNG walk visibly changes at a fixed collision anchor and always faces the camera',async({page})=>{
 await open(page);await page.evaluate(()=>(window as any).arrange(true));const samples=await page.evaluate(()=>{const w=window as any,g=w.game,e=g.combat.enemies.find((e:any)=>e.active),result=[];e.walkAmount=1;for(const phase of[0,.7,1.6,2.5]){e.walkPhase=phase;e.facing=phase;const before=[e.x,e.z,e.hp];w.draw();result.push({gpu:w.gpu(),motion:w.motion(),same:JSON.stringify(before)===JSON.stringify([e.x,e.z,e.hp])});}return result;});
 expect(new Set(samples.map((s:any)=>s.gpu.hash)).size).toBe(4);for(const s of samples){expect(s.same).toBe(true);expect(s.motion.normalDot).toBeCloseTo(1,5);expect(s.motion.position[1]).toBeLessThan(.06);}expect(samples[0].motion.quaternion).not.toEqual(samples[1].motion.quaternion);expect(samples[0].motion.scale).not.toEqual(samples[1].motion.scale);
});
test('real hit flash brightens PNG and death shrinks/dissolves it before releasing the instance',async({page})=>{
 await open(page);await page.evaluate(()=>(window as any).arrange(true));const base=await page.evaluate(()=>(window as any).gpu());
 await page.evaluate(()=>{const w=window as any,g=w.game,e=g.combat.enemies.find((e:any)=>e.active);g.combat.damageEnemy(e,1,0,0);w.draw()});const hurt=await page.evaluate(()=>(window as any).gpu());expect(hurt.light).toBeGreaterThan(base.light+30);await page.screenshot({path:'artifacts/enemy-motion-hit.png'});
 await page.evaluate(()=>{const w=window as any,g=w.game,e=g.combat.enemies.find((e:any)=>e.active);g.combat.damageEnemy(e,1000,0,0);w.draw()});const dead=await page.evaluate(()=>(window as any).gpu());expect(dead.count).toBeGreaterThan(0);
 await page.evaluate(()=>(window as any).run(15));const fading=await page.evaluate(()=>(window as any).gpu());expect(fading.count).toBeGreaterThan(0);expect(fading.count).toBeLessThan(dead.count*.65);await page.screenshot({path:'artifacts/enemy-motion-death.png'});
 await page.evaluate(()=>(window as any).run(25));expect((await page.evaluate(()=>(window as any).gpu())).count).toBe(0);expect(await page.evaluate(()=>(window as any).game.combat.enemies.some((e:any)=>e.active))).toBe(false);
});
test('real pursuit on both phone layouts freezes on pause and reuses cached batches after restart',async({page})=>{
 await open(page);await page.evaluate(()=>(window as any).arrange());const start=await page.evaluate(()=>(window as any).game.combat.enemies.filter((e:any)=>e.active).map((e:any)=>Math.hypot(e.x,e.z)));
 await page.evaluate(()=>(window as any).run(45));const end=await page.evaluate(()=>(window as any).game.combat.enemies.filter((e:any)=>e.active).map((e:any)=>Math.hypot(e.x,e.z)));for(let i=0;i<start.length;i++)expect(end[i]).toBeLessThan(start[i]);
 for(const viewport of[{width:844,height:390},{width:568,height:320}]){await page.setViewportSize(viewport);await page.evaluate(()=>(window as any).draw());await page.screenshot({path:'artifacts/enemy-motion-pursuit-'+viewport.width+'.png'});}
 await page.locator('#pause').tap();const frozen=await page.evaluate(()=>JSON.stringify((window as any).game.combat.enemies));await page.waitForTimeout(180);expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.enemies))).toBe(frozen);
 const cache=await page.evaluate(()=>(window as any).game.combatView.pixelEnemies.inspect().cache);await page.locator('#restart').tap();expect(await page.evaluate(()=>(window as any).game.combatView.pixelEnemies.inspect().cache)).toEqual(cache);
 expect(await page.evaluate(()=>{const g=(window as any).game;g.dispose();return g.combatView.pixelEnemies})).toBeUndefined();
});

for(const kind of ['normal','fast','tank']as const)test(kind+' shows eight distinct GPU headings with independent mirrored UVs and holds direction at rest',async({page})=>{
 await open(page);
 const samples=await page.evaluate(kind=>{const w=window as any,g=w.game;g.sleep();g.mode='paused';g.combat.reset();const e=g.combat.spawn(kind,-3,3,0),samples=[];
  for(const [dx,dy]of [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]){
   e.previousX=e.x-dx*.02;e.previousZ=e.z-dy*.02/Math.SQRT1_2;e.walkX=e.x-e.previousX;e.walkZ=e.z-e.previousZ;w.draw();samples.push({pixels:w.gpu(),frame:g.combatView.pixelEnemies.inspect().batches.find((b:any)=>b.kind===kind).frames[0]});
  }
  e.previousX=e.x;e.previousZ=e.z;e.walkX=e.walkZ=0;w.draw();return {samples,rest:g.combatView.pixelEnemies.inspect().batches.find((b:any)=>b.kind===kind).frames[0]};
 },kind);
 expect(new Set(samples.samples.map(s=>s.pixels.hash)).size).toBe(8);
 expect(samples.samples.map(s=>s.frame)).toEqual([4,3,2,1,0,1,2,3].map((frame,i)=>({frame,mirror:i>=5})));
 expect(samples.rest).toEqual({frame:3,mirror:true});
});

test('actual pursuit faces its displacement; death retains its heading and finished corpses release direction state',async({page})=>{
 await open(page);
 const result=await page.evaluate(()=>{const w=window as any,g=w.game,c=g.combat;g.sleep();c.reset();c.obstacles=[];c.useNavigation=false;c.spawnClock=1e9;g.party.leader.attackCooldown=1e9;
  const enemies=[c.spawn('normal',6,4,0),c.spawn('fast',-6,4,0),c.spawn('tank',0,-6,0)];c.update(1/60,{x:0,z:0});w.draw();const alive=g.combatView.pixelEnemies.inspect();
  enemies.forEach((e:any)=>c.damageEnemy(e,1e5,0,0));w.draw();const dead=g.combatView.pixelEnemies.inspect();c.update(.6,{x:0,z:0});w.draw();return {alive,dead,cleared:g.combatView.pixelEnemies.inspect().directionStates};
 });
 expect(result.alive.batches.map((b:any)=>b.frames[0])).toEqual([{frame:3,mirror:true},{frame:3,mirror:false},{frame:0,mirror:false}]);
 expect(result.dead.batches.map((b:any)=>b.frames)).toEqual(result.alive.batches.map((b:any)=>b.frames));expect(result.cleared).toBe(0);
});

for(const viewport of [{width:844,height:390},{width:568,height:320}])test('three species render every direction at '+viewport.width+' without per-enemy textures',async({page})=>{
 await page.setViewportSize(viewport);await open(page);await page.evaluate(()=>{const w=window as any,g=w.game;g.sleep();g.mode='paused';g.combat.reset();g.welcome.style.display='none';
  const vectors=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  for(const [row,kind]of ['normal','fast','tank'].entries())for(const [col,[dx,dy]]of vectors.entries()){
   const e=g.combat.spawn(kind,(col-3.5)*2.4,(row-1)*4,0);e.previousX=e.x-dx*.02;e.previousZ=e.z-dy*.02/Math.SQRT1_2;e.walkX=e.x-e.previousX;e.walkZ=e.z-e.previousZ;
  }w.draw();
 });
 const state=await page.evaluate(()=>(window as any).game.combatView.pixelEnemies.inspect());
 expect(state.cache).toEqual({textures:3,references:3});expect(state.batches.map((b:any)=>b.count)).toEqual([8,8,8]);expect(state.batches.every((b:any)=>b.directional&&b.nearest&&!b.mipmaps)).toBe(true);
 // Keep presenting this frozen GPU scene during screenshot composition in WebKit.
 await page.evaluate(()=>{const w=window as any;const draw=()=>{w.draw();w.captureFrame=requestAnimationFrame(draw)};draw()});
 await page.screenshot({path:'artifacts/enemy-directions-eight-'+viewport.width+'.png'});
 await page.evaluate(()=>cancelAnimationFrame((window as any).captureFrame));
});

test('a missing direction atlas falls back only that species to its original static PNG',async({page})=>{
 await page.route('**/enemies/direction/runner-bug-directions/runtime.normalized.png',r=>r.abort());await open(page);
 const batches=await page.evaluate(()=>(window as any).game.combatView.pixelEnemies.inspect().batches);
 expect(batches.map((b:any)=>b.directional)).toEqual([true,false,true]);expect(batches[1]).toMatchObject({loaded:true,failed:false,directionFailed:true});
 await page.evaluate(()=>(window as any).arrange());expect(await page.evaluate(()=>(window as any).game.combatView.pixelEnemies.inspect().batches.map((b:any)=>b.count))).toEqual([2,2,1]);
});
