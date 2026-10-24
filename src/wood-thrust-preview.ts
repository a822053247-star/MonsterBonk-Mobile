type Level = 1 | 2 | 3 | 4 | 5;
type PreviewEnemy = { id: number; x: number; y: number; hp: number; deadAt: number; lastHitAt: number; lastDamage: number };
type LevelSpec = { range: number; pierce: number; width: number; damage: number; burst: number; detail: string };

const root = document.querySelector<HTMLElement>("#wood-thrust-preview");
if (!root) throw new Error("Wood Thrust preview root is missing.");

const style = document.createElement("style");
style.textContent = [
  ":root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#f4f0d8;background:#0d1916;font-synthesis:none}",
  "*{box-sizing:border-box}",
  "html,body{margin:0;min-height:100%;background:#0d1916}",
  "body{min-height:100dvh;overflow-x:hidden;user-select:none;-webkit-tap-highlight-color:transparent}",
  "button{font:inherit;cursor:pointer;color:inherit}",
  "button:focus-visible{outline:3px solid #f7e5a0;outline-offset:3px}",
  ".wood-page{width:min(1440px,100%);margin:0 auto;padding:max(18px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}",
  ".wood-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 0 18px}",
  ".wood-kicker{color:#b7d78b;font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase}",
  ".wood-title{margin:7px 0 5px;font-size:clamp(28px,4vw,46px);line-height:1.05;letter-spacing:-1.5px;color:#fff5d9}",
  ".wood-subtitle{margin:0;color:#a5b9a5;font-size:14px;line-height:1.6}",
  ".wood-pill{flex:0 0 auto;border:1px solid #6c916b;background:#1b3329;color:#cfe8ac;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700}",
  ".wood-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:start}",
  ".wood-card{border:1px solid #344e3e;background:linear-gradient(155deg,#172a23,#12211d 72%);border-radius:16px;overflow:hidden;box-shadow:0 16px 40px #0003}",
  ".wood-stage-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #314638;color:#d9e9c9;font-size:12px;font-weight:750;letter-spacing:.4px}",
  ".wood-live{display:inline-flex;align-items:center;gap:7px;color:#b6d58a}.wood-live:before{content:'';width:7px;height:7px;border-radius:50%;background:#9bd26e;box-shadow:0 0 12px #9bd26e}",
  ".wood-canvas{display:block;width:100%;height:auto;aspect-ratio:8/5;background:#172b23}",
  ".wood-stage-foot{display:flex;justify-content:space-between;gap:12px;padding:11px 16px;color:#8fa891;font-size:11px;line-height:1.5;border-top:1px solid #314638}",
  ".wood-side{display:grid;gap:14px}",
  ".wood-panel{padding:16px}",
  ".wood-panel h2{margin:0 0 12px;font-size:15px;color:#f3efd7;letter-spacing:.2px}",
  ".wood-level-buttons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}",
  ".wood-level-button{min-height:42px;padding:8px 2px;border-radius:9px;border:1px solid #405b46;background:#1b3027;color:#b9cbb5;font-size:12px;font-weight:800}",
  ".wood-level-button[aria-pressed=true]{background:#d8e9a4;color:#183123;border-color:#f0f6c4;box-shadow:0 0 0 2px #d8e9a426}",
  ".wood-replay{width:100%;min-height:44px;margin-top:9px;border:1px solid #8ca56d;border-radius:10px;background:#334c32;color:#f1f3cf;font-size:13px;font-weight:800}",
  ".wood-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
  ".wood-stat{padding:11px;border-radius:10px;background:#0f1d19;border:1px solid #293e31;min-width:0}",
  ".wood-stat-label{display:block;color:#8fa993;font-size:11px;margin-bottom:6px}",
  ".wood-stat-value{display:block;color:#eff5d7;font-size:22px;font-weight:850;letter-spacing:-.5px;font-variant-numeric:tabular-nums}",
  ".wood-stat-unit{font-size:11px;color:#b2c7a9;font-weight:650;margin-left:3px}",
  ".wood-detail{margin:0;color:#c0d0bb;font-size:13px;line-height:1.75}",
  ".wood-detail strong{color:#e4efc2}",
  ".wood-rule{margin:13px 0;border:0;border-top:1px solid #304538}",
  ".wood-level-map{display:grid;gap:8px;margin:0;padding:0;list-style:none}",
  ".wood-level-map li{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:start;color:#a9bca7;font-size:12px;line-height:1.55}",
  ".wood-level-map b{display:grid;place-items:center;width:28px;height:24px;border-radius:6px;background:#263c2b;color:#d7e8a2;font-size:11px}",
  ".wood-level-map li.current{color:#f2f0d8}.wood-level-map li.current b{background:#d8e9a4;color:#1a3024}",
  ".wood-note{margin:14px 0 0;color:#819887;font-size:11px;line-height:1.65}",
  "@media(max-width:900px){.wood-layout{grid-template-columns:1fr}.wood-side{grid-template-columns:repeat(2,minmax(0,1fr))}.wood-side .wood-panel:last-child{grid-column:1/-1}}",
  "@media(max-width:560px){.wood-page{padding-left:10px;padding-right:10px}.wood-header{align-items:flex-start;flex-direction:column;gap:10px;margin-bottom:12px}.wood-pill{font-size:11px}.wood-layout{gap:10px}.wood-side{grid-template-columns:1fr}.wood-side .wood-panel:last-child{grid-column:auto}.wood-stage-head{padding:11px 12px}.wood-stage-foot{padding:10px 12px;flex-direction:column;gap:3px}.wood-panel{padding:13px}.wood-stat-value{font-size:20px}}",
].join("\n");
document.head.append(style);

root.innerHTML = [
  '<div class="wood-page">',
  '  <header class="wood-header">',
  '    <div><div class="wood-kicker">MONSTERBONK · WEAPON LAB</div><h1 class="wood-title">灵木枝刺</h1><p class="wood-subtitle">直线贯穿 · 枝杈生长 · 五级根刺爆发</p></div>',
  '    <div class="wood-pill">独立视觉原型 · 不影响正式构筑</div>',
  '  </header>',
  '  <div class="wood-layout">',
  '    <section class="wood-card" aria-label="武器实时演示">',
  '      <div class="wood-stage-head"><span>实时攻击演示</span><span class="wood-live" id="wood-cycle">自动攻击中</span></div>',
  '      <canvas class="wood-canvas" id="wood-canvas" width="960" height="600" aria-label="灵木枝刺向前伸展并贯穿敌人的动画预览"></canvas>',
  '      <div class="wood-stage-foot"><span>枝刺会锁定前方目标，沿一条直线快速伸出并回收。</span><span id="wood-hit-summary">等待首次命中…</span></div>',
  '    </section>',
  '    <aside class="wood-side">',
  '      <section class="wood-card wood-panel">',
  '        <h2>预览等级 <span id="wood-current-level" style="color:#cfe6a0">1级</span></h2>',
  '        <div class="wood-level-buttons" role="group" aria-label="选择灵木枝刺等级">',
  '          <button class="wood-level-button" data-level="1" aria-pressed="true">1级</button>',
  '          <button class="wood-level-button" data-level="2" aria-pressed="false">2级</button>',
  '          <button class="wood-level-button" data-level="3" aria-pressed="false">3级</button>',
  '          <button class="wood-level-button" data-level="4" aria-pressed="false">4级</button>',
  '          <button class="wood-level-button" data-level="5" aria-pressed="false">5级</button>',
  '        </div>',
  '        <button class="wood-replay" id="wood-replay">重新演示当前等级</button>',
  '      </section>',
  '      <section class="wood-card wood-panel">',
  '        <h2>当前攻击参数</h2>',
  '        <div class="wood-stats">',
  '          <div class="wood-stat"><span class="wood-stat-label">基础伤害</span><span class="wood-stat-value" data-stat="damage">24</span></div>',
  '          <div class="wood-stat"><span class="wood-stat-label">直刺距离</span><span class="wood-stat-value" data-stat="range">7.2<span class="wood-stat-unit">单位</span></span></div>',
  '          <div class="wood-stat"><span class="wood-stat-label">最多贯穿</span><span class="wood-stat-value" data-stat="pierce">3<span class="wood-stat-unit">个</span></span></div>',
  '          <div class="wood-stat"><span class="wood-stat-label">攻击间隔</span><span class="wood-stat-value">1.0<span class="wood-stat-unit">秒</span></span></div>',
  '        </div>',
  '        <hr class="wood-rule">',
  '        <p class="wood-detail" id="wood-level-detail">基础枝刺向前伸出，贯穿最多3个敌人。</p>',
  '      </section>',
  '      <section class="wood-card wood-panel">',
  '        <h2>升级变化</h2>',
  '        <ol class="wood-level-map" id="wood-level-map">',
  '          <li class="current" data-map-level="1"><b>1级</b><span>基础直刺，贯穿最多3个敌人。</span></li>',
  '          <li data-map-level="2"><b>2级</b><span>基础伤害提高14%。</span></li>',
  '          <li data-map-level="3"><b>3级</b><span>刺击距离提高至8.2，最多贯穿4个敌人。</span></li>',
  '          <li data-map-level="4"><b>4级</b><span>枝刺明显变宽，更容易覆盖一列敌人。</span></li>',
  '          <li data-map-level="5"><b>5级</b><span>刺尖爆出根刺，追加40%主伤害的范围爆发。</span></li>',
  '        </ol>',
  '        <p class="wood-note">此页面只演示攻击节奏、穿刺表现和等级视觉变化。参数是设计预览值，尚未接入正式战斗伤害、升级卡或融合系统。</p>',
  '      </section>',
  '    </aside>',
  '  </div>',
  '</div>',
].join("");

const canvas = document.querySelector<HTMLCanvasElement>("#wood-canvas")!;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D is unavailable.");
ctx.imageSmoothingEnabled = false;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const ATTACK_INTERVAL = 1;
const START_X = 252;
const START_Y = 326;
const PIXELS_PER_UNIT = 58;
const MAX_HP = 100;
const specs: Record<Level, LevelSpec> = {
  1: { range: 7.2, pierce: 3, width: 13, damage: 24, burst: 0, detail: "基础枝刺向前伸出，沿直线贯穿最多3个敌人。" },
  2: { range: 7.2, pierce: 3, width: 15, damage: 24 * 1.14, burst: 0, detail: "枝刺的基础伤害提高14%，攻击仍保持快速直刺与回收。" },
  3: { range: 8.2, pierce: 4, width: 17, damage: 24 * 1.28, burst: 0, detail: "枝条延伸更远，最多贯穿4个敌人；适合清理排成一线的怪群。" },
  4: { range: 8.2, pierce: 4, width: 25, damage: 24 * 1.42, burst: 0, detail: "枝刺变得更粗，命中判定表现更宽，能更稳定地覆盖一列敌人。" },
  5: { range: 8.2, pierce: 4, width: 27, damage: 24 * 1.56, burst: 0.4, detail: "刺尖命中时爆出根刺，追加主攻击伤害40%的小范围爆发。" },
};
const enemyStarts = [
  { x: 320, y: 306 },
  { x: 415, y: 318 },
  { x: 510, y: 304 },
  { x: 605, y: 320 },
  { x: 700, y: 307 },
  { x: 795, y: 319 },
];
let level: Level = 1;
let elapsed = 0;
let lastTime = 0;
let frameId = 0;
let lastShotCycle = -1;
let impactAt = -10;
let impactX = START_X + 7.2 * PIXELS_PER_UNIT;
let enemies: PreviewEnemy[] = createEnemies();

function createEnemies(): PreviewEnemy[] {
  return enemyStarts.map((enemy, id) => ({ id, x: enemy.x, y: enemy.y, hp: MAX_HP, deadAt: -10, lastHitAt: -10, lastDamage: 0 }));
}

function currentSpec(): LevelSpec {
  return specs[level];
}

function setText(selector: string, text: string): void {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) node.textContent = text;
}

function updateLevelUi(): void {
  const spec = currentSpec();
  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.level) === level));
  });
  document.querySelectorAll<HTMLElement>("[data-map-level]").forEach(item => {
    item.classList.toggle("current", Number(item.dataset.mapLevel) === level);
  });
  setText("#wood-current-level", level + "级");
  setText('[data-stat="damage"]', spec.damage.toFixed(1).replace(/\.0$/, ""));
  const range = document.querySelector<HTMLElement>('[data-stat="range"]');
  if (range) range.innerHTML = spec.range.toFixed(1) + '<span class="wood-stat-unit">单位</span>';
  const pierce = document.querySelector<HTMLElement>('[data-stat="pierce"]');
  if (pierce) pierce.innerHTML = spec.pierce + '<span class="wood-stat-unit">个</span>';
  setText("#wood-level-detail", spec.detail);
  setText("#wood-hit-summary", "等待首次命中…");
}

function resetPreview(): void {
  elapsed = 0;
  lastTime = 0;
  lastShotCycle = -1;
  impactAt = -10;
  impactX = START_X + currentSpec().range * PIXELS_PER_UNIT;
  enemies = createEnemies();
  updateLevelUi();
}

document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(button => {
  button.addEventListener("click", () => {
    const requested = Number(button.dataset.level);
    if (requested >= 1 && requested <= 5) {
      level = requested as Level;
      resetPreview();
    }
  });
});
document.querySelector<HTMLButtonElement>("#wood-replay")!.addEventListener("click", resetPreview);

function drawBackground(time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#152d26");
  sky.addColorStop(0.55, "#203e2d");
  sky.addColorStop(1, "#0e211b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(510, 245, 20, 510, 245, 470);
  glow.addColorStop(0, "#7e9f4c30");
  glow.addColorStop(1, "#7e9f4c00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "#b6d68b13";
  ctx.lineWidth = 1;
  for (let x = -120; x < WIDTH + 120; x += 64) {
    ctx.beginPath();
    ctx.moveTo(480 + (x - 480) * 0.28, 155);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 190; y < HEIGHT; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  for (let i = 0; i < 46; i++) {
    const x = (i * 197 + 37) % WIDTH;
    const y = 176 + ((i * 83) % 390);
    const sway = Math.sin(time * 1.1 + i * 1.7) * 2;
    ctx.fillStyle = i % 3 === 0 ? "#c6db8266" : "#7eb7784a";
    ctx.fillRect(x + sway, y, 2, i % 4 === 0 ? 8 : 4);
  }

  ctx.fillStyle = "#0b1a16";
  ctx.fillRect(0, 0, WIDTH, 154);
  ctx.fillStyle = "#274b33";
  for (let i = 0; i < 20; i++) {
    const x = i * 54 - 10;
    const h = 22 + (i * 17) % 38;
    ctx.beginPath();
    ctx.moveTo(x - 18, 155);
    ctx.lineTo(x + 4, 155 - h);
    ctx.lineTo(x + 27, 155);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#e3e9b2";
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.fillText("WOOD THRUST / " + String(level).padStart(2, "0"), 22, 32);
  ctx.fillStyle = "#a8c29b";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("AUTO TARGET  ·  LINEAR PIERCE", 22, 52);
  ctx.textAlign = "right";
  ctx.fillStyle = "#d7e6bd";
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.fillText("LV." + level, WIDTH - 22, 33);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#9fbd93";
  ctx.fillText("贯穿 " + currentSpec().pierce + " 目标", WIDTH - 22, 53);
  ctx.textAlign = "left";
}

function drawLeaf(x: number, y: number, angle: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(-size * 0.1, -size * 0.9, size, 0);
  ctx.quadraticCurveTo(0, size * 0.55, -size, 0);
  ctx.fill();
  ctx.strokeStyle = "#d4e9a06b";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.7, 0);
  ctx.lineTo(size * 0.65, 0);
  ctx.stroke();
  ctx.restore();
}

function drawFox(time: number): void {
  const bob = Math.sin(time * 4) * 2;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = "#07140f70";
  ctx.beginPath();
  ctx.ellipse(174, 369, 63, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#b95c32";
  ctx.beginPath();
  ctx.moveTo(143, 317);
  ctx.lineTo(98, 294 + Math.sin(time * 3) * 4);
  ctx.lineTo(74, 301);
  ctx.lineTo(111, 334);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f5d5a0";
  ctx.beginPath();
  ctx.moveTo(81, 300);
  ctx.lineTo(74, 301);
  ctx.lineTo(91, 317);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#bd6436";
  ctx.beginPath();
  ctx.ellipse(160, 331, 49, 28, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e88a45";
  ctx.beginPath();
  ctx.ellipse(170, 324, 36, 23, -0.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8d482c";
  ctx.fillRect(128, 345, 11, 25);
  ctx.fillRect(155, 347, 10, 24);
  ctx.fillRect(185, 346, 10, 24);
  ctx.fillRect(207, 340, 9, 27);
  ctx.fillStyle = "#f2d1a0";
  ctx.fillRect(127, 366, 13, 5);
  ctx.fillRect(154, 368, 12, 5);
  ctx.fillRect(184, 367, 12, 5);
  ctx.fillRect(206, 365, 12, 5);

  ctx.fillStyle = "#f5dfb4";
  ctx.beginPath();
  ctx.ellipse(207, 332, 23, 20, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e78b43";
  ctx.beginPath();
  ctx.ellipse(217, 312, 27, 23, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8f4b2e";
  ctx.beginPath();
  ctx.moveTo(198, 294);
  ctx.lineTo(200, 272);
  ctx.lineTo(213, 291);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(220, 291);
  ctx.lineTo(235, 274);
  ctx.lineTo(236, 299);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f3c5a0";
  ctx.beginPath();
  ctx.moveTo(203, 289);
  ctx.lineTo(202, 280);
  ctx.lineTo(209, 292);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f7dfb8";
  ctx.beginPath();
  ctx.ellipse(238, 318, 18, 11, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b241b";
  ctx.beginPath();
  ctx.arc(243, 313, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#251f19";
  ctx.beginPath();
  ctx.arc(226, 307, 2.4, 0, Math.PI * 2);
  ctx.fill();
  drawLeaf(219, 292, -0.35, 8, "#b7d77b");
  ctx.restore();
}

function drawEnemy(enemy: PreviewEnemy, time: number): void {
  if (enemy.hp <= 0) {
    const age = time - enemy.deadAt;
    if (age > 1.65) {
      enemy.hp = MAX_HP;
      enemy.deadAt = -10;
      enemy.lastHitAt = -10;
    } else {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 1.65);
      ctx.strokeStyle = "#d8e89b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 20 + age * 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
  }

  const float = Math.sin(time * 2.7 + enemy.id) * 3;
  const y = enemy.y + float;
  ctx.fillStyle = "#07140f80";
  ctx.beginPath();
  ctx.ellipse(enemy.x, y + 26, 25, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(enemy.x - 8, y - 10, 3, enemy.x, y + 3, 35);
  body.addColorStop(0, "#d4bb70");
  body.addColorStop(0.55, "#8d9c54");
  body.addColorStop(1, "#435f3c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(enemy.x, y, 24, 25, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(enemy.x + 24, y + 10);
  ctx.quadraticCurveTo(enemy.x, y + 35, enemy.x - 24, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d8e69a";
  ctx.beginPath();
  ctx.arc(enemy.x - 7, y - 3, 3, 0, Math.PI * 2);
  ctx.arc(enemy.x + 7, y - 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#253222";
  ctx.beginPath();
  ctx.arc(enemy.x - 6, y - 3, 1.3, 0, Math.PI * 2);
  ctx.arc(enemy.x + 8, y - 3, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#13241c";
  ctx.fillRect(enemy.x - 24, y - 39, 48, 5);
  ctx.fillStyle = enemy.hp > 40 ? "#b6d77b" : "#f2b36e";
  ctx.fillRect(enemy.x - 23, y - 38, 46 * enemy.hp / MAX_HP, 3);

  const hitAge = time - enemy.lastHitAt;
  if (hitAge >= 0 && hitAge < 0.7) {
    ctx.save();
    ctx.globalAlpha = 1 - hitAge / 0.7;
    ctx.fillStyle = "#fff1a4";
    ctx.font = "800 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("-" + Math.round(enemy.lastDamage), enemy.x, y - 47 - hitAge * 28);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawBranch(time: number, attackAge: number): void {
  const spec = currentSpec();
  const maxTip = START_X + spec.range * PIXELS_PER_UNIT;
  const plannedTargets = enemies.filter(enemy => enemy.hp > 0 && enemy.x >= START_X + 12 && enemy.x <= maxTip + 5).sort((a, b) => a.x - b.x).slice(0, spec.pierce);
  const plannedTip = plannedTargets.length ? plannedTargets[plannedTargets.length - 1].x : maxTip;
  const fullLength = plannedTip - START_X;
  let progress = 0;
  if (attackAge < 0.12) progress = Math.min(1, attackAge / 0.12);
  else if (attackAge < 0.18) progress = 1;
  else if (attackAge < 0.32) progress = Math.max(0, 1 - (attackAge - 0.18) / 0.14);
  if (progress <= 0.01) return;

  const tipX = START_X + fullLength * progress;
  const points: Array<{ x: number; y: number }> = [];
  const segments = 10;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push({ x: START_X + (tipX - START_X) * t, y: START_Y + Math.sin(t * 13 + time * 5) * 4 * t });
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = "#211b14";
  ctx.lineWidth = spec.width + 8;
  ctx.stroke();
  ctx.strokeStyle = "#74512b";
  ctx.lineWidth = spec.width;
  ctx.stroke();
  ctx.strokeStyle = "#c6a66a";
  ctx.lineWidth = Math.max(2, spec.width * 0.22);
  ctx.stroke();

  for (let i = 2; i < points.length - 1; i += 2) {
    const point = points[i];
    const direction = i % 4 === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 13, point.y + direction * (11 + level));
    ctx.lineTo(point.x + 23, point.y + direction * (9 + level));
    ctx.strokeStyle = "#35271a";
    ctx.lineWidth = Math.max(3, spec.width * 0.42);
    ctx.stroke();
    ctx.strokeStyle = "#956b35";
    ctx.lineWidth = Math.max(1.5, spec.width * 0.22);
    ctx.stroke();
    if (i % 4 === 0) drawLeaf(point.x + 17, point.y - 11, -0.5, 8 + level, "#9fc56b");
  }

  ctx.fillStyle = "#d4bd7b";
  ctx.beginPath();
  ctx.moveTo(tipX - 8, START_Y - spec.width * 0.35);
  ctx.lineTo(tipX + 8, START_Y);
  ctx.lineTo(tipX - 8, START_Y + spec.width * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

}

function drawRootBurst(time: number, attackAge: number): void {
  const burstAge = time - impactAt;
  if (burstAge < 0 || burstAge > 0.34 || attackAge > 0.32) return;
  const alpha = 1 - burstAge / 0.34;
  const radius = 15 + burstAge * 155;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#dceca0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(impactX, START_Y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#a8cc71";
  ctx.lineWidth = 5;
  for (let i = 0; i < 9; i++) {
    const angle = i * Math.PI * 2 / 9 + burstAge * 1.6;
    const inner = radius * 0.28;
    const outer = radius * 0.62 + Math.sin(i * 2 + time * 9) * 5;
    ctx.beginPath();
    ctx.moveTo(impactX + Math.cos(angle) * inner, START_Y + Math.sin(angle) * inner);
    ctx.lineTo(impactX + Math.cos(angle) * (outer + 13), START_Y + Math.sin(angle) * (outer + 13));
    ctx.lineTo(impactX + Math.cos(angle + 0.12) * outer, START_Y + Math.sin(angle + 0.12) * outer);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = "#f3edb3";
  ctx.beginPath();
  ctx.arc(impactX, START_Y, 8 + burstAge * 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function resolveAttack(): void {
  const spec = currentSpec();
  const tipX = START_X + spec.range * PIXELS_PER_UNIT;
  const targets = enemies
    .filter(enemy => enemy.hp > 0 && enemy.x >= START_X + 12 && enemy.x <= tipX + 5)
    .sort((a, b) => a.x - b.x)
    .slice(0, spec.pierce);

  for (const enemy of targets) {
    enemy.hp = Math.max(0, enemy.hp - spec.damage);
    enemy.lastHitAt = elapsed;
    enemy.lastDamage = spec.damage;
    if (enemy.hp <= 0) enemy.deadAt = elapsed;
  }

  impactX = targets.length ? targets[targets.length - 1].x : tipX;
  impactAt = elapsed;

  if (spec.burst > 0) {
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || Math.hypot(enemy.x - impactX, enemy.y - START_Y) > 104) continue;
      enemy.hp = Math.max(0, enemy.hp - spec.damage * spec.burst);
      enemy.lastHitAt = elapsed;
      enemy.lastDamage = spec.damage * spec.burst;
      if (enemy.hp <= 0) enemy.deadAt = elapsed;
    }
  }
  setText("#wood-hit-summary", "本次命中 " + targets.length + " 个目标" + (level === 5 ? " · 根刺爆发" : ""));
}

function drawRangeGuide(): void {
  const tip = START_X + currentSpec().range * PIXELS_PER_UNIT;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "#d2e7a32e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(START_X, START_Y + 31);
  ctx.lineTo(tip, START_Y + 31);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#b5ce9a";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(currentSpec().range.toFixed(1) + "u 射程", Math.min(tip - 54, WIDTH - 100), START_Y + 50);
  ctx.restore();
}

function render(time: number): void {
  drawBackground(time);
  drawRangeGuide();
  for (const enemy of enemies) drawEnemy(enemy, time);
  drawFox(time);
  const cycle = Math.floor(elapsed / ATTACK_INTERVAL);
  const attackAge = elapsed - cycle * ATTACK_INTERVAL;
  drawBranch(time, attackAge);
  if (level === 5) drawRootBurst(time, attackAge);
  setText("#wood-cycle", "第 " + (cycle + 1) + " 次刺击");
}

function tick(now: number): void {
  const dt = lastTime ? Math.min(0.05, Math.max(0, (now - lastTime) / 1000)) : 0;
  lastTime = now;
  if (!document.hidden) elapsed += dt;
  const cycle = Math.floor(elapsed / ATTACK_INTERVAL);
  const attackAge = elapsed - cycle * ATTACK_INTERVAL;
  if (attackAge >= 0.12 && attackAge < 0.18 && cycle !== lastShotCycle) {
    lastShotCycle = cycle;
    resolveAttack();
  }
  render(elapsed);
  frameId = requestAnimationFrame(tick);
}

document.addEventListener("visibilitychange", () => { lastTime = 0; });
window.addEventListener("pagehide", () => cancelAnimationFrame(frameId), { once: true });
updateLevelUi();
render(0);
frameId = requestAnimationFrame(tick);
