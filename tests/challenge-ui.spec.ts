import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../src/game';
const state=(page:Page)=>page.evaluate(()=>(window as unknown as {game:Game}).game?.inspect());
type Fixture={finishWave:()=>void;finishRun:()=>void;level:()=>void;lose:()=>void;autoplay:()=>ReturnType<Game['inspect']>};
test.use({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{
  await page.route('**/challenge-harness',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    const draw=()=>{g.updateHUD();g.monster.root.position.copy(g.position);g.monster.animate(0,0,false,g.elapsed);g.placeCamera(true);g.combatView.render(1,g.elapsed,g.position);g.renderer.render(g.scene,g.camera)};
    window.finishWave=()=>{g.sleep();const wave=g.challenge.wave;for(let i=0;i<1200&&g.mode!=='gameover'&&g.challenge.wave===wave&&g.challenge.phase!=='rest';i++){
      if(g.mode==='upgrading'){g.chooseUpgrade(g.combat.progression.offers[0]);g.sleep();}g.step(1/60);
      for(const e of g.combat.enemies)if(e.active&&e.spawnTime===0)g.combat.damageEnemy(e,e.hp,1,0);
    }draw()};
    window.finishRun=()=>{g.sleep();for(let i=0;i<5000&&g.mode!=='gameover';i++){
      if(g.mode==='upgrading'){g.chooseUpgrade(g.combat.progression.offers[0]);g.sleep();}g.step(1/60);
      for(const e of g.combat.enemies)if(e.active&&e.spawnTime===0)g.combat.damageEnemy(e,e.hp,1,0);
    }draw()};
    window.level=()=>{g.combat.progression.gainExperience(8);g.step(1/60)};
    window.lose=()=>{g.combat.hp=0;g.step(1/60);draw()};
    window.autoplay=()=>{g.start('horn-challenge');g.sleep();let seed=606;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);g.combat.random=g.combat.progression.random=random;for(let tick=0;tick<10800&&g.mode!=='gameover';tick++){
      if(g.mode==='upgrading'){g.chooseUpgrade(g.combat.progression.offers[0]);g.sleep();}
      const enemies=g.combat.enemies.filter(e=>e.active).sort((a,b)=>Math.hypot(a.x-g.position.x,a.z-g.position.z)-Math.hypot(b.x-g.position.x,b.z-g.position.z));
      const e=enemies[0];g.input.keys.clear();if(e){const dx=e.x-g.position.x,dz=e.z-g.position.z,distance=Math.hypot(dx,dz);if(Math.abs(dx)>.15)g.input.keys.add(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.15)g.input.keys.add(dz>0?'KeyS':'KeyW');if(e.spawnTime===0&&distance<3.5&&g.cooldown===0)g.input.dashQueued=true;}
      g.step(1/60);
    }draw();return g.inspect()};
  </script></body></html>`}));
  await page.goto('/challenge-harness');await page.waitForFunction(()=>'game' in window);
  await expect.poll(async()=>(await state(page))?.creature.model?.loaded).toBe(true);
});

test('challenge clears three finite waves into victory, freezes, retries, and preserves classic defeat text',async({page},info)=>{
  await page.locator('#start-challenge').tap();expect((await state(page)).ruleset).toBe('horn-challenge');
  expect((await state(page)).creature.equipped.head).toBe('charge-horns');
  await page.evaluate(()=>(window as unknown as Fixture).finishRun());
  const won=await state(page);expect(won.outcome).toBe('victory');expect(won.combat.kills).toBe(15);expect(won.challenge).toMatchObject({wave:3,phase:'won',stars:1});
  await expect(page.locator('#result-heading')).toHaveText('三波挑战，通关！');await expect(page.locator('#result-challenge')).toContainText('★☆☆');
  await page.waitForTimeout(200);expect(await state(page)).toEqual(won);
  if(info.project.name==='chromium')await page.screenshot({path:'artifacts/challenge-victory.png'});
  await page.locator('#gameover-restart').tap();expect((await state(page)).challenge).toMatchObject({wave:1,remaining:4,defeated:0});expect((await state(page)).outcome).toBeNull();
  await page.locator('#pause').tap();await page.locator('#back-menu').tap();await page.locator('#start').tap();
  expect((await state(page)).challenge).toBeUndefined();await page.evaluate(()=>(window as unknown as Fixture).lose());
  expect((await state(page)).outcome).toBe('defeat');await expect(page.locator('#result-heading')).toHaveText('小火焰，休息一下。');await expect(page.locator('#result-challenge')).toBeHidden();
});

test('wave break, three-choice upgrades, pause and background freeze the director',async({page})=>{
  await page.locator('#start-challenge').tap();await page.evaluate(()=>(window as unknown as Fixture).finishWave());
  expect((await state(page)).challenge).toMatchObject({wave:1,phase:'rest',restTime:3});
  await expect(page.locator('#trial-title')).toContainText('本波完成');
  await page.evaluate(()=>(window as unknown as Fixture).level());await expect(page.locator('#upgrade-screen')).toBeVisible();
  const upgraded=await state(page);await page.waitForTimeout(220);expect(await state(page)).toEqual(upgraded);
  await page.locator('.skill-card').first().tap();await expect(page.locator('#upgrade-screen')).toBeHidden();
  await page.locator('#pause').tap();const paused=await state(page);await page.waitForTimeout(200);expect(await state(page)).toEqual(paused);
  await page.locator('#resume').tap();await expect.poll(async()=>(await state(page)).challenge?.wave,{timeout:8000}).toBe(2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
  const background=await state(page);expect(background.mode).toBe('paused');await page.waitForTimeout(200);expect(await state(page)).toEqual(background);
});

test('new entry, wave HUD and victory controls fit two phone landscape safe areas',async({page},info)=>{
  for(const viewport of [{width:844,height:390},{width:568,height:320}]){
    await page.setViewportSize(viewport);await page.addStyleTag({content:':root{--safe-left:44px;--safe-right:44px;--safe-bottom:21px}'});
    for(const id of ['start-trial','start-challenge']){const box=(await page.locator('#'+id).boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width-44);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height-21);expect(box.height).toBeGreaterThanOrEqual(44);}
    await page.locator('#start-challenge').tap();const hud=(await page.locator('#trial-status').boundingBox())!,joystick=(await page.locator('#joystick').boundingBox())!;expect(hud.y+hud.height).toBeLessThanOrEqual(joystick.y);
    await page.evaluate(()=>(window as unknown as Fixture).finishRun());
    const panel=(await page.locator('.result-card').boundingBox())!;expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.y+panel.height).toBeLessThanOrEqual(viewport.height-21);
    for(const id of ['gameover-restart','gameover-menu']){const box=(await page.locator('#'+id).boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height-21);expect(box.x).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width-44);}
    if(info.project.name==='chromium')await page.screenshot({path:'artifacts/challenge-victory-'+viewport.width+'.png'});
    await page.locator('#gameover-menu').tap();
  }
});

test('real movement, auto attacks, dash damage and normal upgrades can complete the encounter without forced kills',async({page},info)=>{
  await page.locator('#start-challenge').tap();
  const result=await page.evaluate(()=>(window as unknown as Fixture).autoplay());
  console.log('challenge simulated playthrough:',JSON.stringify({outcome:result.outcome,time:result.elapsed,hp:result.combat.hp,kills:result.combat.kills,horns:result.combat.trial?.hits,interrupts:result.combat.trial?.interrupts,level:result.combat.progression.level}));
  expect(result.outcome).toBe('victory');expect(result.combat.kills).toBe(15);expect(result.combat.trial!.hits).toBeGreaterThan(0);expect(result.combat.progression.level).toBeGreaterThan(1);
  if(info.project.name==='chromium')await page.screenshot({path:'artifacts/challenge-simulated-victory.png'});
});
