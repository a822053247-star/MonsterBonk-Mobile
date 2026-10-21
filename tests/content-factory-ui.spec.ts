import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {openTimeline} from './vfx-timeline-harness';

const directory='artifacts/content-factory';mkdirSync(directory,{recursive:true});
for(const width of [844,568]) test(`factory reward, fifth shop and actual radius lifecycle at ${width}`,async({page,browserName})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await openTimeline(page,width,width===568);
  await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;w.setup('bubble');
    // Use seeded production reward rolls, never inject an offer or replace the reward pool.
    let found=false;
    for(let seed=1;seed<500&&!found;seed++){
      c.reset();c.grantUpgrade('bubble-weapon');c.grantUpgrade('area');
      let state=seed;c.progression.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
      c.progression.gainExperience(c.progression.threshold);found=c.progression.offers.includes('tide-prism');
    }
    if(!found)throw new Error('No legal tide-prism reward');g.openUpgrade();w.draw();
  });
  const card=page.locator('.skill-card[data-skill="tide-prism"]');await expect(card).toBeVisible();await expect(card).toBeEnabled();
  await expect(card.locator('.skill-illustration')).toHaveClass(/art-loaded/);
  await expect(card).toContainText('+25%');await expect(card).toContainText('+10%');
  const layout=await card.evaluate(el=>{const r=el.getBoundingClientRect();return {right:r.right,bottom:r.bottom,width:el.clientWidth,scroll:el.scrollWidth}});
  expect(layout.right).toBeLessThanOrEqual(width);expect(layout.scroll).toBeLessThanOrEqual(layout.width+1);
  if(browserName==='chromium')await page.screenshot({path:`${directory}/upgrade-${width}.png`});
  await card.click();await expect(page.locator('#upgrade-screen')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).game.combat.runBuild.relics.includes('tide-prism'))).toBe(true);
  await page.locator('#pause').click();await expect(page.locator('#build-summary')).toContainText('潮涌棱镜');
  await page.locator('#build-relics').scrollIntoViewIfNeeded();await expect(page.locator('#build-relics')).toBeInViewport();
  if(browserName==='chromium')await page.screenshot({path:`${directory}/build-${width}.png`});
  await page.locator('#resume').click();
  // A second run exercises the actual fifth-wave boundary and normal shop purchase event.
  await page.evaluate(()=>{
    const w=window as any,g=w.game;w.setup('bubble');const c=g.combat;c.grantUpgrade('area');
    const rare=c.progression.skills.filter((s:any)=>s.category&&c.progression.canGrant(s.id));
    g.run.random=()=> (rare.findIndex((s:any)=>s.id==='tide-prism')+.01)/rare.length;
    g.run.waveIndex=4;g.run.update(g.run.definition.seconds,c,g.position);g.run.updateRest(3.5,c);g.run.coins=100;
    g.syncRunPhase();
  });
  const item=page.locator('.shop-item[data-skill="tide-prism"]');await expect(item).toBeVisible();
  await expect(item.locator('[data-upgrade-art="shop-illustration"]')).toHaveClass(/art-loaded/);
  await expect(page.locator('#shop-heading')).toContainText('第 5 波');
  await item.scrollIntoViewIfNeeded();await expect(item).toBeInViewport();
  if(browserName==='chromium')await page.screenshot({path:`${directory}/shop-${width}.png`});
  await item.locator('button').click();await expect(item).toHaveClass(/sold/);
  expect(await page.evaluate(()=>(window as any).game.combat.runBuild.rules('bubble').areaMultiplier)).toBe(1.25);
  // Resume the game, then real projectile flight/collision drives the shared VFX pools.
  await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;
    document.getElementById('shop-screen')!.hidden=true;document.getElementById('hud')!.inert=false;g.mode='playing';
    g.run.prepare=()=>{};g.run.phase='fighting';g.run.waveIndex=0;g.run.waveElapsed=0;
    for(const e of c.enemies)e.active=false;
    for(const a of c.runBuild.attacks)a.cooldown=10000;
    const t=c.spawn('normal',-5.8,3,0);t.hp=10000;
    const edge=c.spawn('normal',-5.8,5.35,0);edge.hp=10000;
    w.factoryTarget=t;w.factoryEdge=edge;
    c.fireBolts(g.position,t,15,1,10.5,0,'bubblesalamander','bubble');w.advance(.12);
  });
  if(browserName==='chromium')await page.screenshot({path:`${directory}/flight-${width}.png`});
  const hit=await page.evaluate(()=>{
    const w=window as any,c=w.game.combat;let ticks=0;while(c.hits===0&&ticks++<150)w.advance(1/120);
    const e=c.effects.find((e:any)=>e.active&&e.kind==='water');w.factoryEvent=e;
    return {radius:e?.radius,preset:e?.vfxPresetId,edge:w.factoryEdge.hp,hits:c.hits};
  });
  expect(hit.radius).toBeCloseTo(2.25);expect(hit.preset).toBe('tidal-ring');expect(hit.hits).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).advance(.08));
  const pixels=await page.evaluate(()=>(window as any).vfxPixels());expect(pixels.changed).toBeGreaterThan(10);
  if(browserName==='chromium')await page.screenshot({path:`${directory}/impact-${width}.png`});
  await page.locator('#pause').click();
  const time=await page.evaluate(()=>(window as any).factoryEvent.time);
  await page.evaluate(()=>(window as any).advance(.3));expect(await page.evaluate(()=>(window as any).factoryEvent.time)).toBe(time);
  await page.locator('#resume').click();await page.evaluate(()=>(window as any).advance(.12));
  if(browserName==='chromium')await page.screenshot({path:`${directory}/expanded-${width}.png`});
  await page.evaluate(()=>(window as any).advance(.5));
  expect(await page.evaluate(()=>(window as any).factoryEvent.active)).toBe(false);
  await page.evaluate(()=>{const w=window as any;w.setup('bubble');w.draw()});
  const reset=await page.evaluate(()=>{const w=window as any,g=w.game;return {relics:g.combat.runBuild.relics,effects:g.combat.effects.filter((e:any)=>e.active).length,reactions:g.combatView.inspect().reactions}});
  expect(reset.relics).toEqual([]);expect(reset.effects).toBe(0);expect(reset.reactions.outlines).toBe(0);expect(errors).toEqual([]);
  if(browserName==='chromium')writeFileSync(`${directory}/runtime-${width}.json`,JSON.stringify({width,quality:width===568?'battery':'high',hit,pixels,reset,errors},null,2));
});

test('missing shared VFX textures retain battle input and bounded tidal outline',async({page})=>{
  await openTimeline(page,568,true,true);
  const state=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;w.setup('bubble');c.grantUpgrade('area');c.grantUpgrade('tide-prism');
    w.cast('bubble');w.untilHit();w.advance(.1);
    return {mode:g.mode,hits:c.hits,reactions:c.effects.find((e:any)=>e.active&&e.kind==='water')?.vfxPresetId,pools:g.combatView.inspect().reactions};
  });
  expect(state.mode).toBe('playing');expect(state.hits).toBeGreaterThan(0);expect(state.reactions).toBe('tidal-ring');expect(state.pools.outlines).toBeGreaterThan(0);
});

test('dedicated PNG failure falls back to a generated pixel icon without blocking a card',async({page})=>{
  await page.route('**/assets/test-unavailable.png',r=>r.abort());
  await page.goto('/');
  await page.evaluate(async()=>{
    const {bindUpgradeArt}=await import('/src/upgrade-art.ts' as string);
    const {tidePrism}=await import('/src/content/relics/tide-prism.ts' as string);
    const root=document.createElement('div');root.id='content-icon-fallback';
    const image=document.createElement('img');image.dataset.upgradeArt='illustration';image.src='/assets/test-unavailable.png';
    root.append(image);document.body.append(root);
    bindUpgradeArt(root,[{...tidePrism,id:'test-png-relic',art:{symbol:'orb',palette:'water',png:'assets/test-unavailable.png'}}]);
  });
  const image=page.locator('#content-icon-fallback img');await expect(image).toHaveAttribute('src',/^data:image\/svg\+xml,/);
  await expect(image).toHaveClass(/art-loaded/);
});

test('tidal impact shares the fixed pools and keeps actual elite and Boss warnings legible',async({page,browserName})=>{
  test.setTimeout(60000);await openTimeline(page,568,true);
  const evidence:any[]=[];
  for(const kind of ['elite','lane','cone']){
    await page.evaluate(()=>{
      const w=window as any;w.setup('bubble');const c=w.game.combat;c.grantUpgrade('area');c.grantUpgrade('tide-prism');
      w.cast('bubble');w.untilHit();w.advance(.10);
    });
    await page.evaluate(kind=>(window as any).warning(kind),kind);
    const pixels=await page.evaluate(kind=>(window as any).warningPixels(kind),kind);
    expect(pixels.baseline).toBeGreaterThan(30);expect(pixels.ratio).toBeGreaterThan(.8);evidence.push({kind,pixels});
    if(browserName==='chromium')await page.screenshot({path:`${directory}/warning-${kind}-568.png`});
  }
  const budget=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;g.draw?.();const before={...g.renderer.info.memory};
    for(const e of c.effects)Object.assign(e,{active:true,kind:'water',time:.25,duration:.32,radius:2.25,vfxPresetId:'tidal-ring',x:-5,z:3});
    w.draw();const after={...g.renderer.info.memory};return {before,after,effects:c.effects.length,shots:c.projectiles.length,reactions:g.combatView.inspect().reactions};
  });
  expect(budget.after).toEqual(budget.before);expect(budget.reactions.outlines).toBeGreaterThan(0);expect(budget.reactions.outlines).toBeLessThanOrEqual(budget.effects);
  expect(budget.reactions.outlines).toBeLessThanOrEqual(budget.reactions.outlineCapacity);
  if(browserName==='chromium')writeFileSync(`${directory}/budgets-warnings.json`,JSON.stringify({evidence,budget},null,2));
});
