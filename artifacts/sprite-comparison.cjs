const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');

(async () => {
  const label = process.argv[2] || 'after';
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.route('**/sprite-comparison*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="app"></div><script type="module">
      import '/src/style.css';import {createUI} from '/src/ui.ts';import {Game} from '/src/game.ts';
      createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>` }));
    await page.goto('http://127.0.0.1:5173/sprite-comparison' + (label === 'before' ? '?character=3d' : ''));
    await page.waitForFunction(() => !!window.game);
    if (label === 'after') await page.waitForFunction(() => window.game.inspect().creature.sprite?.loaded);
    const result = await page.evaluate(async () => {
      const g = window.game;
      g.start();g.sleep();g.combat.random=()=>0.4;
      g.combat.spawn('tank',0,6,0);g.combat.spawn('normal',-3,4,0);g.combat.spawn('fast',4,6,0);
      for(let i=0;i<24;i++)g.step(1/60);
      g.monster.root.position.copy(g.position);g.monster.animate(0,0,false,0,0,0);
      g.updateHUD();g.welcome.hidden=true;
      g.combatView.render(1,0.4,g.position);g.placeCamera(true);g.renderer.render(g.scene,g.camera);
      return g.inspect();
    });
    await page.screenshot({ path: `artifacts/sprite-${label}-mobile.png` });
    // Close-up is another real render at a tighter frustum, with the same map and actors.
    await page.evaluate(() => {
      const g=window.game;document.getElementById('hud').hidden=true;
      const aspect=844/390;g.camera.top=3.4;g.camera.bottom=-3.4;g.camera.left=-3.4*aspect;g.camera.right=3.4*aspect;
      g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);
    });
    await page.screenshot({ path: `artifacts/sprite-${label}-detail.png` });
    const alpha = await page.evaluate(async () => {
      const im=new Image();im.src='/assets/characters/yanrong-base.png';await im.decode();
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
      const d=ctx.getImageData(0,0,c.width,c.height).data;let transparent=0,partial=0;
      const bounds={left:c.width,right:0,top:c.height,bottom:0};
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const a=d[(y*c.width+x)*4+3];if(a===0)transparent++;if(a>0&&a<255)partial++;if(a>32){bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}}
      return {width:im.width,height:im.height,transparent,partial,bounds};
    });
    await fs.writeFile(`artifacts/sprite-${label}-capture.json`,JSON.stringify({environment:'Windows Playwright Chromium, 844x390 CSS viewport, DPR 2; fixed enemy placement in the real Game',state:result,sourceImage:alpha},null,2));
    console.log(JSON.stringify({label,sourceImage:alpha,creature:result.creature}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
