import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {openTimeline} from './vfx-timeline-harness';

const directory='artifacts/vfx-lifecycle';
mkdirSync(directory,{recursive:true});
type Frame={label:string;image?:string;state:any;pixels:any};
async function capture(page:Page,prefix:string,label:string,save:boolean):Promise<Frame>{
  const state=await page.evaluate(()=>(window as any).sample());
  const pixels=await page.evaluate(()=>(window as any).vfxPixels());
  const image=save?`${prefix}-${label}.png`:undefined;
  if(image)await page.screenshot({path:`${directory}/${image}`});
  return {label,image,state,pixels};
}

for(const [width,battery] of [[844,false],[568,true]] as const){
  test(`continuous collision and reaction lifecycles at ${width} ${battery?'battery':'high'}`,async({page,browserName})=>{
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text())});
    await openTimeline(page,width,battery);
    const manifest:any={browser:browserName,width,height:width===568?320:390,quality:battery?'battery':'high',scenarios:{}};
    for(const kind of ['spark','bubble','burst','steam']){
      await page.evaluate(kind=>(window as any).setup(kind),kind);
      const frames:Frame[]=[],prefix=`${browserName}-${width}-${manifest.quality}-${kind}`,save=browserName==='chromium';
      if(kind==='steam'){
        await page.evaluate(()=>{const w=window as any;w.cast('bubble');w.untilHit()});
        const wet=await capture(page,prefix,'01-wet',save);frames.push(wet);
        expect(wet.state.wet).toBeGreaterThan(0);expect(wet.state.steamBursts).toBe(0);expect(wet.state.boiling).toBe(true);
        await page.evaluate(()=>(window as any).advance(.1));
      }
      await page.evaluate(attack=>(window as any).cast(attack),kind==='bubble'?'bubble':'spark');
      frames.push(await capture(page,prefix,kind==='steam'?'02-fire-cast':'01-launch',save));
      if(kind!=='steam'){
        await page.evaluate(()=>(window as any).advance(.05));
        frames.push(await capture(page,prefix,'02-emerge',save));
      }
      await page.evaluate(()=>(window as any).advance(.10));
      const flight=await capture(page,prefix,kind==='steam'?'03-fire-flight':'02-flight-trail',save);frames.push(flight);
      expect(flight.state.shots.length).toBeGreaterThan(0);expect(flight.state.feedback.trails).toBeGreaterThan(0);
      expect(flight.pixels.changed).toBeGreaterThan(10);
      const hit=await page.evaluate(()=>(window as any).untilHit());
      expect(hit.hp).toBeLessThan(kind==='steam'?9985:10000);
      if(kind==='steam')expect(hit.steamBursts).toBe(1);
      frames.push(await capture(page,prefix,kind==='steam'?'04-trigger':'03-impact',save));
      for(const [index,age] of (kind==='steam'?[.025,.12,.28,.46,.535,.57]:kind==='burst'?[.04,.12,.28,.39,.47]:[.04,.10,.17,.34]).entries()){
        const current=await page.evaluate(()=>(window as any).sample().event.age);
        await page.evaluate(dt=>(window as any).advance(dt),Math.max(0,age-current));
        const frame=await capture(page,prefix,`${String(index+(kind==='steam'?5:4)).padStart(2,'0')}-age-${age.toFixed(3)}`,save);frames.push(frame);
      }
      const last=frames[frames.length-1];expect(last.state.event.active).toBe(false);
      expect(last.state.feedback.count).toBe(0);expect(last.state.reactions.count).toBe(kind==='bubble'?1:0);
      if(kind==='steam'){
        const middle=frames.find(f=>f.label.endsWith('0.280'))!,late=frames.find(f=>f.label.endsWith('0.535'))!;
        expect(middle.state.event.radius).toBe(2.5);expect(middle.pixels.changed).toBeGreaterThan(20);
        expect(late.state.event.active).toBe(true);expect(late.state.reactions.alpha.reduce((a:number,b:number)=>a+b,0)).toBeLessThan(middle.state.reactions.alpha.reduce((a:number,b:number)=>a+b,0));
      }
      manifest.scenarios[kind]=frames;
    }
    writeFileSync(`${directory}/${browserName}-${width}-${manifest.quality}.json`,JSON.stringify(manifest,null,2));
    expect(errors).toEqual([]);
  });
}

test('actual elite and Boss warnings remain legible under overlapping explosions and steam on both phone sizes',async({page,browserName})=>{
  test.setTimeout(150000);await openTimeline(page);
  const evidence:any[]=[];
  for(const [width,battery] of [[844,false],[568,true]] as const){
    await page.setViewportSize({width,height:width===568?320:390});
    await page.evaluate(battery=>{const g=(window as any).game;g.quality.setMode(battery?'battery':'high');g.applyGraphics()},battery);
    for(const effect of ['burst','steam'])for(const kind of ['elite','lane','cone']){
      await page.evaluate(effect=>{const w=window as any;w.setup(effect);if(effect==='steam'){w.cast('bubble');w.untilHit();}w.cast('spark');w.untilHit();w.advance(effect==='steam'?.18:.12)},effect);
      await page.evaluate(kind=>(window as any).warning(kind),kind);
      if(kind!=='elite')await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().encounters.boss?.atlases.filter((a:any)=>a.loaded).length)).toBe(8);
      await page.evaluate(()=>(window as any).draw());
      const pixels=await page.evaluate(kind=>(window as any).warningPixels(kind),kind);
      expect(pixels.baseline).toBeGreaterThan(30);expect(pixels.ratio).toBeGreaterThan(.8);
      const image=`${browserName}-${width}-warning-${effect}-${kind}.png`;
      if(browserName==='chromium')await page.screenshot({path:`${directory}/${image}`});
      evidence.push({width,battery,effect,kind,pixels,image:browserName==='chromium'?image:undefined,state:await page.evaluate(()=>(window as any).sample())});
    }
  }
  writeFileSync(`${directory}/${browserName}-warnings.json`,JSON.stringify(evidence,null,2));
});

test('test-only preset changes atlas animation and geometry; bad presets retain identical pixels and bounded resources',async({page,browserName})=>{
  test.setTimeout(90000);await openTimeline(page);
  await page.evaluate(()=>(window as any).setup('spark'));
  const applied=await page.evaluate(()=>{
    const w=window as any,v=w.game.combatView,r=v.vfx;
    w.cast('spark');w.advance(.05); // Warm the existing batches before measuring a configuration change.
    const before={...w.game.renderer.info.memory},mesh=v.firePixels.mesh;
    const result=r.tryBind({type:'projectile',attack:'spark'},{...r.projectile('spark'),id:'timeline-test-comet',color:'#73e6ff',scale:1.8,
      animation:{atlas:'fire',row:1,frames:[0,2,3],fps:12},trail:{color:'#e5a0ff',length:1.2,opacity:.8},low:{animated:false,trail:true}});
    w.draw();return {result,before,sameMesh:mesh===v.firePixels.mesh};
  });
  expect(applied.result.ok).toBe(true);expect(applied.sameMesh).toBe(true);
  const frames:Frame[]=[];
  for(const [i,dt] of [0,.05,.10].entries()){
    await page.evaluate(dt=>(window as any).advance(dt),dt);
    frames.push(await capture(page,`${browserName}-custom`,`${i+1}-animation`,browserName==='chromium'));
  }
  expect(new Set(frames.map(f=>f.state.fire.frames[0])).size).toBeGreaterThan(1);
  const validation=await page.evaluate(()=>{
    const w=window as any,g=w.game,v=g.combatView,r=v.vfx,preset=r.projectile('spark'),a=w.pixels();
    const invalid=[{...preset,id:'bad-timeline',scale:NaN},{...preset,id:'bad-timeline-atlas',animation:{atlas:'fire',row:99,frames:[0],fps:12}},
      {...r.area('steam'),id:'bad-timeline-type'}].map(p=>r.tryBind({type:'projectile',attack:'spark'},p));
    w.draw();const b=w.pixels();let changed=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])changed++;
    v.firePixels.mesh.getColorAt(0,v.color);
    return {invalid,changed,samePreset:r.projectile('spark')===preset,color:v.color.getHexString(),
      scale:Math.hypot(...v.firePixels.mesh.instanceMatrix.array.slice(0,3)),memory:{...g.renderer.info.memory},
      officialCard:!!g.combat.progression.skills.find((s:any)=>s.id==='timeline-test-comet')};
  });
  expect(validation.invalid.every((v:any)=>!v.ok&&v.error)).toBe(true);expect(validation.changed).toBe(0);expect(validation.samePreset).toBe(true);
  expect(validation.color).toBe('73e6ff');expect(validation.scale).toBeCloseTo(.65*1.8);expect(validation.officialCard).toBe(false);expect(validation.memory).toEqual(applied.before);
  const stress=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat,v=g.combatView;w.setup('spark');
    let accepted=0;while(accepted<100){try{w.cast('spark');accepted++;}catch{break;}}
    w.advance(.1);const high=w.sample();g.quality.setMode('battery');g.applyGraphics();w.draw();const low=w.sample();
    const memory={...g.renderer.info.memory};for(let i=0;i<80;i++)w.draw();
    return {accepted,high,low,memory,after:{...g.renderer.info.memory},overflow:v.batches.some((m:any)=>m.count>m.instanceMatrix.count)};
  });
  expect(stress.accepted).toBe(24);expect(stress.high.fire.count).toBeLessThanOrEqual(stress.high.fire.capacity);
  expect(stress.high.feedback.count).toBeLessThanOrEqual(48);expect(stress.low.feedback.trails).toBeLessThanOrEqual(12);
  expect(stress.low.fallback.bolts).toBe(24);expect(stress.overflow).toBe(false);expect(stress.after).toEqual(stress.memory);
  writeFileSync(`${directory}/${browserName}-custom.json`,JSON.stringify({applied,frames,validation,stress},null,2));
});

test('steam requires real wet hits and boiling core; failed assets still allow damage, pause, resume and clean restart',async({page,browserName})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await openTimeline(page,568,true,true);
  const controls=await page.evaluate(()=>{
    const w=window as any,out=[];
    for(const kind of ['bubble','steam']){
      w.setup(kind);if(kind==='bubble'){w.cast('bubble');w.untilHit();}w.cast('spark');w.untilHit();out.push(w.sample());
    }
    w.setup('steam');w.cast('bubble');w.untilHit();const wet=w.sample();w.cast('spark');w.untilHit();w.advance(.15);
    return {out,wet,active:w.sample()};
  });
  expect(controls.out.map((c:any)=>c.steamBursts)).toEqual([0,0]);expect(controls.wet.wet).toBeGreaterThan(0);expect(controls.wet.boiling).toBe(true);
  expect(controls.active.steamBursts).toBe(1);expect(controls.active.reactions.failed).toBe(true);expect(controls.active.reactions.outlines).toBe(1);
  expect(controls.active.hp).toBeLessThan(controls.wet.hp);expect(controls.active.combatTime).toBeGreaterThan(controls.wet.combatTime);
  if(browserName==='chromium')await page.screenshot({path:`${directory}/chromium-failed-assets-steam.png`});
  await page.locator('#pause').click();const frozen=await page.evaluate(()=>JSON.stringify((window as any).sample()));
  await page.evaluate(()=>{const w=window as any;w.game.step(.7);w.draw()});expect(await page.evaluate(()=>JSON.stringify((window as any).sample()))).toBe(frozen);
  await page.locator('#resume').click();await page.evaluate(()=>(window as any).advance(.7));
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().reactions.outlines)).toBe(0);
  await page.evaluate(()=>{const w=window as any,g=w.game;g.start('classic',true,false,'fusion');g.sleep();w.draw()});
  const restarted=await page.evaluate(()=>{const w=window as any,v=w.game.combatView;return {feedback:v.inspect().feedback.count,fire:v.inspectFusion().count,mist:v.inspect().reactions.count,rings:v.inspect().reactions.outlines,trails:v.boltTrails.count,bolts:v.bolts.count}});
  expect(restarted).toEqual({feedback:0,fire:0,mist:0,rings:0,trails:0,bolts:0});expect(errors).toEqual([]);
  writeFileSync(`${directory}/${browserName}-failed-assets.json`,JSON.stringify({controls,restarted},null,2));
});
