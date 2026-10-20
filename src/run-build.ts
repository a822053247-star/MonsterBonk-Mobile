import { CREATURES, type SpeciesId } from './party';
import type { BaseAttackId } from './fusion';
import { resolveAttackRules, type RelicId, type EvolutionId } from './relics';
import { FLAME_SWEEP } from './flame-sweep';

export const MAX_WEAPON_LEVEL = 5;

/** Weapon identity is independent of its caster. Three distinct weapons share a bounded combat pool. */
export const ATTACKS = {
  spark: { kind: 'projectile', title: '火花弹', damage: 18, interval: .44, range: 10.5, color: '#ff9849' },
  bubble: { kind: 'projectile', title: '水泡弹', damage: 15, interval: .62, range: 10.5, color: '#55c9ed' },
  leaf: { kind: 'projectile', title: '飞叶弹', damage: 16, interval: .54, range: 10.5, color: '#70bc52' },
  'flame-sweep': { kind: 'melee_arc', title: '火焰横扫', damage: FLAME_SWEEP.damage, interval: FLAME_SWEEP.interval, range: FLAME_SWEEP.radius, color: '#ff8c35' },
} as const;

export interface EquippedAttack {
  attackId: BaseAttackId;
  slot: number;
  level: number;
  cooldown: number;
  cooldownTotal: number;
  shotsFired: number;
}

export class RunBuild {
  private equipped: EquippedAttack[] = [];
  private ownedRelics: RelicId[] = [];
  private chosenEvolution?: EvolutionId;
  get relics(): readonly RelicId[] { return this.ownedRelics; }
  get evolution() { return this.chosenEvolution; }
  species: SpeciesId = 'yanrong';
  get attacks(): readonly EquippedAttack[] { return this.equipped; }

  reset(species: SpeciesId) {
    this.species = species;
    this.ownedRelics = [];
    this.chosenEvolution = undefined;
    this.equipped = [{ attackId: CREATURES[species].skill, slot: 0, level: 1, cooldown: 0, cooldownTotal: 0, shotsFired: 0 }];
  }

  rules(attackId: BaseAttackId) {
    return resolveAttackRules(attackId, this.relics, this.attacks.length, this.attacks.find(a => a.attackId === attackId)?.level ?? 1, this.evolution);
  }

  upgrade(attackId: BaseAttackId) {
    const weapon = this.equipped.find(a => a.attackId === attackId);
    if (!weapon || weapon.level >= MAX_WEAPON_LEVEL) return false;
    weapon.level++; return true;
  }

  addRelic(id: RelicId) {
    if (this.ownedRelics.includes(id)) return false;
    this.ownedRelics.push(id); return true;
  }

  evolve(id: EvolutionId) {
    if (this.chosenEvolution || !this.has('spark')) return false;
    this.chosenEvolution = id; return true;
  }

  has(attackId: BaseAttackId) { return this.equipped.some(attack => attack.attackId === attackId); }

  acquire(attackId: BaseAttackId) {
    if (this.has(attackId) || this.equipped.length >= 3) return false;
    const slot = this.equipped.length;
    this.equipped.push({ attackId, slot, level: 1, cooldown: slot * .31, cooldownTotal: slot * .31, shotsFired: 0 });
    return true;
  }

}
