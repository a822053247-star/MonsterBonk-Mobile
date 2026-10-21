import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, missing = false) {
  await page.setViewportSize({width:844,height:390});
  if (missing) {
    await page.route('**/yanrong/fire-effects-sheet.normalized.png', r=>r.abort());
    await page.route('**/particles/kenney-feedback.png', r=>r.abort());
    await page.route('**/smoke_08.png', r=>r.abort());
    await page.route('**/fusions/effects.normalized.png', r=>r.abort());
  }
  await page.route('**/vfx-game-harness*', r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); const g=window.game=new Game();
    window.draw=()=>{g.sleep();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.snapshot=()=>JSON.stringify({effects:g.combat.effects,projectiles:g.combat.projectiles,enemies:g.combat.enemies,rng:g.combat.random,kills:g.combat.kills,hp:g.combat.hp});
    window.arrange=kind=>{
      g.sleep();const c=g.combat;c.reset();c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;c.invulnerability=1000;
      c.grantUpgrade('bubble-weapon');c.grantUpgrade('draft-boiling-core');
      for(const a of c.runBuild.attacks)a.cooldown=10000;
      g.position.set(0,0,0);g.party.syncLeader(g.position,0);
      const target=c.spawn(kind==='steam'?'normal':'tank',5,-2,0);target.hp=10000;
      const fire=(attack,x,z)=>c.fireBolts({x,z},target,18,1,10,0,attack==='bubble'?'bubblesalamander':'yanrong',attack);
      if(kind==='steam') {fire('bubble',4.2,-2);c.update(.04,g.position);fire('spark',4.2,-2);c.update(.04,g.position);c.update(.22,g.position);}
      else {fire(kind,-4,-2);c.update(.08,g.position);fire(kind,4.2,-2);c.update(.04,g.position);c.update(.02,g.position);}
      const warning=c.spawn('fast',-2.8,2.5,.8);
      document.getElementById('welcome').hidden=true;window.draw();
      return {steam:c.relicTelemetry.steamBursts,water:c.effects.some(e=>e.active&&e.kind==='water'),hit:c.effects.some(e=>e.active&&e.kind==='hit'),warning:warning.spawnTime};
    };
  </script></body></html>`}));
  await page.goto('/vfx-game-harness?world=fixed'); await page.locator('#start-fusion').click();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.wake=()=>{}});
  await expect.poll(()=>page.evaluate(missing=>{
    const g=(window as any).game,v=g.combatView;
    return missing?v.inspectFusion()?.failed&&v.inspect().feedback?.failed&&v.inspect().reactions?.failed
      :v.inspectFusion()?.loaded&&v.inspect().feedback?.loaded&&v.inspect().reactions?.loaded;
  },missing)).toBe(true);
}

test('real spark, bubble and wet-fire steam render through presets and keep lifecycle/budgets', async ({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text())});
  await open(page);
  for (const kind of ['spark','bubble','steam']) {
    const event=await page.evaluate(kind=>(window as any).arrange(kind),kind);
    expect(event.warning).toBeGreaterThan(0);
    if(kind==='steam')expect(event.steam).toBe(1);else expect(event[kind==='bubble'?'water':'hit']).toBe(true);
    const result=await page.evaluate(()=>{
      const w=window as any,g=w.game,v=g.combatView,before=w.snapshot();w.draw();
      const memory={...g.renderer.info.memory},high=v.inspect();v.detail=2;w.draw();const low=v.inspect();
      for(let i=0;i<80;i++)w.draw();v.detail=4;w.draw();
      return {same:before===w.snapshot(),high,low,memory,after:{...g.renderer.info.memory},warning:v.warnings.count};
    });
    expect(result.same).toBe(true);expect(result.after).toEqual(result.memory);expect(result.warning).toBeGreaterThan(0);
    expect(result.high.feedback.count).toBeLessThanOrEqual(48);expect(result.low.feedback.count).toBeLessThanOrEqual(48);
    if(kind==='steam')expect(result.high.reactions.count).toBeGreaterThan(0);
    else expect(result.high.feedback.trails).toBeGreaterThan(0);
    const pixels=await page.evaluate(kind=>{
      const w=window as any,g=w.game,v=g.combatView,r=g.renderer,gl=r.getContext();
      const size=gl.drawingBufferWidth*gl.drawingBufferHeight*4,a=new Uint8Array(size),b=new Uint8Array(size);
      const mesh=kind==='steam'?v.reactions.group:v.feedback.mesh;
      r.render(g.scene,g.camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);
      mesh.visible=false;r.render(g.scene,g.camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);
      mesh.visible=true;w.draw();let changed=0;for(let i=0;i<size;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
      return changed;
    },kind);
    expect(pixels).toBeGreaterThan(10);
    if(browserName==='chromium')await page.screenshot({path:'artifacts/vfx-'+kind+'-combat.png'});
  }
  await page.locator('#pause').click();
  const before=await page.evaluate(()=>(window as any).snapshot());
  await page.evaluate(()=>{const w=window as any;w.game.step(.2);w.draw()});
  expect(await page.evaluate(()=>(window as any).snapshot())).toBe(before);
  await page.locator('#resume').click();
  await page.evaluate(()=>{const w=window as any,g=w.game;g.step(.7);w.draw()});
  expect(await page.evaluate(()=>(window as any).game.combat.effects.some((e:any)=>e.active&&e.kind==='steam'))).toBe(false);
  const reset=await page.evaluate(()=>{
    const w=window as any,g=w.game;g.start('classic',true,false,'fusion');g.sleep();w.draw();
    const fresh={feedback:g.combatView.inspect().feedback.count,mist:g.combatView.inspect().reactions.count,rings:g.combatView.inspect().reactions.outlines};
    g.start('classic',true,false,'legacy-party');w.arrange('spark');
    return {fresh,legacy:g.combatView.inspect().feedback.count};
  });
  expect(reset).toEqual({fresh:{feedback:0,mist:0,rings:0},legacy:0});expect(errors).toEqual([]);
});

test('custom content changes actual render buffers; unavailable textures and low quality retain fallback',async({page})=>{
  await open(page,true);
  await page.evaluate(()=>(window as any).arrange('bubble'));
  const custom=await page.evaluate(()=>{
    const w=window as any,g=w.game,v=g.combatView,r=v.vfx;
    r.register({...r.projectile('bubble'),id:'custom-ice',color:'#bbddff',scale:1.4,trail:{color:'#ffffff',length:1.2,opacity:.2}});
    r.bindProjectile('bubble','custom-ice');
    r.register({...r.impact('water'),id:'custom-ring',ring:true,color:'#ffffff',radiusScale:1.4});r.bindImpact('water','custom-ring');
    const before=w.snapshot();w.draw();
    const alpha=v.trailAlpha.getX(0),rings=v.inspect().reactions.outlines;
    const trail=v.boltTrails.count,sparks=v.sparks.count,bolts=v.bolts.count;
    for(const detail of [2,4,2,4]){v.detail=detail;w.draw();}
    return {same:before===w.snapshot(),alpha,rings,trail,sparks,bolts};
  });
  expect(custom.same).toBe(true);expect(custom.alpha).toBeCloseTo(.2);expect(custom.rings).toBeGreaterThan(0);
  expect(custom.trail).toBeGreaterThan(0);expect(custom.sparks).toBeGreaterThan(0);expect(custom.bolts).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).arrange('steam'));
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().reactions.outlines)).toBeGreaterThan(0);
});

test('registered atlas, size, tint and area presets work through actual quality settings',async({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.evaluate(()=>(window as any).arrange('spark'));
  const shot=await page.evaluate(()=>{
    const w=window as any,g=w.game,v=g.combatView,r=v.vfx,before=w.snapshot();
    r.register({...r.projectile('spark'),id:'custom-spark',color:'#66ccff',scale:1.5,
      animation:{atlas:'fire',row:1,frames:[2],fps:1},low:{animated:false,trail:false}});
    r.bindProjectile('spark','custom-spark');w.draw();
    const frame=v.inspectFusion().frames,scale=Math.hypot(...v.firePixels.mesh.instanceMatrix.array.slice(0,3));
    v.firePixels.mesh.getColorAt(0,v.color);const tint=v.color.getHexString();
    const modes=[];
    for(const mode of ['battery','auto','high']){
      g.quality.setMode(mode);g.applyGraphics();w.draw();modes.push({mode,detail:v.detail,fire:v.inspectFusion().count,bolts:v.bolts.count,trail:v.inspect().feedback.trails});
    }
    return {frame,scale,tint,modes,same:before===w.snapshot()};
  });
  expect(shot.same).toBe(true);expect(shot.frame).toEqual([6]);expect(shot.scale).toBeCloseTo(.65*1.5);expect(shot.tint).toBe('66ccff');
  expect(shot.modes[0]).toMatchObject({mode:'battery',detail:2,fire:0,bolts:1,trail:0});
  expect(shot.modes[1].fire).toBe(1);expect(shot.modes[2].fire).toBe(1);
  if(browserName==='chromium')await page.screenshot({path:'artifacts/vfx-custom-combat.png'});
  await page.evaluate(()=>(window as any).arrange('steam'));
  const area=await page.evaluate(()=>{
    const w=window as any,g=w.game,v=g.combatView,r=v.vfx,before=w.snapshot();
    r.register({...r.area('steam'),id:'custom-steam',outline:'ring',color:'#eeeeff',radiusScale:.8,fade:.4,rotationSpeed:2,pulseSpeed:3,low:{mist:false}});
    r.bindArea('steam','custom-steam');w.draw();const high=v.inspect().reactions;
    g.quality.setMode('battery');g.applyGraphics();w.draw();const low=v.inspect().reactions;
    const same=before===w.snapshot();g.combat.update(.7,g.position);w.draw();return {high,low,expired:v.inspect().reactions,same};
  });
  expect(area.same).toBe(true);expect(area.high.outlines).toBe(1);expect(area.high.count).toBeGreaterThan(0);expect(area.low.count).toBe(0);expect(area.low.outlines).toBe(1);
  expect(area.expired.count).toBe(0);expect(area.expired.outlines).toBe(0);expect(errors).toEqual([]);
});
