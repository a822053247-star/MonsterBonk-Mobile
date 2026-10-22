import type { SkillRanks } from './progression';

export type BaseAttackId = 'spark' | 'bubble' | 'leaf' | 'flame-sweep' | 'thorn-wheel' | 'tidal-blade' | 'thunder-bud' | 'frost-crystal';
/** P1 tuning. Child hits never execute the parent recipe. */
export const BURST_SEED = {
  id: 'burst-seed', title: '爆裂火种', baseAttack: 'spark', requires: ['split-on-hit'], visual: 'yanrong-fire',
  explosionRadius: 1.35, explosionDamage: 0.3, childDamage: 0.35,
  childCount: 2, maxGeneration: 1, childAngle: Math.PI / 3, childLifetime: 0.45,
  childSize: 0.55, explosionDuration: 0.4,
} as const;
export const DEEP_BUBBLE = { id: 'deep-bubble', title: '深海泡影', baseAttack: 'bubble', requires: ['area'], radius: 1.8, damage: .45, visual: 'deep-bubble', icon: 'deep-bubble', behavior: 'area', duration: .45 } as const;
export const CHAIN_BUBBLE = { id: 'chain-bubble', title: '连环水爆', baseAttack: 'bubble', requires: ['chain'], radius: .7, damage: .2, hopDamage: .65, range: 3.2, delay: .1, hopDuration: .12, maxHops: 2, visual: 'chain-bubble', icon: 'chain-bubble', behavior: 'chain' } as const;
export const THORN_SCATTER = { id: 'thorn-scatter', title: '荆棘散射', baseAttack: 'leaf', requires: ['split-on-hit'], childCount: 3, childDamage: .35, angle: Math.PI / 6, range: 3, lifetime: 3 / 18, visual: 'thorn-scatter', icon: 'thorn-scatter', behavior: 'split' } as const;
export const JUMP_THORN = { id: 'jump-thorn', title: '跳跃荆棘', baseAttack: 'leaf', requires: ['chain'], hopDamage: .7, range: 3.5, delay: 0, hopDuration: .12, maxHops: 2, visual: 'jump-thorn', icon: 'jump-thorn', behavior: 'chain' } as const;
export const ELEMENTAL_RULES = { slowFactor: .7, slowDuration: 1.5, leafPierces: 1, chainHops: 2 } as const;
export const FUSION_RECIPES = [BURST_SEED, DEEP_BUBBLE, CHAIN_BUBBLE, THORN_SCATTER, JUMP_THORN] as const;
export type FusionId = typeof FUSION_RECIPES[number]['id'];
export function resolveFusions(baseAttack: BaseAttackId, ranks: Readonly<SkillRanks>) {
  return FUSION_RECIPES.filter(recipe => recipe.baseAttack === baseAttack && recipe.requires.every(id => ranks[id] > 0));
}

export function resolveFusion(baseAttack: BaseAttackId, ranks: Readonly<SkillRanks>) {
  return resolveFusions(baseAttack, ranks)[0];
}
