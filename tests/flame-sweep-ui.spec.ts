import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, fail = false) {
  await page.setViewportSize({width:1280,height:720});
  if(fail) await page.route('**/flame-sweep/flame-sweep.png',r=>r.abort());
  await page.route('**/melee-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
    createUI(document.getElementById('app')); const g=window.game=new Game();
    window.draw=()=>{g.partyView.render(1,g.visualTime);g.placeCamera(true);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera);return g.renderer.domElement.toDataURL()};
    window.arrange=()=>{
      g.sleep();g.combat.clearWave();g.run.prepare(g.combat,g.position);g.position.set(0,0,0);g.input.sample=()=>({x:0,y:0});
      g.combat.runBuild.attacks[0].cooldown=1000;g.combat.runBuild.attacks[1].cooldown=0;
      for(const [x,z] of [[1.5,0],[2,.8],[2,-.8],[2.7,0]]){const e=g.combat.spawn('normal',x,z,0);e.hp=12;e.swarm=true}
      for(const [x,z] of [[2.8,1.7],[2.8,-1.7],[3.7,0]])g.combat.spawn('tank',x,z,0).hp=500;
      document.getElementById('welcome').hidden=true;g.step(1/60);window.visual=g.combatView.flameSweep;window.draw();
      return {kills:g.combat.kills,shots:g.combat.shotsFired,hitIds:[...g.combat.melee.hitIds].filter(Boolean)};
    };
    window.frame=seconds=>{g.combat.melee.age=seconds;const before=JSON.stringify(g.combat.inspect());const pixels=window.draw();return {view:g.combatView.inspect().melee,pixels,unchanged:before===JSON.stringify(g.combat.inspect())}};
  </script></body></html>`}));
  await page.goto('/melee-harness?world=fixed&meleeDev=flame-sweep');
  await page.waitForFunction(()=> 'game' in window); await page.locator('#start-fusion').click();
  await page.evaluate(()=>(window as any).game.sleep());
  await expect.poll(()=>page.evaluate(fail=>{const v=(window as any).game.combatView.inspect().melee;return fail?v?.failed:v?.loaded},fail)).toBe(true);
}

test('selected retimed frames render with a stable low root, no render damage and clean lifecycle',async({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  const attack=await page.evaluate(()=>(window as any).arrange());expect(attack.kills).toBe(4);expect(attack.shots).toBe(0);
  await expect(page.locator('#fusion-title')).toContainText('火焰横扫');
  const roots:number[][]=[], hashes=new Set<string>();
  const config=await page.evaluate(()=>(window as any).game.combatView.inspect().melee.config);
  let elapsed=0;
  for(const entry of config.sequence){
    const result=await page.evaluate(t=>(window as any).frame(t),(elapsed+entry.ms/2)/1000);elapsed+=entry.ms;
    expect(result.unchanged).toBe(true);expect(result.view.frame).toBe(entry.frame);expect(result.view.fallback).toBe(false);
    roots.push(result.view.root);hashes.add(result.pixels);
    if(browserName==='chromium'&&entry.frame===4) {
      await page.screenshot({path:'artifacts/v6-1-b-visual-balanced-game.png'});
      await page.screenshot({path:'artifacts/v6-1-b-visual-balanced-detail.png',clip:{x:540,y:230,width:380,height:250}});
    }
  }
  expect(hashes.size).toBe(config.sequence.length);for(const root of roots)expect(root).toEqual(roots[0]);
  expect(roots[0][1]).toBe(.60);
  const finished=await page.evaluate(t=>{const w=window as any;return {view:w.frame(t).view,combatActive:w.game.combat.melee.active}},config.durationMs/1000+.001);
  expect(finished.view.active).toBe(false);expect(finished.combatActive).toBe(true);
  const moved=await page.evaluate(()=>{const g=(window as any).game;g.position.set(1,0,-.5);g.party.syncLeader(g.position,0);return (window as any).frame(.13).view.root});
  expect(moved).toEqual([roots[0][0]+1,roots[0][1],roots[0][2]-.5]);
  await page.locator('#pause').click();
  const before=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  await page.evaluate(()=>{for(let i=0;i<120;i++)(window as any).game.step(1/60)});
  expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(before);
  await page.locator('#restart').click();await page.evaluate(()=>(window as any).game.sleep());
  expect(await page.evaluate(()=>{const w=window as any;return {same:w.visual===w.game.combatView.flameSweep,active:w.game.combat.melee.active,id:w.game.combat.melee.attackInstanceId,slots:w.game.combat.runBuild.attacks.length}})).toEqual({same:true,active:false,id:0,slots:2});
  await page.locator('#pause').click();await page.locator('#back-menu').click();await page.locator('#start-legacy-party').click();await page.evaluate(()=>(window as any).game.sleep());
  expect(await page.evaluate(()=>({active:(window as any).game.combat.melee.active,cards:(window as any).game.combat.progression.skills.length}))).toEqual({active:false,cards:8});
  expect(errors).toEqual([]);
});

test('three preset peaks compare the same scene without changing combat and stay readable at phone size',async({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.evaluate(()=>(window as any).arrange());
  for(const viewport of [{width:1280,height:720},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    for(const id of ['compact','balanced','punchy']){
      const result=await page.evaluate(id=>{
        const w=window as any,g=w.game;
        g.sleep();const before=JSON.stringify(g.combat.inspect());g.combatView.flameSweep.setPreset(id);
        const same=before===JSON.stringify(g.combat.inspect());const config=g.combatView.inspect().melee.config;
        let start=0;for(const entry of config.sequence){if(entry.frame===4)break;start+=entry.ms}
        const duration=config.sequence.find((e:any)=>e.frame===4).ms;
        const visual=w.frame((start+duration/2)/1000);
        return {same,visual:visual.view,unchanged:visual.unchanged};
      },id);
      expect(result.same).toBe(true);expect(result.unchanged).toBe(true);expect(result.visual.frame).toBe(4);
      expect(result.visual.config.sizeRatio).toBeGreaterThanOrEqual(.65);expect(result.visual.config.sizeRatio).toBeLessThanOrEqual(.75);
      if(browserName==='chromium'){
        await page.screenshot({path:`artifacts/v6-1-b-visual-${id}-${viewport.width}.png`});
        if(viewport.width===1280)await page.screenshot({path:`artifacts/v6-1-b-visual-${id}-compare-detail.png`,clip:{x:540,y:230,width:380,height:250}});
      }
    }
  }
  expect(errors).toEqual([]);
});

test('GPU core attenuation reduces actual scene highlights while keeping the attack intact',async({page})=>{
  await open(page);await page.evaluate(()=>(window as any).arrange());
  const result=await page.evaluate(async()=>{
    const w=window as any,v=w.game.combatView.flameSweep;
    // Hold simulation age constant before comparing render-only mutations.
    w.game.combat.melee.age=.13;
    const before=JSON.stringify(w.game.combat.inspect());
    const softened=w.frame(.13).pixels;
    v.uniforms.sweepBrightness.value=1;v.uniforms.sweepCoreGain.value=1;
    const bright=w.frame(.13).pixels;
    v.setPreset('balanced');
    const decode=async(url:string)=>{
      const img=new Image();img.src=url;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;
    };
    const a=await decode(softened),b=await decode(bright);let changed=0,energyA=0,energyB=0,neutralA=0,neutralB=0;
    for(let i=0;i<a.length;i+=4){
      if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
      energyA+=a[i]+a[i+1]+a[i+2];energyB+=b[i]+b[i+1]+b[i+2];
      neutralA+=Math.min(a[i],a[i+1],a[i+2]);neutralB+=Math.min(b[i],b[i+1],b[i+2]);
    }
    return {changed,energyA,energyB,neutralA,neutralB,unchanged:before===JSON.stringify(w.game.combat.inspect())};
  });
  expect(result.changed).toBeGreaterThan(20);expect(result.energyA).toBeLessThan(result.energyB);
  expect(result.neutralA).toBeLessThan(result.neutralB);expect(result.unchanged).toBe(true);
});

test('missing sweep atlas keeps a bounded visible fallback and real melee damage',async({page})=>{
  await open(page,true);const attack=await page.evaluate(()=>(window as any).arrange());expect(attack.kills).toBe(4);
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().melee)).toMatchObject({failed:true,loaded:false,active:true,fallback:true,capacity:1});
});

test('all eight equal cells decode transparently and retain a luminous base at the shared pixel anchor',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const image=new Image();image.src='/assets/pixel/skills/flame-sweep/flame-sweep.png';await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
    const frames=[];
    for(let i=0;i<8;i++){
      const d=ctx.getImageData(i*448,0,448,448).data;let root=0,edge=0;
      for(let y=0;y<448;y++)for(let x=0;x<448;x++){
        const j=(y*448+x)*4;
        if((x===0||x===447||y===0||y===447)&&d[j+3]>32)edge++;
        if(Math.abs(x-96)<=3&&Math.abs(y-368)<=3&&d[j]>220&&d[j+1]>160&&d[j+3]>90)root++;
      }
      frames.push({root,edge});
    }
    return {size:[image.width,image.height],frames};
  });
  expect(result.size).toEqual([3584,448]);for(const f of result.frames){expect(f.root).toBeGreaterThan(0);expect(f.edge).toBe(0);}
});
