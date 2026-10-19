import { test, expect, type Page } from '@playwright/test';

async function open(page:Page, failedAssets=false) {
  await page.setViewportSize({width:844,height:390});
  await page.route('**/enemy-challenge-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.draw=()=>{g.monster.root.position.copy(g.position);g.partyView.render(1,g.visualTime);g.placeCamera(true);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
    window.arrange=wave=>{g.sleep();g.combat.clearWave();g.run.waveIndex=wave-1;g.run.waveElapsed=wave===4?12:0;g.combat.obstacles=[];g.combat.useNavigation=false;g.input.sample=()=>({x:0,y:0});for(const a of g.combat.runBuild.attacks)a.cooldown=10000;g.run.prepare(g.combat,g.position);const e=wave===6?g.combat.encounters.boss:g.combat.encounters.elite;Object.assign(e,{x:4,z:0,previousX:4,previousZ:0,spawnTime:0});document.getElementById('welcome').hidden=true;window.draw()};
    window.drive=n=>{g.sleep();for(let i=0;i<n;i++)g.step(1/60);window.draw()};
    window.freeze=()=>JSON.stringify({combat:g.combat.inspect(),boss:g.combatView.inspect().encounters,run:g.run.inspect()});
  </script></body></html>`}));
  await page.goto('/enemy-challenge-harness?world=fixed'); await page.waitForFunction(()=>'game'in window);
  await page.locator('#start-fusion').click(); await page.evaluate(()=>(window as any).arrange(6));
  await expect.poll(()=>page.evaluate(failed=>(window as any).game.combatView.inspect().encounters.boss?.atlases.filter((a:any)=>failed?a.failed:a.loaded).length,failedAssets)).toBe(8);
}

test('real Boss shows front combat poses and independent warnings, freezes, dies, wins, and resets to legacy safely',async({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.evaluate(()=>{const w=window as any,c=w.game.combat.encounters;c.bossState='dash-windup';c.bossTime=.3;c.aimX=-1;c.aimZ=0;w.draw()});
  const view=await page.evaluate(()=>(window as any).game.combatView.inspect().encounters);
  expect(view.lane).toBe(true);expect(view.boss).toMatchObject({action:'dash-windup',renderedFacing:'down',rotation:0,fallback:false});
  await expect(page.locator('#encounter-name')).toHaveText('荆冠兽王');
  await expect(page.locator('#encounter-hint')).toContainText('横向移出');
  if(browserName==='chromium')await page.screenshot({path:'artifacts/v5.3-e-boss-dash.png'});
  await page.locator('#pause').click(); const before=await page.evaluate(()=>(window as any).freeze());
  await page.evaluate(()=>(window as any).drive(60)); await page.waitForTimeout(130);
  expect(await page.evaluate(()=>(window as any).freeze())).toBe(before);
  await page.locator('#resume').click();await page.evaluate(()=>{const w=window as any;w.game.sleep();w.game.combat.encounters.bossState='recover';w.game.combat.encounters.bossTime=.2;w.game.combat.encounters.boss.hp=1000;w.draw()});
  await expect(page.locator('#encounter-name')).toContainText('狂暴');
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().encounters.boss.action)).toBe('enraged-idle');
  await page.evaluate(()=>{const w=window as any,c=w.game.combat;c.damageEnemy(c.encounters.boss,10000,0,0);c.progression.gainExperience(8);w.drive(45)});
  await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().encounters.boss)).toMatchObject({action:'death',renderedFrame:4});
  await expect(page.locator('#gameover-screen')).toBeHidden();
  if(browserName==='chromium')await page.screenshot({path:'artifacts/v5.3-e-boss-death.png'});
  await page.evaluate(()=>(window as any).drive(17));
  await expect(page.locator('#result-heading')).toHaveText('六波挑战，通关！');
  await expect(page.locator('#result-message')).toContainText('荆冠兽王已击败');
  await page.locator('#gameover-restart').click(); await page.evaluate(()=>(window as any).game.sleep());
  expect(await page.evaluate(()=>(window as any).game.combat.encounters.inspect())).toMatchObject({enabled:true,wave:1,boss:null,elite:null,shots:[]});
  await expect(page.locator('#encounter-status')).toBeHidden();
  await page.locator('#pause').click();await page.locator('#back-menu').click();await page.locator('#start-legacy-party').click();
  expect(await page.evaluate(()=>(window as any).game.combat.encounters.enabled)).toBe(false);expect(errors).toEqual([]);
});

test('elite and spread warnings fit short phones; upgrades, settings and background freeze Boss hazards',async({page,browserName})=>{
  await open(page);
  await page.evaluate(()=>{const w=window as any,c=w.game.combat.encounters;c.bossState='spread-windup';c.bossTime=.6;c.aimX=-1;c.aimZ=0;w.draw()});
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().encounters.cone)).toBe(true);
  if(browserName==='chromium')await page.screenshot({path:'artifacts/v5.3-e-boss-spread.png'});
  await page.evaluate(()=>{const w=window as any;w.game.combat.progression.gainExperience(8);w.game.step(1/60)});
  await expect(page.locator('#upgrade-screen')).toBeVisible();let frozen=await page.evaluate(()=>(window as any).freeze());
  await page.evaluate(()=>(window as any).drive(120));expect(await page.evaluate(()=>(window as any).freeze())).toBe(frozen);
  await expect(page.locator('.skill-card').first()).toBeEnabled();await page.locator('.skill-card').first().click();await page.evaluate(()=>(window as any).game.sleep());
  await page.locator('#settings').click();frozen=await page.evaluate(()=>(window as any).freeze());
  await page.evaluate(()=>(window as any).drive(120));expect(await page.evaluate(()=>(window as any).freeze())).toBe(frozen);
  await page.locator('#close-settings').click();await page.locator('#resume').click();await page.evaluate(()=>(window as any).game.sleep());
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
  frozen=await page.evaluate(()=>(window as any).freeze());await page.waitForTimeout(150);expect(await page.evaluate(()=>(window as any).freeze())).toBe(frozen);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
  await page.locator('#resume').click();await page.evaluate(()=>(window as any).arrange(4));
  await page.evaluate(()=>{const w=window as any,c=w.game.combat.encounters;c.elitePulsing=true;c.eliteTime=.7;w.draw()});
  await expect(page.locator('#encounter-name')).toHaveText('精英岩甲');await expect(page.locator('#encounter-hint')).toContainText('金色圆环');
  await page.setViewportSize({width:568,height:320});await page.evaluate(()=>{(window as any).game.sleep();(window as any).draw()});
  const rect=await page.locator('#encounter-status').boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.y+rect!.height).toBeLessThan(320);
  const health=await page.locator('.health-panel').boundingBox(),actions=await page.locator('.hud-actions').boundingBox();
  expect(rect!.x).toBeGreaterThan(health!.x+health!.width);expect(rect!.x+rect!.width).toBeLessThan(actions!.x);
  if(browserName==='chromium')await page.screenshot({path:'artifacts/v5.3-e-elite-small.png'});
});

test('final timer cannot grant victory and failed Boss assets stay an honest visible fallback',async({page})=>{
  await page.route('**/Crownthorn/runtime/*.png',route=>route.abort());
  await open(page,true);
  await page.evaluate(()=>(window as any).draw());
  expect(await page.evaluate(()=>(window as any).game.combatView.inspect().encounters)).toMatchObject({fallback:true,boss:{visible:false}});
  await page.evaluate(()=>{const w=window as any;w.draw();w.game.run.waveElapsed=90;w.game.step(1/60)});
  await expect(page.locator('#result-message')).toContainText('未能在 90 秒内击败');
  expect(await page.evaluate(()=>(window as any).game.run.bossDefeated)).toBe(false);
});
