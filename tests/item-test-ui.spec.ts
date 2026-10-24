import {test,expect} from '@playwright/test';
const skills=['screen-barrage','frost-barrage','leaf-barrage','arc-barrage','rose-barrage'];
for(const phone of [false,true])test(`item test selector and five isolated playable skills (${phone?'phone':'desktop'})`,async({page})=>{
  test.setTimeout(90_000);await page.setViewportSize(phone?{width:844,height:390}:{width:1280,height:720});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/item-test-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';createUI(document.getElementById('app'));window.game=new Game();</script>`}));
  await page.goto('/item-test-harness?world=fixed');await page.waitForFunction(()=>!!(window as any).game);
  await page.locator('#open-item-test').click();await expect(page.locator('#item-test-picker')).toBeVisible();
  await expect(page.locator('[data-test-skill]')).toHaveCount(5);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('.item-test-option img')).every(i=>i.complete&&i.naturalWidth>0));
  const boxes=await page.locator('.item-test-panel,#start-item-test,#item-test-level').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
  for(const b of boxes){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(phone?844:1280);expect(b.bottom).toBeLessThanOrEqual(phone?390:720);}
  await page.screenshot({path:`artifacts/item-test-selector-${phone?'phone':'desktop'}.png`});
  await page.keyboard.press('Escape');await expect(page.locator('#item-test-picker')).toBeHidden();
  expect(await page.locator('#menu').evaluate(e=>(e as HTMLElement).inert)).toBe(false);
  await page.locator('#open-item-test').click();
  for(const skill of skills){
    await page.locator(`[data-test-skill="${skill}"]`).click();await expect(page.locator(`[data-test-skill="${skill}"]`)).toHaveAttribute('aria-pressed','true');
    await page.locator('#item-test-level').selectOption('3');await page.locator('#start-item-test').click();
    await page.waitForFunction(()=>!(window as any).game.sceneLoading);
    const result=await page.evaluate(skills=>{
      const g=(window as any).game,c=g.combat;g.sleep();g.wake=()=>{};
      for(let i=0;i<210;i++)g.step(1/60);
      g.updateHUD();g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);
      return{mode:g.mode,test:g.inspect().itemTest,run:!!g.run,enemyTest:!!g.enemyTest,capture:!!g.capture,
        ranks:skills.map(id=>c.progression.ranks[id]),baseShots:c.shotsFired,active:c.enemies.filter((e:any)=>e.active).length,
        choices:c.progression.awaitingChoice,gold:c.goldEarned,cast: c.areaAttacks.telemetry.casts+c.coloredBarrages.telemetry.casts};
    },skills);
    expect(result).toMatchObject({mode:'playing',test:{skill,rank:3},run:false,enemyTest:false,capture:false,baseShots:0,choices:false,gold:0});
    expect(result.ranks).toEqual(skills.map(id=>id===skill?3:0));expect(result.active).toBeGreaterThan(0);expect(result.active).toBeLessThanOrEqual(12);expect(result.cast).toBeGreaterThan(0);
    await expect(page.locator('#item-test-controls')).toBeVisible();
    if(skill==='screen-barrage')await page.screenshot({path:`artifacts/item-test-playing-${phone?'phone':'desktop'}.png`});
    await page.locator('#item-test-live-level').selectOption('1');
    expect(await page.evaluate(()=>(window as any).game.inspect().itemTest)).toEqual({skill,rank:1});
    await page.locator('#switch-item-test').click();await expect(page.locator('#item-test-picker')).toBeVisible();
    expect(await page.evaluate(()=>(window as any).game.mode)).toBe('menu');
  }
  await page.locator('#close-item-test').click();await page.locator('#start-fusion').click();
  expect(await page.evaluate(()=>({test:(window as any).game.inspect().itemTest,run:!!(window as any).game.run}))).toEqual({test:null,run:true});
  await expect(page.locator('#item-test-controls')).toBeHidden();expect(errors).toEqual([]);
});
