import { expect, type Page } from '@playwright/test';

export async function openTimeline(page: Page, width = 844, battery = false, missing = false) {
  await page.setViewportSize({width,height:width===568?320:390});
  if(missing) for(const pattern of ['**/yanrong/fire-effects-sheet.normalized.png','**/particles/kenney-feedback.png','**/smoke_08.png','**/fusions/effects.normalized.png'])
    await page.route(pattern,r=>r.abort());
  await page.route('**/vfx-timeline-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';import {ATTACKS} from '/src/run-build.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    let target,event,hitAt=0,castAt=0,seed=20261021;
    const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    window.draw=()=>{g.sleep();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.advance=seconds=>{let left=seconds;while(left>1e-9){const dt=Math.min(1/120,left);g.step(dt);left-=dt;}window.draw();};
    window.setup=kind=>{
      g.start('classic',true,false,'fusion');g.sleep();const c=g.combat;
      seed=20261021;c.random=c.progression.random=rng;c.reset();c.automaticSpawning=false;c.obstacles=[];c.useNavigation=false;c.invulnerability=10000;
      g.run.prepare=()=>{};g.input.sample=()=>({x:0,y:0});g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);
      if(kind==='bubble'||kind==='steam')c.grantUpgrade('bubble-weapon');
      if(kind==='burst')c.grantUpgrade('split-on-hit');
      if(kind==='steam')c.grantUpgrade('draft-boiling-core');
      for(const a of c.runBuild.attacks)a.cooldown=10000;
      window.advance(3);target=c.spawn('normal',-5.8,3,0);target.hp=10000;
      event=undefined;hitAt=castAt=0;document.getElementById('welcome').hidden=true;window.draw();
    };
    window.cast=attack=>{
      const c=g.combat;castAt=c.elapsed;
      const hp=target.hp,hits=c.hits;
      if(!c.fireBolts(g.position,target,ATTACKS[attack].damage,1,ATTACKS[attack].range,0,attack==='bubble'?'bubblesalamander':'yanrong',attack))throw new Error('Cast rejected');
      window.draw();return {attack,castAt,hp,hits};
    };
    window.untilHit=()=>{
      const c=g.combat,hits=c.hits;let steps=0;
      while(c.hits===hits&&steps++<120)window.advance(1/120);
      if(c.hits===hits)throw new Error('No actual collision');
      hitAt=c.elapsed;event=c.effects.find(e=>e.active&&e.kind==='steam')??c.effects.find(e=>e.active&&e.kind==='burst')??c.effects.find(e=>e.active&&(e.kind==='water'||e.kind==='hit'));
      return window.sample();
    };
    window.sample=()=>{
      const c=g.combat,v=g.combatView;
      return {gameTime:g.elapsed,combatTime:c.elapsed,castAt,hitAt,seed,hp:target?.hp,wet:target?.wetTime??0,
        boiling:c.runBuild.relics.includes('draft-boiling-core'),steamBursts:c.relicTelemetry.steamBursts,hits:c.hits,
        event:event?{kind:event.kind,active:event.active,age:event.duration-event.time,duration:event.duration,radius:event.radius}:null,
        shots:c.projectiles.filter(p=>p.active).map(p=>({attack:p.attackId,age:p.age,x:p.x,z:p.z,distance:p.distance})),
        feedback:v.inspect().feedback,fire:v.inspectFusion(),reactions:v.inspect().reactions,
        fallback:{bolts:v.bolts.count,trails:v.boltTrails.count,sparks:v.sparks.count},
        memory:{...g.renderer.info.memory},warnings:v.inspect().encounters};
    };
    window.parts=()=>{const v=g.combatView;return [v.firePixels.mesh,v.fusionPixels.mesh,v.feedback.mesh,v.reactions.group,v.bolts,v.boltCores,v.boltTrails,v.sparks]};
    window.pixels=()=>{const r=g.renderer,gl=r.getContext();r.render(g.scene,g.camera);const a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
    window.vfxPixels=()=>{
      const a=window.pixels(),parts=window.parts(),states=parts.map(p=>p.visible);parts.forEach(p=>p.visible=false);const b=window.pixels();parts.forEach((p,i)=>p.visible=states[i]);window.draw();
      let changed=0,minX=1e9,maxX=0,minY=1e9,maxY=0;const width=g.renderer.getContext().drawingBufferWidth;
      for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12){changed++;const x=i/4%width,y=Math.floor(i/4/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      return {changed,width:changed?maxX-minX+1:0,height:changed?maxY-minY+1:0};
    };
    window.warning=kind=>{
      const c=g.combat,e=c.encounters;e.beginWave(kind==='elite'?4:6);
      const enemy=kind==='elite'?e.spawnElite(c,g.position):e.spawnBoss(c,g.position);
      Object.assign(enemy,{x:kind==='elite'?target.x:target.x-1.2,z:target.z,previousX:kind==='elite'?target.x:target.x-1.2,previousZ:target.z,spawnTime:0});
      if(kind==='elite'){e.elitePulsing=true;e.eliteTime=.3;}else{e.bossState=kind==='lane'?'dash-windup':'spread-windup';e.bossTime=.3;e.aimX=1;e.aimZ=0;}
      window.draw();
    };
    window.warningPixels=kind=>{
      const v=g.combatView,warning=v.encounters[kind==='elite'?'elite':kind==='lane'?'lane':'cone'];
      const a=window.pixels();warning.visible=false;const b=window.pixels();warning.visible=true;
      const parts=window.parts(),states=parts.map(p=>p.visible);parts.forEach(p=>p.visible=false);const c=window.pixels();warning.visible=false;const d=window.pixels();
      parts.forEach((p,i)=>p.visible=states[i]);warning.visible=true;window.draw();
      let baseline=0,retained=0;for(let i=0;i<a.length;i+=4){if(Math.abs(c[i]-d[i])+Math.abs(c[i+1]-d[i+1])+Math.abs(c[i+2]-d[i+2])>12){baseline++;if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)retained++;}}
      return {baseline,retained,ratio:retained/Math.max(1,baseline),visible:warning.visible};
    };
  </script></body></html>`}));
  await page.goto('/vfx-timeline-harness?world=fixed');await page.locator('#start-fusion').click();
  await page.evaluate(battery=>{const g=(window as any).game;g.sleep();g.wake=()=>{};g.quality.setMode(battery?'battery':'high');g.applyGraphics()},battery);
  await expect.poll(()=>page.evaluate(missing=>{
    const v=(window as any).game.combatView;
    return [v.inspectFusion(),v.inspect().feedback,v.inspect().reactions].every(p=>p?.[missing?'failed':'loaded']);
  },missing)).toBe(true);
}
