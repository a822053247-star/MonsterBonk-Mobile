import { test, expect, type Page } from '@playwright/test';
test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
test.beforeEach(async({page})=>{
 await page.route('**/elemental-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
 import '/src/style.css';import{Game}from'/src/game.ts';import{createUI}from'/src/ui.ts';createUI(document.getElementById('app'));const g=window.game=new Game();
 window.draw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
 window.offer=(id)=>{g.sleep();const p=g.combat.progression,c=p.skills.filter(s=>p.ranks[s.id]<s.maxRank),j=c.findIndex(s=>s.id===id),rolls=[];for(let i=c.length-1;i>0;i--)rolls.push(((i===j?0:i)+.1)/(i+1));p.random=()=>rolls.shift()??.999;p.gainExperience(p.threshold-p.experience);g.step(1/60)};
 window.impact=()=>{g.sleep();for(const pool of [g.combat.enemies,g.combat.projectiles,g.combat.effects])for(const e of pool)e.active=false;g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);g.party.leader.attackCooldown=0;const target=g.combat.spawn('tank',5,0,0);g.combat.update(.001,g.position);const shot=g.combat.projectiles.find(s=>s.active);g.party.leader.attackCooldown=999;g.combat.spawn('tank',5,2,0);g.combat.spawn('tank',8,-2,0);Object.assign(shot,{x:target.x,z:target.z});g.combat.update(.001,g.position);g.welcome.style.display='none';window.draw()};
 window.freeze=()=>JSON.stringify({combat:g.combat.inspect(),enemies:g.combat.enemies,shots:g.combat.projectiles,effects:g.combat.effects,animation:g.partyView.inspect(),time:g.visualTime});
 </script></body></html>`}));
});
async function open(page:Page,dev:string){await page.goto('/elemental-harness?world=fixed&fusionDev='+dev);await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();await expect.poll(()=>page.evaluate(()=>(window as any).game.partyView.inspect().members[0]?.animation.atlases.filter((a:any)=>a.loaded).length)).toBe(2);}
async function learn(page:Page,id:string){await page.evaluate(id=>(window as any).offer(id),id);await expect(page.locator('.skill-card')).toHaveCount(3);const card=page.locator('[data-skill="'+id+'"]');await expect(card).toBeEnabled();await card.tap();await page.evaluate(()=>(window as any).game.sleep());}
for(const [dev,species,name,cards,titles]of [
 ['paopaoyuan','bubblesalamander','泡泡螈',['area','chain'],['深海泡影','连环水爆']],
 ['yacishou','sproutspike','芽刺兽',['split-on-hit','chain'],['荆棘散射','跳跃荆棘']],
]as const)test(dev+' development entry uses one animated creature, real cards, automatic fusions and bounded colored effects',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,dev);
 expect(await page.evaluate(()=>(window as any).game.party.members.map((m:any)=>m.species))).toEqual([species]);await expect(page.locator('#creature-name')).toHaveText(name);await expect(page.locator('.dash-control')).toBeHidden();
 for(let i=0;i<cards.length;i++){await learn(page,cards[i]);await expect(page.locator('#fusion-title')).toContainText(titles[i]);}
 await page.evaluate(()=>(window as any).impact());
 const state=await page.evaluate(()=>{const g=(window as any).game;return {c:g.combat.inspect(),rings:g.combatView.burstRings.count,fire:g.combatView.firePixels?.mesh.count??0,children:g.combat.projectiles.filter((s:any)=>s.active&&s.generation===1).length}});
 expect(state.rings).toBeGreaterThan(0);expect(state.fire).toBe(0);expect(state.c.hits).toBeGreaterThan(0);expect(state.c.fusion.recipes).toHaveLength(2);if(dev==='yacishou')expect(state.children).toBe(3);
 await page.evaluate(()=>{const w=window as any;w.game.combat.update(.08,w.game.position);w.draw()});
 for(const viewport of [{width:844,height:390},{width:568,height:320}]){await page.setViewportSize(viewport);await page.evaluate(()=>(window as any).draw());await page.screenshot({path:'artifacts/elemental-'+dev+'-'+viewport.width+'.png'});}
 await page.locator('#pause').tap();const before=await page.evaluate(()=>(window as any).freeze());await page.waitForTimeout(160);expect(await page.evaluate(()=>(window as any).freeze())).toBe(before);await page.locator('#resume').tap();
 await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.combat.hp=0;g.step(1/60)});await page.evaluate(()=>{const g=(window as any).game;document.getElementById('gameover-restart')!.addEventListener('click',()=>g.sleep(),{once:true})});await page.locator('#gameover-restart').tap();
 expect(await page.evaluate(()=>(window as any).game.combat.fusions)).toEqual([]);expect(await page.evaluate(()=>(window as any).game.party.members.map((m:any)=>m.species))).toEqual([species]);
 expect(errors).toEqual([]);
});
test('unknown developer value preserves Yanrong and old three-party ignores developer species and new cards',async({page})=>{
 await open(page,'invalid');expect(await page.evaluate(()=>(window as any).game.party.leader.species)).toBe('yanrong');
 await page.evaluate(()=>{const g=(window as any).game;g.sleep();g.start('classic',true,false,'legacy-party');g.sleep()});
 expect(await page.evaluate(()=>{const g=(window as any).game;return {count:g.party.members.length,fusion:g.combat.fusionEnabled,cards:g.combat.progression.skills.length}})).toEqual({count:3,fusion:false,cards:8});
});
