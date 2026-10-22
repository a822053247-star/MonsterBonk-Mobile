import {WEAPON_PAIR_RECIPES,pairSources,pairLevel,pairIcon} from './weapon-pair-fusion';
import { RELICS, EVOLUTIONS } from './relics';
import { MAX_GAME_SPEED } from './quality';
import type { RunFlow } from './run-flow';
import type { Combat } from './combat';
import { ATTACKS, type RunBuild } from './run-build';
import { flameSweepStats } from './flame-sweep';
import { upgradePreview, type Progression, type SkillId } from './progression';
import { FUSION_ASSET_ROOT, type ElementalFusionId } from './fusion-pixels';
import { bindUpgradeArt, uiArtUrl, upgradeArt } from './upgrade-art';
import { shopArt } from './shop-art';
import { formatEndlessRecordTime, readEndlessRecord, type EndlessRecord, type EndlessRunResult } from './endless-record';

const icons = {
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/>',
  jump: '<path d="M5 20h14M12 16V3m-5 5 5-5 5 5M6 14l-2 3m14-3 2 3"/>',
  leaf: '<path d="M19 4C9 3 3 7 5 14c2 7 14 5 14-10ZM5 20 15 10"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  dash: '<path d="m14 3-8 10h6l-2 8 9-12h-7l2-6ZM3 6h4M2 18h4"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 2 10 8 15 6-5 13-10 8-15Z"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)"/><circle cx="19" cy="6" r="2" fill="currentColor"/>',
  wave: '<path d="M3 17a9 9 0 0 1 18 0M7 17a5 5 0 0 1 10 0M11 17a1 1 0 0 1 2 0M5 21h14"/>',
  battle: '<path d="m5 3 5 5-2 3-5-5 2-3Zm14 0 2 3-5 5-2-3 5-5ZM4 20 19 5M20 20 5 5M3 16l5 5m8 0 5-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1"/>',
  rotate: '<rect x="7" y="3" width="10" height="18" rx="2" transform="rotate(25 12 12)"/><path d="M3 8V4h4m14 12v4h-4"/>',
};
export const icon = (name: keyof typeof icons, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const portrait = `<svg class="portrait" viewBox="0 0 80 80" aria-hidden="true"><path d="M17 38 12 15l20 13M49 27 65 14l-4 26" fill="#fff0c8"/><path d="m22 23-2-7 9 11m27-2 5-10-1 13" fill="#f4af9f"/><ellipse cx="40" cy="48" rx="28" ry="25" fill="#f58b32"/><ellipse cx="29" cy="45" rx="3.4" ry="5" fill="#223e3c"/><ellipse cx="51" cy="45" rx="3.4" ry="5" fill="#223e3c"/><ellipse cx="22" cy="53" rx="5" ry="2.5" fill="#f4af9f"/><ellipse cx="59" cy="53" rx="5" ry="2.5" fill="#f4af9f"/><path d="M36 56q4 5 8 0" fill="none" stroke="#223e3c" stroke-width="2.5" stroke-linecap="round"/><path d="M40 18l7 10-7 10-7-10Z" fill="#fff7a9"/></svg>`;

export function createUI(root: HTMLElement) {
  root.innerHTML = `
    <canvas id="game-canvas" aria-label="幻兽幸存者游戏场景"></canvas>
    <div class="vignette" aria-hidden="true"></div>
    <div id="damage-overlay" class="damage-overlay" aria-hidden="true"></div>
    <section id="menu" class="menu screen" aria-label="主菜单">
      <img class="menu-background" src="${uiArtUrl('menu/forest-yanrong-background.png')}" alt="" fetchpriority="high" draggable="false"/>
      <header class="menu-header"><div class="studio-mark">${icon('leaf')}<span>幻兽幸存者 </span></div><span class="version">六波挑战</span></header>
      <div class="menu-copy">
        <div class="eyebrow"><span></span> 小小怪兽，大大冒险</div>
        <h1>幻兽<br/><span>幸存者</span></h1>
        <p class="menu-description">一只焰绒，从火花到爆裂火种。<br/>自动迎战，升级组合你的魔法。</p>
        <div class="main-modes" aria-label="选择挑战玩法"><button id="start-fusion" class="mode-card campaign-mode">${icon('battle')}<span><strong>闯关挑战</strong></span>${icon('arrow')}</button><button id="start-infinite" class="mode-card infinite-mode">${icon('spark')}<span><strong>无尽挑战</strong></span>${icon('arrow')}</button></div>
        <div id="endless-best-menu" class="endless-best-menu" aria-label="无尽个人最佳">无尽个人最佳 · 首次挑战后记录</div>
        <div class="menu-actions menu-utilities"><button id="choose-creature" class="secondary creature-select-entry" aria-label="选择出战幻兽">选择幻兽</button><button id="help" class="secondary" aria-label="操作指南">${icon('help')}<span>操作指南</span></button><button id="menu-settings" class="secondary settings-entry" aria-label="画质与声音设置">${icon('settings')}</button></div>
        
      </div>
      <footer class="menu-footer" aria-label="旧版模式入口"><button id="open-legacy" class="trial-entry practice-entry" aria-haspopup="dialog">旧版模式</button></footer>
    </section>
    <section id="legacy-picker" class="modal-screen" role="dialog" aria-modal="true" aria-labelledby="legacy-title" hidden><div class="modal legacy-card"><button id="close-legacy" class="icon-button close-button" aria-label="关闭旧版玩法">${icon('close')}</button><h2 id="legacy-title">旧版模式</h2><div class="legacy-options"><button id="start" class="secondary">${icon('leaf')} 单兽冒险</button><button id="start-trial" class="secondary">${icon('dash')} 犄角试炼</button><button id="start-challenge" class="secondary">${icon('battle')} 三波闯关</button></div></div></section>
    <section id="creature-picker" class="modal-screen" role="dialog" aria-modal="true" aria-labelledby="creature-picker-title" hidden>
      <div class="creature-picker-card"><header><div><small>每局一只 · 自动攻击</small><h2 id="creature-picker-title">选择出战幻兽</h2></div><button id="close-creature-picker" class="icon-button" aria-label="关闭幻兽选择">${icon('close')}</button></header>
        <div class="creature-options" role="group" aria-label="可选幻兽">
          <button type="button" class="creature-option" data-creature="yanrong" aria-pressed="true"><img data-creature-src="${import.meta.env.BASE_URL}assets/pixel/creatures/yanrong-base.png" alt=""/><strong>焰绒</strong><span>火花弹 · 爆炸分裂</span></button>
          <button type="button" class="creature-option" data-creature="bubblesalamander" aria-pressed="false"><img data-creature-src="${import.meta.env.BASE_URL}assets/pixel/creatures/paopaoyuan.png" alt=""/><strong>泡泡螈</strong><span>水泡弹 · 减速扩散</span></button>
          <button type="button" class="creature-option" data-creature="sproutspike" aria-pressed="false"><img data-creature-src="${import.meta.env.BASE_URL}assets/pixel/creatures/yacishou.png" alt=""/><strong>芽刺兽</strong><span>飞叶弹 · 穿透连锁</span></button>
        </div>
        <button id="start-selected-creature" class="primary">焰绒 · 闯关挑战 ${icon('arrow')}</button>
      </div>
    </section>
    <section id="hud" class="hud screen" aria-label="游戏操作与状态" hidden>
      <div id="low-health-effect" class="low-health-effect" aria-hidden="true"></div>
      <div class="hud-top">
        <div class="health-block"><div class="health-panel"><img class="health-frame-art" data-upgrade-art="health-frame" src="${uiArtUrl('hud/creature-health-panel.png')}" alt="" draggable="false"/>${portrait}<img id="creature-portrait" class="portrait" data-upgrade-art="portrait" alt="" hidden style="object-fit:contain;image-rendering:pixelated"/><div class="health-copy"><div class="health-values"><strong id="health-value">100 / 100</strong></div><div class="health-track" role="progressbar" aria-label="生命值 HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="health-fill"></div></div></div></div><div class="combat-stats"><div>${icon('battle')}<span>击败</span><strong id="kill-value">0</strong></div><div>${icon('spark')}<span>经验</span><strong id="xp-value">0</strong></div></div><div class="hud-bottom-row"><div class="hud-gold" aria-label="当前金币"><img src="${uiArtUrl('common/coin.png')}" alt="" draggable="false"/><strong id="hud-coins">0</strong></div><div class="xp-row"><div id="xp-track" class="xp-track" role="progressbar" aria-label="升级经验" aria-valuemin="0" aria-valuemax="8" aria-valuenow="0"><div id="xp-fill"></div></div><span id="level-value">Lv.1</span></div></div></div>
        <div class="run-status"><small id="run-wave" hidden></small><strong id="timer">00:00</strong><small id="run-gold" hidden></small></div>
        <div class="hud-actions"><button id="game-speed" class="icon-button speed-button" aria-label="游戏速度：1倍，点击切换" title="切换游戏倍速">1×</button><button id="settings" class="icon-button" aria-label="画质与声音设置">${icon('settings')}</button><button id="fullscreen" class="icon-button" aria-label="切换全屏">${icon('expand')}</button><button id="pause" class="icon-button" aria-label="暂停游戏">${icon('pause')}</button></div>
      </div>
      <div id="encounter-status" class="encounter-status" hidden><div><strong id="encounter-name"></strong><span id="encounter-health"></span></div><div id="encounter-track" class="encounter-track" role="progressbar" aria-label="遭遇敌人生命值" aria-valuemin="0"><i id="encounter-fill"></i></div><small id="encounter-hint"></small><small id="encounter-wave"></small></div>
      <div id="welcome" class="welcome"><h2>小小魔法，准备就绪。</h2><p>移动躲避敌人，焰绒会自动施法 · 靠近拾取经验</p></div>
      <div id="party-status" class="party-status" hidden><strong>草场战斗样板</strong><span>焰绒 · 单兽自动攻击</span></div>
      <div id="fusion-status" class="fusion-status" role="status" hidden><span id="hud-extra-weapons" hidden></span><span id="fusion-spark-icon">${fireIcon(0)}</span><span id="fusion-burst-icon" hidden>${fireIcon(2)}</span><div><strong id="fusion-title">火花弹</strong><small id="fusion-hint">升级寻找「命中分裂」</small><small id="build-status" hidden></small><div id="weapon-cooldowns" class="weapon-cooldowns" role="group" aria-label="武器冷却" hidden></div></div></div>
      <div id="trial-status" class="trial-status" hidden><strong id="trial-title">冲锋犄角 · 开局已装备</strong><span id="trial-progress" aria-live="polite"></span><small id="trial-hint">黄线蓄力时侧移躲开；冲刺命中可打断，青环期间可反击</small></div><span id="map-seed" hidden></span>
      <div class="movement-control"><div id="joystick" class="joystick" role="group" aria-label="虚拟摇杆：按住并拖动以移动"><span class="joystick-cross horizontal"></span><span class="joystick-cross vertical"></span><span class="joystick-knob"><span></span></span></div><span class="control-caption">移动</span></div>
      <div class="dash-control"><button id="dash" class="dash-button" aria-label="冲刺">${icon('dash')}<strong>冲刺</strong><span id="dash-status">就绪</span></button><span class="control-caption">空格冲刺</span></div>
      <div id="boundary-hint" class="boundary-hint" hidden>已到边界</div>
      <div class="stage-note">2.5D 原型 <span>·</span> 幻兽幸存者</div>
    </section>
    <section id="pause-screen" class="modal-screen" role="dialog" aria-modal="true" aria-labelledby="pause-heading" aria-label="暂停菜单" hidden><div class="modal pause-card"><div class="pause-controls"><div class="modal-symbol" aria-hidden="true">${icon('leaf')}</div><h2 id="pause-heading">已暂停</h2><p id="pause-reason"></p><button id="resume" class="primary">继续冒险 ${icon('arrow')}</button><button id="pause-settings" class="text-button">画质与声音</button><div class="pause-links"><button id="restart" class="text-button">重新开始</button><button id="back-menu" class="text-button">返回主菜单</button></div><a id="map-replay" class="map-replay" hidden></a></div><section id="build-summary" class="build-summary" aria-label="本局构筑" tabindex="0" hidden><h3>本局构筑</h3><div id="build-weapons" class="build-weapon-list"></div><h4>技能融合</h4><div id="build-fusions" class="build-detail"></div><h4>稀有道具与进化</h4><div id="build-relics" class="build-detail"></div><p id="build-evolution"></p></section></div></section>
    <section id="gameover-screen" class="modal-screen" role="dialog" aria-modal="true" aria-labelledby="result-heading" aria-label="本局结束" data-outcome="defeat" hidden>
      <div class="modal result-card">
        <header class="result-header"><span class="result-insignia" aria-hidden="true"><span class="result-art-fallback">${icon('leaf')}</span><img id="result-victory-art" data-upgrade-art="result-victory" src="${uiArtUrl('result/victory-crown.png')}" alt="" draggable="false" hidden/><img id="result-defeat-art" data-upgrade-art="result-defeat" src="${uiArtUrl('result/defeat-badge.png')}" alt="" draggable="false"/></span><div><span id="result-eyebrow" class="eyebrow">冒险战报</span><h2 id="result-heading">本局结束</h2><p id="result-message"></p></div></header>
        <div class="result-report" style="--result-panel-url:url('${uiArtUrl('result/battle-report-panel.png')}')"><img class="result-panel-art" data-upgrade-art="result-panel" src="${uiArtUrl('result/battle-report-panel.png')}" alt="" draggable="false"/><div class="result-body"><div class="result-overview"><div class="result-stats"><div><strong id="result-time">00:00</strong><span>生存时间</span></div><div><strong id="result-kills">0</strong><span>击败怪物</span></div><div><strong id="result-xp">0</strong><span>获得经验</span></div></div><div id="result-challenge" class="result-challenge" hidden></div><p id="result-run"></p><section id="endless-record-result" class="endless-record-result" hidden aria-live="polite"><strong id="endless-record-title"></strong><p id="endless-record-current"></p><p id="endless-record-best"></p></section></div>
          <section id="result-build" class="build-summary" aria-label="最终构筑" tabindex="0"><h3>最终构筑</h3><div id="result-weapons" class="build-weapon-list"></div><div id="result-skills" class="build-detail"></div><div id="result-fusions" class="build-detail"></div><div id="result-relics" class="build-detail"></div></section></div></div>
        <footer class="result-actions"><button id="gameover-restart" class="primary">再次挑战 ${icon('arrow')}</button><button id="gameover-menu" class="text-button">返回菜单</button></footer>
      </div>
    </section>
    <section id="shop-screen" class="shop-screen" role="dialog" aria-modal="true" aria-labelledby="shop-heading" hidden>
      <div class="shop-panel"><header class="shop-header"><div><small>休整 · 已暂停</small><h2 id="shop-heading">森林魔法商店</h2></div><div><span class="shop-wallet"><img data-upgrade-art="coin" src="${uiArtUrl('common/coin.png')}" alt="" draggable="false"/><strong id="shop-coins"></strong></span><small id="shop-health"></small></div></header>
      <p id="shop-message" class="shop-message" role="status"></p><div class="shop-display"><img class="shop-panel-art" data-upgrade-art="shop-panel" src="${uiArtUrl('shop/shop-panel.png')}" alt="" draggable="false"/><div id="shop-items" class="shop-items"></div></div>
      <footer class="shop-actions"><button id="shop-refresh" class="secondary"></button><button id="shop-menu" class="text-button">返回主菜单</button><button id="shop-next" class="primary"></button></footer></div>
    </section>
    <section id="upgrade-screen" class="upgrade-screen" role="dialog" aria-modal="true" aria-labelledby="upgrade-heading" hidden>
      <div id="upgrade-panel" class="upgrade-panel" tabindex="-1">
        <header class="upgrade-header"><div class="upgrade-heading-art"><img data-upgrade-art="banner" src="${uiArtUrl('common/forest-title-banner.png')}" alt="" draggable="false"/><h2 id="upgrade-heading">选择强化</h2></div><button id="upgrade-menu" class="text-button">返回菜单</button></header>
        <div class="upgrade-subtitle"><span id="upgrade-level">等级 02</span><p id="upgrade-instruction">选择一项</p><span class="paused-badge">战斗已暂停</span></div>
        <div id="upgrade-cards" class="upgrade-cards"></div><section id="weapon-pair-picker" class="weapon-pair-picker" aria-label="选择双武器配方" hidden><h3>选择双武器配方</h3><div id="weapon-pair-options"></div><button id="weapon-pair-cancel" class="secondary">返回普通升级</button></section>
        <footer class="upgrade-footer"><span>${icon('spark')} <span id="upgrade-queue">本次选择后继续</span></span><span>仅本局生效</span></footer>
      </div>
    </section>
    <section id="help-screen" class="modal-screen" aria-label="操作指南" hidden><div class="modal help-card"><button id="close-help" class="icon-button close-button" aria-label="关闭操作指南">${icon('close')}</button><h2>操作指南</h2><div class="guide-row"><span>01</span><div><strong>走位与闪避</strong><p>摇杆或方向键移动。避开圆环，横移躲开冲刺。</p></div></div><div class="guide-row"><span>02</span><div><strong>自动迎战</strong><p>幻兽自动攻击，注意绕开障碍。</p></div></div><div class="guide-row"><span>03</span><div><strong>收集经验，选择魔法</strong><p>拾取经验，升级强化；波次结束后可购物。第4波有精英，第6波需在90秒内击败兽王。</p></div></div><p class="guide-tip">手机请横屏游玩。</p></div></section>
    <section id="settings-screen" class="modal-screen settings-screen" role="dialog" aria-modal="true" aria-labelledby="settings-heading" hidden>
      <div class="settings-card"><header><div><h2 id="settings-heading">设置</h2></div><button id="close-settings" class="icon-button" aria-label="关闭设置">${icon('close')}</button></header>
      <div class="settings-grid"><div class="graphics-setting"><label for="quality">画面品质</label><select id="quality"><option value="auto">自动 · 优先流畅</option><option value="battery">省电 · 30 帧目标</option><option value="high">清晰 · 60 帧目标</option></select><p id="quality-description">根据运行负载动态调整清晰度。</p><small>帧率为目标，实际表现取决于设备。</small><label for="game-speed-setting" class="speed-label">游戏速度</label><select id="game-speed-setting">${Array.from({length:MAX_GAME_SPEED},(_,i)=>`<option value="${i+1}">${i+1} 倍${i===0?' · 正常速度':''}</option>`).join('')}</select><p>移动、战斗与波次同步加速，音乐保持原速。</p></div>
      <div class="audio-settings"><label class="setting-toggle"><span>背景音乐<small>原创风铃小调</small></span><input id="music-toggle" type="checkbox" role="switch" aria-label="背景音乐" checked/><i></i></label><label class="setting-toggle"><span>游戏音效<small>魔法、拾取与受击</small></span><input id="sound-toggle" type="checkbox" role="switch" aria-label="游戏音效" checked/><i></i></label><small id="audio-status" class="audio-status">点击开始冒险后启用声音</small></div></div>
      <footer><span>设置自动保存 · 战斗中打开会暂停<br/><small>Super Pixel Effects Gigapack — Will Tice / unTied Games</small></span><button id="save-settings" class="primary">完成 ${icon('arrow')}</button></footer></div>
    </section>
    <section id="rotate-screen" class="rotate-screen" aria-label="请横屏游玩"><div class="rotate-icon">${icon('rotate')}</div><h2>请横屏游玩</h2><p>关闭方向锁定，横屏游玩。</p><span class="rotate-brand">幻兽幸存者</span></section>
    <section id="error-screen" class="error-screen" hidden><h2>草原暂时没有打开</h2><p id="error-message"></p><button id="retry" class="primary">重新加载</button></section>
    <div id="toast" class="toast" role="status" hidden></div>
  `;
  bindFireIcons(root);
  bindUpgradeArt(root);
  renderEndlessBestMenu();
}

export function renderEndlessBestMenu() {
  const panel = document.getElementById('endless-best-menu');
  if (!panel) return;
  const record = readEndlessRecord();
  panel.textContent = record.runsPlayed
    ? `无尽个人最佳 · 第 ${record.bestWave} 波 / 第 ${record.bestCycle} 轮 · Boss ${record.bestBossesDefeated} · ${formatEndlessRecordTime(record.bestSurvivalSeconds)}`
    : '无尽个人最佳 · 首次挑战后记录';
}

export function renderEndlessBestResult(
  result: EndlessRunResult,
  record: EndlessRecord,
  newRecords: readonly string[],
) {
  const panel = document.getElementById('endless-record-result');
  if (!panel) return;
  panel.hidden = false;
  panel.classList.toggle('new-record', newRecords.length > 0);
  document.getElementById('endless-record-title')!.textContent = newRecords.length
    ? `新纪录！${newRecords.join('、')}`
    : '本局结束 · 无尽个人最佳';
  document.getElementById('endless-record-current')!.textContent =
    `本局：第 ${result.wave} 波 · 第 ${result.cycle} 轮 · 击败 Boss ${result.bossesDefeated} 个 · ${formatEndlessRecordTime(result.survivalSeconds)}`;
  document.getElementById('endless-record-best')!.textContent =
    `最佳：第 ${record.bestWave} 波 · 第 ${record.bestCycle} 轮 · 击败 Boss ${record.bestBossesDefeated} 个 · ${formatEndlessRecordTime(record.bestSurvivalSeconds)}`;
  renderEndlessBestMenu();
}

export function renderUpgradeCards(progression: Progression, version: number) {
  const offered = progression.offers;
  document.getElementById('upgrade-level')!.textContent = `等级 ${String(progression.choiceLevel).padStart(2, '0')}`;
  document.getElementById('upgrade-instruction')!.textContent = offered.length < 3 ? `剩余 ${offered.length} 项可选` : '三选一';
  document.getElementById('upgrade-queue')!.textContent = progression.pendingChoices > 1 ? `待选 ${progression.pendingChoices} 次` : '选择后继续';
  document.getElementById('upgrade-cards')!.innerHTML = offered.map((id) => {
    const skill = progression.skills.find((candidate) => candidate.id === id)!;
    const rank = progression.ranks[id];
    const art = upgradeArt(skill, progression.fusionBase, progression.build?.attacks.map(a=>a.attackId));
    if(id==='weapon-pair-fusion')art.illustrations=[`${import.meta.env.BASE_URL}${pairIcon(progression.build!.availablePairs()[0])}`];
    const preview = id==='weapon-pair-fusion'?'自愿融合 · 保留技能与遗物':id.endsWith('-weapon') && rank === 0
      ? `未装备 → ${rank + 1}级` : upgradePreview(skill, progression.ranks) ?? '';
    const titlePath = `upgrade-title-${version}-${id}`;
    return `<button type="button" class="skill-card${skill.tradeoff ? ' has-tradeoff' : ''}" data-skill="${id}" data-offer="${version}" data-category="${skill.category ?? 'normal'}" data-element="${art.element ?? ''}" style="--skill-color:${skill.color}" disabled aria-label="${skill.title}：${skill.benefit}，${preview}，${rank} → ${rank + 1}级${skill.tradeoff ? '，代价：' + skill.tradeoff : ''}" aria-description="${skill.description}">
      <img class="skill-frame" data-upgrade-art="frame" src="${art.frame}" alt="" draggable="false"/>
      <span class="skill-card-meta"><span><img data-upgrade-art="gem" src="${art.gem}" alt="" draggable="false"/>${id==='weapon-pair-fusion'?'武器融合':skill.category === 'relic' ? '稀有道具' : skill.category === 'evolution' ? '互斥进化' : id.endsWith('-weapon') ? (rank ? '武器强化' : '新武器') : rank === 0 && skill.effect.type === 'spell' ? '新技能' : '魔法强化'}</span><span>${id==='weapon-pair-fusion'?'自选配方':`${rank} → ${rank + 1}级`}<small> / ${skill.maxRank}</small></span></span>
      <h3 aria-label="${skill.title}">${curvedTitle(skill.title, titlePath, 'skill-title-arc')}</h3>
      <span class="skill-content"><span class="skill-emblem${art.illustrations.length > 1 ? ' multiple-art' : ''}" aria-hidden="true"><span class="skill-art-fallback">${icon(skill.icon)}</span>${art.illustrations.map(url => `<img class="skill-illustration" data-upgrade-art="illustration" src="${url}" alt="" draggable="false"/>`).join('')}</span>
      <strong class="skill-benefit">${skill.benefit}</strong>
      <span class="skill-preview">${preview}</span></span>
      ${skill.tradeoff ? `<p class="skill-tradeoff">代价：${skill.tradeoff}</p>` : ''}
      <p class="skill-description">${skill.description}</p>
      <span class="skill-ranks" aria-hidden="true">${Array.from({ length: skill.maxRank }, (_, index) => `<i class="${index < rank ? 'filled' : index === rank ? 'next' : ''}"></i>`).join('')}</span>
      <span class="skill-pick">点击选择 ${icon('arrow')}</span>
    </button>`;
  }).join('');
  bindUpgradeArt(document.getElementById('upgrade-cards')!);
}

function curvedTitle(title: string, pathId: string, className: string) {
  const size = Math.min(36, 240 / Array.from(title).length);
  return `<svg class="${className}" viewBox="0 0 300 76" aria-hidden="true" focusable="false"><defs><path id="${pathId}" d="M 8 58 Q 150 20 292 58"/></defs><text font-size="${size}" text-anchor="middle"><textPath href="#${pathId}" startOffset="50%">${title}</textPath></text></svg>`;
}

function fireIcon(index: 0 | 1 | 2) {
  return `<span class="fire-icon" data-icon="${index}">${icon('spark')}<img src="${import.meta.env.BASE_URL}assets/pixel/skills/yanrong/fire-skill-icons.normalized.png" alt="" style="left:-${index * 100}%" draggable="false"/></span>`;
}

function bindFireIcons(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('.fire-icon img, .fusion-icon img').forEach(image => {
    const sync = () => image.parentElement!.classList.toggle('ready', image.complete && image.naturalWidth > 0);
    image.addEventListener('load', sync, { once: true }); image.addEventListener('error', sync, { once: true }); sync();
  });
}

export function fusionIcon(id: ElementalFusionId) {
  return `<span class="fusion-icon">${icon(id.includes('bubble') ? 'wave' : 'leaf')}<img src="${FUSION_ASSET_ROOT}${id}-icon.png" alt="" draggable="false"/></span>`;
}
export function setFusionIcons(root: HTMLElement, ids: ElementalFusionId[]) {
  const key = ids.join(',');
  if (root.dataset.icons === key) return;
  root.dataset.icons = key; root.innerHTML = ids.map(fusionIcon).join(''); bindFireIcons(root);
}

/** Build names are local catalog text; keep generated markup safe if copy changes. */
const buildText = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
function buildTokens(values: readonly string[]) {
  return `<ul class="build-tokens">${values.map(value => `<li>${buildText(value)}</li>`).join('')}</ul>`;
}
function buildWeaponRows(build: RunBuild) {
  return build.attacks.map(attack => {
    const art = upgradeArt({id:`${attack.pairId??attack.attackId}-weapon` as SkillId}, attack.attackId);
    const growth = attack.attackId === 'flame-sweep' ? flameSweepStats(attack.level) : undefined;
    return `<div class="build-weapon" data-element="${art.element}"><span class="build-weapon-art" aria-hidden="true">${icon(art.element === 'water' ? 'wave' : art.element === 'grass' ? 'leaf' : 'spark')}<img data-upgrade-art="build-weapon" src="${art.illustrations[0]}" alt="" draggable="false"/></span><div class="build-weapon-copy"><span class="build-weapon-role">${attack.slot ? '副武器'+attack.slot : '主武器'}</span><strong>${buildText(build.title(attack))} ${attack.level}级</strong>${attack.sources?`<small>来源：${attack.sources.map(id=>ATTACKS[id].title).join(" + ")}</small>`:""}${growth ? `<small>${growth.radius} 范围 / ${growth.degrees}° 火浪</small>` : ''}</div><span class="build-weapon-ranks" aria-label="最高5级，当前${attack.level}级">${Array.from({length:5},(_,i)=>`<i${i<attack.level?' class="filled"':''}></i>`).join('')}</span></div>`;
  }).join('');
}

/** Long build details live in the existing pause menu, never over the joystick. */
export function renderBuildSummary(build: RunBuild | undefined, fusions: readonly { title: string }[], resonances: readonly string[] = []) {
  const panel = document.getElementById('build-summary')!;
  panel.hidden = !build;
  panel.closest('.pause-card')!.classList.toggle('has-build', !!build);
  const status = document.getElementById('build-status')!;
  status.hidden = true;
  if (!build) return;
  const evolution = build.evolution ? EVOLUTIONS[build.evolution].title : '未选择进化';
  const key = JSON.stringify([build.attacks.map(a => [a.attackId, a.level]), build.relics, evolution, fusions.map(f => f.title), resonances]);
  status.textContent = `${build.relics.length} 件稀有道具 · ${evolution} · 暂停查看构筑`;
  if (panel.dataset.snapshot === key) return;
  panel.dataset.snapshot = key;
  document.getElementById('build-weapons')!.innerHTML = buildWeaponRows(build);
  document.getElementById('build-fusions')!.innerHTML = (fusions.length ? buildTokens(fusions.map(f=>f.title)) : '<p class="build-empty">尚未形成融合，升级时选择适配改造。</p>') + (resonances.length ? `<p>已激活：${buildText(resonances.join(' / '))}</p>` : '');
  document.getElementById('build-relics')!.innerHTML = build.relics.length ? build.relics.map(id => {
    const relic = RELICS[id];
    const inactive = id === 'specialist-badge' && build.attacks.length > 1 ? '（副武器已装备，加成失效）' : '';
    const art=upgradeArt({id,category:'relic'},build.attacks[0].attackId);
    return `<article class="build-relic"><img class="build-relic-icon" data-upgrade-art="build-relic" src="${art.illustrations[0]}" alt=""/><strong>${buildText(relic.title+inactive)}</strong><p>${buildText(relic.benefit)}</p><p class="build-tradeoff">代价：${buildText(relic.tradeoff)}</p></article>`;
  }).join('') : '<p class="build-empty">尚未获得稀有道具，升级时偶尔出现。</p>';
  document.getElementById('build-evolution')!.textContent = build.evolution ? `${evolution}：${EVOLUTIONS[build.evolution].benefit}；${EVOLUTIONS[build.evolution].tradeoff}` : '火花弹获得命中分裂后，可出现互斥进化路线。';
  bindUpgradeArt(panel);
}

export function renderRunShop(run: RunFlow, combat: Combat) {
  const shop = run.shop;
  if (!shop) return;
  document.getElementById('shop-heading')!.textContent = run.endless
    ? `${run.waveLabel}完成 · 魔法商店`
    : `第 ${run.wave} 波完成 · 魔法商店`;
  document.getElementById('shop-coins')!.textContent = `${run.coins} 金币`;
  document.getElementById('shop-health')!.textContent = `生命 ${Math.ceil(combat.hp)} / ${combat.maxHp}`;
  const items = document.getElementById('shop-items')!;
  const pageKey = `${shop.token.split(':')[0]}:${shop.refreshes}`;
  const resetScroll = items.dataset.page !== pageKey;
  items.dataset.page = pageKey;
  items.innerHTML = shop.items.map((item, index) => {
    const art = shopArt(item, combat);
    const unavailable = item.sold || item.kind === 'empty' || item.price > run.coins;
    const state = item.sold ? '已购买' : item.kind === 'empty' ? '暂无适用商品' : item.price > run.coins ? '金币不足' : '购买';
    const title = item.kind === 'reward' && item.skill?.endsWith('-weapon')
      ? item.title.replace(/^获得/, '').replace(/强化$/, '') : item.title;
    const titlePath = `shop-title-${shop.token.replace(/[^a-zA-Z0-9_-]/g, '-')}-${index}`;
    return `<article class="shop-item${item.sold ? ' sold' : ''}${item.price > run.coins ? ' unaffordable' : ''}" data-kind="${item.kind}" data-category="${art.category}" data-skill="${item.skill ?? ''}">
      <img class="shop-slot-art" data-upgrade-art="shop-slot" src="${uiArtUrl('shop/item-slot.png')}" alt="" draggable="false"/>
      <h3 aria-label="${title}">${curvedTitle(title, titlePath, 'shop-title-arc')}</h3><small class="shop-item-type">${art.label}</small>
      <div class="shop-item-body"><span class="shop-illustration${art.images.length > 1 ? ' multiple-art' : ''}" aria-hidden="true"><span class="shop-art-fallback">${icon(art.icon)}</span>${art.images.map(src => `<img data-upgrade-art="shop-illustration" src="${src}" alt="" draggable="false"/>`).join('')}</span><p class="shop-benefit">${item.benefit}</p>${item.tradeoff ? `<p class="shop-cost">代价：${item.tradeoff}</p>` : ''}</div>
      <div class="shop-purchase"><span class="shop-price" ${item.kind === 'empty' ? 'hidden' : ''}><img data-upgrade-art="coin" src="${uiArtUrl('common/coin.png')}" alt="" draggable="false"/>${item.price} 金币</span>
      <button type="button" class="shop-buy" data-buy="${index}" data-shop-token="${shop.token}" aria-label="${item.title}，${item.price} 金币，${state}" ${unavailable ? 'disabled' : ''}><span class="shop-buy-label">${state}</span></button>
      </div>
    </article>`;
  }).join('');
  if (resetScroll) { items.scrollTop = 0; items.scrollLeft = 0; }
  const refresh = document.getElementById('shop-refresh') as HTMLButtonElement;
  refresh.innerHTML = `<img data-upgrade-art="refresh" src="${uiArtUrl('shop/refresh-rune.png')}" alt="" draggable="false"/><span>${shop.treasureRefreshes ? '携宝兽奖励 · 免费刷新 1 次' : `刷新商品 · ${shop.refreshCost} 金币`}</span>`;
  refresh.dataset.shopToken = shop.token; refresh.disabled = run.coins < shop.refreshCost || !shop.canRefresh;
  const next = document.getElementById('shop-next') as HTMLButtonElement;
  next.textContent = `进入第 ${run.wave + 1} 波`;
  next.dataset.shopToken = shop.token;
  bindUpgradeArt(document.getElementById('shop-screen')!);
}

export function renderRunResult(run: RunFlow | undefined, combat: Combat) {
  const panel = document.getElementById('result-build')!;
  panel.hidden = false; panel.closest('.result-card')!.classList.toggle('formal-result', !!run);
  const build = combat.usesRunBuild ? combat.runBuild : undefined;
  const runSummary = document.getElementById('result-run')!;
  runSummary.hidden = !run;
  runSummary.textContent = run ? (run.endless
    ? `无尽生存 · ${run.waveLabel}\n完成 ${run.completedWaves} 波 · 击败 ${run.bossesDefeated} 个 Boss\n本局获得 ${run.earned} 金币`
    : `第 ${run.wave} / 6 波 · 完成 ${run.completedWaves} 波\n本局获得 ${run.earned} 金币`) : '';
  document.getElementById('result-weapons')!.innerHTML = build ? buildWeaponRows(build) : `<p>基础攻击：${buildText(ATTACKS[combat.baseAttack].title)}</p>`;
  const learned = combat.progression.skills.filter(skill => !skill.category && !skill.id.endsWith('-weapon') && combat.progression.ranks[skill.id] > 0);
  document.getElementById('result-skills')!.innerHTML = `<h4>技能强化</h4>${buildTokens(learned.map(skill => `${skill.title} ${combat.progression.ranks[skill.id]}级`))}`;
  document.getElementById('result-fusions')!.innerHTML = `<h4>技能融合</h4>${buildTokens(combat.fusions.map(f=>f.title))}` + (combat.resonances.length ? `<p>共鸣：${buildText(combat.resonances.join(' / '))}</p>` : '') + `<p class="build-chain-summary">连锁击杀 <strong>${combat.relicTelemetry.chainKills}</strong> · 蒸爆 <strong>${combat.relicTelemetry.steamBursts}</strong> 次</p>`;
  document.getElementById('result-relics')!.innerHTML = `<h4>稀有道具与进化</h4>${buildTokens([...(build?.relics.map(id=>RELICS[id].title) ?? []),...(build?.evolution ? [EVOLUTIONS[build.evolution].title] : [])])}`;
  document.getElementById('result-skills')!.hidden = !learned.length;
  document.getElementById('result-fusions')!.hidden = !combat.fusions.length && !combat.resonances.length && !combat.relicTelemetry.chainKills && !combat.relicTelemetry.steamBursts;
  document.getElementById('result-relics')!.hidden = !build?.relics.length && !build?.evolution;
  bindUpgradeArt(panel);
}

export function renderResultOutcome(won: boolean) {
  document.getElementById('gameover-screen')!.dataset.outcome = won ? 'victory' : 'defeat';
  document.getElementById('result-victory-art')!.hidden = !won;
  document.getElementById('result-defeat-art')!.hidden = won;
}

export function renderWeaponCooldowns(_combat: Combat) {
  // 底部只显示武器摘要，详细构筑在暂停菜单查看。
  const root = document.getElementById('weapon-cooldowns')!;
  root.hidden = true;
  root.replaceChildren();
}

export function renderHudWeaponIcons(combat: Combat) {
  const root = document.getElementById('hud-extra-weapons')!;
  const attacks = combat.usesRunBuild ? combat.runBuild.attacks.map(attack => attack.attackId) : [combat.baseAttack];
  const pairs=combat.usesRunBuild?combat.runBuild.attacks.filter(a=>a.pairId):[];
  const ids = attacks.filter(id => !pairs.some(a=>a.attackId===id)&&id !== 'spark' && !combat.fusions.some(fusion => fusion.baseAttack === id));
  root.hidden = !ids.length&&!pairs.length;
  const key = ids.join(',')+pairs.map(a=>a.pairId).join(',');
  if (root.dataset.weapons === key) return;
  root.dataset.weapons = key;
  root.innerHTML = ids.map(id => `<span class="hud-weapon-icon" title="${ATTACKS[id].title}">${icon(id === 'bubble' ? 'wave' : id === 'flame-sweep' ? 'battle' : 'leaf')}<img data-upgrade-art="hud-weapon" src="${uiArtUrl(`upgrade/illustrations/skills/${id}-weapon.png`)}" alt="" draggable="false"/></span>`).join('');
  root.innerHTML+=pairs.map(a=>`<span class="hud-weapon-icon" title="${combat.runBuild.title(a)} ${a.level}级；来源：${a.sources!.map(id=>ATTACKS[id].title).join('+')}"><img data-upgrade-art="hud-weapon" src="${import.meta.env.BASE_URL}${pairIcon(a.pairId!)}" alt="${combat.runBuild.title(a)}"/></span>`).join('');
  bindUpgradeArt(root);
}

export function renderEncounterStatus(combat: Combat, run?: RunFlow) {
  const c=combat.encounters, root=document.getElementById('encounter-status')!;
  const enemy=c.boss ?? (c.elite?.active ? c.elite : undefined);
  root.hidden=!c.enabled || !enemy || c.defeated;
  document.getElementById('hud')!.classList.toggle('encounter-active',!root.hidden);
  if(root.hidden || !enemy) return;
  const boss=enemy.rank==='boss', max=combat.enemyHealth(enemy);
  root.classList.toggle('enraged', boss && c.enraged);
  root.dataset.rank = boss ? 'boss' : 'elite';
  document.getElementById('encounter-name')!.textContent=boss ? `荆冠兽王${c.enraged?' · 狂暴':''}` : '精英岩甲';
  document.getElementById('encounter-health')!.textContent=`${Math.ceil(enemy.hp)} / ${max}`;
  document.getElementById('encounter-fill')!.style.width=`${Math.max(0,enemy.hp/max)*100}%`;
  const track=document.getElementById('encounter-track')!; track.setAttribute('aria-valuemax',String(max)); track.setAttribute('aria-valuenow',String(Math.ceil(enemy.hp)));
  const hints:Record<string,string>={approach:'保持移动，留意下一次攻击', 'spread-windup':'扇形弹幕蓄力 · 离开紫色扇面',spread:'弹幕来袭 · 从间隙或侧面绕过', 'dash-windup':'锁定冲击 · 立即横向移出橙色长条',dash:'冲击！避开路径', 'summon-windup':'即将召唤 · 预留清怪空间',summon:'援兵出生预警 · 优先清理包围',recover:'攻击间隙 · 趁机反击',dying:'兽王倒下……'};
  document.getElementById('encounter-hint')!.textContent=enemy.spawnTime>0
    ? (boss ? (run?.endless ? '阶段 Boss · 超时后进入狂暴' : '最终挑战 · 90 秒内击败兽王') : '精英出现 · 击败额外获得 18 金币')
    : boss && run?.endless && run.bossOvertime ? '加时狂暴 · 继续战斗，击败兽王后进入下一轮'
    : boss ? hints[c.bossState]??'' : c.elitePulsing?'震地蓄力 · 离开金色圆环':'绕开震地，或集中火力获取奖励';
  document.getElementById('encounter-wave')!.textContent=run
    ? `${run.waveLabel} · ${run.bossOvertime ? `加时 ${Math.ceil(run.bossOvertimeElapsed)} 秒` : `剩余 ${Math.ceil(run.remaining)} 秒`} · 金币 ${run.coins}`
    : '';
}

export function renderWeaponPairPicker(build:RunBuild){
 const root=document.getElementById('weapon-pair-options')!;
 root.innerHTML=build.availablePairs().map(id=>{
   const parents=pairSources(id).map(source=>build.attacks.find(a=>a.attackId===source)!);
   return `<button class="secondary weapon-pair-option" data-pair="${id}"><img src="${import.meta.env.BASE_URL}${pairIcon(id)}" alt=""/><span><strong>${parents.map(a=>ATTACKS[a.attackId].title+' Lv'+a.level).join(' + ')} → ${WEAPON_PAIR_RECIPES[id].title} Lv${pairLevel(parents[0].level,parents[1].level)}</strong><small>${id==='bramble-tide'?'连锁转为范围扩大，不产生跳跃。':id==='blazing-thorn'?'最多命中3敌；已有连锁改为定向跳跃。':'蒸汽爆发；继承分裂与最多2次连锁。'} 保留全部技能与遗物。</small></span></button>`;
 }).join('');
 document.getElementById('upgrade-panel')!.classList.add('choosing-pair');
 document.getElementById('upgrade-cards')!.hidden=true;document.getElementById('weapon-pair-picker')!.hidden=false;
 root.querySelector<HTMLButtonElement>('button')?.focus();
}
