import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts/basic-projectiles', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/basic-projectile-capture*', r => r.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();
    </script></html>` }));
  await page.goto('http://127.0.0.1:5175/basic-projectile-capture?world=fixed', { waitUntil: 'domcontentloaded' });
  await page.locator('#start-fusion').click();
  await page.evaluate(()=>{window.game.sleep();window.game.wake=()=>{};window.game.partyView.render(1,0)});
  await page.waitForFunction(() => window.game.combatView.firePixels?.loaded, {timeout:45000});
  await page.evaluate(() => {
    const g=window.game,c=g.combat;g.sleep();g.wake=()=>{};c.reset();c.automaticSpawning=false;c.obstacles=[];
    c.grantUpgrade('bubble-weapon');c.grantUpgrade('leaf-weapon');
    g.position.set(0,0,0);g.previousPosition.copy(g.position);
    for(const a of c.runBuild.attacks)a.cooldown=10000;
    for(const [id,z] of [['spark',-2],['bubble',0],['leaf',2]]){
      c.fireBolts({x:0,z},{x:9,z},10,1,11,0,'yanrong',id);
      const s=c.projectiles.find(s=>s.active&&s.attackId===id);s.x=s.previousX=2.8;s.z=s.previousZ=z;s.age=.1;
    }
    document.getElementById('welcome').hidden=true;document.getElementById('world-loading').hidden=true;
    g.placeCamera(true);g.party.syncLeader(g.position,0);g.partyView.render(1,c.elapsed);g.monster.root.visible=!g.partyView.hasPixelLeader;
    g.updateHUD();g.combatView.render(1,c.elapsed,g.position);g.renderer.render(g.scene,g.camera);
  });
  await page.screenshot({path:'artifacts/basic-projectiles/fire-water-leaf.png'});
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>{const g=window.game;g.combatView.detail=2;g.placeCamera(true);g.partyView.render(1,g.combat.elapsed);g.combatView.render(1,g.combat.elapsed,g.position);g.renderer.render(g.scene,g.camera)});
  await page.screenshot({path:'artifacts/basic-projectiles/fire-water-leaf-mobile.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Captured desktop and low-detail mobile basic projectiles.');
} finally { await browser.close(); }
