import {test,expect,type Page}from'@playwright/test';
test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
test.beforeEach(async({page})=>{await page.route('**/selection-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">import '/src/style.css';import{createUI}from'/src/ui.ts';import{Game}from'/src/game.ts';createUI(document.getElementById('app'));window.game=new Game();</script></body></html>`}));});
async function menu(page:Page,query=''){await page.goto('/selection-harness?world=fixed'+query);await page.waitForFunction(()=>'game'in window);}
for(const[species,name,card,attack]of[['yanrong','焰绒','split-on-hit','spark'],['bubblesalamander','泡泡螈','area','bubble'],['sproutspike','芽刺兽','chain','leaf']]as const)test('choose '+species+' directly from menu and keep only that creature through restart',async({page})=>{
 await menu(page);await page.locator('#choose-creature').tap();await page.locator('[data-creature="'+species+'"]').tap();await expect(page.locator('[data-creature="'+species+'"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#start-selected-creature')).toContainText(name);await page.locator('#start-selected-creature').tap();
 await expect.poll(()=>page.evaluate(()=>(window as any).game.partyView.inspect().members[0]?.animation.atlases.filter((a:any)=>a.loaded).length)).toBe(2);
 const actual=await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.combat.spawnClock=100000;g.combat.spawn('tank',g.position.x+5,g.position.z,0);g.step(1/60);return{party:g.party.members.map((m:any)=>m.species),base:g.combat.baseAttack,cards:g.combat.progression.skills.map((s:any)=>s.id),shots:g.combat.shotsFired,variant:g.inspect().prototypeVariant}});
 expect(actual.party).toEqual([species]);expect(actual.base).toBe(attack);expect(actual.cards).toContain(card);expect(actual.shots).toBeGreaterThan(0);expect(actual.variant).toBe('fusion');await expect(page.locator('#creature-name')).toHaveText(name);await expect(page.locator('.dash-control')).toBeHidden();await expect(page.locator('#creature-picker')).toBeHidden();
 await page.locator('#pause').tap();await page.locator('#restart').tap();expect(await page.evaluate(()=>(window as any).game.party.members.map((m:any)=>m.species))).toEqual([species]);
});
test('selection dialog, cards and start targets fit both phone safe areas and closing does not start a run',async({page})=>{
 for(const viewport of[{width:844,height:390},{width:568,height:320}]){
 await page.setViewportSize(viewport);await menu(page);await page.addStyleTag({content:':root{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}'});
 await page.locator('#choose-creature').tap();await expect(page.locator('#creature-picker')).toBeVisible();
 for(const locator of[page.locator('#close-creature-picker'),page.locator('#start-selected-creature'),...await page.locator('[data-creature]').all()]){const b=(await locator.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(44);expect(b.x+b.width).toBeLessThanOrEqual(viewport.width-44);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(viewport.height-21);expect(b.height).toBeGreaterThanOrEqual(44);expect(await locator.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true);}
 await page.screenshot({path:'artifacts/creature-selection-'+viewport.width+'.png'});await page.locator('#close-creature-picker').tap();await expect(page.locator('#creature-picker')).toBeHidden();expect(await page.evaluate(()=>(window as any).game.inspect().mode)).toBe('menu');
 }
});
test('menu selection overrides development URL and remains selected after returning from compatibility mode',async({page})=>{
 await menu(page,'&fusionDev=paopaoyuan');await page.locator('#choose-creature').tap();await expect(page.locator('[data-creature="bubblesalamander"]')).toHaveAttribute('aria-pressed','true');await page.locator('[data-creature="sproutspike"]').tap();await page.keyboard.press('Escape');await page.locator('#start-fusion').tap();expect(await page.evaluate(()=>(window as any).game.party.leader.species)).toBe('sproutspike');
 await page.locator('#pause').tap();await page.locator('#back-menu').tap();await page.locator('#start-legacy-party').tap();expect(await page.evaluate(()=>(window as any).game.party.members.length)).toBe(3);
 await page.locator('#pause').tap();await page.locator('#back-menu').tap();await page.locator('#start-fusion').tap();expect(await page.evaluate(()=>(window as any).game.party.members.map((m:any)=>m.species))).toEqual(['sproutspike']);
});
