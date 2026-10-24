import {test,expect} from '@playwright/test';

for(const phone of [false,true])test(`four colored salvos stay readable with star rain, preserve low-quality hits and clear (${phone?'phone':'desktop'})`,async({page})=>{
  test.setTimeout(60_000);await page.setViewportSize(phone?{width:844,height:390}:{width:1280,height:720});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/colored-barrage-harness*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI,renderUpgradeCards} from '/src/ui.ts';import {Game} from '/src/game.ts';
    import {COLORED_BARRAGE_IDS} from '/src/colored-barrage.ts';import {upgradeArt} from '/src/upgrade-art.ts';
    import {shopArt} from '/src/shop-art.ts';
    createUI(document.getElementById('app'));window.game=new Game();window.ids=COLORED_BARRAGE_IDS;window.renderCards=renderUpgradeCards;window.art=upgradeArt;window.shopArt=shopArt;
  </script>`}));
  await page.goto('/colored-barrage-harness?world=fixed');await page.waitForFunction(()=>!!(window as any).game);
  await page.locator('#start-fusion').click();await page.waitForFunction(()=>!(window as any).game.sceneLoading);
  await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;g.sleep();g.wake=()=>{};c.clearWave();c.obstacles=[];c.captureSpawnRoll=()=>false;
    g.position.set(0,0,0);g.previousPosition.copy(g.position);c.anchorX=c.anchorZ=0;g.party.syncLeader(g.position,0);g.placeCamera(true);
    document.getElementById('welcome')!.hidden=true;c.automaticSpawning=false;
    for(let i=0;i<18;i++){const a=i/18*Math.PI*2,e=c.spawn('normal',Math.sin(a)*9,Math.cos(a)*9,0);e.spawnTime=0;e.hp=1000;}
    w.draw=()=>{g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.renderer.render(g.scene,g.camera);};
    for(const id of w.ids)c.coloredBarrages.cast(id,3);
    c.areaAttacks.castBarrage('ring',24,1);c.areaAttacks.update(.3,0,1);c.coloredBarrages.update(.3,{},1);g.combatView.detail=4;w.draw();
  });
  const high=await page.evaluate(()=>(window as any).game.combatView.inspect().coloredBarrages);
  expect(high.batches.map((b:any)=>b.id)).toHaveLength(4);
  for(const b of high.batches)expect(b.cores).toBeGreaterThan(0);
  const total=high.batches.reduce((n:number,b:any)=>n+b.cores,0);expect(total).toBeLessThanOrEqual(64);
  expect(high.batches.reduce((n:number,b:any)=>n+b.trails,0)).toBe(0);
  await page.screenshot({path:`artifacts/colored-barrages-combined-${phone?'phone':'desktop'}.png`});
  const result=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat,before=JSON.stringify(c.coloredBarrages.inspect()),memory={...g.renderer.info.memory};
    g.combatView.detail=2;w.draw();const low=g.combatView.inspect().coloredBarrages;
    g.pause('弹幕验证');for(let i=0;i<120;i++)g.step(1/60);const frozen=before===JSON.stringify(c.coloredBarrages.inspect());
    g.combatView.clear();const viewCleared=g.combatView.inspect().coloredBarrages.batches.every((b:any)=>!b.cores&&!b.trails);
    c.clearTransientEffects();w.draw();return{low,frozen,viewCleared,memoryStable:JSON.stringify(memory)===JSON.stringify(g.renderer.info.memory),active:c.coloredBarrages.inspect().activeShots};
  });
  expect(result.low.batches.map((b:any)=>b.cores)).toEqual(high.batches.map((b:any)=>b.cores));
  expect(result).toMatchObject({frozen:true,viewCleared:true,memoryStable:true,active:0});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{const w=window as any,g=w.game;g.combat.coloredBarrages.cast('arc-barrage',1);g.combatView.detail=4;w.draw();});
  await expect.poll(()=>page.evaluate(()=>{const w=window as any;w.draw();return w.game.combatView.inspect().coloredBarrages.batches.find((b:any)=>b.id==='arc-barrage');})).toMatchObject({cores:6,trails:0});
  const impact=await page.evaluate(()=>{
    const w=window as any,g=w.game,c=g.combat;c.clearWave();c.coloredBarrages.clear();
    const e=c.spawn('tank',0,3,0);e.spawnTime=0;e.hp=1000;c.coloredBarrages.cast('frost-barrage',1);c.coloredBarrages.update(.2,{},1);w.draw();
    const glints=g.combatView.inspect().coloredBarrages.hitGlints;
    c.clearTransientEffects();g.combatView.clear();return{glints,cleared:g.combatView.inspect().coloredBarrages.hitGlints};
  });
  expect(impact.glints).toBeGreaterThan(0);expect(impact.glints).toBeLessThanOrEqual(24);expect(impact.cleared).toBe(0);
  for(const ids of [['frost-barrage','leaf-barrage','arc-barrage'],['rose-barrage']]){
    await page.evaluate(ids=>{
      const w=window as any,g=w.game,p=g.combat.progression;g.mode='upgrading';p.currentOffers=ids;p.pendingChoices=1;
      document.getElementById('pause-screen')!.hidden=true;document.getElementById('upgrade-screen')!.hidden=false;w.renderCards(p,27);
    },ids);
    for(const id of ids){
      const card=page.locator(`[data-skill="${id}"]`);await expect(card).toBeVisible();
      const image=card.locator('.skill-illustration');await expect(image).toHaveAttribute('src',new RegExp(`${id}\\.webp$`));
      await expect.poll(()=>image.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth===256)).toBe(true);
      const shopImage=await page.evaluate(id=>{const w=window as any;return w.shopArt({kind:'reward',skill:id,title:id,benefit:'',price:10,sold:false},w.game.combat).images[0];},id);
      expect(shopImage).toMatch(new RegExp(`card-art/upgrade/illustrations/skills/${id}\\.webp$`));
    }
    if(ids.length===3)await page.screenshot({path:`artifacts/colored-barrages-cards-${phone?'phone':'desktop'}.png`});
  }
  expect(errors).toEqual([]);
});
