import {test,expect} from '@playwright/test';

test('treasure remains discoverable in crowds, leaves a frozen trail and can be tracked beyond every screen edge',async({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/treasure-tracking-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.sleep();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera)};
    window.arrange=()=>{
      g.sleep();g.combat.clearWave();g.combat.encounters.beginWave(2);g.mode='paused';g.welcome.hidden=true;
      g.combat.obstacles=[];g.combat.useNavigation=false;g.combat.automaticSpawning=false;g.combat.invulnerability=1000;
      for(const a of g.combat.runBuild.attacks)a.cooldown=10000;
      for(let i=0;i<12;i++){const e=g.combat.spawn('normal',2+(i%4)*.35,1+Math.floor(i/4)*.4,0);e.stagger=10000}
      window.runner=g.combat.spawn('draft-treasure-runner',3,1,0);window.runner.specialTime=1.3;
      for(let i=0;i<40;i++){g.party.syncLeader(g.position,0);g.combat.update(1/60,g.position);if(i%4===0)window.draw()}window.draw();
      return g.combatView.specialEnemies.inspectTreasure();
    };
    window.edge=(x,z)=>{const e=window.runner;e.x=e.previousX=x;e.z=e.previousZ=z;e.walkX=e.walkZ=0;window.draw();return g.combatView.specialEnemies.inspectTreasure()};
  </script></body></html>`}));
  await page.goto('/treasure-tracking-harness?world=fixed');await page.locator('#start-fusion').click();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.wake=()=>{}});
  await expect.poll(()=>page.evaluate(()=>{const g=(window as any).game;return g.combatView.specialEnemies.inspectTreasure().trail.loaded&&g.combatView.inspect().batches.every((b:any)=>b.loaded)})).toBe(true);
  for(const viewport of [{width:1280,height:720},{width:568,height:320}]) {
    await page.setViewportSize(viewport);
    const view=await page.evaluate(()=>(window as any).arrange());
    expect(view.runners).toBe(1);expect(view.trail.count).toBeGreaterThan(1);expect(view.markers[0].alwaysVisible).toBe(true);
    const badgePixels=await page.evaluate(()=>{const g=(window as any).game;return g.combatView.specialEnemies.inspectTreasure().markers[0].badgeHeight/(g.camera.top-g.camera.bottom)*innerHeight});
    expect(badgePixels).toBeGreaterThanOrEqual(27.9);
    const capture=async(name:string)=>{
      await page.evaluate(()=>{const w=window as any;const draw=()=>{w.draw();w.frame=requestAnimationFrame(draw)};draw()});
      if(browserName==='chromium')await page.screenshot({path:'artifacts/treasure-tracking-'+name+'-'+viewport.width+'.png'});
      await page.evaluate(()=>cancelAnimationFrame((window as any).frame));
    };
    await capture('crowd');
    const frozen=await page.evaluate(()=>JSON.stringify([(window as any).game.combat.inspect(),(window as any).game.combatView.specialEnemies.inspectTreasure()]));
    await page.evaluate(()=>{for(let i=0;i<30;i++)(window as any).draw()});
    expect(await page.evaluate(()=>JSON.stringify([(window as any).game.combat.inspect(),(window as any).game.combatView.specialEnemies.inspectTreasure()]))).toBe(frozen);
    for(const [x,z] of [[27,0],[-27,0],[0,27],[0,-27],[-20,20],[-20,-20]]) {
      const edge=await page.evaluate(([x,z])=>(window as any).edge(x,z),[x,z]);
      expect(edge.offscreen).toBe(1);
      const marker=edge.markers[0].edge;expect(Math.abs(marker[0])).toBeLessThanOrEqual(.781);expect(Math.abs(marker[1])).toBeLessThanOrEqual(.521);
      if(x)expect(Math.sign(marker[0])).toBe(Math.sign(x));
    }
    await page.evaluate(()=>(window as any).edge(27,0));await capture('offscreen');
    const memory=await page.evaluate(()=>JSON.stringify((window as any).game.renderer.info.memory));
    await page.evaluate(()=>{for(let i=0;i<20;i++)(window as any).draw()});
    expect(await page.evaluate(()=>JSON.stringify((window as any).game.renderer.info.memory))).toBe(memory);
    const cleared=await page.evaluate(()=>{const w=window as any;w.runner.active=false;w.draw();return w.game.combatView.specialEnemies.inspectTreasure()});
    expect(cleared).toMatchObject({runners:0,offscreen:0,markers:[]});expect(cleared.trail.count).toBe(0);
  }
  const disposed=await page.evaluate(()=>{const g=(window as any).game,v=g.combatView.specialEnemies.treasureTracker;g.dispose();return{children:v.group.children.length,resources:v.resources.length,trail:v.inspect().trail.loaded}});
  expect(disposed).toEqual({children:0,resources:0,trail:false});expect(errors).toEqual([]);
});
