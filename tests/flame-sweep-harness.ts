import {expect,type Page} from '@playwright/test';
export async function openSweep(page:Page,missing=false){
  await page.setViewportSize({width:844,height:390});
  if(missing){
    await page.route('**/yanrong/fire-effects-sheet.normalized.png',r=>r.abort());
    await page.route('**/particles/kenney-feedback.png',r=>r.abort());
  }
  await page.route('**/sector-wave-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.sleep();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.pose=age=>{g.sleep();g.combat.melee.age=age;window.draw();return g.combatView.inspect().melee};
    window.arrange=level=>{
      g.sleep();const c=g.combat;c.clearWave();c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;c.invulnerability=1000;
      while(c.runBuild.attacks.find(a=>a.attackId==='flame-sweep').level<level)c.grantUpgrade('flame-sweep-weapon');
      g.position.set(0,0,0);g.party.syncLeader(g.position,0);
      for(const a of c.runBuild.attacks)a.cooldown=a.attackId==='flame-sweep'?0:1000;
      for(const [x,z] of [[2,0],[3.2,1.8],[3.2,-1.8],[.5,3.7],[.5,-3.7],[-3.5,0]]){const e=c.spawn('normal',x,z,0);e.hp=500;}
      c.update(1/60,g.position);document.getElementById('welcome').hidden=true;window.pose(.13);
    };
  </script></body></html>`}));
  await page.goto('/sector-wave-harness?world=fixed&meleeDev=flame-sweep');await page.locator('#start-fusion').click();
  await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.wake=()=>{};});
  await expect.poll(()=>page.evaluate(missing=>{
    const v=(window as any).game.combatView.inspect().melee;
    return missing?v?.failed&&v.assets.fire.failed&&v.assets.particles.failed:v?.loaded&&v.assets.fire.loaded&&v.assets.particles.loaded;
  },missing)).toBe(true);
  await page.evaluate(()=>(window as any).arrange(1));
}
