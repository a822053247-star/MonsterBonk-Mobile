import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Capture the current water impact without combat actors or unrelated VFX.
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 430 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/water-ripple-isolated', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#14262c;color:#e4f5fa;font:18px "Microsoft YaHei",sans-serif}
      header{padding:24px 32px 0;font-size:24px;font-weight:bold}small{display:block;margin-top:9px;color:#9ab4bf;font-size:14px;font-weight:normal}
      canvas{display:block;width:1080px;height:280px}.labels{display:flex;text-align:center;color:#bdd6df}.labels>div{width:33.333%}
    </style><header>水泡弹 · 去除圆圈后的命中水花<small>当前游戏特效单独渲染 · 统一放大展示 · 保留原色与透明度</small></header>
    <script type="module">
      import * as THREE from '/node_modules/three/build/three.module.js';
      import {Combat} from '/src/combat.ts';
      import {CombatView} from '/src/combat-view.ts';
      import {PartySystem} from '/src/party.ts';
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(1080,280);renderer.setClearColor('#14262c');document.body.append(renderer.domElement);
      const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-3.9,3.9,1.011,-1.011,.1,100);
      camera.position.set(0,9.55,8);camera.lookAt(0,1.55,0);
      const combat=new Combat([],100);combat.party=new PartySystem();combat.party.reset(['yanrong']);combat.fusionEnabled=true;combat.reset();
      const view=new CombatView(combat);view.setFusion(true);view.group.visible=true;scene.add(view.group);view.updateView(camera,280,2.022);
      const duration=.32, ages=[.02,.08,.15];
      ages.forEach((age,i)=>Object.assign(combat.effects[i],{active:true,kind:'water',enemyKind:'normal',x:(i-1)*2.6,z:0,radius:.6,duration,time:duration-age}));
      function draw(){
        if(!view.fusionPixels?.loaded||!view.inspect().feedback?.loaded){setTimeout(draw,30);return;}
        view.render(1,0,{x:0,z:0});renderer.render(scene,camera);
        window.probe={outlines:view.inspect().reactions.outlines,frames:view.fusionPixels.mesh.count,preset:view.vfx.impact('water')};window.ready=true;
      }draw();
    </script><div class="labels"><div>开始 · 0.02秒</div><div>扩散 · 0.08秒</div><div>淡出 · 0.15秒</div></div></html>` }));
  await page.goto('http://127.0.0.1:5173/water-ripple-isolated');
  await page.waitForFunction(() => window.ready);
  const probe = await page.evaluate(() => window.probe);
  if (errors.length || probe.outlines !== 0 || probe.frames !== 3) throw new Error(JSON.stringify({ errors, probe }));
  await mkdir('artifacts/water-ripple', { recursive: true });
  await page.screenshot({ path: 'artifacts/water-ripple/water-impact-clean.png' });
  console.log(JSON.stringify(probe));
} finally { await browser.close(); }
