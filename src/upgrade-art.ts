import type { BaseAttackId } from './fusion';
import type { SkillDefinition, SkillId } from './progression';

/** Presentation only. Categories and availability still come from Progression. */
export const UPGRADE_ART = {
  damage: ['skills/damage.png'],
  haste: ['skills/haste.png'],
  multishot: ['skills/multishot.png'],
  vitality: ['skills/vitality.png'],
  movement: ['skills/movement.png'],
  range: ['skills/range.png'],
  orbit: ['skills/orbit.png'],
  shockwave: ['skills/shockwave.png'],
  'split-on-hit': ['skills/split-on-hit-fire.png'],
  area: ['skills/area-expansion.png'],
  chain: ['skills/chain-bounce-water.png'],
  'spark-weapon': ['skills/spark-weapon.png'],
  'bubble-weapon': ['skills/bubble-weapon.png'],
  'leaf-weapon': ['skills/leaf-weapon.png'],
  'overload-core': ['relics/overload-core.png'],
  'hunter-eye': ['relics/hunter-eye.png'],
  'shattered-core': ['relics/shattered-core.png'],
  'tidal-pearl': ['relics/tidal-pearl.png'],
  'specialist-badge': ['relics/specialist-badge.png'],
  'echo-rune': ['relics/echo-rune.png'],
  'berserk-route': ['skills/berserk-route.png'],
  'pursuit-route': ['skills/pursuit-route.png'],
} satisfies Record<SkillId, readonly string[]>;

export const uiArtUrl = (path: string) => `${import.meta.env.BASE_URL}assets/ui/${path}`;

export function upgradeArt(skill: Pick<SkillDefinition, 'id' | 'category'>, base: BaseAttackId, weapons?: readonly BaseAttackId[]) {
  const equipped = weapons ?? [base];
  let illustrations: readonly string[] = UPGRADE_ART[skill.id];
  if (skill.id === 'split-on-hit') {
    illustrations = [
      ...(equipped.includes('spark') ? ['skills/split-on-hit-fire.png'] : []),
      ...(equipped.includes('leaf') ? ['skills/split-on-hit-thorn.png'] : []),
    ];
  } else if (skill.id === 'chain') {
    illustrations = [
      ...(equipped.includes('bubble') ? ['skills/chain-bounce-water.png'] : []),
      ...(equipped.includes('leaf') ? ['skills/chain-bounce-grass.png'] : []),
    ];
  }
  const element = skill.id === 'spark-weapon' ? 'fire' : skill.id === 'bubble-weapon' ? 'water' : skill.id === 'leaf-weapon' ? 'grass' : undefined;
  const category = skill.category ?? 'normal';
  // All offers share the same parchment geometry and content safe areas.
  // Category/element are conveyed through dynamic labels, gems and ink colors.
  const frame = 'common';
  return { illustrations: illustrations.map(path => uiArtUrl(`upgrade/illustrations/${path}`)), element, category,
    frame: uiArtUrl(`upgrade/card-frames/${frame}.png`),
    gem: uiArtUrl(`upgrade/gem-${category === 'relic' ? 'rare' : category === 'evolution' ? 'legendary' : 'common'}.png`),
  };
}

/** Load state affects decoration only; never gates the card's input or offer. */
export function bindUpgradeArt(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('img[data-upgrade-art]').forEach(image => {
    if (image.dataset.artBound === 'true') return;
    image.dataset.artBound = 'true';
    const sync = () => {
      const ready = image.complete && image.naturalWidth > 0;
      image.classList.toggle('art-loaded', ready);
      image.parentElement?.classList.toggle('art-ready', !!image.parentElement.querySelector('.art-loaded'));
      if (image.dataset.upgradeArt === 'frame') image.closest('.skill-card')?.classList.toggle('frame-ready', ready);
    };
    image.addEventListener('load', sync, { once: true });
    image.addEventListener('error', sync, { once: true });
    sync();
  });
}
