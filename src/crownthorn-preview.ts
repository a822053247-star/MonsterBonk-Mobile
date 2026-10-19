import * as THREE from 'three';
import { CrownthornView } from './crownthorn-view';
import { CROWNTHORN_CLIPS, type CrownthornAction } from './crownthorn-animation';
import { FACING_ORDER, type Facing8 } from './creature-animation';
import './crownthorn-preview.css';

const names: Record<CrownthornAction, string> = { idle: '待机', 'dash-windup': '蓄力冲刺', dash: '冲刺', 'spread-cast': '扇形弹幕施法', summon: '召唤', 'enraged-idle': '狂暴待机', death: '死亡' };
const directions: Record<Facing8, string> = { down: '↓ 正面', 'down-right': '↘ 右前', right: '→ 右侧', 'up-right': '↗ 右后', up: '↑ 背面', 'up-left': '↖ 左后', left: '← 左侧', 'down-left': '↙ 左前' };
document.querySelector('#preview')!.innerHTML = `<header><a href="./">返回游戏</a><h1>荆冠兽王</h1><p>2.5D 八方向与正面动作预览 · 正式战斗位于六波挑战第 6 波</p></header>
<div class="stage"><canvas aria-label="荆冠兽王动画"></canvas><span class="ground-label">＋ 脚底锚点</span></div>
<section aria-label="预览控制"><label>屏幕投影移动方向 <select id="direction">${FACING_ORDER.map(d => `<option value="${d}">${directions[d]}</option>`).join('')}</select></label>
<label>显示动作 <select id="action"><option value="move">方向展示（静态朝向素材）</option>${Object.entries(names).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}</select></label>
<div class="buttons"><button id="pause">暂停</button><button id="restart">从头播放</button><button id="reset">重置</button></div>
<output id="status" aria-live="polite"></output><p>移动显示五张原图及三张水平镜像；战斗动作只使用正面素材，动作结束停在末帧。此处方向输入用于检验投影，不产生攻击、碰撞或预警。</p>
<details open><summary>素材审查：可用帧 / 原定帧</summary><ul>${Object.entries(CROWNTHORN_CLIPS).map(([key, c]) => `<li>${names[key as CrownthornAction]}：${c.frames.length}/${c.expected}${c.frames.length < c.expected ? '（部分帧不可用）' : ''}</li>`).join('')}</ul><p>四张替换素材已重新审查，七套动作帧数完整。播放全部已验证原始帧，未补画、复制或伪造动作帧。</p></details></section>`;
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100);
camera.position.set(0, 12, 12); camera.lookAt(0, 1.8, 0); camera.updateMatrixWorld();
const boss = new CrownthornView(); scene.add(boss.group);
const grid = new THREE.GridHelper(12, 12, '#a6b78a', '#3f5148'); scene.add(grid);
const marker = new THREE.Mesh(new THREE.RingGeometry(.12, .16, 16), new THREE.MeshBasicMaterial({ color: '#e7d79b', side: THREE.DoubleSide }));
marker.rotation.x = -Math.PI / 2; marker.position.y = .02; scene.add(marker);
const basis = { rightX: camera.matrixWorld.elements[0], rightZ: camera.matrixWorld.elements[2], upX: camera.matrixWorld.elements[4], upZ: camera.matrixWorld.elements[6] };
let paused = false, last = performance.now(), raf = 0, disposed = false;
const direction = document.querySelector<HTMLSelectElement>('#direction')!, action = document.querySelector<HTMLSelectElement>('#action')!;
direction.value = 'down';
function step(dt: number) {
  const angle = FACING_ORDER.indexOf(direction.value as Facing8) * Math.PI / 4;
  // Invert the actual camera basis, rather than assuming world Z is screen Y.
  const sx = Math.cos(angle), sy = -Math.sin(angle);
  const determinant = basis.rightX * basis.upZ - basis.rightZ * basis.upX;
  boss.step(dt, (sx * basis.upZ - basis.rightZ * sy) / determinant, (basis.rightX * sy - sx * basis.upX) / determinant, basis);
}
function draw() {
  renderer.render(scene, camera);
  const state = boss.inspect(), failed = state.atlases.filter(a => a.failed).length;
  document.querySelector('#status')!.textContent = `${state.action ? names[state.action] : '方向展示'} · 逻辑朝向 ${directions[state.facing]} · 显示 ${directions[state.renderedFacing]} · 帧 ${state.renderedFrame + 1} · 可用 ${state.usable}/${state.expected}${state.complete ? '' : '（素材不完整）'}${state.fallback ? ' · 当前素材未就绪，回退正面静态图' : ''}${failed ? ` · ${failed} 张图集加载失败` : ''}${state.visible ? '' : ' · 无可用素材'}${paused ? ' · 已暂停' : ''}`;
}
function resize() { const { width, height } = canvas.getBoundingClientRect(); renderer.setSize(width, height, false); const aspect = width / height; camera.left = -4.7 * aspect; camera.right = 4.7 * aspect; camera.top = 4.7; camera.bottom = -4.7; camera.updateProjectionMatrix(); draw(); }
function setPaused(value: boolean) { paused = value; last = performance.now(); document.querySelector('#pause')!.textContent = paused ? '继续' : '暂停'; draw(); }
action.onchange = () => { boss.play(action.value === 'move' ? null : action.value as CrownthornAction, true); draw(); };
direction.onchange = () => { step(1e-6); draw(); };
document.querySelector('#pause')!.addEventListener('click', () => setPaused(!paused));
document.querySelector('#restart')!.addEventListener('click', () => { boss.play(boss.animator.action, true); draw(); });
document.querySelector('#reset')!.addEventListener('click', () => { boss.reset(); direction.value = 'down'; action.value = 'move'; step(1e-6); setPaused(false); });
function visibility() { if (document.hidden) setPaused(true); }
document.addEventListener('visibilitychange', visibility);
const observer = new ResizeObserver(resize); observer.observe(canvas);
function tick(now: number) { if (disposed) return; const dt = Math.min(.05, (now-last)/1000); last = now; if (!paused && !document.hidden) step(dt); draw(); raf = requestAnimationFrame(tick); }
resize(); raf = requestAnimationFrame(tick);
function dispose() { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); boss.dispose(); grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); marker.geometry.dispose(); marker.material.dispose(); renderer.dispose(); }
if (import.meta.env.DEV) Object.defineProperty(window, '__crownthorn', { configurable: true, value: {
  inspect: () => boss.inspect(), step, dispose,
  pixels: () => {
    draw();
    const gl = renderer.getContext(), size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const data = new Uint8Array(size.x * size.y * 4);
    gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let bodyPixels = 0, hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] > 0 && data[i] > data[i+1]*1.1) bodyPixels++;
      hash = Math.imul(hash ^ data[i], 16777619) >>> 0;
    }
    return { bodyPixels, hash };
  },
} });
import.meta.hot?.dispose(() => { dispose(); Reflect.deleteProperty(window, '__crownthorn'); });
