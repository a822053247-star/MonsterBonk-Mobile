import type { BaseAttackId } from './fusion';

export const RELICS = {
  'overload-core': { title: '过载核心', benefit: '范围半径 +50%', tradeoff: '所有武器攻击间隔 +20%', icon: 'wave', color: '#ffb45f' },
  'hunter-eye': { title: '追猎之眼', benefit: '派生弹轻微追踪', tradeoff: '派生弹伤害 -20%', icon: 'compass', color: '#e7c67a' },
  'shattered-core': { title: '破碎晶核', benefit: '每次分裂子弹 +1', tradeoff: '派生弹伤害 -25%，仍受弹体预算限制', icon: 'battle', color: '#d6b9f5' },
  'tidal-pearl': { title: '潮汐遗珠', benefit: '水泡减速时长 +60%', tradeoff: '所有武器直接命中伤害 -15%', icon: 'wave', color: '#8fe8ff' },
  'specialist-badge': { title: '专精徽记', benefit: '仅装备一种武器时伤害 +60%', tradeoff: '装备副武器后加成失效', icon: 'spark', color: '#f3de9a' },
  'echo-rune': { title: '回声符石', benefit: '连锁距离 +40%', tradeoff: '每次额外跳跃伤害再乘 70%', icon: 'orbit', color: '#a5edbe' },
} as const;
export type RelicId = keyof typeof RELICS;
export const EVOLUTIONS = {
  'berserk-route': { title: '狂暴火种', benefit: '火种爆炸半径 +35%', tradeoff: '火花弹攻击间隔 +25%，放弃追猎路线', icon: 'spark', color: '#ff9849' },
  'pursuit-route': { title: '追猎火种', benefit: '派生火种追踪敌人', tradeoff: '火种爆炸半径 -25%，放弃狂暴路线', icon: 'compass', color: '#f3de9a' },
} as const;
export type EvolutionId = keyof typeof EVOLUTIONS;

/** Snapshot these rules on a volley; upgrades never rewrite an in-flight attack. */
export interface AttackRules {
  damageMultiplier: number; directMultiplier: number; intervalMultiplier: number;
  areaMultiplier: number; childCountBonus: number; childDamageMultiplier: number;
  childHoming: boolean; slowDuration: number; chainRangeMultiplier: number;
  chainDecay: number; pierceBonus: number;
}

export function resolveAttackRules(attack: BaseAttackId, relics: readonly RelicId[], weaponCount: number, level = 1, evolution?: EvolutionId): AttackRules {
  const has = (id: RelicId) => relics.includes(id);
  const spark = attack === 'spark';
  return {
    damageMultiplier: (1 + .2 * (level - 1)) * (has('specialist-badge') && weaponCount === 1 ? 1.6 : 1),
    directMultiplier: has('tidal-pearl') ? .85 : 1,
    intervalMultiplier: (has('overload-core') ? 1.2 : 1) * (spark && evolution === 'berserk-route' ? 1.25 : 1),
    areaMultiplier: (has('overload-core') ? 1.5 : 1) * (spark ? 1 + .06 * (level - 1) : 1)
      * (spark && evolution === 'berserk-route' ? 1.35 : spark && evolution === 'pursuit-route' ? .75 : 1),
    childCountBonus: has('shattered-core') ? 1 : 0,
    childDamageMultiplier: (has('hunter-eye') ? .8 : 1) * (has('shattered-core') ? .75 : 1),
    childHoming: has('hunter-eye') || (spark && evolution === 'pursuit-route'),
    slowDuration: (1.5 + (attack === 'bubble' ? .1 * (level - 1) : 0)) * (has('tidal-pearl') ? 1.6 : 1),
    chainRangeMultiplier: has('echo-rune') ? 1.4 : 1,
    chainDecay: has('echo-rune') ? .7 : 1,
    pierceBonus: attack === 'leaf' && level >= 3 ? 1 : 0,
  };
}
