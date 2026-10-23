import {
  readSanctuary, SANCTUARY_LEVEL_COSTS, SANCTUARY_MAX_LEVEL, SANCTUARY_REGIONS,
  type SanctuarySave,
} from './sanctuary';

/** Lightweight HTML/CSS habitat: no extra WebGL context or texture downloads. */
export function sanctuaryMarkup(): string {
  return `
    <section id="sanctuary-screen" class="modal-screen sanctuary-screen" role="dialog" aria-modal="true"
      aria-labelledby="sanctuary-heading" hidden>
      <div class="sanctuary-panel">
        <header class="sanctuary-header">
          <div><small>冒险之外 · 森林的另一面</small><h2 id="sanctuary-heading">幻兽栖地</h2>
            <p>每一场冒险，都让这片森林多一点生机。</p></div>
          <div class="sanctuary-header-actions">
            <span class="sanctuary-wallet" aria-label="可用栖地光屑">✦ <strong id="sanctuary-light">3</strong> 光屑</span>
            <button id="close-sanctuary" class="sanctuary-close" type="button" aria-label="关闭栖地">×</button>
          </div>
        </header>
        <div class="sanctuary-content">
          <div class="sanctuary-scene" aria-label="森林营地的建设预览">
            <span class="sanctuary-moon" aria-hidden="true">✧</span>
            <span class="sanctuary-scene-title">微光林地 <small id="sanctuary-progress">0 / 9 处修复</small></span>
            <div class="sanctuary-hills" aria-hidden="true"></div>
            ${SANCTUARY_REGIONS.map(region => `<div class="sanctuary-landmark sanctuary-landmark--${region.id}" data-landmark="${region.id}" data-level="0" aria-hidden="true">
              <span class="sanctuary-landmark-light"></span><span class="sanctuary-landmark-icon">${region.icon}</span>
              <small>${region.name}</small>
            </div>`).join('')}
            <div class="sanctuary-path" aria-hidden="true"></div>
          </div>
          <div class="sanctuary-build-area">
            <div class="sanctuary-build-heading"><strong>修复森林</strong><span>最高 3 阶 · 仅外观与收集进度</span></div>
            <div class="sanctuary-buildings">
            ${SANCTUARY_REGIONS.map(region => `
              <article class="sanctuary-building sanctuary-building--${region.id}" id="sanctuary-region-${region.id}" data-level="0">
                <div class="sanctuary-building-icon" aria-hidden="true">${region.icon}</div>
                <div class="sanctuary-building-info">
                  <small>${region.creature}的栖息角</small><h3>${region.name}</h3>
                  <p>${region.description}</p>
                  <span class="sanctuary-stage">尚未修复</span>
                </div>
                <button type="button" class="sanctuary-build-button" data-sanctuary-region="${region.id}">修复 · 3 ✦</button>
              </article>`).join('')}
            </div>
            <p id="sanctuary-info" class="sanctuary-info" role="status" aria-live="polite">
              每次闯关或无尽挑战的已完成波次，可为栖地带回光屑。战斗金币仍只在本局使用。
            </p>
          </div>
        </div>
      </div>
    </section>`;
}

export function renderSanctuary(save: SanctuarySave = readSanctuary(), message?: string): void {
  const panel = document.getElementById('sanctuary-screen');
  if (!panel) return;
  document.getElementById('sanctuary-light')!.textContent = String(save.light);
  const levels = SANCTUARY_REGIONS.reduce((sum, region) => sum + save.buildings[region.id], 0);
  document.getElementById('sanctuary-progress')!.textContent = `${levels} / 9 阶修复`;
  const menuCount = document.getElementById('sanctuary-menu-count');
  if (menuCount) menuCount.textContent = `${save.light} 光屑`;
  for (const region of SANCTUARY_REGIONS) {
    const level = save.buildings[region.id];
    const card = document.getElementById(`sanctuary-region-${region.id}`)!;
    const landmark = panel.querySelector<HTMLElement>(`[data-landmark="${region.id}"]`)!;
    card.dataset.level = landmark.dataset.level = String(level);
    card.querySelector<HTMLElement>('.sanctuary-stage')!.textContent =
      level === 0 ? '尚未修复' : level === SANCTUARY_MAX_LEVEL ? '完全复苏 · 3 / 3' : `修复进度 · ${level} / 3`;
    const button = card.querySelector<HTMLButtonElement>('[data-sanctuary-region]')!;
    const cost = SANCTUARY_LEVEL_COSTS[level as 0 | 1 | 2] ?? 0;
    button.disabled = level >= SANCTUARY_MAX_LEVEL || save.light < cost;
    button.textContent = level >= SANCTUARY_MAX_LEVEL ? '已完成 ✓'
      : save.light < cost ? `需 ${cost} ✦` : `${level === 0 ? '修复' : '升级'} · ${cost} ✦`;
  }
  document.getElementById('sanctuary-info')!.textContent = message
    ?? '首次突破更高波次可获得额外光屑；重复挑战也有少量奖励。栖地建设不增加战斗属性。';
}

export function renderSanctuaryReward(earned?: number): void {
  const line = document.getElementById('sanctuary-result');
  if (!line) return;
  line.hidden = !earned;
  line.textContent = earned ? `栖地收获 ✦ +${earned} 光屑 · 返回主菜单可修复森林` : '';
}
