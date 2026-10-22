import { test, expect } from '@playwright/test';

test('new enemy art, spore warning/burst and visible treasure rewards render on desktop and phone', async ({page,browserName}) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/special-enemies-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera)};
    window.arrange=()=>{
      g.sleep();g.combat.clearWave();g.combat.encounters.beginWave(2);g.combat.obstacles=[];g.combat.useNavigation=false;
      g.position.set(0,0,0);g.party.syncLeader(g.position,0);g.run.waveIndex=1;g.run.waveElapsed=15;g.mode='paused';
      g.welcome.hidden=true;g.combat.automaticSpawning=false;for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      for(let i=0;i<6;i++){const e=g.combat.spawn('draft-crystal-swarm',-5+(i%3)*.8,3+Math.floor(i/3)*1,0);e.stagger=10000}
      const bomber=g.combat.spawn('draft-spore-bomber',-1,5,0);bomber.stagger=10000;
      const victim=g.combat.spawn('normal',-1,4,0);victim.stagger=10000;
      const runner=g.combat.spawn('draft-treasure-runner',4,3,0);runner.specialTime=2;
      window.bomber=bomber;window.runner=runner;g.updateHUD();window.draw();
      return g.combatView.inspect();
    };
    window.killBomber=()=>{g.combat.damageEnemy(window.bomber,100000,0,0);window.draw();return g.combatView.inspect().specialEnemies};
    window.advanceBurst=()=>{g.combat.update(.7,g.position);window.draw();return g.combatView.inspect().specialEnemies};
    window.reward=()=>{g.combat.damageEnemy(window.runner,100000,0,0);g.updateHUD();window.draw();return g.combatView.inspect().specialEnemies};
    window.chain=()=>{
      g.combat.clearWave();g.combat.encounters.beginWave(2);g.combat.hp=100;g.combat.invulnerability=10;
      for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      const enemies=[-2,0,2].map(x=>{const e=g.combat.spawn('draft-spore-bomber',x,4,0);e.stagger=10000;return e});
      g.combat.damageEnemy(enemies[0],100000,0,0);g.combat.update(.7,g.position);g.combat.update(.14,g.position);window.draw();
      return {model:g.combat.inspect().specialEnemies,visual:g.combatView.specialEnemies.inspectSpore()};
    };
  </script></body></html>`}));
  await page.goto('/special-enemies-harness?world=fixed'); await page.waitForFunction(()=>'game' in window);
  await page.locator('#start-fusion').click();
  await expect.poll(() => page.evaluate(() => (window as any).game.inspect().mode)).toBe('playing');
  await page.evaluate(()=>(window as any).game.sleep());
  await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().batches.filter((b:any)=>b.loaded).length)).toBe(6);
  await expect.poll(()=>page.evaluate(()=>{const v=(window as any).game.combatView.specialEnemies.inspectSpore();return v.warning.loaded&&v.fire.loaded&&v.smoke.loaded})).toBe(true);
  for(const width of [1280,568]) {
    await page.setViewportSize({width,height:width===1280?720:320});
    const scene=await page.evaluate(()=>(window as any).arrange());
    for(const kind of ['draft-crystal-swarm','draft-spore-bomber','draft-treasure-runner']) {
      const batch=scene.batches.find((b:any)=>b.kind===kind);
      expect(batch).toMatchObject({loaded:true,failed:false,directional:true,nearest:true,mipmaps:false});
      expect(batch.count).toBeGreaterThan(0); expect(batch.crop[2]).toBeGreaterThan(0);
    }
    expect(scene.specialEnemies).toMatchObject({runners:1,warnings:0,rewards:0});
    const capture=async(name:string)=>{
      // WebKit presents an actively rendered frozen scene reliably during capture.
      await page.evaluate(()=>{const w=window as any;const draw=()=>{w.draw();w.frame=requestAnimationFrame(draw)};draw()});
      if(browserName==='chromium')await page.screenshot({path:'artifacts/special-enemies-'+name+'-'+width+'.png'});
      await page.evaluate(()=>cancelAnimationFrame((window as any).frame));
    };
    await capture('roster');
    expect(await page.evaluate(()=>(window as any).killBomber())).toMatchObject({warnings:1,bursts:0,runners:1});
    await capture('warning');
    expect(await page.evaluate(()=>(window as any).advanceBurst())).toMatchObject({warnings:0,bursts:1,runners:1});
    await page.evaluate(()=>{const w=window as any;w.game.combat.update(.14,w.game.position);w.draw()});
    const burst=await page.evaluate(()=>(window as any).game.combatView.specialEnemies.inspectSpore());
    expect(burst.fire.url).toContain('fire-effects-sheet.normalized.png'); expect(burst.fire.frames).toContain(10);
    expect(burst.fire.nearest).toBe(true); expect(burst.smoke.count).toBeGreaterThan(0);
    await capture('burst');
    expect(await page.evaluate(()=>(window as any).reward())).toMatchObject({rewards:1,runners:0});
    await capture('reward');
    const chain=await page.evaluate(()=>(window as any).chain());
    expect(chain.visual).toMatchObject({bursts:1,warnings:1,warningStyle:'spore-nodes'});
    expect(chain.model.sporeKills).toBeGreaterThan(0);
    expect(chain.model.explosions.filter((e:any)=>!e.detonated)).toHaveLength(1);
    await capture('chain');
    const chainBefore=await page.evaluate(()=>JSON.stringify((window as any).game.combatView.specialEnemies.inspectSpore()));
    await page.evaluate(()=>{for(let i=0;i<20;i++)(window as any).draw()});
    expect(await page.evaluate(()=>JSON.stringify((window as any).game.combatView.specialEnemies.inspectSpore()))).toBe(chainBefore);
  }
  await page.evaluate(()=>(window as any).arrange()); await page.evaluate(()=>(window as any).killBomber());
  await page.evaluate(()=>(window as any).game.mode='playing');
  await page.locator('#pause').click();
  const before=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  await page.evaluate(()=>{const g=(window as any).game;for(let i=0;i<120;i++)g.step(1/60)});
  expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(before);
  await page.locator('#restart').click(); await page.evaluate(()=>{const w=window as any;w.game.sleep();w.draw()});
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().specialEnemies)).toEqual({warnings:0,bursts:0,runners:0,rewards:0});
  const disposed=await page.evaluate(()=>{const g=(window as any).game,v=g.combatView.specialEnemies;g.dispose();return {children:v.group.children.length,resources:v.resources.length}});
  expect(disposed).toEqual({children:0,resources:0}); expect(errors).toEqual([]);
});
