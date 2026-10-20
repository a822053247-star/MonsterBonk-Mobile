# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flame-sweep-ui.spec.ts >> all eight equal cells decode transparently and retain a luminous base at the shared pixel anchor
- Location: tests\flame-sweep-ui.spec.ts:145:1

# Error details

```
Error: page.evaluate: EncodingError: Loading was canceled.
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - generic "幻兽幸存者游戏场景" [ref=f1e3]
  - region "主菜单" [ref=f1e4]:
    - generic [ref=f1e5]: 幻兽幸存者
    - generic [ref=f1e10]:
      - generic [ref=f1e11]: 小小怪兽，大大冒险
      - heading "幻兽 幸存者" [level=1] [ref=f1e13]: 幻兽幸存者
      - paragraph [ref=f1e15]: 焰绒出战 · 自动攻击，升级强化。
      - generic [ref=f1e16]:
        - button "开始挑战" [ref=f1e17] [cursor=pointer]
        - button "选择出战幻兽，当前焰绒" [ref=f1e20] [cursor=pointer]: 选择幻兽
        - button "操作指南" [ref=f1e21] [cursor=pointer]
        - button "画质与声音设置" [ref=f1e26] [cursor=pointer]
      - generic [ref=f1e32]:
        - button "随机草场冒险" [ref=f1e33] [cursor=pointer]
        - button "三兽编队原型 兼容" [ref=f1e34] [cursor=pointer]
      - generic [ref=f1e35]: 摇杆或方向键移动 · 自动攻击
    - generic:
      - generic:
        - strong: 焰绒
      - generic: ✧
    - generic "旧版兼容回归入口" [ref=f1e37]:
      - button "单兽回归 旧版" [ref=f1e38] [cursor=pointer]:
        - text: 单兽回归
        - generic [ref=f1e39]: 旧版
      - generic [ref=f1e40]:
        - button "犄角试炼 旧版 · 自由练习" [ref=f1e41] [cursor=pointer]:
          - text: 犄角试炼
          - generic [ref=f1e44]: 旧版 · 自由练习
        - button "三波闯关 旧版 · 赢取星级" [ref=f1e45] [cursor=pointer]:
          - text: 三波闯关
          - generic [ref=f1e48]: 旧版 · 赢取星级
```

# Test source

```ts
  47  |   expect(moved).toEqual([roots[0][0]+1,roots[0][1],roots[0][2]-.5]);
  48  |   await page.locator('#pause').click();
  49  |   const before=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  50  |   await page.evaluate(()=>{for(let i=0;i<120;i++)(window as any).game.step(1/60)});
  51  |   expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(before);
  52  |   await page.locator('#restart').click();await page.evaluate(()=>(window as any).game.sleep());
  53  |   expect(await page.evaluate(()=>{const w=window as any;return {same:w.visual===w.game.combatView.flameSweep,active:w.game.combat.melee.active,id:w.game.combat.melee.attackInstanceId,slots:w.game.combat.runBuild.attacks.length}})).toEqual({same:true,active:false,id:0,slots:2});
  54  |   await page.locator('#pause').click();await page.locator('#back-menu').click();await page.locator('#start-legacy-party').click();await page.evaluate(()=>(window as any).game.sleep());
  55  |   expect(await page.evaluate(()=>({active:(window as any).game.combat.melee.active,cards:(window as any).game.combat.progression.skills.length}))).toEqual({active:false,cards:8});
  56  |   expect(errors).toEqual([]);
  57  | });
  58  | 
  59  | test('three preset peaks compare the same scene without changing combat and stay readable at phone size',async({page,browserName})=>{
  60  |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.evaluate(()=>(window as any).arrange());
  61  |   for(const viewport of [{width:1280,height:720},{width:844,height:390}]){
  62  |     await page.setViewportSize(viewport);
  63  |     for(const id of ['compact','balanced','punchy']){
  64  |       const result=await page.evaluate(id=>{
  65  |         const w=window as any,g=w.game;
  66  |         g.sleep();const before=JSON.stringify(g.combat.inspect());g.combatView.flameSweep.setPreset(id);
  67  |         const same=before===JSON.stringify(g.combat.inspect());const config=g.combatView.inspect().melee.config;
  68  |         let start=0;for(const entry of config.sequence){if(entry.frame===4)break;start+=entry.ms}
  69  |         const duration=config.sequence.find((e:any)=>e.frame===4).ms;
  70  |         const visual=w.frame((start+duration/2)/1000);
  71  |         return {same,visual:visual.view,unchanged:visual.unchanged};
  72  |       },id);
  73  |       expect(result.same).toBe(true);expect(result.unchanged).toBe(true);expect(result.visual.frame).toBe(4);
  74  |       expect(result.visual.config.sizeRatio).toBeGreaterThanOrEqual(.65);expect(result.visual.config.sizeRatio).toBeLessThanOrEqual(.75);
  75  |       if(browserName==='chromium'){
  76  |         await page.screenshot({path:`artifacts/v6-1-b-visual-${id}-${viewport.width}.png`});
  77  |         if(viewport.width===1280)await page.screenshot({path:`artifacts/v6-1-b-visual-${id}-compare-detail.png`,clip:{x:540,y:230,width:380,height:250}});
  78  |       }
  79  |     }
  80  |   }
  81  |   expect(errors).toEqual([]);
  82  | });
  83  | 
  84  | test('GPU core attenuation reduces actual scene highlights while keeping the attack intact',async({page})=>{
  85  |   await open(page);await page.evaluate(()=>(window as any).arrange());
  86  |   const result=await page.evaluate(async()=>{
  87  |     const w=window as any,v=w.game.combatView.flameSweep;
  88  |     // Hold simulation age constant before comparing render-only mutations.
  89  |     w.game.combat.melee.age=.13;
  90  |     const before=JSON.stringify(w.game.combat.inspect());
  91  |     const softened=w.frame(.13).pixels;
  92  |     v.uniforms.sweepBrightness.value=1;v.uniforms.sweepCoreGain.value=1;
  93  |     const bright=w.frame(.13).pixels;
  94  |     v.setPreset('balanced');
  95  |     const decode=async(url:string)=>{
  96  |       const img=new Image();img.src=url;await img.decode();
  97  |       const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
  98  |       const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;
  99  |     };
  100 |     const a=await decode(softened),b=await decode(bright);let changed=0,energyA=0,energyB=0,neutralA=0,neutralB=0;
  101 |     for(let i=0;i<a.length;i+=4){
  102 |       if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
  103 |       energyA+=a[i]+a[i+1]+a[i+2];energyB+=b[i]+b[i+1]+b[i+2];
  104 |       neutralA+=Math.min(a[i],a[i+1],a[i+2]);neutralB+=Math.min(b[i],b[i+1],b[i+2]);
  105 |     }
  106 |     return {changed,energyA,energyB,neutralA,neutralB,unchanged:before===JSON.stringify(w.game.combat.inspect())};
  107 |   });
  108 |   expect(result.changed).toBeGreaterThan(20);expect(result.energyA).toBeLessThan(result.energyB);
  109 |   expect(result.neutralA).toBeLessThan(result.neutralB);expect(result.unchanged).toBe(true);
  110 | });
  111 | 
  112 | test('missing sweep atlas keeps a bounded visible fallback and real melee damage',async({page})=>{
  113 |   await open(page,true);const attack=await page.evaluate(()=>(window as any).arrange());expect(attack.kills).toBe(4);
  114 |   expect(await page.evaluate(()=>(window as any).game.combatView.inspect().melee)).toMatchObject({failed:true,loaded:false,active:true,fallback:true,capacity:1});
  115 | });
  116 | 
  117 | test('late-game sweep and independent fire ring render on both phones and pause cleanly',async({page,browserName})=>{
  118 |   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  119 |   await page.evaluate(()=>{
  120 |     const w=window as any,g=w.game;g.sleep();
  121 |     for(let i=0;i<4;i++)g.combat.grantUpgrade('flame-sweep-weapon');
  122 |     w.arrange();g.combat.flameRing.cooldown=0;g.step(1/60);
  123 |     g.combat.melee.age=.13;g.combat.flameRing.age=.12;w.draw();
  124 |   });
  125 |   const view=await page.evaluate(()=>(window as any).game.combatView.inspect().melee);
  126 |   expect(view.angle).toBeCloseTo(300*Math.PI/180);expect(view.ring).toMatchObject({active:true,capacity:1,flames:32});
  127 |   expect(view.ring.radius).toBeGreaterThan(4.5);
  128 |   for(const width of [844,568]){
  129 |     await page.setViewportSize({width,height:width===844?390:320});
  130 |     const unchanged=await page.evaluate(()=>{const w=window as any,before=JSON.stringify(w.game.combat.inspect());w.draw();return before===JSON.stringify(w.game.combat.inspect())});
  131 |     expect(unchanged).toBe(true);
  132 |     if(browserName==='chromium')await page.screenshot({path:`artifacts/flame-growth-ring-${width}.png`});
  133 |   }
  134 |   await page.locator('#pause').click();
  135 |   await expect(page.locator('#build-weapons')).toContainText('4.4 范围 / 300° · 火环每 4 秒');
  136 |   const before=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  137 |   await page.evaluate(()=>{const g=(window as any).game;for(let i=0;i<120;i++)g.step(1/60)});
  138 |   expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(before);
  139 |   await page.locator('#restart').click();await page.evaluate(()=>(window as any).game.sleep());
  140 |   expect(await page.evaluate(()=>(window as any).game.combat.flameRing)).toMatchObject({active:false,pulseId:0,armed:false});
  141 |   await expect(page.locator('#fusion-title')).toContainText('火焰横扫');
  142 |   expect(errors).toEqual([]);
  143 | });
  144 | 
  145 | test('all eight equal cells decode transparently and retain a luminous base at the shared pixel anchor',async({page})=>{
  146 |   await page.goto('/');
> 147 |   const result=await page.evaluate(async()=>{
      |                           ^ Error: page.evaluate: EncodingError: Loading was canceled.
  148 |     const image=new Image();image.src='/assets/pixel/skills/flame-sweep/flame-sweep.png';await image.decode();
  149 |     const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  150 |     const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
  151 |     const frames=[];
  152 |     for(let i=0;i<8;i++){
  153 |       const d=ctx.getImageData(i*448,0,448,448).data;let root=0,edge=0;
  154 |       for(let y=0;y<448;y++)for(let x=0;x<448;x++){
  155 |         const j=(y*448+x)*4;
  156 |         if((x===0||x===447||y===0||y===447)&&d[j+3]>32)edge++;
  157 |         if(Math.abs(x-96)<=3&&Math.abs(y-368)<=3&&d[j]>220&&d[j+1]>160&&d[j+3]>90)root++;
  158 |       }
  159 |       frames.push({root,edge});
  160 |     }
  161 |     return {size:[image.width,image.height],frames};
  162 |   });
  163 |   expect(result.size).toEqual([3584,448]);for(const f of result.frames){expect(f.root).toBeGreaterThan(0);expect(f.edge).toBe(0);}
  164 | });
  165 | 
```