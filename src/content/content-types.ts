import type { BaseAttackId } from '../fusion';
import type { RelicBehavior } from './relics/behavior-relics';

export const CONTENT_SKILLS = ['damage','haste','multishot','vitality','movement','range','orbit','shockwave','split-on-hit','area','chain','bubble-weapon','spark-weapon','leaf-weapon','flame-sweep-weapon'] as const;
export type ContentSkillId = typeof CONTENT_SKILLS[number];
export const CONTENT_TAGS = ['water','fire','grass','area','projectile','melee'] as const;
export type ContentTag = typeof CONTENT_TAGS[number];
export interface Requirements { weapon?: BaseAttackId; weapons?: readonly BaseAttackId[]; anyWeapons?: readonly BaseAttackId[]; projectile?: boolean; skills?: readonly ContentSkillId[] }
export const MODIFIER_STATS = ['damageMultiplier','intervalMultiplier','areaMultiplier','rangeMultiplier'] as const;
export type ModifierStat = typeof MODIFIER_STATS[number];
export const MODIFIER_TARGETS = ['water-area','water-weapon','fire-weapon','grass-weapon','all-weapons'] as const;
export type ModifierTarget = typeof MODIFIER_TARGETS[number];
export interface RelicModifier {
  handler: 'multiply'; target: ModifierTarget; stat: ModifierStat; multiply: number;
  polarity: 'benefit' | 'tradeoff'; requirements?: Requirements; tags?: readonly ContentTag[];
}
export interface RelicDefinition<Id extends string = string> {
  id: Id; title: string; category: 'relic'; rarity: 'rare'; modes: readonly ['formal'];
  tags: readonly ContentTag[]; requirements: Requirements; modifiers: readonly RelicModifier[];
  behavior?: RelicBehavior;
  art: { symbol: 'prism' | 'orb'; palette: 'water' | 'fire' | 'grass'; png?: string };
  vfx: { preset: string; target: ModifierTarget };
  maxRank: 1; rewards: { upgrade: boolean; shop: boolean };
  /** Optional copy must match generated effect copy; numbers have a single source. */
  description?: string;
}
export interface RelicContext { weapons: readonly BaseAttackId[]; ranks: Partial<Record<ContentSkillId, number>> }
export function meetsRequirements(requirements: Requirements, context: RelicContext) {
  return (!requirements.weapon || context.weapons.includes(requirements.weapon))
    && (requirements.weapons ?? []).every(id => context.weapons.includes(id))
    && (!requirements.anyWeapons || requirements.anyWeapons.some(id => context.weapons.includes(id)))
    && (!requirements.projectile || context.weapons.some(id => id !== 'flame-sweep'))
    && (requirements.skills ?? []).every(id => (context.ranks[id] ?? 0) > 0);
}
