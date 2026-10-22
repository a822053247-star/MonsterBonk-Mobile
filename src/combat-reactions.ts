import type { BaseAttackId } from './fusion';
import type { SkillRanks } from './progression';
import type { RelicDamageSource } from './relics';

/** Formal-run reactions; projectile generation is independent of chain depth. */
export const REACTION_RULES = {
  wetDuration: 2.4,
  steam: { radius: 2.5, damage: .55, cooldown: .6 },
  mature: { level: 3, generations: 3, damage: .55, decay: .85 },
  nodesPerChain: 24,
  propagationDelay: .065,
} as const;

export function matureFire(attack: BaseAttackId, level: number, ranks: Readonly<SkillRanks>) {
  return level >= REACTION_RULES.mature.level
    && (attack === 'flame-sweep' || attack === 'spark' && ranks['split-on-hit'] > 0);
}

/** Explicit gameplay cap. Accepted events are deferred, never discarded. */
export function reserveReaction(source: RelicDamageSource) {
  const chain = source.chain ??= { nodes: 0 };
  if (chain.nodes >= REACTION_RULES.nodesPerChain) return false;
  chain.nodes++;
  return true;
}

export function martyrDamage(source: RelicDamageSource, lethalDamage: number, mature: boolean) {
  return mature ? (source.rootDamage ?? lethalDamage) * REACTION_RULES.mature.damage
    * REACTION_RULES.mature.decay ** source.generation : lethalDamage * .45;
}
