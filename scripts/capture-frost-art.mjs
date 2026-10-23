import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const output = 'artifacts/frost-art-preview';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/frost-art-preview*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI,renderUpgradeCards} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));window.game=new Game();window.renderCards=renderUpgradeCards;
    </script></html>` }));
  await page.goto('http://127.0.0.1:5175/frost-art-preview?world=fixed', { waitUntil: 'domcontentloaded' });
  await page.locator('#start-fusion').click();
  await page.evaluate(() => {
    const g = window.game; g.sleep(); g.wake = () => {}; const c = g.combat;
    c.reset(); c.automaticSpawning = false; c.obstacles = []; c.grantUpgrade('frost-crystal-weapon');
    g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);
    g.partyView.render(1,0);
    for(const a of c.runBuild.attacks)a.cooldown=10000;
    const e=c.spawn('normal',7.5,0,0);e.hp=1000;
    c.fireBolts({x:0,z:0},e,10,1,11,0,'yanrong','frost-crystal');
    const shot=c.projectiles.find(s=>s.active&&s.attackId==='frost-crystal');
    shot.x=shot.previousX=3.2;shot.z=shot.previousZ=0;shot.age=.15;
    window.drawFrost=()=>{
      document.getElementById('world-loading').hidden=true;document.getElementById('welcome').hidden=true;
      g.placeCamera(true);g.partyView.render(1,0);g.monster.root.visible=!g.partyView.hasPixelLeader;
      g.updateHUD();g.combatView.render(1,0,g.position);g.renderer.render(g.scene,g.camera);
    };
  });
  await page.waitForFunction(() => {
    const g=window.game;
    return g.world.sampleActive && g.partyView.startupSettled && g.combatView.startupSettled
      && g.combatView.inspect().frost.atlases.every(a=>a.loaded);
  }, { timeout: 60000 });
  await page.waitForFunction(()=>{const image=document.getElementById('creature-portrait');return image.complete&&image.naturalWidth>0}, {timeout:45000});
  await page.evaluate(()=>window.drawFrost());
  await page.waitForFunction(()=>[...document.querySelectorAll('#hud-extra-weapons img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({ path: output+'/gameplay.png' });
  await page.screenshot({ path: output+'/projectile-closeup.png', clip:{x:550,y:255,width:470,height:200} });
  await page.evaluate(()=>{
    const p=window.game.combat.progression;
    p.build.reset('yanrong');p.ranks['frost-crystal-weapon']=0;
    p.currentOffers=['frost-crystal-weapon'];p.level=2;p.pendingChoices=1;window.renderCards(p,42);
    document.getElementById('upgrade-screen').hidden=false;
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('#upgrade-cards img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('[data-skill="frost-crystal-weapon"]').screenshot({ path: output+'/card.png', animations:'disabled' });
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Saved frost card, actual gameplay and projectile detail previews.');
} finally { await browser.close(); }
