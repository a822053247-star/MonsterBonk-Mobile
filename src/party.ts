import { clampToRectangularBoundary, isInsideRectangularBoundary } from './arena-boundary';
import type { SkillStats } from './progression';

export type SpeciesId = 'yanrong' | 'bubblesalamander' | 'sproutspike';
export interface CreatureDefinition {
  readonly name: string;
  readonly element: 'fire' | 'water' | 'grass';
  readonly color: string;
  readonly skill: 'spark' | 'bubble' | 'leaf';
  readonly attack: { readonly damage: number; readonly interval: number; readonly range: number };
}
// P1 only: distinct basic bolts. AoE/slow/piercing and evolution belong to P4.
export const CREATURES: Readonly<Record<SpeciesId, CreatureDefinition>> = {
  yanrong: { name: '焰绒', element: 'fire', color: '#ff9849', skill: 'spark', attack: { damage: 18, interval: 0.44, range: 10.5 } },
  bubblesalamander: { name: '泡泡螈', element: 'water', color: '#55c9ed', skill: 'bubble', attack: { damage: 15, interval: 0.62, range: 10.5 } },
  sproutspike: { name: '芽刺兽', element: 'grass', color: '#70bc52', skill: 'leaf', attack: { damage: 16, interval: 0.54, range: 10.5 } },
};
export interface PartyPoint { x: number; z: number }
export interface PartyObstacle extends PartyPoint { radius: number }
export interface CreatureInstance extends PartyPoint {
  readonly id: number;
  readonly species: SpeciesId;
  previousX: number; previousZ: number; facing: number;
  attackCooldown: number; targetId: number; shotsFired: number;
  rank: 1 | 2 | 3; evolution: 'base' | 'evolved' | 'complete';
  blockedTime: number;
}

/** Sole entry for creature attack modifiers; no rendering or UI calculations. */
export function calculateCreatureStats(creature: CreatureInstance, upgrades: Readonly<SkillStats>) {
  const base = CREATURES[creature.species].attack;
  return {
    damage: base.damage * upgrades.damageMultiplier,
    interval: base.interval / upgrades.attackRateMultiplier,
    range: base.range * upgrades.rangeMultiplier,
    projectileCount: upgrades.projectileCount,
  };
}

const RADIUS = 0.48;
/** Pure simulation. Combat owns the one shared HP bar, never individual members. */
export class PartySystem {
  private roster: CreatureInstance[] = [];
  private nextId = 1;
  private statsCache = new WeakMap<CreatureInstance, { upgrades: Readonly<SkillStats>; stats: ReturnType<typeof calculateCreatureStats> }>();
  get members(): readonly CreatureInstance[] { return this.roster; }
  get leader() { return this.roster[0]!; }

  // A future four-slot mode needs no follow/attack loop changes.
  constructor(readonly capacity: 3 | 4 = 3) { this.reset(); }

  statsFor(member: CreatureInstance, upgrades: Readonly<SkillStats>) {
    let cached = this.statsCache.get(member);
    if (!cached || cached.upgrades !== upgrades) {
      cached = { upgrades, stats: calculateCreatureStats(member, upgrades) };
      this.statsCache.set(member, cached);
    }
    return cached.stats;
  }

  reset(species: readonly SpeciesId[] = ['yanrong']) {
    if (species.length < 1 || species.length > this.capacity) throw new RangeError('Invalid party size');
    this.roster.length = 0;
    this.nextId = 1;
    for (const id of species) this.add(id);
  }

  add(species: SpeciesId) {
    if (this.roster.length >= this.capacity) return undefined;
    const creature: CreatureInstance = {
      id: this.nextId++, species, x: 0, z: 0, previousX: 0, previousZ: 0, facing: 0,
      attackCooldown: 0, targetId: 0, shotsFired: 0, rank: 1, evolution: 'base', blockedTime: 0,
    };
    this.roster.push(creature);
    return creature;
  }

  /** Called after the existing controlled creature's movement and world collision. */
  syncLeader(point: PartyPoint, facing: number) {
    const leader = this.leader;
    leader.previousX = leader.x; leader.previousZ = leader.z;
    leader.x = point.x; leader.z = point.z; leader.facing = facing;
  }

  private clear(x: number, z: number, obstacles: readonly PartyObstacle[], boundary: number, index: number) {
    if (!isInsideRectangularBoundary(x, z, boundary, RADIUS)) return false;
    if (obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + RADIUS + 0.04)) return false;
    if (Math.hypot(x - this.leader.x, z - this.leader.z) < 1.15) return false;
    for (let i = 1; i < index; i++) {
      const other = this.roster[i];
      if (Math.hypot(x - other.x, z - other.z) < RADIUS * 2 + 0.1) return false;
    }
    return true;
  }

  /** Bounded recovery search, including near map edges and around cover. */
  private recover(member: CreatureInstance, index: number, obstacles: readonly PartyObstacle[], boundary: number) {
    for (const radius of [2, 2.8, 3.6, 4.4]) for (let sample = 0; sample < 16; sample++) {
      const angle = this.leader.facing + Math.PI + (index % 2 ? -0.65 : 0.65) + sample * Math.PI / 8;
      const x = this.leader.x + Math.sin(angle) * radius, z = this.leader.z + Math.cos(angle) * radius;
      if (!this.clear(x, z, obstacles, boundary, index)) continue;
      member.x = member.previousX = x; member.z = member.previousZ = z;
      member.blockedTime = 0;
      return;
    }
    // No valid slot this tick: retain the last position and retry next tick.
  }

  placeCompanions(obstacles: readonly PartyObstacle[], boundary: number) {
    for (let i = 1; i < this.roster.length; i++) this.recover(this.roster[i], i, obstacles, boundary);
  }

  follow(dt: number, obstacles: readonly PartyObstacle[], boundary: number) {
    if (dt <= 0) return;
    const leader = this.leader;
    for (let i = 1; i < this.roster.length; i++) {
      const member = this.roster[i];
      member.previousX = member.x; member.previousZ = member.z;
      const angle = leader.facing + Math.PI + (i % 2 ? -0.65 : 0.65);
      const radius = i <= 2 ? 2 : 3.2;
      const goalX = leader.x + Math.sin(angle) * radius, goalZ = leader.z + Math.cos(angle) * radius;
      const dx = goalX - member.x, dz = goalZ - member.z, distance = Math.hypot(dx, dz);
      let vx = dx, vz = dz;
      // Local tangential steering; each formation slot has a stable bypass side.
      for (const obstacle of obstacles) {
        const ox = member.x - obstacle.x, oz = member.z - obstacle.z;
        const length = Math.max(0.001, Math.hypot(ox, oz)), avoid = obstacle.radius + RADIUS + 0.7;
        if (length < avoid) {
          const strength = (avoid - length) * 5, side = i % 2 ? 1 : -1;
          vx += (ox - oz * side) / length * strength;
          vz += (oz + ox * side) / length * strength;
        }
      }
      const length = Math.hypot(vx, vz), speed = Math.min(8, distance * 5);
      const travel = Math.min(distance, speed * dt);
      if (length > 0.001) { member.x += vx / length * travel; member.z += vz / length * travel; }
      // Projection resolves overlap; partners never change the controlled position.
      for (let pass = 0; pass < 3; pass++) {
        for (let j = 0; j < this.roster.length; j++) {
          if (j === i) continue;
          const other = this.roster[j], sx = member.x - other.x, sz = member.z - other.z;
          const d = Math.hypot(sx, sz), separation = j === 0 ? 1.15 : RADIUS * 2 + 0.1;
          if (d < separation) {
            member.x = other.x + (d > 0.001 ? sx / d : i % 2 ? -1 : 1) * separation;
            member.z = other.z + (d > 0.001 ? sz / d : 0) * separation;
          }
        }
        for (const obstacle of obstacles) {
          const ox = member.x - obstacle.x, oz = member.z - obstacle.z, d = Math.hypot(ox, oz);
          const limit = obstacle.radius + RADIUS + 0.04;
          if (d < limit) {
            member.x = obstacle.x + (d > 0.001 ? ox / d : 1) * limit;
            member.z = obstacle.z + (d > 0.001 ? oz / d : 0) * limit;
          }
        }
        clampToRectangularBoundary(member, boundary, RADIUS);
      }
      const moved = Math.hypot(member.x - member.previousX, member.z - member.previousZ);
      member.blockedTime = distance > 0.8 && moved < 0.025 * dt ? member.blockedTime + dt : 0;
      if (moved > 0.001) member.facing = Math.atan2(member.x - member.previousX, member.z - member.previousZ);
      if (Math.hypot(member.x - leader.x, member.z - leader.z) > 7 || member.blockedTime > 0.8
        || !this.clear(member.x, member.z, obstacles, boundary + 0.001, i)) {
        this.recover(member, i, obstacles, boundary);
      }
    }
  }

  inspect() { return this.roster.map(member => ({ ...member })); }
}
