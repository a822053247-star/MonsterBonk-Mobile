import { test, expect, type Page } from '@playwright/test';
test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
test.beforeEach(async({page})=>{
 await page.route('**/elemental-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
 import '/src/style.css';import{Game}from'/src/game.ts';import{FUSION_CLIPS}from'/src/fusion-pixels.ts';import{createUI}from'/src/ui.ts';createUI(document.getElementById('app'));const g=window.game=new Game();window.clips=FUSION_CLIPS;
 window.draw=()=>{g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
 window.offer=(id)=>{g.sleep();const p=g.combat.progression,c=p.skills.filter(s=>p.ranks[s.id]<s.maxRank),j=c.findIndex(s=>s.id===id),rolls=[];for(let i=c.length-1;i>0;i--)rolls.push(((i===j?0:i)+.1)/(i+1));p.random=()=>rolls.shift()??.999;p.gainExperience(p.threshold-p.experience);g.step(1/60)};
 window.impact=()=>{g.sleep();g.combat.clearTransientEffects();for(const a of g.combat.runBuild.attacks)a.cooldown=0;for(const pool of [g.combat.enemies,g.combat.projectiles,g.combat.effects])for(const e of pool)e.active=false;g.position.set(0,0,0);g.previousPosition.copy(g.position);g.party.syncLeader(g.position,0);g.party.leader.attackCooldown=0;const target=g.combat.spawn('tank',4,0,0);g.combat.update(.001,g.position);const shot=g.combat.projectiles.find(s=>s.active);g.party.leader.attackCooldown=999;for(const a of g.combat.runBuild.attacks)a.cooldown=999;g.combat.spawn('tank',5.7,1.3,0);g.combat.spawn('tank',7.6,-.8,0);Object.assign(shot,{x:target.x,z:target.z});g.combat.update(.001,g.position);g.welcome.style.display='none';window.draw()};
 window.freeze=()=>JSON.stringify({combat:g.combat.inspect(),enemies:g.combat.enemies,shots:g.combat.projectiles,effects:g.combat.effects,animation:g.partyView.inspect(),time:g.visualTime});
 </script></body></html>`}));
});
async function open(page:Page,dev:string){await page.goto('/elemental-harness?world=fixed&fusionDev='+dev);await page.waitForFunction(()=>'game'in window);await page.locator('#start-fusion').tap();await expect.poll(()=>page.evaluate(()=>(window as any).game.partyView.inspect().members[0]?.animation.atlases.filter((a:any)=>a.loaded).length)).toBe(2);}
async function learn(page:Page,id:string){await page.evaluate(id=>(window as any).offer(id),id);await expect(page.locator('.skill-card')).toHaveCount(3);const card=page.locator('[data-skill="'+id+'"]');await expect(card).toBeEnabled();await card.tap();await page.evaluate(()=>(window as any).game.sleep());}
test('deep atlas loads, plays flight and one-shot impact, damages and slows in actual game',async({page})=>{
 await open(page,'paopaoyuan');await page.evaluate(()=>(window as any).game.sleep());
 await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspectElemental()?.loaded)).toBe(true);
 await learn(page,'area');await page.evaluate(()=>(window as any).impact());
 const result=await page.evaluate(()=>{const g=(window as any).game;return {hp:g.combat.enemies.filter((e:any)=>e.active).map((e:any)=>e.hp),slow:g.combat.enemies.filter((e:any)=>e.active).map((e:any)=>e.slowTime),pixels:g.combatView.inspectElemental()}});
 expect(result.hp.some((hp:number)=>hp<100)).toBe(true);expect(result.slow.some((s:number)=>s>0)).toBe(true);
 expect(result.pixels).toMatchObject({loaded:true,nearest:true,count:1});expect(result.pixels.frames).toEqual([3]);
 await page.evaluate(()=>{const w=window as any;w.game.combat.update(.14,w.game.position);w.draw()});
 expect(await page.evaluate(()=>(window as any).game.combatView.inspectElemental().frames)).toEqual([4]);
 await page.screenshot({path:'artifacts/fusion-deep-bubble-844.png'});
 await page.evaluate(()=>{const w=window as any;w.game.combat.update(.5,w.game.position);w.draw()});
 expect(await page.evaluate(()=>(window as any).game.combatView.inspectElemental().count)).toBe(0);
});
for(const [dev,species,name,cards,titles]of [
 ['paopaoyuan','bubblesalamander','泡泡螈',['area','chain'],['深海泡影','连环水爆']],
 ['yacishou','sproutspike','芽刺兽',['split-on-hit','chain'],['荆棘散射','跳跃荆棘']],
]as const)test(dev+' development entry uses one animated creature, real cards, automatic fusions and bounded colored effects',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,dev);
 expect(await page.evaluate(()=>(window as any).game.party.members.map((m:any)=>m.species))).toEqual([species]);await expect(page.locator('#creature-name')).toHaveText(name);await expect(page.locator('.dash-control')).toBeHidden();
 for(let i=0;i<cards.length;i++){await learn(page,cards[i]);await expect(page.locator('#fusion-title')).toContainText(titles[i]);}
 await page.evaluate(()=>(window as any).impact());
 const state=await page.evaluate(()=>{const g=(window as any).game;return {c:g.combat.inspect(),rings:g.combatView.burstRings.count+(g.combatView.inspectElemental()?.count??0),fire:g.combatView.firePixels?.mesh.count??0,children:g.combat.projectiles.filter((s:any)=>s.active&&s.generation===1).length}});
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

for(const [id,dev,card,delta] of [
 ['deep-bubble','paopaoyuan','area',.14],['chain-bubble','paopaoyuan','chain',.14],
 ['thorn-scatter','yacishou','split-on-hit',.06],['jump-thorn','yacishou','chain',.06],
]as const)test(id+' individual skill renders audited pixels, icon and real damage; lifecycle clears batch',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,dev);await page.evaluate(()=>(window as any).game.sleep());
 await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspectElemental()?.loaded)).toBe(true);
 await learn(page,card);await expect(page.locator('.skill-card')).toHaveCount(0);
 await expect(page.locator('#fusion-elemental-icons img')).toHaveAttribute('src',new RegExp(id+'-icon.png'));
 await expect.poll(()=>page.locator('#fusion-elemental-icons img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===128)).toBe(true);
 await page.evaluate(()=>(window as any).impact());await page.evaluate(dt=>{const w=window as any;w.game.combat.update(dt,w.game.position);w.draw()},delta);
 const state=await page.evaluate(()=>{const g=(window as any).game;return {pixels:g.combatView.inspectElemental(),hits:g.combat.hits,children:g.combat.childShots,shots:g.combat.projectiles.filter((s:any)=>s.active).map((s:any)=>({hops:s.bounces,delay:s.hopDelay}))}});
 expect(state.hits).toBeGreaterThan(0);expect(state.pixels.count).toBeGreaterThan(0);expect(state.pixels.nearest).toBe(true);if(id==='thorn-scatter')expect(state.children).toBe(3);
 const row=['deep-bubble','chain-bubble','thorn-scatter','jump-thorn'].indexOf(id);expect(state.pixels.frames.every((f:number)=>Math.floor(f/8)===row)).toBe(true);
 if(id==='jump-thorn')expect(state.pixels.frames.every((f:number)=>f===24||f===25)).toBe(true);
 for(const viewport of [{width:844,height:390},{width:568,height:320}]){await page.setViewportSize(viewport);await page.evaluate(()=>(window as any).draw());await page.screenshot({path:'artifacts/fusion-'+id+'-'+viewport.width+'.png'});}
 await page.locator('#pause').tap();const before=await page.evaluate(()=>(window as any).freeze());await page.waitForTimeout(100);expect(await page.evaluate(()=>(window as any).freeze())).toBe(before);
 await page.locator('#resume').tap();await page.evaluate(()=>{const w=window as any;w.game.sleep();w.game.combat.hp=0;w.game.step(1/60);w.draw()});
 expect(await page.evaluate(()=>(window as any).game.combatView.inspectElemental().count)).toBe(0);
 expect(await page.evaluate(()=>(window as any).game.combat.projectiles.filter((s:any)=>s.active).length)).toBe(0);
 await page.locator('#gameover-restart').tap();await page.evaluate(()=>(window as any).game.sleep());
 expect(await page.evaluate(()=>(window as any).game.combat.fusions)).toEqual([]);expect(await page.evaluate(()=>(window as any).game.combatView.inspectElemental().count)).toBe(0);expect(errors).toEqual([]);
});

test('missing elemental textures and icons preserve procedural effects, readable cards and damage',async({page})=>{
 await page.route('**/assets/pixel/skills/fusions/*.png',r=>r.abort());await open(page,'paopaoyuan');await page.evaluate(()=>(window as any).game.sleep());
 await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspectElemental()?.failed)).toBe(true);await learn(page,'area');await page.evaluate(()=>(window as any).impact());
 expect(await page.evaluate(()=>(window as any).game.combat.hits)).toBeGreaterThan(0);expect(await page.evaluate(()=>(window as any).game.combatView.burstRings.count)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).game.combatView.inspectElemental().count)).toBe(0);await expect(page.locator('#fusion-title')).toContainText('深海泡影');
});

test('changing only visual FPS preserves actual combat state; repeated starts reuse the elemental GPU batch',async({page})=>{
 await open(page,'paopaoyuan');await page.evaluate(()=>(window as any).game.sleep());await expect.poll(()=>page.evaluate(()=>(window as any).game.combatView.inspectElemental()?.loaded)).toBe(true);
 await learn(page,'area');
 const parity=await page.evaluate(()=>{const w=window as any,g=w.game,run=()=>{g.combat.reset();g.combat.grantUpgrade('area');w.impact();for(let i=0;i<6;i++){g.combat.update(.02,g.position);w.draw()}return JSON.stringify({hp:g.combat.enemies.filter((e:any)=>e.active).map((e:any)=>e.hp),shots:g.combat.projectiles.filter((s:any)=>s.active),effects:g.combat.effects.filter((e:any)=>e.active).map((e:any)=>[e.time,e.duration,e.kind]),slow:g.combat.enemies.filter((e:any)=>e.active).map((e:any)=>e.slowTime)})};
  const a=run();w.clips['deep-bubble'].flightFPS=48;w.clips['deep-bubble'].impactFPS=48;const b=run();return {a,b};});
 expect(parity.a).toBe(parity.b);
 const reuse=await page.evaluate(()=>{const g=(window as any).game,batch=g.combatView.fusionPixels,texture=batch.mesh.material.map;for(let i=0;i<8;i++){g.start('classic',true,false,'fusion');g.sleep()}return {same:batch===g.combatView.fusionPixels,texture:texture===g.combatView.fusionPixels.mesh.material.map,count:batch.mesh.count,capacity:batch.inspect().capacity};});
 expect(reuse).toEqual({same:true,texture:true,count:0,capacity:120});
});
