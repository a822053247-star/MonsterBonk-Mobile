import type { BaseAttackId } from '../fusion';
import type { RelicBehavior } from './relics/behavior-relics';
import {weaponCapabilities,type WeaponCapabilities,type WeaponTag} from './weapon-traits';

export const CONTENT_SKILLS = ['damage','haste','multishot','vitality','movement','range','orbit','shockwave','split-on-hit','area','chain','bubble-weapon','spark-weapon','leaf-weapon','flame-sweep-weapon','screen-nova','screen-barrage','azure-burst','star-tide','still-sea','returning-ring','abyss-vortex','ice-radiance','spore-trail','tidal-recall','tsunami-sanctuary','astral-wheel','abyss-crown','undertow-pyre','deep-collapse','frost-prism','all-tides'] as const;
export type ContentSkillId = typeof CONTENT_SKILLS[number];
export const CONTENT_TAGS = ['water','fire','grass','area','projectile','melee',
  'chain','multiweapon','defense','retaliation','position','on-kill','execute','on-cast','cone',
  'economy','experience','cross-element','kill-streak','healing','dash','control','level-up','multi-target',
  'knockback','charge','guard','hit-streak','haste','full-health','pulse','orbit','multishot','shards','hurt','echo','xp','magnet'] as const;
export type ContentTag = typeof CONTENT_TAGS[number];
export interface Requirements { weapon?: BaseAttackId; weapons?: readonly BaseAttackId[]; anyWeapons?: readonly BaseAttackId[]; projectile?: boolean; skills?: readonly ContentSkillId[]; weaponTags?:readonly WeaponTag[] }
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
export interface RelicContext { weapons: readonly BaseAttackId[]; ranks: Partial<Record<ContentSkillId, number>>; capabilities?:readonly WeaponCapabilities[] }
export function meetsRequirements(requirements: Requirements, context: RelicContext) {
  return (!requirements.weapon || context.weapons.includes(requirements.weapon))
    && (requirements.weapons ?? []).every(id => context.weapons.includes(id))
    && (!requirements.anyWeapons || requirements.anyWeapons.some(id => context.weapons.includes(id)))
    && (!requirements.projectile || (context.capabilities??context.weapons.map(id=>weaponCapabilities(id,context.ranks))).some(w=>w.tags.includes('projectile')))
    && (!requirements.weaponTags || (context.capabilities??context.weapons.map(id=>weaponCapabilities(id,context.ranks))).some(w=>requirements.weaponTags!.every(t=>w.tags.includes(t))))
    && (requirements.skills ?? []).every(id => (context.ranks[id] ?? 0) > 0);
}
