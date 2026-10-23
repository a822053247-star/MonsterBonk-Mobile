import * as THREE from 'three';
import './elite-quake-preview.css';
import { Combat } from './combat';
import { CombatView } from './combat-view';
import { PartySystem } from './party';
import { PartyView } from './party-view';
import { ENCOUNTER_RULES } from './enemy-challenge';
import { createSampleWorld } from './world-sample';
import { fixedWorldLayout } from './world-layout';
import { EliteQuakeView } from './elite-quake-view';
import { QuakeDrill, QUAKE_DRILL } from './quake-drill';
import { Input } from './input';

document.querySelector('#preview')!.innerHTML = `
  <header><div><a href="./">返回游戏</a><h1>岩甲精英 · 地震</h1></div>
    <nav class="mode-switch" aria-label="预览模式"><button id="mode-drill" aria-pressed="true">躲避演练</button><button id="mode-view" aria-pressed="false">特效查看</button></nav></header>
  <div class="preview-layout"><section class="stage" aria-label="地震演练场"><canvas tabindex="0" aria-label="地震演练：WASD、方向键或左下摇杆移动"></canvas>
    <div id="drill-hit" aria-hidden="true"></div>
    <div class="stage-note"><span id="phase">移动躲避地震</span><small>WASD / 方向键移动，触屏拖动左下摇杆</small></div>
    <div id="drill-hud" class="drill-hud"><label>生命 <strong id="drill-hp">100</strong><progress id="drill-health" max="100" value="100" aria-label="角色生命值"></progress></label><span>躲避 <strong id="drill-dodged">0</strong></span></div>
    <div id="drill-joystick" class="drill-joystick" role="group" aria-label="移动摇杆"><span class="joystick-knob"></span></div><button id="drill-dash" hidden>冲刺</button>
    <div id="drill-death" class="drill-death" role="status" hidden><strong>演练结束</strong><span>看准预警，提前走出金色圆环</span><button id="retry-drill">再试一次</button></div>
    <span id="loading">正在准备草场…</span></section>
    <aside><section id="drill-controls"><h2>让地震铺开，留出退路</h2><p>第一处地震锁定你的位置，其余落点分散在场地中。预警结束时，站在圆环内会受到伤害。</p>
      <label class="radius-control" for="drill-radius">地震半径 <output id="radius-value">4.6</output><input id="drill-radius" type="range" min="2.5" max="5.5" step=".1" value="4.6"/></label>
      <label class="count-control" for="drill-count">每轮地震<select id="drill-count"><option value="2">2 处</option><option value="3" selected>3 处</option><option value="4">4 处</option><option value="6">6 处</option></select></label>
      <label class="auto-control"><input id="drill-auto" type="checkbox" checked/>连续释放</label><button id="drill-trigger">释放一轮地震</button>
      <p class="drill-rule">每处预警 1.3 秒，命中扣 20 点生命。范围和数量在下一轮生效。</p></section>
      <section id="view-controls" hidden><h2>看清每一次落地</h2><p>固定的金色预警圈先亮起，落地后震波推向边缘，裂纹、碎石与尘土逐渐消退。</p>
      <div class="phases" aria-label="查看攻击阶段"><button data-time="1.05">蓄力预警</button><button data-time="1.44">落地冲击</button><button data-time="1.9">裂纹余波</button></div></section>
      <div class="options"><label>播放速度<select id="speed"><option value=".5">半速</option><option value="1" selected>正常</option></select></label>
      <label>画质<select id="detail"><option value="3">完整特效</option><option value="2">省电特效</option></select></label></div>
    </aside></div>
  <footer><div class="playback"><button id="play">开始演练</button><button id="replay">重新开始</button><output id="time">0.0 秒</output></div>
    <label class="timeline" for="seek" hidden>攻击时间轴<input id="seek" type="range" min="0" max="3.2" step=".01" value="0"/></label>
    <p id="drill-help">WASD / 方向键或左下摇杆移动。看准预警，提前走出圆环。</p></footer>`;

const element = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = element<HTMLCanvasElement>('canvas'), stage = element('.stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#6e9857');
scene.add(new THREE.HemisphereLight('#fff2cd', '#57755c', 2));
const sun = new THREE.DirectionalLight('#ffedc5', 2); sun.position.set(-8, 12, 8); scene.add(sun);
const world = createSampleWorld({ ...fixedWorldLayout(), water: [] }); scene.add(world.group);
const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, .1, 100);
const player = { x: 5, z: 1.5 };
const combat = new Combat([], 40, () => .5);
combat.party = new PartySystem(); combat.fusionEnabled = true; combat.reset(); combat.automaticSpawning = false;
combat.party.syncLeader(player, 0);
const view = new CombatView(combat); view.setFusion(true, false); view.group.visible = true; scene.add(view.group);
const party = new PartyView(combat.party); party.setAnimatedLeader(true); party.group.visible = true; scene.add(party.group);
combat.encounters.beginWave(4);
const elite = combat.encounters.spawnElite(combat, player)!;
Object.assign(elite, { x: 0, z: 0, previousX: 0, previousZ: 0, spawnTime: 0 });
const drill = new QuakeDrill(combat);
const zones = Array.from({ length: QUAKE_DRILL.capacity }, () => new EliteQuakeView());
for (const zone of zones) scene.add(zone.group);
const boundary = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-10, .07, -6), new THREE.Vector3(10, .07, -6), new THREE.Vector3(10, .07, 6), new THREE.Vector3(-10, .07, 6),
]), new THREE.LineBasicMaterial({ color: '#e4d6a4', transparent: true, opacity: .55 })); scene.add(boundary);
const input = new Input(element('#drill-joystick'), element<HTMLButtonElement>('#drill-dash')); input.setMovementOnly(true);
const seek = element<HTMLInputElement>('#seek'), play = element<HTMLButtonElement>('#play');
const movement = { x: 0, z: 0 }, inactive = { active: false, age: 0, x: 0, z: 0 };
let mode: 'drill' | 'view' = 'drill', time = 0, paused = true, ready = false, disposed = false;
let last = performance.now(), raf = 0, inputEnabled = false;

function syncInput() {
  const editing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
  const enabled = mode === 'drill' && ready && !paused && drill.alive && !document.hidden && !editing;
  if (enabled !== inputEnabled) { input.setEnabled(enabled); inputEnabled = enabled; }
}
function resetView() {
  combat.encounters.beginWave(4); combat.encounters.elite = elite;
  combat.encounters.elitePulsing = true; time = 0;
}
function resetDrill() {
  drill.reset(); combat.clearTransientEffects(); combat.encounters.beginWave(4); combat.encounters.elite = elite;
  player.x = drill.player.x; player.z = drill.player.z; time = 0;
  combat.party!.syncLeader(player, 0); party.stopAnimation(); for (const zone of zones) zone.clear();
}
function advance(dt: number) {
  let left = dt;
  while (left > 1e-8) {
    const step = Math.min(left, 1 / 120); left -= step; time += step;
    combat.encounters.beforeTick(step);
    combat.encounters.movement(elite, step, player, combat, 0, 0);
    combat.encounters.advanceHazards(step, combat, player, player);
  }
}
function advanceDrill(dt: number) {
  const beforeX = player.x, beforeZ = player.z, sampled = input.sample();
  movement.x = sampled.x; movement.z = sampled.y; drill.update(dt, movement); time = drill.elapsed;
  for (const effect of combat.effects) if (effect.active) { effect.time -= dt; effect.active = effect.time > 0; }
  player.x = drill.player.x; player.z = drill.player.z;
  const dx = (player.x - beforeX) / dt, dz = (player.z - beforeZ) / dt;
  combat.party!.syncLeader(player, dx || dz ? Math.atan2(dx, dz) : combat.party!.leader.facing);
  party.stepAnimation(dt, dx, dz);
  if (!drill.alive) { paused = true; syncInput(); }
}
function draw() {
  view.render(1, time, player);
  for (let i = 0; i < zones.length; i++) {
    const zone = drill.zones[i];
    if (mode !== 'drill' || !zone.active || zone.age < 0) { zones[i].clear(); continue; }
    const warning = !zone.impacted;
    zones[i].render(warning ? { x: zone.x, z: zone.z, progress: zone.age / ENCOUNTER_RULES.eliteWindup } : null,
      warning ? inactive : { active: true, x: zone.x, z: zone.z, age: zone.age - ENCOUNTER_RULES.eliteWindup }, view.detail, zone.radius);
  }
  party.render(1, time, combat.hurtFlash / .25, combat.invulnerability); renderer.render(scene, camera);
  if (mode === 'drill') {
    const warning = drill.zones.filter(zone => zone.active && !zone.impacted && zone.age >= 0).length;
    element('#phase').textContent = !drill.alive ? '演练结束' : paused ? '移动躲避地震' : warning ? `${warning} 处地震正在蓄力` : drill.zones.some(zone => zone.active) ? '落地冲击 · 保持移动' : '准备下一轮';
    element('.stage-note small').textContent = 'WASD / 方向键移动，触屏拖动左下摇杆';
    element('#drill-hp').textContent = String(Math.floor(combat.hp)); element<HTMLProgressElement>('#drill-health').value = combat.hp;
    element('#drill-dodged').textContent = String(drill.dodged); element('#drill-death').hidden = drill.alive;
    element('#drill-hit').style.opacity = String(Math.min(.65, combat.hurtFlash * 2));
    element<HTMLButtonElement>('#drill-trigger').disabled = !ready || !drill.canTrigger;
    element('#time').textContent = `${time.toFixed(1)} 秒`; play.textContent = paused ? time ? '继续演练' : '开始演练' : '暂停'; play.disabled = !drill.alive || !ready;
  } else {
    const warning = combat.encounters.elitePulsing, impact = combat.encounters.eliteQuake;
    element('#phase').textContent = warning ? '蓄力预警' : impact.active ? impact.age < .32 ? '落地冲击' : '裂纹余波' : '恢复';
    element('.stage-note small').textContent = warning ? '金色边界内危险，向外移动躲避' : '伤害已结算，裂纹与尘土逐渐消退';
    element('#time').textContent = `${time.toFixed(2)} / 3.20 秒`; seek.value = String(time);
    play.textContent = paused ? '播放' : '暂停'; play.disabled = !ready;
  }
}
function jump(value: number) { resetView(); advance(THREE.MathUtils.clamp(value, 0, 3.2)); draw(); }
function resize() {
  const width = stage.clientWidth, height = stage.clientHeight;
  renderer.setSize(width, height, false);
  const halfHeight = mode === 'drill' ? Math.max(6.5, 11.5 * height / width) : Math.max(5.6, 7.2 * height / width);
  camera.position.set(mode === 'drill' ? 0 : 1.3, 17, 17); camera.lookAt(mode === 'drill' ? 0 : 1.3, 0, 0); camera.updateMatrixWorld();
  camera.left = -halfHeight * width / height; camera.right = -camera.left; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
  view.updateView(camera, height, halfHeight * 2); party.setCamera(camera); party.resize(height, halfHeight * 2);
  for (const zone of zones) zone.setView(camera); draw();
}
function setMode(value: 'drill' | 'view') {
  mode = value; paused = true; resetDrill();
  if (mode === 'view') { player.x = 5; player.z = 1.5; combat.party!.syncLeader(player, 0); resetView(); advance(1.05); }
  for (const id of ['drill-controls', 'drill-hud', 'drill-joystick', 'drill-help']) element('#' + id).hidden = mode !== 'drill';
  element('#drill-death').hidden = true; element('#drill-hit').hidden = mode !== 'drill';
  element('#view-controls').hidden = element('.timeline').hidden = mode !== 'view'; boundary.visible = mode === 'drill';
  element('#mode-drill').setAttribute('aria-pressed', String(mode === 'drill')); element('#mode-view').setAttribute('aria-pressed', String(mode === 'view'));
  element<HTMLButtonElement>('#replay').textContent = mode === 'drill' ? '重新开始' : '重播';
  last = performance.now(); syncInput(); resize();
}
element('#mode-drill').onclick = () => setMode('drill'); element('#mode-view').onclick = () => setMode('view');
play.onclick = () => { paused = !paused; last = performance.now(); canvas.focus({ preventScroll: true }); syncInput(); draw(); };
function restart() { mode === 'drill' ? resetDrill() : resetView(); paused = false; last = performance.now(); canvas.focus({ preventScroll: true }); syncInput(); draw(); }
element('#replay').onclick = restart; element('#retry-drill').onclick = restart;
element('#drill-trigger').onclick = () => { if (drill.trigger()) { paused = false; last = performance.now(); canvas.focus({ preventScroll: true }); syncInput(); draw(); } };
element<HTMLInputElement>('#drill-radius').oninput = event => { drill.radius = Number((event.target as HTMLInputElement).value); element('#radius-value').textContent = drill.radius.toFixed(1); };
element<HTMLSelectElement>('#drill-count').onchange = event => { drill.count = Number((event.target as HTMLSelectElement).value); };
element<HTMLInputElement>('#drill-auto').onchange = event => { drill.automatic = (event.target as HTMLInputElement).checked; };
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-time]')) button.onclick = () => { paused = true; jump(Number(button.dataset.time)); };
seek.oninput = () => { paused = true; jump(Number(seek.value)); };
element<HTMLSelectElement>('#detail').onchange = event => { view.detail = Number((event.target as HTMLSelectElement).value); draw(); };
const events = new AbortController();
function suspend() { paused = true; last = performance.now(); input.reset(); syncInput(); draw(); }
window.addEventListener('blur', suspend, { signal: events.signal });
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); }, { signal: events.signal });
document.addEventListener('focusin', syncInput, { signal: events.signal });
document.addEventListener('focusout', () => queueMicrotask(syncInput), { signal: events.signal });
window.addEventListener('keydown', event => { if (event.code === 'Escape') { paused = !paused; last = performance.now(); syncInput(); draw(); } }, { signal: events.signal });
const observer = new ResizeObserver(resize); observer.observe(stage); setMode('drill');
void world.ready.then(() => { if (disposed) return; ready = true; element('#loading').hidden = true; syncInput(); draw(); }).catch(() => {
  if (disposed) return; ready = true; element('#loading').textContent = '草场贴图不可用，演练仍可运行'; syncInput(); draw();
});
function frame(now: number) {
  if (disposed) return;
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (ready && !paused && !document.hidden && dt > 0) {
    const scaled = dt * Number(element<HTMLSelectElement>('#speed').value);
    if (mode === 'drill') advanceDrill(scaled); else if (time + scaled >= 3.2) resetView(); else advance(scaled);
  }
  draw(); raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
function dispose() {
  disposed = true; cancelAnimationFrame(raf); observer.disconnect(); events.abort(); input.dispose();
  for (const zone of zones) zone.dispose(); boundary.geometry.dispose(); boundary.material.dispose();
  view.dispose(); party.dispose(); world.dispose(); renderer.dispose();
}
if (import.meta.env.DEV) Object.defineProperty(window, '__eliteQuake', { configurable: true, value: {
  inspect: () => ({ mode, time, paused, ready, windup: ENCOUNTER_RULES.eliteWindup, quake: view.inspect().encounters.quake,
    event: { ...combat.encounters.eliteQuake }, drill: drill.inspect(), fields: zones.map(zone => zone.inspect()),
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  seek: (value: number) => { if (mode !== 'view') setMode('view'); paused = true; jump(value); }, dispose,
  pixels: () => {
    draw(); const gl = renderer.getContext(), size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const pixels = new Uint8Array(size.x * size.y * 4); gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2166136261; for (let i = 0; i < pixels.length; i += 4) hash = Math.imul(hash ^ pixels[i], 16777619) >>> 0;
    return hash;
  },
} });
import.meta.hot?.dispose(() => { dispose(); Reflect.deleteProperty(window, '__eliteQuake'); });
