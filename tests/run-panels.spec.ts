import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/run-panels-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
    createUI(document.getElementById('app'));const g=window.game=new Game();
    window.showRunPanel=(kind,rich=true)=>{
      g.sleep();g.combat.clearWave();
      if(rich)for(const id of ['spark-weapon','spark-weapon','flame-sweep-weapon','flame-sweep-weapon','flame-sweep-weapon','flame-sweep-weapon','bubble-weapon','bubble-weapon','damage','haste','orbit','shockwave','split-on-hit','area','chain','draft-martyr-core','draft-boiling-core','pursuit-route','echo-rune'])
        if(!g.combat.grantUpgrade(id))throw new Error('Invalid fixture upgrade: '+id);
      g.combat.kills=1012;g.combat.progression.totalExperience=449;g.run.waveIndex=4;g.run.completedWaves=4;g.run.combatElapsed=307;g.run.earned=412;g.combat.relicTelemetry.chainKills=186;g.combat.relicTelemetry.steamBursts=24;
      g.updateHUD();
      if(kind==='pause')g.pause('冒险已暂停，准备好后继续出发。');
      else {g.combat.hp=0;g.run.finish(g.combat,false);g.endRun('defeat');}
      g.sleep();
    };
  </script></body></html>`}));
});

const cases=[
  {name:'4k',width:3840,height:1907},
  {name:'desktop',width:1920,height:1080},
  {name:'laptop',width:1280,height:720},
  {name:'phone',width:844,height:390},
  {name:'small-safe',width:568,height:320,safe:true},
];
for(const viewport of cases)for(const kind of ['pause','result'])test(`${kind} remains readable and operable at ${viewport.name}`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize(viewport);
  await page.goto('/run-panels-harness?world=fixed');
  await page.locator('#start-fusion').click();
  await page.evaluate(kind=>(window as any).showRunPanel(kind),kind);
  if(viewport.safe)await page.evaluate(()=>{
    document.documentElement.style.setProperty('--safe-left','44px');document.documentElement.style.setProperty('--safe-right','44px');document.documentElement.style.setProperty('--safe-bottom','21px');
  });
  const screen=page.locator(kind==='pause'?'#pause-screen':'#gameover-screen');
  await expect(screen).toBeVisible();
  const card=screen.locator('.modal'), bounds=(await card.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(viewport.safe?44:0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width-(viewport.safe?44:0));
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height-(viewport.safe?21:0));
  expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const build=screen.locator('.build-summary');
  expect(await build.locator('.build-weapon-copy strong').count()).toBe(3);
  expect(await build.locator('.build-weapon-copy strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17);
  expect(await build.locator('p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  if(viewport.name==='4k')expect(await build.locator('.build-weapon-copy strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(30);
  const primary=page.locator(kind==='pause'?'#resume':'#gameover-restart');
  await expect(primary).toBeInViewport();expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const snapshot=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  await page.evaluate(()=>{(window as any).game.step(1);});
  expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(snapshot);
  await expect(build.locator('img').first()).toHaveClass(/art-loaded/);
  if(info.project.name==='chromium'&&['desktop','phone'].includes(viewport.name))await page.screenshot({path:`artifacts/run-panels-${kind}-${viewport.name}.png`});
  if(kind==='pause') {
    await build.evaluate(el=>el.scrollTop=el.scrollHeight);
    await expect(page.locator('#build-evolution')).toBeInViewport();
  } else {
    await page.locator('.result-body').evaluate(el=>el.scrollTop=el.scrollHeight);
    await expect(page.locator('#result-relics')).toBeInViewport();
    await expect(page.locator('#result-kills')).toHaveText('1012');
  }
  await expect(primary).toBeInViewport();
  await primary.focus();await page.keyboard.press('Enter');
  await expect(screen).toBeHidden();
  expect(errors).toEqual([]);
});

test('starter build and missing weapon images retain clear text and fallback symbols',async({page})=>{
  await page.setViewportSize({width:844,height:390});
  await page.route('**/assets/ui/upgrade/illustrations/**',route=>route.abort());
  await page.goto('/run-panels-harness?world=fixed');await page.locator('#start-fusion').click();
  await page.evaluate(()=>(window as any).showRunPanel('pause',false));
  await expect(page.locator('#build-weapons')).toContainText('火花弹 1级');
  await expect(page.locator('.build-weapon-art>.icon')).toBeVisible();
  await expect(page.locator('#build-relics')).toContainText('尚未获得');
  await page.locator('#resume').click();await expect(page.locator('#pause-screen')).toBeHidden();
});
