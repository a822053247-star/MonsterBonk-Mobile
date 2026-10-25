import {test,expect} from '@playwright/test';

test('trial and capture notices stay readable below the live timer on desktop and phones',async({page},info)=>{
  test.setTimeout(60000);
  await page.route('**/hud-notice-harness',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
    import '/src/style.css';import {createUI} from '/src/ui.ts';import {AltarTrial} from '/src/altar-trial.ts';
    import {CaptureHUD} from '/src/capture-hud.ts';import {Combat} from '/src/combat.ts';import {PartySystem} from '/src/party.ts';
    createUI(document.getElementById('app'));document.getElementById('menu').hidden=true;document.getElementById('hud').hidden=false;
    document.getElementById('welcome').hidden=true;
    document.getElementById('run-wave').hidden=false;document.getElementById('run-wave').textContent='第 13 波';
    document.getElementById('region-status').hidden=false;document.getElementById('region-status').textContent='永恒雪原';
    document.getElementById('timer').textContent='12:59';
    const c=new Combat();c.fusionEnabled=true;c.party=new PartySystem();c.reset();
    const trial=new AltarTrial(()=>{}),capture=new CaptureHUD(()=>{},()=>{});capture.root.hidden=false;
    let player;
    window.prepare=()=>{
      capture.clearNotice();trial.reset();trial.offer(c);player={x:trial.origin.x,z:trial.origin.z+10};
      for(let i=0;i<100;i++){const previous={...player};player.z-=.1;trial.resolveEntrance(player,previous);}
      trial.render(true,c,player,1,trial.group.quaternion,4);return trial.canActivate(player);
    };
    window.startTrial=()=>{const started=trial.start(c,player,{x:player.x,z:player.z,halfWidth:10,halfDepth:6});trial.render(true,c,player,1,trial.group.quaternion,4);return started;};
    window.showCapture=()=>{capture.showSuccess('normal',true);capture.step(.2);};
    window.layout=()=>{trial.render(true,c,player,1,trial.group.quaternion,4);capture.step(.001);};
    window.ready=true;</script></body></html>`}));
  await page.goto('/hud-notice-harness');await page.waitForFunction(()=>(window as any).ready);
  const clock=page.locator('.run-status'),prompt=page.locator('.altar-trial'),button=prompt.locator('button'),label=page.locator('.altar-trial-label');
  const capture=page.locator('.capture-success-notice');
  for(const viewport of [{width:1280,height:720},{width:844,height:390},{width:568,height:320}]){
    await page.setViewportSize(viewport);
    await clock.evaluate(e=>{(e as HTMLElement).style.minHeight='';});
    expect(await page.evaluate(()=>(window as any).prepare())).toBe(true);
    await expect(button).toContainText('E 开启');
    expect(await button.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(20);
    let clockBox=(await clock.boundingBox())!,promptBox=(await prompt.boundingBox())!;
    expect(promptBox.y-clockBox.y-clockBox.height).toBeGreaterThanOrEqual(26);
    expect(await page.evaluate(()=>(window as any).startTrial())).toBe(true);
    await expect(label).toHaveText('禁止冲刺');
    expect(await label.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(22);
    await page.evaluate(()=>(window as any).showCapture());
    await expect(capture.locator('strong')).toHaveText('已捕捉到幻兽囚坊');
    expect(await capture.locator('strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(20);
    promptBox=(await prompt.boundingBox())!;const noticeBox=(await capture.boundingBox())!;
    expect(noticeBox.y).toBeGreaterThanOrEqual(promptBox.y+promptBox.height+16);
    expect(noticeBox.x).toBeGreaterThanOrEqual(0);expect(noticeBox.x+noticeBox.width).toBeLessThanOrEqual(viewport.width);
    expect(noticeBox.y+noticeBox.height).toBeLessThanOrEqual(viewport.height-8);
    await page.screenshot({path:info.outputPath(`notices-${viewport.width}.png`)});
    if(viewport.width===1280){
      await clock.evaluate(e=>{(e as HTMLElement).style.minHeight='140px';});await page.evaluate(()=>(window as any).layout());
      clockBox=(await clock.boundingBox())!;promptBox=(await prompt.boundingBox())!;
      expect(promptBox.y-clockBox.y-clockBox.height).toBeGreaterThanOrEqual(26);
      expect((await capture.boundingBox())!.y).toBeGreaterThanOrEqual(promptBox.y+promptBox.height+16);
    }
  }
});
