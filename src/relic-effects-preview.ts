import * as THREE from 'three';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { PartySystem, type SpeciesId } from './party';
import { PartyView } from './party-view';
import type { RelicId } from './relics';
import './relic-effects-preview.css';

const demos: { id: RelicId; title: string; species: SpeciesId; description: string }[] = [
  { id: 'draft-martyr-core', title: '殉爆晶核', species: 'yanrong', description: '火花击杀 → 死亡位置爆炸 → 邻近敌人被引爆，最多两代。' },
  { id: 'draft-kindling-flask', title: '引火油壶', species: 'yanrong', description: '火花命中后燃烧 2 秒，每 0.5 秒出现一次小火焰脉冲；当前版本没有常驻包裹敌人的火焰。' },
  { id: 'draft-thorn-testament', title: '荆棘遗嘱', species: 'sproutspike', description: '飞叶击杀 → 向附近敌人发出 3 枚绿色小荆棘；荆棘不再触发遗嘱。' },
  { id: 'draft-bubble-spore', title: '泡泡孢子', species: 'bubblesalamander', description: '水泡击杀 → 发出一枚蓝色小泡 → 最多额外弹射两次。' },
];
const root = document.querySelector<HTMLElement>('#preview')!;
root.innerHTML = `<header><div><small>实际战斗逻辑 · 现有素材</small><h1>遗物特效预览</h1></div><a href="./">返回游戏</a></header>
<nav aria-label="选择遗物">${demos.map((d,i)=>`<button data-demo="${i}">${d.title}</button>`).join('')}</nav>
<section class="preview-stage"><canvas aria-label="遗物特效战斗画面"></canvas><span id="phase"></span></section>
<p id="description"></p><section class="controls"><button id="play">暂停</button><button id="replay">重播</button><label>速度 <select id="speed"><option value="0.25">0.25 倍</option><option value="0.5" selected>0.5 倍</option><option value="1">正常</option></select></label><label class="timeline">进度 <input id="seek" type="range" min="0" max="3.2" step="0.0166667" value="0"></label><output id="time">0.00 秒</output></section>
<p class="note">每轮只装备正在查看的遗物。自动循环；可暂停、拖动进度逐帧观察。敌人固定站位，伤害、派生、素材与正式战斗共用。</p>`;

const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor('#244d3a');
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#fff9e3','#365f3a',2.5));
const light = new THREE.DirectionalLight('#fff0cf',2); light.position.set(-6,14,8); scene.add(light);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshLambertMaterial({color:'#487b48'}));
ground.rotation.x=-Math.PI/2; ground.position.y=-.015; scene.add(ground);
const camera = new THREE.OrthographicCamera(-6,6,4,-4,.1,80);
camera.position.set(0,17,17); camera.lookAt(0,0,0); camera.updateMatrixWorld();
const c = new Combat([],32,()=>.5), party = new PartySystem();
c.party=party; c.fusionEnabled=true; c.automaticSpawning=false;
const view = new CombatView(c), partyView = new PartyView(party);
view.group.visible=partyView.group.visible=true;
view.setPixelEnemies(true); view.setFusion(true); partyView.setCamera(camera);
scene.add(view.group,partyView.group);
const player={x:-4,z:0};
let selected=0, time=0, playing=true, speed=.5, accumulator=0, last=performance.now(), frame=0, disposed=false;
const STEP=1/60, DURATION=3.2;
const seek = root.querySelector<HTMLInputElement>('#seek')!;
const phase = root.querySelector<HTMLElement>('#phase')!;

function resize() {
  const width=canvas.parentElement!.clientWidth, height=canvas.parentElement!.clientHeight;
  renderer.setSize(width,height,false);
  const aspect=width/height, vertical=Math.max(7.3,12/aspect);
  camera.left=-vertical*aspect/2; camera.right=vertical*aspect/2;
  camera.top=vertical/2; camera.bottom=-vertical/2; camera.updateProjectionMatrix();
  view.updateView(camera,height,vertical); partyView.resize(height,vertical);
  draw();
}
function arrange(index=selected) {
  selected=index; time=accumulator=0;
  party.reset([demos[index].species]); c.reset(); c.encounters.beginWave(1);
  c.invulnerability=10000; party.syncLeader(player,-Math.PI/2);
  c.grantUpgrade(demos[index].id);
  c.runBuild.attacks[0].cooldown=.35;
  const spawn=(kind:'normal'|'tank',x:number,z:number,hp:number)=>{
    const e=c.spawn(kind,x,z,0)!; e.hp=e.maxHp=hp; e.stagger=10000; return e;
  };
  if(index===0) {
    spawn('normal',-1.4,0,6); spawn('normal',.2,.1,6); spawn('normal',1.8,.1,2);
    spawn('tank',2.7,1.9,150);
  } else if(index===1) spawn('tank',0,0,150);
  else if(index===2) {
    spawn('normal',-1.4,0,6); spawn('tank',1.4,-1.8,150);
    spawn('tank',2.2,0,150); spawn('tank',1.4,1.8,150);
  } else {
    spawn('normal',-1.4,0,6); spawn('tank',.2,.1,150);
    spawn('tank',1.8,-1.2,150); spawn('tank',3,1,150);
  }
  root.querySelector('#description')!.textContent=demos[index].description;
  root.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  draw();
}
function step() {
  party.syncLeader(player,-Math.PI/2); c.update(STEP,player);
  // Isolate one ordinary weapon hit so all later activity comes from this relic.
  if(c.shotsFired>0) for(const a of c.runBuild.attacks) a.cooldown=10000;
  time+=STEP;
}
function draw() {
  partyView.render(1,time); view.render(1,time,player); renderer.render(scene,camera);
  seek.value=String(time); root.querySelector('#time')!.textContent=`${time.toFixed(2)} 秒`;
  phase.textContent=time<.35?'等待施放':time<.5?'武器命中':selected===1?'2 秒燃烧 · 每 0.5 秒一次火焰脉冲':'击杀后的遗物派生';
}
function pose(index:number, seconds:number) {
  arrange(index);
  for(let i=0;i<Math.round(Math.min(DURATION,seconds)/STEP);i++) step();
  draw();
}
function animate(now:number) {
  if(disposed) return;
  if(playing) {
    accumulator+=Math.min(.1,(now-last)/1000)*speed;
    while(accumulator>=STEP) { accumulator-=STEP; step(); if(time>=DURATION) arrange(); }
  }
  last=now; draw(); frame=requestAnimationFrame(animate);
}
root.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach((button,i)=>button.addEventListener('click',()=>arrange(i)));
root.querySelector('#replay')!.addEventListener('click',()=>arrange());
root.querySelector('#play')!.addEventListener('click',()=>{playing=!playing;root.querySelector('#play')!.textContent=playing?'暂停':'播放'});
root.querySelector('#speed')!.addEventListener('change',e=>speed=Number((e.target as HTMLSelectElement).value));
seek.addEventListener('input',()=>{playing=false;root.querySelector('#play')!.textContent='播放';pose(selected,Number(seek.value))});
const observer=new ResizeObserver(resize); observer.observe(canvas.parentElement!);
// Deterministic visual inspection and recording use exactly the same update/render path.
const preview={pose, pause:()=>{playing=false;root.querySelector('#play')!.textContent='播放'},
  inspect:()=>({selected,time,combat:c.inspect(),view:{...view.inspect(),fire:view.inspectFusion(),elemental:view.inspectElemental()}})};
Object.assign(window,{relicEffectsPreview:preview});
arrange(); resize(); frame=requestAnimationFrame(animate);
function dispose() {
  disposed=true; cancelAnimationFrame(frame); observer.disconnect(); view.dispose(); partyView.dispose();
  ground.geometry.dispose(); (ground.material as THREE.Material).dispose(); renderer.dispose();
}
window.addEventListener('pagehide',dispose,{once:true});
if(import.meta.hot) import.meta.hot.dispose(dispose);
