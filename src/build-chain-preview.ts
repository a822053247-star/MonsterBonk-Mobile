import * as THREE from 'three';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { PartySystem } from './party';
import { PartyView } from './party-view';
import { BUILD_DEMOS, arrangeBuildDemo } from './build-chain-demo';
import './build-chain-preview.css';

const root = document.querySelector<HTMLElement>('#preview')!;
root.innerHTML = `<header><div><small>幻兽幸存者 / 构筑实验场</small><h1>一簇火花，点燃整片怪潮。</h1></div><a href="./">进入游戏 →</a></header>
<nav aria-label="构筑场景">${BUILD_DEMOS.map((d,i)=>`<button data-demo="${i}" aria-pressed="false"><span>0${i+1}</span>${d.title}</button>`).join('')}</nav>
<section class="stage"><canvas aria-label="真实战斗逻辑的连锁特效预览"></canvas><div class="stage-label"><strong id="build"></strong><span id="phase"></span></div>
<div class="stats" aria-label="战斗统计"><span>击杀 <b id="kills">0</b></span><span>连锁击杀 <b id="chains">0</b></span><span>蒸爆 <b id="steam">0</b></span><span>传播 <b id="depth">0</b> 代</span></div></section>
<p id="description"></p><section class="controls" aria-label="播放控制"><button id="play">暂停</button><button id="replay">重播</button><button id="next-frame">下一帧</button>
<label>速度 <select id="speed"><option value="0.25">0.25 倍</option><option value="0.5" selected>0.5 倍</option><option value="1">1 倍</option></select></label>
<label class="timeline">进度 <input id="seek" type="range" min="0" max="6" step="0.0166667" value="0"></label><output id="time">0.00 秒</output></section>
<footer>复用正式战斗的攻击、状态、伤害与素材。演示固定站位，杂兵使用第五波怪潮的20点生命；前两幕仅施放一次火花，后两幕持续自动攻击。</footer>`;

const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setClearColor('#244a38');
const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight('#fff3cf','#294e3b',2.5));
const light = new THREE.DirectionalLight('#ffe5b0',2); light.position.set(-6,14,8); scene.add(light);
const geometry = new THREE.PlaneGeometry(80,80), material = new THREE.MeshLambertMaterial({color:'#446d3d'});
const ground = new THREE.Mesh(geometry,material); ground.rotation.x=-Math.PI/2; ground.position.y=-.02; scene.add(ground);
const camera = new THREE.OrthographicCamera(-10,10,6,-6,.1,80); camera.position.set(0,20,20); camera.lookAt(0,0,0); camera.updateMatrixWorld();
const c = new Combat([],32,()=>.5); c.party=new PartySystem(); c.fusionEnabled=true; c.automaticSpawning=false;
const view = new CombatView(c), partyView = new PartyView(c.party);
view.group.visible=partyView.group.visible=true; view.setPixelEnemies(true); view.setFusion(true); partyView.setCamera(camera);
scene.add(view.group,partyView.group);
const STEP=1/60,DURATION=6;
let selected=1,time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,speed=.5,accumulator=0,last=performance.now(),frame=0,disposed=false;
let layout = arrangeBuildDemo(c,selected);
const seek=root.querySelector<HTMLInputElement>('#seek')!;
function pause() { playing=false; root.querySelector('#play')!.textContent='播放'; }
function arrange(index=selected) {
  selected=Math.max(0,Math.min(BUILD_DEMOS.length-1,Math.floor(index))); time=accumulator=0;
  layout=arrangeBuildDemo(c,selected); c.party!.syncLeader(layout.player,-Math.PI/2);
  root.querySelector('#build')!.textContent=BUILD_DEMOS[selected].detail;
  root.querySelector('#description')!.textContent=BUILD_DEMOS[selected].description;
  root.querySelectorAll('[data-demo]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));
}
function step() {
  for (const {enemy,x,z} of layout.targets) if(enemy.active) Object.assign(enemy,{x,z,knockX:0,knockZ:0});
  c.party!.syncLeader(layout.player,-Math.PI/2); c.update(STEP,layout.player);
  if(selected<2 && c.shotsFired>0) for(const a of c.runBuild.attacks) a.cooldown=10000;
  while(c.progression.awaitingChoice) c.chooseUpgrade(c.progression.offers[0]);
  time+=STEP;
}
function draw() {
  partyView.render(1,time); view.render(1,time,layout.player); renderer.render(scene,camera);
  seek.value=String(time); root.querySelector('#time')!.textContent=`${time.toFixed(2)} 秒`;
  root.querySelector('#kills')!.textContent=String(c.kills);
  root.querySelector('#chains')!.textContent=String(c.relicTelemetry.chainKills);
  root.querySelector('#steam')!.textContent=String(c.relicTelemetry.steamBursts);
  root.querySelector('#depth')!.textContent=String(c.relicTelemetry.maxGeneration);
  root.querySelector('#phase')!.textContent=c.inspect().triggerRelics.hasteRemaining>0?'屠戮沙漏 · 攻速提升':c.relicTelemetry.steamBursts>0?'湿润消耗 · 蒸爆接力':c.relicTelemetry.maxGeneration>1?'击杀接力 · 连爆传播':'自动攻击 · 等待命中';
}
function pose(index:number,seconds:number) {
  if(!Number.isFinite(index)||!Number.isFinite(seconds)) return;
  arrange(index); for(let i=0;i<Math.round(Math.max(0,Math.min(DURATION,seconds))/STEP);i++) step(); draw();
}
function resize() {
  const width=canvas.parentElement!.clientWidth,height=canvas.parentElement!.clientHeight;
  renderer.setSize(width,height,false);
  const aspect=width/height,vertical=Math.max(12,18/aspect);
  camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;
  camera.updateProjectionMatrix();view.updateView(camera,height,vertical);partyView.resize(height,vertical);draw();
}
function animate(now:number) {
  if(disposed)return;
  if(playing&&!document.hidden) {
    accumulator+=Math.min(.1,(now-last)/1000)*speed;
    while(accumulator>=STEP){accumulator-=STEP;step();if(time>=DURATION)arrange();}
  }
  last=now;draw();frame=requestAnimationFrame(animate);
}
root.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach((b,i)=>b.addEventListener('click',()=>{arrange(i);draw()}));
root.querySelector('#play')!.addEventListener('click',()=>{playing=!playing;root.querySelector('#play')!.textContent=playing?'暂停':'播放';last=performance.now()});
root.querySelector('#replay')!.addEventListener('click',()=>{arrange();draw()});
root.querySelector('#next-frame')!.addEventListener('click',()=>{pause();if(time>=DURATION)arrange();step();draw()});
root.querySelector('#speed')!.addEventListener('change',e=>speed=Number((e.target as HTMLSelectElement).value));
seek.addEventListener('input',()=>{pause();pose(selected,Number(seek.value))});
const observer=new ResizeObserver(resize);observer.observe(canvas.parentElement!);
Object.assign(window,{buildChainPreview:{pose,pause,inspect:()=>({selected,time,playing,combat:c.inspect(),view:{...view.inspect(),fire:view.inspectFusion(),elemental:view.inspectElemental()}})}});
arrange();resize();if(!playing)pause();frame=requestAnimationFrame(animate);
function dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();view.dispose();partyView.dispose();geometry.dispose();material.dispose();renderer.dispose()}
window.addEventListener('pagehide',dispose,{once:true});if(import.meta.hot)import.meta.hot.dispose(dispose);
