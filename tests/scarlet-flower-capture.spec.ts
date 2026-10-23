import { test, expect } from '@playwright/test';

test('scarlet caster has one pink ground ring while firing', async ({page,browserName}) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/special-enemies-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.monster.root.visible=!g.partyView.hasPixelLeader;g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera)};
    window.arrange=()=>{
      g.sleep();g.combat.clearWave();g.combat.encounters.beginWave(2);g.combat.obstacles=[];g.combat.useNavigation=false;
      g.position.set(0,0,0);g.party.syncLeader(g.position,0);g.run.waveIndex=1;g.run.waveElapsed=15;g.mode='paused';
      g.welcome.hidden=true;g.combat.automaticSpawning=false;for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      for(let i=0;i<6;i++){const e=g.combat.spawn('draft-crystal-swarm',-5+(i%3)*.8,3+Math.floor(i/3)*1,0);e.stagger=10000}
      const bomber=g.combat.spawn('spore-floater',-1,5,0);bomber.stagger=10000;
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
  await page.locator('#start-fusion').click(); await page.evaluate(()=>(window as any).game.sleep());
  await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspect().batches.filter((b:any)=>b.loaded).length)).toBe(18);

 await page.evaluate(()=>{
  const w=window as any,g=w.game; w.arrange();g.combat.clearWave();g.combat.encounters.beginWave(3);
  const e=g.combat.spawn('scarlet-flower',-4,2,0);w.shooter=e;e.stagger=10000;
  for(let i=0;i<87;i++)g.combat.update(1/60,g.position);
  document.getElementById('world-loading')!.hidden=true;
  g.combat.targetId=e.id;g.updateHUD();w.draw();g.camera.zoom=2.4;g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);
 });

 expect(await page.evaluate(()=>(window as any).game.combat.encounters.shots.find((s:any)=>s.active)?.style)).toBe('petal');
 expect(await page.evaluate(()=>(window as any).game.combatView.recoveryRings.count)).toBe(0);
 expect(await page.evaluate(()=>(window as any).game.combatView.flowerRings.count)).toBe(1);
 expect(await page.evaluate(()=>(window as any).game.combatView.target.count)).toBe(0);
 await page.screenshot({path:'artifacts/scarlet-flower-firing.png'});
});
