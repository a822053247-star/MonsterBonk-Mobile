import {test,expect} from '@playwright/test';
import {PAIR_IDS,WEAPON_PAIR_RECIPES} from '../src/weapon-pair-fusion';
import {mkdirSync} from 'node:fs';

for(const id of PAIR_IDS)test(`${id}: optional upgrade, confirmation, HUD/pause/result and restart`,async({page})=>{
 test.setTimeout(45000);await page.setViewportSize({width:844,height:390});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/main.ts*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('const game = new Game();','const game = window.__pairGame = new Game();')});});
 await page.goto('/?world=fixed');await page.locator('#start-fusion').click();
 await page.evaluate(id=>{
  const g=(window as any).__pairGame,c=g.combat;g.sleep();g.wake=()=>{};g.run.prepare=()=>{};g.run.update=()=>{};
  c.reset();c.automaticSpawning=false;c.encounters.enabled=false;c.useNavigation=false;c.obstacles=[];
  c.runBuild.acquire('bubble');c.runBuild.acquire('leaf');for(const a of c.runBuild.attacks){a.level=3;c.progression.ranks[`${a.attackId}-weapon`]=3;}
  c.progression.gainExperience(8);g.openUpgrade();
 },id);
 const card=page.locator('[data-skill="weapon-pair-fusion"]');await expect(card).toBeEnabled();mkdirSync('artifacts/weapon-pair-fusion',{recursive:true});await page.screenshot({path:`artifacts/weapon-pair-fusion/${id}-offer.png`});await card.click();
 await expect(page.locator('#weapon-pair-options button')).toHaveCount(3);
 mkdirSync('artifacts/weapon-pair-fusion',{recursive:true});
 await page.screenshot({path:`artifacts/weapon-pair-fusion/${id}-picker.png`});
 if(id==='steam-comet'){await page.setViewportSize({width:568,height:320});await expect(page.locator('#weapon-pair-options button').last()).toBeInViewport({ratio:1});await expect(page.locator('#weapon-pair-cancel')).toBeInViewport({ratio:1});await page.screenshot({path:'artifacts/weapon-pair-fusion/picker-568.png'});await page.setViewportSize({width:844,height:390});}
 await page.locator('#weapon-pair-cancel').click();await expect(card).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__pairGame.combat.runBuild.attacks.length)).toBe(3);
 await card.click();await page.locator(`[data-pair="${id}"]`).click();
 await expect(page.locator('#upgrade-screen')).toBeHidden();await expect(page.locator('#fusion-title')).toContainText(WEAPON_PAIR_RECIPES[id].title);
 await expect(page.locator('#fusion-hint')).toContainText('来源');
 await expect(page.locator('#hud-extra-weapons')).toBeVisible();
 await page.locator('#pause').click();await expect(page.locator('#build-summary')).toContainText(WEAPON_PAIR_RECIPES[id].title);
 const summary=page.locator('#build-summary');await expect(summary).toContainText('来源');
 mkdirSync('artifacts/weapon-pair-fusion',{recursive:true});await page.screenshot({path:`artifacts/weapon-pair-fusion/${id}-pause.png`});
 await page.locator('#resume').click();
 await page.evaluate(()=>{const g=(window as any).__pairGame,c=g.combat;g.welcome.hidden=true;const e=c.spawn('tank',4,0,0);e.hp=1000;for(const z of [-1,1])c.spawn('tank',4,z,0).hp=1000;for(const a of c.runBuild.attacks)a.cooldown=a.pairId?0:10000;
  for(let i=0;i<25;i++)c.update(1/120,g.position);g.visualTime+=.2;g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);
 });
 await page.screenshot({path:`artifacts/weapon-pair-fusion/${id}-combat.png`});
 await page.evaluate(()=>{const g=(window as any).__pairGame;g.combat.hp=0;g.endRun('defeat');});
 await expect(page.locator('#result-weapons')).toContainText(WEAPON_PAIR_RECIPES[id].title);await expect(page.locator('#result-weapons')).toContainText('来源');
 await page.locator('#gameover-menu').click();expect(await page.evaluate(()=>(window as any).__pairGame.combat.runBuild.attacks.some((a:any)=>a.pairId))).toBe(false);
 await page.locator('#start-fusion').click();expect(await page.evaluate(()=>(window as any).__pairGame.combat.runBuild.attacks.some((a:any)=>a.pairId))).toBe(false);
 expect(errors).toEqual([]);
});
