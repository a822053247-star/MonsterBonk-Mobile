import {PAIR_IDS,type PairSkillId} from './weapon-pair-fusion';
import { factoryRelic, FACTORY_RELICS, type FactoryRelicId } from './content/relic-registry';
import { relicIcon, generatedIcon } from './content/relic-icons';
import type { RelicDefinition } from './content/content-types';
import type { BaseAttackId } from './fusion';
import type { SkillDefinition, SkillId } from './progression';
import {cardArtUrl,cardArtImages} from './card-art';

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
  'screen-nova': ['skills/screen-nova.png'],
  'screen-barrage': ['skills/screen-barrage.png'],
  'azure-burst': ['skills/azure-burst.png'],
  'star-tide': ['skills/star-tide.png'],
  'still-sea': ['skills/still-sea.png'],
  'returning-ring': ['skills/returning-ring.png'],
  'abyss-vortex': ['skills/abyss-vortex.png'],
  'ice-radiance': ['skills/ice-radiance.png'],
  'shatter-ring': ['skills/shatter-ring.svg'],
  'glacier-trail': ['skills/glacier-trail.svg'],
  'dream-dart-weapon': ['skills/dream-dart-weapon.png'],
  'resonance-seed-weapon': ['skills/resonance-seed-weapon.png'],
  'sakura-echo': ['skills/sakura-echo.png'],
  'spore-trail': ['skills/spore-trail.png'],
  'tidal-recall': ['skills/tidal-recall.png'],
  'tsunami-sanctuary': ['skills/tsunami-sanctuary.png'],
  'astral-wheel': ['skills/astral-wheel.png'],
  'abyss-crown': ['skills/abyss-crown.png'],
  'undertow-pyre': ['skills/undertow-pyre.png'],
  'deep-collapse': ['skills/deep-collapse.png'],
  'frost-prism': ['skills/frost-prism.png'],
  'all-tides': ['skills/all-tides.png'],
  'split-on-hit': ['skills/split-on-hit-fire.png'],
  area: ['skills/area-expansion.png'],
  chain: ['skills/chain-bounce-water.png'],
  'spark-weapon': ['skills/spark-weapon.png'],
  'bubble-weapon': ['skills/bubble-weapon.png'],
  'leaf-weapon': ['skills/leaf-weapon.png'],
  'flame-sweep-weapon': ['skills/flame-sweep-weapon.png'],
  'thorn-wheel-weapon': ['skills/thorn-wheel-weapon.png'],
  'tidal-blade-weapon': ['skills/tidal-blade-weapon.png'],
  'thunder-bud-weapon': ['skills/thunder-bud-weapon.svg'],
  'frost-crystal-weapon': ['skills/frost-crystal-weapon.svg'],
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
 ...Object.fromEntries(Object.values(FACTORY_RELICS).map((d:RelicDefinition) => [d.id, d.art.hidden?[]:[generatedIcon(d.art)]])),
};

export const uiArtUrl = (path: string) => cardArtUrl(`${import.meta.env.BASE_URL}assets/ui/${path}`);

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
  const element = definition?.art.palette ?? (skill.id === 'spark-weapon' || skill.id === 'flame-sweep-weapon' ? 'fire' : ['bubble-weapon', 'tidal-blade-weapon', 'azure-burst', 'star-tide', 'still-sea', 'returning-ring', 'abyss-vortex', 'ice-radiance', 'tidal-recall', 'tsunami-sanctuary', 'astral-wheel', 'abyss-crown', 'deep-collapse', 'frost-prism', 'all-tides'].includes(skill.id) ? 'water' : skill.id === 'leaf-weapon' || skill.id === 'thorn-wheel-weapon' || (skill.id === 'spore-trail' || skill.id === 'undertow-pyre') ? 'grass' : undefined);
  const category = skill.category ?? 'normal';
  // All offers share the same parchment geometry and content safe areas.
  // Category/element are conveyed through dynamic labels, gems and ink colors.
  const frame = 'common';
  return { hideIcon:!!definition?.art.hidden, illustrations: cardArtImages(definition ? definition.art.hidden?[]:[relicIcon(definition.art, import.meta.env.BASE_URL)] : illustrations.map(path => uiArtUrl(`upgrade/illustrations/${path}`))), element: ['dream-dart-weapon', 'resonance-seed-weapon', 'sakura-echo'].includes(skill.id) ? 'pink' : ['frost-crystal-weapon', 'shatter-ring', 'glacier-trail'].includes(skill.id) ? 'ice' : skill.id === 'thunder-bud-weapon' ? 'electric' : element, category,
    frame: uiArtUrl(`upgrade/card-frames/${frame}.png`),
    gem: uiArtUrl(`upgrade/gem-${category === 'relic' ? 'rare' : category === 'evolution' ? 'legendary' : 'common'}.png`),
  };
}

/** Small decoded-image cache for the actual upcoming offers, not the full catalog. */
const warmedImages = new Map<string, HTMLImageElement>();
export function preloadUpgradeImages(urls: readonly string[]) {
  for (const url of new Set(urls)) {
    if (!url || warmedImages.has(url)) continue;
    const image = new Image();
    image.loading = 'eager'; image.fetchPriority = 'high'; image.decoding = 'async';
    image.onload = () => { void image.decode().catch(() => {}); };
    image.onerror = () => { if (warmedImages.get(url) === image) warmedImages.delete(url); };
    warmedImages.set(url, image); image.src = url;
    if (warmedImages.size > 16) warmedImages.delete(warmedImages.keys().next().value!);
  }
}

/** Load state affects decoration only; never gates the card's input or offer. */
export function bindUpgradeArt(root: HTMLElement, definitions: readonly RelicDefinition[] = Object.values(FACTORY_RELICS)) {
  root.querySelectorAll<HTMLImageElement>('img[data-upgrade-art]').forEach(image => {
    if (image.dataset.artBound === 'true') return;
    image.dataset.artBound = 'true';
    if(image.src.includes('/assets/ui/card-art/'))image.style.imageRendering='auto';
    if (image.dataset.upgradeArt === 'shop-illustration' || image.dataset.upgradeArt === 'illustration') {
      image.loading = 'eager'; image.fetchPriority = 'high';
    }
    // Dedicated illustrations can be high resolution; generated pixel icons retain nearest sampling.
    if (/\/(?:screen-nova|screen-barrage|azure-burst|star-tide|still-sea|returning-ring|abyss-vortex|ice-radiance|spore-trail|tidal-recall|tsunami-sanctuary|astral-wheel|abyss-crown|undertow-pyre|deep-collapse|frost-prism|all-tides)\.png$/.test(image.src)
      || /\/(?:frost-crystal-weapon\.svg|rest-supply\.png|vital-contract\.png)$/.test(image.src)
      || definitions.some(d => d.art.png && image.src === new URL(relicIcon(d.art, import.meta.env.BASE_URL), document.baseURI).href)) image.style.imageRendering = 'auto';
    const sync = () => {
      const ready = image.complete && image.naturalWidth > 0;
      image.classList.toggle('art-loaded', ready);
      const parent = image.parentElement;
      const groupReady = parent?.classList.contains('shop-illustration')
        ? [...parent.querySelectorAll<HTMLImageElement>('img')].every(img => img.complete && img.naturalWidth > 0)
        : !!parent?.querySelector('.art-loaded');
      parent?.classList.toggle('art-ready', groupReady);
      if (image.dataset.upgradeArt === 'frame') image.closest('.skill-card')?.classList.toggle('frame-ready', ready);
    };
    image.addEventListener('load', sync, { once: true });
    const fallback = () => {
      const definition = definitions.find(d => image.src === new URL(cardArtUrl(relicIcon(d.art, import.meta.env.BASE_URL)), document.baseURI).href);
      if (definition && image.dataset.iconFallback !== 'true') { image.dataset.iconFallback = 'true'; image.src = generatedIcon(definition.art); }
      else if (image.dataset.artFallback && image.dataset.iconFallback !== 'true') {
        image.dataset.iconFallback = 'true'; image.src = image.dataset.artFallback;
      }
      sync();
    };
    image.addEventListener('error', fallback, { once: true });
    if (image.complete && image.naturalWidth === 0) fallback();
    sync();
  });
}
