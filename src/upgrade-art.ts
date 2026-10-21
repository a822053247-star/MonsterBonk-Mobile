import {PAIR_IDS,type PairSkillId} from './weapon-pair-fusion';
import { factoryRelic, FACTORY_RELICS, type FactoryRelicId } from './content/relic-registry';
import { relicIcon, generatedIcon } from './content/relic-icons';
import type { RelicDefinition } from './content/content-types';
import type { BaseAttackId } from './fusion';
import type { SkillDefinition, SkillId } from './progression';

/** Presentation only. Categories and availability still come from Progression. */
const LEGACY_UPGRADE_ART = {
  'draft-boiling-core': ['skills/area-expansion.png', 'skills/split-on-hit-fire.png'],
  'draft-martyr-core': ['relics/draft-martyr-core.png'],
  'draft-kindling-flask': ['relics/draft-kindling-flask.png'],
  'draft-thorn-testament': ['relics/draft-thorn-testament.png'],
  'draft-bubble-spore': ['relics/draft-bubble-spore.png'],
  'draft-echo-bone-dice': ['relics/draft-echo-bone-dice.png'],
  'draft-slaughter-hourglass': ['relics/draft-slaughter-hourglass.png'],
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
  'flame-sweep-weapon': ['skills/flame-sweep-weapon.png'],
  'overload-core': ['relics/overload-core.png'],
  'hunter-eye': ['relics/hunter-eye.png'],
  'shattered-core': ['relics/shattered-core.png'],
  'tidal-pearl': ['relics/tidal-pearl.png'],
  'specialist-badge': ['relics/specialist-badge.png'],
  'echo-rune': ['relics/echo-rune.png'],
  'berserk-route': ['skills/berserk-route.png'],
  'pursuit-route': ['skills/pursuit-route.png'],
} satisfies Record<Exclude<SkillId, FactoryRelicId | PairSkillId>, readonly string[]>;

export const UPGRADE_ART: Partial<Record<SkillId, readonly string[]>> = {
  ...LEGACY_UPGRADE_ART,...Object.fromEntries(PAIR_IDS.map(id=>[`${id}-weapon`,[`weapon-pairs/${id}.png`]])),
 ...Object.fromEntries(Object.values(FACTORY_RELICS).map(d => [d.id, [generatedIcon(d.art)]])),
};

export const uiArtUrl = (path: string) => `${import.meta.env.BASE_URL}assets/ui/${path}`;

export function upgradeArt(skill: Pick<SkillDefinition, 'id' | 'category'>, base: BaseAttackId, weapons?: readonly BaseAttackId[]) {
  const equipped = weapons ?? [base];
  const definition = factoryRelic(skill.id);
  let illustrations: readonly string[] = skill.id in UPGRADE_ART ? UPGRADE_ART[skill.id] ?? [] : [];
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
  const element = definition?.art.palette ?? (skill.id === 'spark-weapon' || skill.id === 'flame-sweep-weapon' ? 'fire' : skill.id === 'bubble-weapon' ? 'water' : skill.id === 'leaf-weapon' ? 'grass' : undefined);
  const category = skill.category ?? 'normal';
  // All offers share the same parchment geometry and content safe areas.
  // Category/element are conveyed through dynamic labels, gems and ink colors.
  const frame = 'common';
  return { illustrations: definition ? [relicIcon(definition.art, import.meta.env.BASE_URL)] : illustrations.map(path => uiArtUrl(`upgrade/illustrations/${path}`)), element, category,
    frame: uiArtUrl(`upgrade/card-frames/${frame}.png`),
    gem: uiArtUrl(`upgrade/gem-${category === 'relic' ? 'rare' : category === 'evolution' ? 'legendary' : 'common'}.png`),
  };
}

/** Load state affects decoration only; never gates the card's input or offer. */
export function bindUpgradeArt(root: HTMLElement, definitions: readonly RelicDefinition[] = Object.values(FACTORY_RELICS)) {
  root.querySelectorAll<HTMLImageElement>('img[data-upgrade-art]').forEach(image => {
    if (image.dataset.artBound === 'true') return;
    image.dataset.artBound = 'true';
    // Dedicated illustrations can be high resolution; generated pixel icons retain nearest sampling.
    if (definitions.some(d => d.art.png && image.src === new URL(relicIcon(d.art, import.meta.env.BASE_URL), document.baseURI).href)) image.style.imageRendering = 'auto';
    const sync = () => {
      const ready = image.complete && image.naturalWidth > 0;
      image.classList.toggle('art-loaded', ready);
      image.parentElement?.classList.toggle('art-ready', !!image.parentElement.querySelector('.art-loaded'));
      if (image.dataset.upgradeArt === 'frame') image.closest('.skill-card')?.classList.toggle('frame-ready', ready);
    };
    image.addEventListener('load', sync, { once: true });
    image.addEventListener('error', () => {
      const definition = definitions.find(d => image.src === new URL(relicIcon(d.art, import.meta.env.BASE_URL), document.baseURI).href);
      if (definition && image.dataset.iconFallback !== 'true') { image.dataset.iconFallback = 'true'; image.src = generatedIcon(definition.art); }
      sync();
    }, { once: true });
    sync();
  });
}
