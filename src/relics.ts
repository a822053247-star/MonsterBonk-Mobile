import type { BaseAttackId } from './fusion';
import { frostStats } from './frost-combat';
import { FACTORY_RELIC_METADATA, factoryRelic } from './content/relic-registry';
import { applyRelicDefinition } from './content/relic-effects';
import type { RelicContext } from './content/content-types';

export const LEGACY_RELICS = {
  'draft-boiling-core': { title: '沸腾核心', benefit: '水泡铺湿润，火系命中引发蒸爆 · 半径 2.5', tradeoff: '消耗湿润；同一目标间隔 0.6 秒，蒸爆不再触发蒸爆', icon: 'wave', color: '#ffd49b' },
  'overload-core': { title: '过载核心', benefit: '范围半径 +50%', tradeoff: '所有武器攻击间隔 +20%', icon: 'wave', color: '#ffb45f' },
  'hunter-eye': { title: '追猎之眼', benefit: '派生弹轻微追踪', tradeoff: '派生弹伤害 -20%', icon: 'compass', color: '#e7c67a' },
  'shattered-core': { title: '破碎晶核', benefit: '每次分裂子弹 +1', tradeoff: '派生弹伤害 -25%，仍受弹体预算限制', icon: 'battle', color: '#d6b9f5' },
  'tidal-pearl': { title: '潮汐遗珠', benefit: '水泡减速时长 +60%', tradeoff: '所有武器直接命中伤害 -15%', icon: 'wave', color: '#8fe8ff' },
  'specialist-badge': { title: '专精徽记', benefit: '仅装备一种武器时伤害 +45%', tradeoff: '装备副武器后加成失效', icon: 'spark', color: '#f3de9a' },
  'echo-rune': { title: '回声符石', benefit: '连锁距离 +40%', tradeoff: '每次额外跳跃伤害再乘 70%', icon: 'orbit', color: '#a5edbe' },
  'draft-martyr-core': { title: '殉爆晶核', benefit: '火系击杀连爆 · 三级可觉醒', tradeoff: '觉醒65%原伤/3代，燃烧可触发；火花需分裂，每链限24节点', description: '基础击杀爆炸为致死伤害50%，最多两代。三级火花+命中分裂，或三级横扫自动觉醒：按原始攻击65%计算，后续每代保留85%，最多三代；燃烧击杀也可引爆。', icon: 'spark', color: '#ff9849' },
  'draft-kindling-flask': { title: '引火油壶', benefit: '燃烧 2 秒，每 0.5 秒造成命中伤害的 10%', tradeoff: '重复火系命中叠层，上限 3；下次爆炸消耗，每层范围 +15%', icon: 'spark', color: '#ffc16b' },
  'draft-thorn-testament': { title: '荆棘遗嘱', benefit: '草系击杀发射 3 枚 35% 伤害荆棘', tradeoff: '荆棘不再触发遗嘱；共享派生弹预算', icon: 'leaf', color: '#a5ec69' },
  'draft-bubble-spore': { title: '泡泡孢子', benefit: '水系击杀生成 35% 伤害小泡，额外弹射 2 次', tradeoff: '触发间隔 0.35 秒；小泡不再派生孢子，共享弹池', icon: 'wave', color: '#70dcff' },
  'draft-echo-bone-dice': { title: '回声骨骰', benefit: '每第 5 次施放，复制前次攻击的 50% 伤害', tradeoff: '复制一枚弹或一次横扫；不计次数，受派生预算限制', icon: 'orbit', color: '#a7edf0' },
  'draft-slaughter-hourglass': { title: '屠戮沙漏', benefit: '4 秒内击杀 8 敌，攻速 +30% 持续 3 秒', tradeoff: '触发后冷却 8 秒，期间不累积；增益不叠加', icon: 'dash', color: '#ffb45f' },
} as const;
export const RELICS = { ...LEGACY_RELICS, ...FACTORY_RELIC_METADATA };
export type RelicId = keyof typeof RELICS;
export const isRelicId = (id: string): id is RelicId => Object.prototype.hasOwnProperty.call(RELICS, id);
export const TRIGGER_RELIC_RULES = {
  martyr: { radius: 1.35, damage: .5, maxGeneration: 2, eventsPerTick: 32 },
  kindling: { duration: 2, interval: .5, damage: .1, maxStacks: 3, radiusPerStack: .15 },
  testament: { count: 3, damage: .35, range: 6, lifetime: .45 },
  bubble: { damage: .35, range: 6, lifetime: .65, cooldown: .35, hops: 2 },
  echo: { every: 5, damage: .5, delay: .12, expiry: .75 },
  hourglass: { window: 4, kills: 8, duration: 3, cooldown: 8, haste: .3 },
} as const;

/** Unique attack lineage, separate from the caster ID and fusion-child generation. */
export interface RelicDamageSource {
  /** Shared by a large cast and every derived source; bounded across enemy pool reuse. */
  areaBudget?: { nodes: number; hits: Map<number, number>; shared?: { nodes: number } };
  weaponTags?:readonly import('./content/weapon-traits').WeaponTag[];
  baseWeaponDamage?:number;
  primary?:boolean;
  castId?:number;
  volley?:{id:number;showerTriggered?:boolean};
  suppressRelics?:boolean;
  behavior?: boolean;
  rootId: number;
  attackId: BaseAttackId;
  kind: 'hit' | 'explosion' | 'burn' | 'testament' | 'bubble-spore' | 'steam';
  /** Original actual hit snapshot, including copy/direct modifiers. */
  rootDamage?: number;
  mature?: boolean;
  reaction?: 'steam';
  chain?: { nodes: number; refracted?: boolean; aftershock?:boolean };
  copied?: boolean;
  generation: number;
  rules: AttackRules;
  martyrHits: Set<number>;
}
export const EVOLUTIONS = {
  'berserk-route': { title: '狂暴火种', benefit: '火种爆炸半径 +35%', tradeoff: '火花弹攻击间隔 +25%，放弃追猎路线', icon: 'spark', color: '#ff9849' },
  'pursuit-route': { title: '追猎火种', benefit: '派生火种追踪敌人', tradeoff: '火种爆炸半径 -25%，放弃狂暴路线', icon: 'compass', color: '#f3de9a' },
} as const;
export type EvolutionId = keyof typeof EVOLUTIONS;
export const isEvolutionId = (id: string): id is EvolutionId => Object.prototype.hasOwnProperty.call(EVOLUTIONS, id);

/** Late-game damage growth is deliberately weaker than the old universal +20% per rank.
 * Level one remains unchanged; coverage/piercing/slow/arc are the reward for investing. */
export const WEAPON_DAMAGE_PER_LEVEL: Readonly<Record<BaseAttackId, number>> = {
  spark: .16, bubble: .18, leaf: .16, 'flame-sweep': .12, 'thorn-wheel': .15, 'tidal-blade': .14, 'thunder-bud': .12, 'frost-crystal': .14,
};

/** Snapshot these rules on a volley; upgrades never rewrite an in-flight attack. */
export interface AttackRules {
  pairId?: import('./weapon-pair-fusion').WeaponPairId;
  pairArea?:boolean; pairSplit?:boolean; pairChain?:boolean;
  damageMultiplier: number; directMultiplier: number; intervalMultiplier: number;
  rangeMultiplier: number; impactVfx?: string;
  areaMultiplier: number; childCountBonus: number; childDamageMultiplier: number;
  childHoming: boolean; slowDuration: number; chainRangeMultiplier: number;
  chainDecay: number; pierceBonus: number;
}

export function resolveAttackRules(attack: BaseAttackId, relics: readonly RelicId[], weaponCount: number, level = 1, evolution?: EvolutionId, context?: RelicContext): AttackRules {
  const has = (id: RelicId) => relics.includes(id);
  const spark = attack === 'spark';
  const rules: AttackRules = {
    rangeMultiplier: 1,
    damageMultiplier: (1 + WEAPON_DAMAGE_PER_LEVEL[attack] * (level - 1)) * (has('specialist-badge') && weaponCount === 1 ? 1.45 : 1),
    directMultiplier: has('tidal-pearl') ? .85 : 1,
    intervalMultiplier: (has('overload-core') ? 1.2 : 1) * (spark && evolution === 'berserk-route' ? 1.25 : 1)
      * (attack === 'frost-crystal' ? frostStats(level).interval / .72 : 1),
    areaMultiplier: (has('overload-core') ? 1.5 : 1) * (spark ? 1 + .06 * (level - 1) : 1)
      * (spark && evolution === 'berserk-route' ? 1.35 : spark && evolution === 'pursuit-route' ? .75 : 1),
    childCountBonus: has('shattered-core') ? 1 : 0,
    childDamageMultiplier: (has('hunter-eye') ? .8 : 1) * (has('shattered-core') ? .75 : 1),
    childHoming: has('hunter-eye') || (spark && evolution === 'pursuit-route'),
    slowDuration: (1.5 + (attack === 'bubble' ? .1 * (level - 1) : 0)) * (has('tidal-pearl') ? 1.6 : 1),
    chainRangeMultiplier: has('echo-rune') ? 1.4 : 1,
    chainDecay: has('echo-rune') ? .7 : 1,
    pierceBonus: attack === 'leaf' && level >= 3 ? 1 : attack === 'frost-crystal' ? frostStats(level).pierces : 0,
  };
  if (context) for (const id of relics) {
    const definition = factoryRelic(id);
    if (definition) applyRelicDefinition(rules, definition, attack, context);
  }
  return rules;
}
