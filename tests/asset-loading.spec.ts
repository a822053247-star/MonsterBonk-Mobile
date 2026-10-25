import {test,expect} from '@playwright/test';

test('unused skill atlases stay idle and a selected skill is prepared before its first draw',async({page})=>{
  const requested:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/blade-weapons/'))requested.push(r.url());});
  await page.route('**/loading-assets-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><div id="app"></div><script type="module">
    import {Combat} from '/src/combat.ts';import {CombatView} from '/src/combat-view.ts';import {PartySystem} from '/src/party.ts';
    const c=window.combat=new Combat();c.fusionEnabled=true;c.party=new PartySystem();c.reset();
    window.view=new CombatView(c);window.ready=true;</script>`}));
  await page.goto('/loading-assets-harness');await page.waitForFunction(()=>(window as any).ready);
  expect(requested).toHaveLength(0);
  await page.evaluate(()=>{const w=window as any;w.view.preloadSkillAssets(['thorn-wheel-weapon']);});
  await expect.poll(()=>page.evaluate(()=>(window as any).view.inspect().blades.atlases.filter((a:any)=>a.name.includes('thorn')).every((a:any)=>a.loaded))).toBe(true);
  expect(requested).toHaveLength(2);expect(requested.every(url=>url.includes('thorn'))).toBe(true);
  const count=await page.evaluate(()=>{
    const w=window as any,c=w.combat;c.grantUpgrade('thorn-wheel-weapon');c.automaticSpawning=false;
    for(const attack of c.runBuild.attacks)attack.cooldown=0;
    c.update(.01,{x:0,z:0});c.blades.update(.1);w.view.render(1,0);
    const count=w.view.inspect().blades.atlases.reduce((n:number,a:any)=>n+a.count,0);w.view.dispose();return count;
  });
  expect(count).toBeGreaterThan(0);
});

test('three upgrade illustrations recover after one failed request without changing offers',async({page,browserName},testInfo)=>{
  test.setTimeout(60000);
  if(browserName==='chromium'){
    const network=await page.context().newCDPSession(page);
    await network.send('Network.enable');
    await network.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:512*1024,uploadThroughput:128*1024});
  }
  const attempts=new Map<string,number>();
  await page.route('**/assets/ui/card-art/**/*.webp',async route=>{
    const url=route.request().url(),n=(attempts.get(url)??0)+1;attempts.set(url,n);
    if(n===1)await route.abort();else{await new Promise(resolve=>setTimeout(resolve,150));await route.continue();}
  });
  await page.route('**/loading-cards-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI,renderUpgradeCards} from '/src/ui.ts';
    import {Progression} from '/src/progression.ts';import {RunBuild} from '/src/run-build.ts';
    import {preloadUpgradeImages,upgradeImageUrls} from '/src/upgrade-art.ts';
    createUI(document.getElementById('app'));const p=window.progression=new Progression();p.reset(true);p.build=new RunBuild();p.build.reset('yanrong');
    p.currentOffers=['ice-radiance','thorn-wheel-weapon','spark-weapon'];p.pendingChoices=1;
    window.urls=upgradeImageUrls(p,p.offers);renderUpgradeCards(p,1);
    document.getElementById('menu').hidden=true;document.getElementById('upgrade-screen').hidden=false;
    window.warm=()=>preloadUpgradeImages(window.urls);window.ready=true;</script>`}));
  await page.goto('/loading-cards-harness');await page.waitForFunction(()=>(window as any).ready);
  await expect(page.locator('.skill-illustration.art-loaded')).toHaveCount(3);
  const timings=await page.locator('.skill-illustration').evaluateAll(images=>images.map(image=>({url:(image as HTMLImageElement).src,displayMs:(image as HTMLElement).dataset.artDisplayMs})));
  await testInfo.attach('card-display-timings',{body:JSON.stringify(timings,null,2),contentType:'application/json'});
  const before=await page.evaluate(()=>[...(window as any).progression.offers]);
  await page.evaluate(()=>(window as any).warm());
  expect(await page.evaluate(()=>[...(window as any).progression.offers])).toEqual(before);
  expect([...attempts.values()].every(n=>n<=3)).toBe(true);
});
