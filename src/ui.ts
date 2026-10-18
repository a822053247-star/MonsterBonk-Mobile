import { SKILLS, upgradePreview, type Progression } from './progression';

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
    <canvas id="game-canvas" aria-label="MonsterBonk Mobile 2.5D 游戏场景"></canvas>
    <div class="vignette" aria-hidden="true"></div>
    <div id="damage-overlay" class="damage-overlay" aria-hidden="true"></div>
    <section id="menu" class="menu screen" aria-label="主菜单">
      <header class="menu-header"><div class="studio-mark">${icon('leaf')}<span>MONSTERBONK <b>MOBILE</b></span></div><span class="version">MEADOW LITTLE MONSTERS <i></i> 04</span></header>
      <div class="menu-copy">
        <div class="eyebrow"><span></span> 小小怪兽，大大冒险</div>
        <h1>MONSTER<br/><span>BONK</span><em>MOBILE</em></h1>
        <p class="menu-description">魔法已苏醒，草原不再安静。<br/>和焰绒一起，迎接小怪物们。</p>
        <div class="menu-actions"><button id="start" class="primary">开始冒险 ${icon('arrow')}</button><button id="help" class="secondary" aria-label="操作指南">${icon('help')}<span>操作指南</span></button><button id="menu-settings" class="secondary settings-entry" aria-label="画质与声音设置">${icon('settings')}</button></div>
        <div class="menu-hint"><span class="key">W A S D</span><span>或虚拟摇杆移动</span><span class="dot">·</span><span>随时来一小段冒险</span></div>
      </div>
      <div class="character-tag"><span class="tag-line"></span><div><small>MEET YOUR LITTLE MONSTER</small><strong>焰绒 <span>YANRONG</span></strong><p>一团勇敢又好奇的小火焰</p></div><span class="tag-star">✧</span></div>
      <footer class="menu-footer"><span>${icon('compass')} 中央草场 <i>/</i> 第一章的起点</span><button id="start-trial" class="trial-entry">${icon('dash')} 犄角试炼 <small>开局装备 · 冲刺反制</small></button></footer>
    </section>
    <section id="hud" class="hud screen" aria-label="游戏操作与状态" hidden>
      <div class="hud-top">
        <div class="health-block"><div class="health-panel">${portrait}<div class="health-copy"><div class="health-title"><strong>焰绒</strong><span id="level-value">Lv. 01</span></div><div class="health-track" role="progressbar" aria-label="生命值" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="health-fill"></div></div><div class="health-values">${icon('heart')}<span id="health-value">100 / 100</span><small>YANRONG</small></div></div></div><div class="combat-stats"><div>${icon('battle')}<span>击败</span><strong id="kill-value">0</strong></div><div>${icon('spark')}<span>经验</span><strong id="xp-value">0</strong></div></div><div class="xp-row"><div id="xp-track" class="xp-track" role="progressbar" aria-label="升级经验" aria-valuemin="0" aria-valuemax="8" aria-valuenow="0"><div id="xp-fill"></div></div><span id="xp-progress">0 / 8</span></div></div>
        <div class="run-status"><span class="run-label">${icon('compass')} 中央草场</span><strong id="timer">00:00</strong><span class="explore-label"><i></i> 草原遭遇</span></div>
        <div class="hud-actions"><button id="settings" class="icon-button" aria-label="画质与声音设置">${icon('settings')}</button><button id="fullscreen" class="icon-button" aria-label="切换全屏">${icon('expand')}</button><button id="pause" class="icon-button" aria-label="暂停游戏">${icon('pause')}</button></div>
      </div>
      <div id="welcome" class="welcome"><span class="eyebrow">A LITTLE SPARK OF MAGIC</span><h2>小小魔法，准备就绪。</h2><p>移动躲避敌人，焰绒会自动施法 · 靠近拾取经验</p></div>
      <div id="trial-status" class="trial-status" hidden><strong id="trial-title">冲锋犄角 · 开局已装备</strong><span id="trial-progress" aria-live="polite"></span><small>黄线蓄力时侧移躲开<br/>冲刺命中可打断；青环期间可反击</small></div><div class="location-label"><span>01</span><div>中央草场<small>WINDSONG MEADOW</small></div></div>
      <div class="movement-control"><div id="joystick" class="joystick" role="group" aria-label="虚拟摇杆：按住并拖动以移动"><span class="joystick-cross horizontal"></span><span class="joystick-cross vertical"></span><span class="joystick-knob"><span></span></span></div><span class="control-caption">移动 <b>W A S D</b></span></div>
      <div class="dash-control"><button id="dash" class="dash-button" aria-label="冲刺">${icon('dash')}<strong>冲刺</strong><span id="dash-status">就绪</span></button><span class="control-caption">轻点冲刺 <b>SPACE</b></span></div>
      <div id="boundary-hint" class="boundary-hint" hidden>草原边界 · 换个方向继续探索吧</div>
      <div class="stage-note">2.5D 原型 <span>·</span> 焰绒与魔法</div>
    </section>
    <section id="pause-screen" class="modal-screen" aria-label="暂停菜单" hidden><div class="modal pause-card"><div class="modal-symbol">${icon('leaf')}</div><span class="eyebrow">TAKE A LITTLE BREATH</span><h2>冒险，歇一小会。</h2><p id="pause-reason">草原会在这里等你。</p><button id="resume" class="primary">继续冒险 ${icon('arrow')}</button><button id="pause-settings" class="text-button">画质与声音</button><div class="pause-links"><button id="restart" class="text-button">重新开始</button><button id="back-menu" class="text-button">返回主菜单</button></div></div></section>
    <section id="gameover-screen" class="modal-screen" aria-label="本局结束" hidden><div class="modal result-card"><div class="modal-symbol">${icon('spark')}</div><span class="eyebrow">EVERY SPROUT GETS ANOTHER CHANCE</span><h2>小火焰，休息一下。</h2><p>带着这次冒险的勇气，再出发吧。</p><div class="result-stats"><div><strong id="result-time">00:00</strong><span>生存时间</span></div><div><strong id="result-kills">0</strong><span>击败怪物</span></div><div><strong id="result-xp">0</strong><span>收集经验</span></div></div><button id="gameover-restart" class="primary">再来一次 ${icon('arrow')}</button><button id="gameover-menu" class="text-button">返回主菜单</button></div></section>
    <section id="upgrade-screen" class="upgrade-screen" role="dialog" aria-modal="true" aria-labelledby="upgrade-heading" hidden>
      <div id="upgrade-panel" class="upgrade-panel" tabindex="-1">
        <header class="upgrade-header"><div class="upgrade-emblem">${icon('leaf')}</div><div><span class="eyebrow">A LITTLE STRONGER, A LITTLE BRAVER</span><h2 id="upgrade-heading">新的魔法，正在发芽。</h2></div><button id="upgrade-menu" class="text-button">返回菜单</button></header>
        <div class="upgrade-subtitle"><span id="upgrade-level">等级 02</span><p id="upgrade-instruction">选择一项强化，让这次冒险更不一样。</p><span class="paused-badge">战斗已暂停</span></div>
        <div id="upgrade-cards" class="upgrade-cards"></div>
        <footer class="upgrade-footer"><span>${icon('spark')} <span id="upgrade-queue">本次选择后继续冒险</span></span><span>轻点卡牌选择 · 强化仅在本局生效</span></footer>
      </div>
    </section>
    <section id="help-screen" class="modal-screen" aria-label="操作指南" hidden><div class="modal help-card"><button id="close-help" class="icon-button close-button" aria-label="关闭操作指南">${icon('close')}</button><span class="eyebrow">A SMALL FIELD GUIDE</span><h2>出发前，认识一下。</h2><div class="guide-row"><span>01</span><div><strong>走位与闪避</strong><p>左下角摇杆控制方向。电脑使用 WASD 或方向键。避开橙色出生预警圈。</p></div></div><div class="guide-row"><span>02</span><div><strong>来一小段冲刺</strong><p>轻点右下角冲刺，电脑按空格或 Shift。碰到敌人会受伤，受伤后短暂无敌。</p></div></div><div class="guide-row"><span>03</span><div><strong>收集经验，选择魔法</strong><p>自动施法击败敌人，靠近吸收经验。升级会暂停战斗，轻点卡牌叠加强化，也能习得环绕球与冲击波。</p></div></div><p class="guide-tip">手机请横屏。升级时摇杆会复位，选卡后请重新按住摇杆；同类百分比强化按基础值累加。</p></div></section>
    <section id="settings-screen" class="modal-screen settings-screen" role="dialog" aria-modal="true" aria-labelledby="settings-heading" hidden>
      <div class="settings-card"><header><div><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="settings-heading">按你的节奏冒险</h2></div><button id="close-settings" class="icon-button" aria-label="关闭设置">${icon('close')}</button></header>
      <div class="settings-grid"><div class="graphics-setting"><label for="quality">画面品质</label><select id="quality"><option value="auto">自动 · 优先流畅</option><option value="battery">省电 · 30 帧目标</option><option value="high">清晰 · 60 帧目标</option></select><p id="quality-description">根据运行负载动态调整清晰度。</p><small>帧率为目标，实际表现取决于设备。</small></div>
      <div class="audio-settings"><label class="setting-toggle"><span>背景音乐<small>原创风铃小调</small></span><input id="music-toggle" type="checkbox" role="switch" aria-label="背景音乐" checked/><i></i></label><label class="setting-toggle"><span>游戏音效<small>魔法、拾取与受击</small></span><input id="sound-toggle" type="checkbox" role="switch" aria-label="游戏音效" checked/><i></i></label><small id="audio-status" class="audio-status">点击开始冒险后启用声音</small></div></div>
      <footer><span>设置自动保存 · 战斗中打开会暂停</span><button id="save-settings" class="primary">完成 ${icon('arrow')}</button></footer></div>
    </section>
    <section id="rotate-screen" class="rotate-screen" aria-label="请横屏游玩"><div class="rotate-icon">${icon('rotate')}</div><span class="eyebrow">A LITTLE MORE ROOM TO ROAM</span><h2>把手机横过来吧</h2><p>焰绒需要一片更宽的草原。<br/>关闭手机方向锁定后，旋转到横屏即可。</p><span class="rotate-brand">MONSTERBONK <b>MOBILE</b></span></section>
    <section id="error-screen" class="error-screen" hidden><h2>草原暂时没有打开</h2><p id="error-message"></p><button id="retry" class="primary">重新加载</button></section>
    <div id="toast" class="toast" role="status" hidden></div>
  `;
}

export function renderUpgradeCards(progression: Progression, version: number) {
  const offered = progression.offers;
  document.getElementById('upgrade-level')!.textContent = `等级 ${String(progression.choiceLevel).padStart(2, '0')}`;
  document.getElementById('upgrade-instruction')!.textContent = offered.length < 3 ? `还有 ${offered.length} 种技能可强化，选择一项继续成长。` : '三选一，让这次冒险更不一样。';
  document.getElementById('upgrade-queue')!.textContent = progression.pendingChoices > 1 ? `还有 ${progression.pendingChoices} 次成长选择 · 逐次选择后继续` : '本次选择后继续冒险';
  document.getElementById('upgrade-cards')!.innerHTML = offered.map((id) => {
    const skill = SKILLS.find((candidate) => candidate.id === id)!;
    const rank = progression.ranks[id];
    return `<button class="skill-card" data-skill="${id}" data-offer="${version}" style="--skill-color:${skill.color}" disabled aria-label="${skill.title}：${skill.benefit}，提升到 ${rank + 1} 级">
      <span class="skill-card-meta"><span>${rank === 0 && skill.effect.type === 'spell' ? '新技能' : '魔法强化'}</span><span>Lv. ${rank} → ${rank + 1}<small> / ${skill.maxRank}</small></span></span>
      <span class="skill-emblem">${icon(skill.icon)}</span>
      <h3>${skill.title}</h3><strong class="skill-benefit">${skill.benefit}</strong>
      <p class="skill-description">${skill.description}</p>
      <span class="skill-preview">${upgradePreview(skill, progression.ranks)}</span>
      <span class="skill-ranks" aria-hidden="true">${Array.from({ length: skill.maxRank }, (_, index) => `<i class="${index <= rank ? 'filled' : ''}"></i>`).join('')}</span>
      <span class="skill-pick">点击选择 ${icon('arrow')}</span>
    </button>`;
  }).join('');
}
