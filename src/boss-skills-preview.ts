import * as THREE from 'three';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { PartySystem } from './party';
import { PartyView } from './party-view';
import type { BossState } from './enemy-challenge';
import './crownthorn-preview.css';
import './boss-skills-preview.css';

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
document.querySelector('#preview')!.innerHTML = `<header><a href="./">返回游戏</a><h1>荆冠兽王 · 技能预览</h1><p>查看闯关第六波的真实弹幕、冲锋和召唤。幻兽固定站位，仅作为瞄准目标。</p></header>
<div class="stage"><canvas aria-label="Boss 技能演示场地"></canvas><span class="ground-label" id="phase">准备技能…</span></div>
<section aria-label="技能预览控制"><label>展示技能<select id="skill"><option value="cycle">完整攻击循环</option><option value="spread-windup">扇形弹幕</option><option value="dash-windup">冲锋</option><option value="summon-windup">召唤</option></select></label>
<label>Boss 状态<select id="rage"><option value="normal">普通 · 7 发子弹</option><option value="enraged">狂暴 · 9 发子弹</option></select></label>
<label>播放速度<select id="speed"><option value="1">正常速度</option><option value=".5">半速查看</option><option value=".25">四分之一速度</option></select></label>
<div class="buttons"><button id="play">暂停</button><button id="replay">重新播放</button><button id="step">前进一帧</button></div>
<output id="status"></output><p>紫色扇形是弹幕预警，橙色长条是冲锋路径。每轮冲锋距离 12.75，完整循环为「弹幕 → 冲锋 → 召唤 → 冲锋」。<a href="./crownthorn-preview.html">查看 Boss 动画素材</a></p></section>`;

const renderer = new THREE.WebGLRenderer({ canvas: element<HTMLCanvasElement>('canvas'), antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();scene.background = new THREE.Color('#405f45');
scene.add(new THREE.HemisphereLight('#fff2cd', '#3b5144', 2));
const sun = new THREE.DirectionalLight('#ffedc5', 2);sun.position.set(-8, 12, 8);scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(64,64),new THREE.MeshLambertMaterial({ color:'#53764e' }));
ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);
const grid = new THREE.GridHelper(40,20,'#8d9f70','#617f59');scene.add(grid);
const camera = new THREE.OrthographicCamera(-15,15,10,-10,.1,100);
camera.position.set(0,24,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const player={x:0,z:3};
const combat = new Combat([],32,()=>.5);combat.party=new PartySystem();combat.fusionEnabled=true;combat.automaticSpawning=false;
const view = new CombatView(combat);view.setFusion(true,false);view.group.visible=true;scene.add(view.group);
const party = new PartyView(combat.party);party.setAnimatedLeader(true);party.group.visible=true;scene.add(party.group);
const skill=element<HTMLSelectElement>('#skill'),rage=element<HTMLSelectElement>('#rage'),speed=element<HTMLSelectElement>('#speed');
const play=element<HTMLButtonElement>('#play');
const names: Record<BossState,string> = { approach:'接近目标', 'spread-windup':'扇形弹幕 · 预警', spread:'扇形弹幕 · 发射', 'dash-windup':'冲锋 · 锁定路径', dash:'冲锋', 'summon-windup':'召唤 · 蓄力', summon:'召唤支援', recover:'攻击后恢复', dying:'死亡', defeated:'击败' };
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches, time=0, accumulator=0, last=performance.now(), raf=0, disposed=false;
function restart() {
  combat.reset();combat.useNavigation=false;combat.automaticSpawning=false;combat.invulnerability=1e6;
  combat.encounters.beginWave(6);
  const boss=combat.encounters.spawnBoss(combat,player)!;
  Object.assign(boss,{x:0,z:-4,previousX:0,previousZ:-4,spawnTime:0});
  if(rage.value==='enraged')boss.hp=boss.maxHp!/2;
  combat.encounters.aimX=0;combat.encounters.aimZ=1;
  if(skill.value!=='cycle')combat.encounters.bossState=skill.value as BossState;
  for(const attack of combat.runBuild.attacks)attack.cooldown=1e6;
  combat.party!.syncLeader(player,Math.PI);time=accumulator=0;
}
function step() {
  combat.party!.syncLeader(player,Math.PI);combat.update(1/60,player);time+=1/60;
  // Restart single-skill demonstrations after their real recovery window.
  if((skill.value!=='cycle'&&combat.encounters.bossState==='approach')||time>=24)restart();
}
function draw() {
  view.render(1,time,player);party.render(1,time);renderer.render(scene,camera);
  const encounter=combat.encounters, boss=view.inspect().encounters.boss;
  const loading=!boss?.atlases.some(a=>a.loaded);
  element('#phase').textContent=loading?'正在加载 Boss 素材…':names[encounter.bossState];
  element('#status').textContent=`${rage.value==='enraged'?'狂暴':'普通'}状态 · 场上子弹 ${encounter.shots.filter(s=>s.active).length} · ${time.toFixed(1)} 秒${paused?' · 已暂停':''}`;
  play.textContent=paused?'播放':'暂停';
}
function resize() {
  const canvas=element<HTMLCanvasElement>('canvas'),{width,height}=canvas.getBoundingClientRect();
  renderer.setSize(width,height,false);
  const aspect=width/height,halfHeight=Math.max(8.5,14/aspect);
  camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();
  view.updateView(camera,height,halfHeight*2);party.setCamera(camera);draw();
}
skill.onchange=rage.onchange=()=>{restart();draw();};
play.onclick=()=>{paused=!paused;last=performance.now();draw();};
element<HTMLButtonElement>('#replay').onclick=()=>{restart();draw();};
element<HTMLButtonElement>('#step').onclick=()=>{paused=true;step();draw();};
function visibility(){if(document.hidden){paused=true;draw();}}
document.addEventListener('visibilitychange',visibility);
const observer=new ResizeObserver(resize);observer.observe(element('canvas'));
function tick(now:number){if(disposed)return;const dt=Math.min(.1,(now-last)/1000);last=now;
  if(!paused&&!document.hidden){accumulator+=dt*Number(speed.value);while(accumulator>=1/60){accumulator-=1/60;step();}}
  draw();raf=requestAnimationFrame(tick);
}
restart();resize();raf=requestAnimationFrame(tick);
function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);view.dispose();party.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();ground.geometry.dispose();ground.material.dispose();renderer.dispose();}
if(import.meta.env.DEV)Object.defineProperty(window,'__bossSkills',{configurable:true,value:{inspect:()=>({time,paused,...combat.encounters.inspect(),view:view.inspect().encounters}),advance:(seconds:number)=>{paused=true;for(let i=0;i<Math.round(seconds*60);i++)step();draw();}}});
import.meta.hot?.dispose(()=>{dispose();Reflect.deleteProperty(window,'__bossSkills');});
