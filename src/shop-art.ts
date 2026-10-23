import type { Combat } from './combat';
import type { ShopItem, RunShop } from './shop';
import { RELICS, EVOLUTIONS } from './relics';
import { uiArtUrl, upgradeArt, preloadUpgradeImages } from './upgrade-art';
import { isWaterEvolution } from './water-evolution';

export function preloadShopArt(shop: RunShop, combat: Combat) {
  preloadUpgradeImages([
    ...shop.items.flatMap(item => shopArt(item, combat).images),
    uiArtUrl('shop/item-slot.png'), uiArtUrl('shop/health-potion.png'),
    uiArtUrl('common/coin.png'), uiArtUrl('shop/refresh-rune.png'),
  ]);
}

/** Resolve appearance from the actual offer, never from its position in the shop. */
export function shopArt(item: ShopItem, combat: Combat) {
  if(item.illustration)return {hideIcon:false,label:item.kind==='contract'?'生命换强化':'恢复补给',category:item.kind,images:[uiArtUrl(`upgrade/illustrations/relics/${item.illustration}.png`)],icon:'heart' as const};
  if (item.kind === 'heal') return { label: '恢复补给', category: 'heal', images: [uiArtUrl('shop/health-potion.png')], icon: 'heart' as const };
  if (item.kind === 'empty' || !item.skill) return { label: '暂无商品', category: 'empty', images: [], icon: 'leaf' as const };
  const skill = combat.progression.skills.find(skill => skill.id === item.skill);
  // Sold/invalidated rewards can leave the eligible pool. Their own ID remains authoritative.
  const category = skill?.category ?? (item.skill in RELICS ? 'relic' : item.skill in EVOLUTIONS || isWaterEvolution(item.skill) ? 'evolution' : undefined);
  const label = category === 'relic' ? '稀有道具' : isWaterEvolution(item.skill) ? '组合进化' : category === 'evolution' ? '互斥进化'
    : item.skill.endsWith('-weapon') ? (item.title.includes('强化') ? '武器强化' : '新武器')
    : ['split-on-hit', 'area', 'chain'].includes(item.skill) ? '融合改造' : '魔法强化';
  const art = upgradeArt({ id: item.skill, category }, combat.progression.fusionBase,
    combat.runBuild.attacks.map(attack => attack.attackId));
  return { hideIcon:art.hideIcon, label, category: category ?? 'normal', images: art.illustrations, icon: skill?.icon ?? 'spark' as const };
}
