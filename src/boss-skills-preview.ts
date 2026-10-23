import * as THREE from 'three';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { PartySystem } from './party';
import { PartyView } from './party-view';
import type { BossState } from './enemy-challenge';
import { endlessBossDefinition } from './endless-boss';
import { BARRAGE_NAMES,type BarragePattern } from './boss-barrage';
import './crownthorn-preview.css';
import './boss-skills-preview.css';

const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
document.querySelector('#preview')!.innerHTML = `<header><a href="./">返回游戏</a><h1>Boss · 弹幕技能预览</h1><p>四位领主，十一种弹幕技能。原有技能保留，观察预警，寻找穿行路线。</p></header>
<div class="stage"><canvas aria-label="Boss 技能演示场地"></canvas><div class="boss-preview-hud"><span>第六波 · 领主遭遇</span><strong>荆冠兽王</strong><i><b id="boss-health"></b></i></div><span class="ground-label" id="phase">准备技能…</span></div>
<section aria-label="技能预览控制"><label>选择 Boss<select id="boss"><option value="0">荆冠兽王</option><option value="1">熔果暴君</option><option value="2">晶甲重炮王</option><option value="3">霜绒巨兽</option></select></label><label>展示技能<select id="skill"></select></label>
<label>Boss 状态<select id="rage"><option value="normal">普通状态</option><option value="enraged">狂暴状态</option></select></label>
<label>播放速度<select id="speed"><option value="1">正常速度</option><option value=".5">半速查看</option><option value=".25">四分之一速度</option></select></label>
<div class="buttons"><button id="play">暂停</button><button id="replay">重新播放</button><button id="step">前进一帧</button></div>
<output id="status"></output><p id="description"></p></section>`;

const renderer = new THREE.WebGLRenderer({ canvas: element<HTMLCanvasElement>('canvas'), antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();scene.background = new THREE.Color('#0d222b');
scene.add(new THREE.HemisphereLight('#fff2cd', '#3b5144', 2));
const sun = new THREE.DirectionalLight('#ffedc5', 2);sun.position.set(-8, 12, 8);scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(64,64),new THREE.MeshLambertMaterial({ color:'#183b3c' }));
ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);
const grid = new THREE.GridHelper(48,24,'#799786','#355956');(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.24;scene.add(grid);
const arenaRings=new THREE.Group();for(const radius of [3,7,11,15]){const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.025,radius,128),new THREE.MeshBasicMaterial({color:'#b7aa78',transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.01;arenaRings.add(ring);}scene.add(arenaRings);
const camera = new THREE.OrthographicCamera(-15,15,10,-10,.1,100);
camera.position.set(0,24,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const player={x:0,z:6};
const combat = new Combat([],32,()=>.5);combat.party=new PartySystem();combat.fusionEnabled=true;combat.automaticSpawning=false;
const view = new CombatView(combat);view.setFusion(true,false);view.group.visible=true;scene.add(view.group);
const party = new PartyView(combat.party);party.setAnimatedLeader(true);party.group.visible=true;scene.add(party.group);
const skill=element<HTMLSelectElement>('#skill'),rage=element<HTMLSelectElement>('#rage'),speed=element<HTMLSelectElement>('#speed');
const bossSelect=element<HTMLSelectElement>('#boss');
const descriptions=[
 '粉紫花环与金色旋转花瓣，保留原扇形射击、冲锋和召唤。',
 '熔火双旋、四向焰流、熔核星爆：旋臂、交叉火流与四瓣爆环交替施放。保留原扇形射击和冲锋。',
 '交错晶阵、十字重炮、棱镜聚焦：错位晶环、交替炮阵与六点聚焦齐射。保留原扇形重炮。',
 '霜雪涟漪、六角飞雪、错位雪幕：双通道霜环、六枝雪花与平行雪幕。保留原冲锋和地震。',
];
function chooseBoss(){
 const index=Number(bossSelect.value),profile=endlessBossDefinition(index);
 const options:[string,string][]=[];
 if(index!==3)options.push(['spread-windup','扇形弹幕（原技能）']);
 for(const pattern of profile?profile.barragePatterns:['flower','spiral'] as BarragePattern[])options.push([pattern,BARRAGE_NAMES[pattern]]);
 options.push(['cycle','完整攻击循环']);
 if(index!==2)options.push(['dash-windup','冲锋（原技能）']);
 if(index===0)options.push(['summon-windup','召唤（原技能）']);
 if(index===3)options.push(['quake-windup','地震（原技能）']);
 skill.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
 skill.value=profile?.barragePattern??'flower';
 element('.boss-preview-hud strong').textContent=profile?.name??'荆冠兽王';
 element('.boss-preview-hud>span').textContent=profile?'无尽挑战 · 领主遭遇':'第六波 · 领主遭遇';
 element('#description').textContent=descriptions[index]+' 花环与霜环显示青绿色初始通道，其余弹幕从弹体间隙躲避。弹幕散尽后继续后续攻击。此处使用真实战斗逻辑，幻兽固定站位。';
}
const play=element<HTMLButtonElement>('#play');
const names: Record<BossState,string> = { approach:'接近目标', 'spread-windup':'扇形弹幕 · 紫色扇面预警', spread:'扇形弹幕 · 发射', 'barrage-windup':'环形弹幕 · 观察弹路', barrage:'环形弹幕 · 扩散中', 'dash-windup':'冲锋 · 锁定路径', dash:'冲锋', 'summon-windup':'召唤 · 蓄力', summon:'召唤支援', 'quake-windup':'震地 · 预警', quake:'震地冲击', recover:'攻击后恢复', dying:'死亡', defeated:'击败' };
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches, time=0, accumulator=0, last=performance.now(), raf=0, disposed=false;
function restart() {
  combat.reset();combat.useNavigation=false;combat.automaticSpawning=false;combat.invulnerability=1e6;
  combat.encounters.beginWave(6);
  const profile=endlessBossDefinition(Number(bossSelect.value));
  if(profile)view.preloadEnemies([profile.kind]);
  combat.encounters.bossProfile=profile;
  const boss=profile?(combat.encounters.boss=combat.spawnRank('boss',player)):combat.encounters.spawnBoss(combat,player)!;
  if(!boss)return;
  Object.assign(boss,{x:0,z:-2.5,previousX:0,previousZ:-2.5,spawnTime:0});
  if(rage.value==='enraged')boss.hp=boss.maxHp!/2;
  combat.encounters.aimX=0;combat.encounters.aimZ=1;
  combat.encounters.bossQuakeTarget.x=boss.x;combat.encounters.bossQuakeTarget.z=boss.z;
  if(Object.prototype.hasOwnProperty.call(BARRAGE_NAMES,skill.value)){combat.encounters.barrageChoice=skill.value as BarragePattern;combat.encounters.bossState='barrage-windup';}
  else if(skill.value!=='cycle')combat.encounters.bossState=skill.value as BossState;
  for(const attack of combat.runBuild.attacks)attack.cooldown=1e6;
  combat.party!.syncLeader(player,Math.PI);time=accumulator=0;
}
function step() {
  combat.party!.syncLeader(player,Math.PI);combat.update(1/60,player);time+=1/60;
  // Restart single-skill demonstrations after their real recovery window.
  if((skill.value!=='cycle'&&combat.encounters.bossState==='approach')||time>=(skill.value==='cycle'?120:24))restart();
}
function draw() {
  view.render(1,time,player);party.render(1,time);renderer.render(scene,camera);
  const encounter=combat.encounters, boss=view.inspect().encounters.boss;
  const loading=!encounter.bossProfile&&!boss?.atlases.some(a=>a.loaded);
  element('#phase').textContent=loading?'正在加载 Boss 素材…':encounter.barrage.running?`${BARRAGE_NAMES[encounter.barrage.pattern]} · ${encounter.barrage.dodgeHint}`:names[encounter.bossState];
  element('#status').textContent=`${rage.value==='enraged'?'狂暴':'普通'}状态 · 场上子弹 ${(encounter.shots.filter(s=>s.active).length+encounter.barrage.inspect().shots)} · ${time.toFixed(1)} 秒${paused?' · 已暂停':''}`;
  play.textContent=paused?'播放':'暂停';
  element('#boss-health').style.width=rage.value==='enraged'?'50%':'100%';
}
function resize() {
  const canvas=element<HTMLCanvasElement>('canvas'),{width,height}=canvas.getBoundingClientRect();
  renderer.setSize(width,height,false);
  const aspect=width/height,halfHeight=Math.max(8.5,14/aspect);
  camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();
  view.updateView(camera,height,halfHeight*2);party.setCamera(camera);draw();
}
skill.onchange=rage.onchange=()=>{restart();draw();};
bossSelect.onchange=()=>{chooseBoss();restart();draw();};
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
chooseBoss();restart();resize();raf=requestAnimationFrame(tick);
function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);view.dispose();party.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();ground.geometry.dispose();ground.material.dispose();arenaRings.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});renderer.dispose();}
if(import.meta.env.DEV)Object.defineProperty(window,'__bossSkills',{configurable:true,value:{inspect:()=>({time,paused,...combat.encounters.inspect(),view:view.inspect().encounters}),advance:(seconds:number)=>{paused=true;for(let i=0;i<Math.round(seconds*60);i++)step();draw();}}});
import.meta.hot?.dispose(()=>{dispose();Reflect.deleteProperty(window,'__bossSkills');});
