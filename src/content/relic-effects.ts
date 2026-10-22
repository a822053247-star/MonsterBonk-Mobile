import type { BaseAttackId } from '../fusion';
import { weaponCapabilities } from './weapon-traits';
import type { AttackRules } from '../relics';
import { behaviorCopy } from './relics/behavior-relics';
import { meetsRequirements, type ModifierTarget, type RelicContext, type RelicDefinition, type RelicModifier, type ContentTag } from './content-types';

const TARGET_COPY: Record<ModifierTarget,string> = { 'water-area':'水系范围攻击的实际效果', 'water-weapon':'水系武器', 'fire-weapon':'火系武器', 'grass-weapon':'草系武器', 'all-weapons':'所有武器' };
const STAT_COPY = { damageMultiplier:'伤害', intervalMultiplier:'攻击间隔', areaMultiplier:'半径', rangeMultiplier:'射程' };
export const EFFECT_HANDLERS = { multiply(rules: AttackRules, modifier: RelicModifier) { rules[modifier.stat] *= modifier.multiply; } };
export function modifierCopy(m: RelicModifier) {
  const percentage = Number((Math.abs(m.multiply - 1) * 100).toPrecision(10));
  return `${TARGET_COPY[m.target]}${STAT_COPY[m.stat]} ${m.multiply >= 1 ? '+' : '-'}${percentage}%`;
}
export function relicMetadata(definition: RelicDefinition) {
  const copy = definition.behavior ? behaviorCopy(definition.behavior) : undefined;
  const benefit = [...definition.modifiers.filter(m => m.polarity === 'benefit').map(modifierCopy), ...(copy ? [copy.benefit] : [])].join('；');
  const tradeoff = [...definition.modifiers.filter(m => m.polarity === 'tradeoff').map(modifierCopy), ...(copy ? [copy.tradeoff] : [])].join('；');
  return { title: definition.title, benefit, tradeoff, description: `${benefit}。${tradeoff}。本局生效，不可重复获得。`, icon: 'wave' as const, color: { water:'#55c9ed',fire:'#ff9849',grass:'#70bc52' }[definition.art.palette] };
}
function attackTags(attack: BaseAttackId, context: RelicContext): readonly ContentTag[] {
  const area = attack === 'bubble' && ((context.ranks.area ?? 0) > 0 || (context.ranks.chain ?? 0) > 0);
  const inherited=context.capabilities?.find(w=>w.origins.includes(attack));
  if (attack === 'thunder-bud') return ['electric', 'chain'];
  if (attack === 'frost-crystal') return ['ice', 'projectile'];
  if(inherited&&inherited.origins.length>1)return [...inherited.tags.filter(t=>t!=='explosion'),...(['area'] as const)];
  if (attack === 'thorn-wheel' || attack === 'tidal-blade') return [...weaponCapabilities(attack).tags.filter(t => t !== 'explosion'), 'area'];
  return [attack === 'bubble' ? 'water' : attack === 'leaf' ? 'grass' : 'fire', attack === 'flame-sweep' ? 'melee' : 'projectile', ...(area || attack === 'flame-sweep' || attack === 'spark' && (context.ranks['split-on-hit'] ?? 0) > 0 ? ['area' as const] : [])];
}
export function matchesTarget(target: ModifierTarget, attack: BaseAttackId, context: RelicContext) {
  const tags = attackTags(attack, context);
  switch (target) {
    case 'water-area': return tags.includes('water') && tags.includes('area');
    case 'water-weapon': return tags.includes('water');
    case 'fire-weapon': return tags.includes('fire');
    case 'grass-weapon': return tags.includes('grass');
    case 'all-weapons': return true;
    default: throw new Error(`Unknown relic target: ${String(target)}`);
  }
}
/** Mutates the existing volley rule snapshot; no separate damage or collision pipeline. */
export function applyRelicDefinition(rules: AttackRules, definition: RelicDefinition, attack: BaseAttackId, context: RelicContext) {
  if (!meetsRequirements(definition.requirements, context)) return;
  const tags = attackTags(attack, context);
  for (const modifier of definition.modifiers) {
    if (meetsRequirements(modifier.requirements ?? {}, context) && matchesTarget(modifier.target, attack, context)
      && (modifier.tags ?? []).every(tag => tags.includes(tag))) {
      if (modifier.handler !== 'multiply' || !(modifier.stat in rules) || !Number.isFinite(modifier.multiply) || modifier.multiply <= 0) throw new Error('Invalid relic effect');
      EFFECT_HANDLERS[modifier.handler](rules, modifier);
    }
  }
  if (!definition.behavior && matchesTarget(definition.vfx.target, attack, context)) rules.impactVfx = definition.vfx.preset;
}
