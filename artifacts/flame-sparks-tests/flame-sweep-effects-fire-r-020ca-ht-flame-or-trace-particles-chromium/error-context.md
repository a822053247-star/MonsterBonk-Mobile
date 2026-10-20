# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flame-sweep-effects.spec.ts >> fire ring stays clean with sparse point sparks and no upright flame or trace particles
- Location: tests\flame-sweep-effects.spec.ts:37:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 4
Received:   2
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic "幻兽幸存者游戏场景" [ref=e3]
  - region "游戏操作与状态":
    - generic:
      - generic:
        - generic:
          - generic:
            - generic:
              - strong: 焰绒
              - generic: 1级
            - progressbar "生命值"
            - generic: 100 / 100
        - generic:
          - generic:
            - generic: 击败
            - strong: "0"
          - generic:
            - generic: 经验
            - strong: "0"
        - generic:
          - generic: 经验
          - progressbar "升级经验"
          - generic: 0 / 8
      - generic:
        - generic: 中央草场
        - strong: 00:00
        - generic: 第 1 / 6 波 · 剩余 65 秒
        - generic: 金币 0
      - generic:
        - button "画质与声音设置" [ref=e4] [cursor=pointer]
        - button "切换全屏" [ref=e10] [cursor=pointer]
        - button "暂停游戏" [ref=e13] [cursor=pointer]
    - status "火花弹 + 火焰横扫 5级。":
      - generic:
        - generic "火焰横扫"
      - generic:
        - strong: 火花弹 + 火焰横扫 5级
    - generic [ref=e16]:
      - group "虚拟摇杆：按住并拖动以移动" [ref=e17]
      - generic: 移动
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | async function open(page:Page,missing=false){
  4   |   await page.setViewportSize({width:844,height:390});
  5   |   if(missing){
  6   |     await page.route('**/flame-sweep/flame-sweep.png',route=>route.abort());
  7   |     await page.route('**/yanrong/fire-effects-sheet.normalized.png',route=>route.abort());
  8   |     await page.route('**/particles/kenney-feedback.png',route=>route.abort());
  9   |   }
  10  |   await page.route('**/sweep-effects-harness*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
  11  |     import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
  12  |     createUI(document.getElementById('app'));const g=window.game=new Game();
  13  |     window.draw=()=>{g.sleep();g.placeCamera(true);g.partyView.render(1,g.visualTime);g.combatView.render(1,g.visualTime,g.position);g.updateHUD();g.renderer.render(g.scene,g.camera)};
  14  |     window.pose=(sweepAge,ringAge)=>{g.sleep();g.combat.melee.active=true;g.combat.flameRing.active=true;g.combat.melee.age=sweepAge;g.combat.flameRing.age=ringAge;window.draw();return g.combatView.inspect().melee};
  15  |     window.arrange=()=>{
  16  |       g.sleep();const c=g.combat;c.clearWave();c.obstacles=[];c.useNavigation=false;c.automaticSpawning=false;c.invulnerability=1000;
  17  |       for(let i=0;i<4;i++)c.grantUpgrade('flame-sweep-weapon');
  18  |       g.position.set(0,0,0);g.party.syncLeader(g.position,0);
  19  |       for(const a of c.runBuild.attacks)a.cooldown=a.attackId==='flame-sweep'?0:1000;
  20  |       for(const [x,z] of [[2,0],[3.2,1.8],[3.2,-1.8],[.5,3.7],[.5,-3.7],[-3.5,0]]){
  21  |         const e=c.spawn('normal',x,z,0);e.hp=500;
  22  |       }
  23  |       c.update(1/60,g.position);c.flameRing.cooldown=0;c.update(1/60,g.position);
  24  |       document.getElementById('welcome').hidden=true;window.pose(.13,.18);
  25  |     };
  26  |   </script></body></html>`}));
  27  |   await page.goto('/sweep-effects-harness?world=fixed&meleeDev=flame-sweep');
  28  |   await page.locator('#start-fusion').click();
  29  |   await page.evaluate(()=>(window as any).game.sleep());
  30  |   await expect.poll(()=>page.evaluate(missing=>{
  31  |     const v=(window as any).game.combatView.inspect().melee;
  32  |     return missing?v?.failed&&v.assets.fire.failed&&v.assets.particles.failed:v?.loaded&&v.assets.fire.loaded&&v.assets.particles.loaded;
  33  |   },missing)).toBe(true);
  34  |   await page.evaluate(()=>(window as any).arrange());
  35  | }
  36  | 
  37  | test('fire ring stays clean with sparse point sparks and no upright flame or trace particles',async({page,browserName})=>{
  38  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  39  |   page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text())});
  40  |   await open(page);
  41  |   for(const [age,frame] of [[.03,12],[.1,13],[.2,14]]){
  42  |     const result=await page.evaluate(({age})=>{
  43  |       const w=window as any,g=w.game;w.pose(.13,age);
  44  |       const before=JSON.stringify(g.combat.inspect());w.draw();
  45  |       return {view:g.combatView.inspect().melee,unchanged:before===JSON.stringify(g.combat.inspect())};
  46  |     },{age});
  47  |     expect(result.unchanged).toBe(true);expect(result.view.assets.ringFrame).toBe(frame);
  48  |     expect(result.view.assets.fire.frames).toContain(frame);
  49  |     expect(result.view.assets.particles.frames.every((frame:number)=>frame===1)).toBe(true);
  50  |     expect(result.view.assets.sweepSparks).toBeLessThanOrEqual(5);expect(result.view.assets.ringSparks).toBe(6);
  51  |     expect(result.view.assets.particles.count).toBeGreaterThan(0);
  52  |     expect(result.view.assets.embers).toBeLessThanOrEqual(11);
> 53  |     expect(new Set(result.view.assets.particles.alpha).size).toBeGreaterThan(4);
      |                                                              ^ Error: expect(received).toBeGreaterThan(expected)
  54  |     for(const batch of [result.view.assets.fire,result.view.assets.particles]){
  55  |       expect(batch.count).toBeLessThanOrEqual(batch.capacity);
  56  |       expect(batch.alpha.every((alpha:number)=>alpha>0&&alpha<=1)).toBe(true);
  57  |     }
  58  |     if(browserName==='chromium')await page.screenshot({path:`artifacts/flame-effects-phase-${frame}.png`});
  59  |   }
  60  |   const changed=await page.evaluate(()=>{
  61  |     const w=window as any,g=w.game;w.pose(.13,.18);
  62  |     const gl=g.renderer.getContext(),count=gl.drawingBufferWidth*gl.drawingBufferHeight*4;
  63  |     const a=new Uint8Array(count),b=new Uint8Array(count);
  64  |     const assets=g.combatView.flameSweep.assets.group;
  65  |     gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);
  66  |     const withCalls=g.renderer.info.render.calls;
  67  |     assets.visible=false;g.renderer.render(g.scene,g.camera);const withoutCalls=g.renderer.info.render.calls;
  68  |     gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);
  69  |     assets.visible=true;w.draw();let changed=0;
  70  |     for(let i=0;i<count;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
  71  |     return {pixels:changed,extraCalls:withCalls-withoutCalls};
  72  |   });
  73  |   expect(changed.pixels).toBeGreaterThan(150);
  74  |   expect(changed.extraCalls).toBeGreaterThan(0);expect(changed.extraCalls).toBeLessThanOrEqual(2);
  75  |   for(const width of [844,568]){
  76  |     await page.setViewportSize({width,height:width===844?390:320});
  77  |     await page.evaluate(()=>(window as any).pose(.13,.18));
  78  |     if(browserName==='chromium')await page.screenshot({path:`artifacts/flame-effects-upgraded-${width}.png`});
  79  |   }
  80  |   expect(errors).toEqual([]);
  81  | });
  82  | 
  83  | test('atlas layers are reusable, pause with combat and clear on restart',async({page})=>{
  84  |   await open(page);
  85  |   const stable=await page.evaluate(()=>{
  86  |     const w=window as any,g=w.game;w.pose(.13,.18);
  87  |     const before=JSON.stringify(g.combat.inspect()),memory={...g.renderer.info.memory},assets=g.combatView.flameSweep.assets;
  88  |     for(let i=0;i<100;i++)w.draw();
  89  |     return {same:before===JSON.stringify(g.combat.inspect()),memoryStable:JSON.stringify(memory)===JSON.stringify(g.renderer.info.memory),sameAssets:assets===g.combatView.flameSweep.assets};
  90  |   });
  91  |   expect(stable).toEqual({same:true,memoryStable:true,sameAssets:true});
  92  |   await page.locator('#pause').click();
  93  |   const before=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  94  |   await page.evaluate(()=>{const g=(window as any).game;for(let i=0;i<120;i++)g.step(1/60)});
  95  |   expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(before);
  96  |   await page.locator('#restart').click();
  97  |   const reset=await page.evaluate(()=>{const w=window as any;w.game.sleep();w.draw();return w.game.combatView.inspect().melee.assets});
  98  |   expect(reset.fire.count).toBe(0);expect(reset.particles.count).toBe(0);
  99  | });
  100 | 
  101 | test('missing all three atlases preserves procedural fallback and real melee and ring hits',async({page})=>{
  102 |   await open(page,true);
  103 |   const result=await page.evaluate(()=>{const g=(window as any).game;return {view:g.combatView.inspect().melee,hits:g.combat.hits,shots:g.combat.shotsFired}});
  104 |   expect(result.hits).toBeGreaterThan(6);expect(result.shots).toBe(0);
  105 |   expect(result.view.fallback).toBe(true);expect(result.view.ring.fallback).toBe(true);
  106 |   expect(result.view.assets.fire.count).toBe(0);expect(result.view.assets.particles.count).toBe(0);
  107 | });
  108 | 
```