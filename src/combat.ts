import { ENEMY_MOTION } from './enemy-motion';
import { Progression, SKILL_RULES, type SkillId } from './progression';
import { HORN, POUNCE, type DashStep, type EnemyIntent, type Ruleset } from './trial';
import { CREATURES, type PartySystem, type SpeciesId } from './party';
import { GroundNavigation } from './navigation';
import { BURST_SEED, resolveFusions, DEEP_BUBBLE, CHAIN_BUBBLE, THORN_SCATTER, JUMP_THORN, ELEMENTAL_RULES, type FusionId } from './fusion';

/** Combat owns no DOM/GPU state. Every clock and movement is measured in seconds. */
export const COMBAT_LIMITS = { enemies: 48, projectiles: 24, orbs: 96, effects: 48, shockwaves: 2 } as const;
export type EnemyKind = 'normal' | 'fast' | 'tank';
export const ENEMY_TYPES = {
  normal: { name: '赤团', hp: 30, speed: 1.25, radius: 0.55, damage: 8, xp: 3, color: '#e59472' },
  fast: { name: '疾芽', hp: 18, speed: 2.7, radius: 0.4, damage: 6, xp: 2, color: '#edd779' },
  tank: { name: '岩甲', hp: 100, speed: 0.75, radius: 0.85, damage: 16, xp: 8, color: '#a58b6e' },
} as const;
export const WEAPON = { range: 10.5, interval: 0.44, speed: 18, damage: 18, lifetime: 0.8, radius: 0.2 } as const;
type Point = { x: number; z: number };
type Obstacle = Point & { radius: number };
type Moving = Point & { previousX: number; previousZ: number; active: boolean };
export interface Enemy extends Moving { id: number; kind: EnemyKind; hp: number; age: number; spawnTime: number; flash: number; knockX: number; knockZ: number; facing: number; orbitCooldown: number; intent: EnemyIntent; intentTime: number; intentCooldown: number; aimX: number; aimZ: number; stagger: number; hornDash: number; slowTime?: number; walkPhase?: number; walkAmount?: number; steerX?: number; steerZ?: number }
export interface Projectile extends Moving { vx: number; vz: number; life: number; damage: number; distance: number; sourceId?: number; species?: SpeciesId; generation?: number; bornTick?: number; ignoreEnemyId?: number; burst?: boolean; age?: number; elemental?: boolean; fusionIds?: FusionId[]; hitIds?: number[]; pierces?: number; bounces?: number; scatter?: boolean; baseDamage?: number; damageIds?: number[]; hopTargetId?: number; hopDelay?: number; hopElapsed?: number; hopDuration?: number; hopFromX?: number; hopFromZ?: number }
export interface Shockwave { active: boolean; x: number; z: number; age: number; radius: number; previousRadius: number; maxRadius: number; damage: number; hitIds: Int32Array }
export interface ExperienceOrb extends Moving { value: number; magnetized: boolean }
export interface CombatEffect extends Point { active: boolean; time: number; duration: number; kind: 'hit' | 'death' | 'collect' | 'hurt' | 'burst' | 'water' | 'thorn'; enemyKind: EnemyKind; radius?: number; fusionId?: FusionId; enemyId?: number; moveX?: number; moveZ?: number }

/** Earliest segment / circle intersection, including shots that start inside a circle. */
export function segmentHit(ax: number, az: number, bx: number, bz: number, x: number, z: number, radius: number) {
  const dx = bx - ax, dz = bz - az, ox = ax - x, oz = az - z;
  const c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return Infinity;
  const b = ox * dx + oz * dz, discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}

export class Combat {
  /** Enabled by the map prototype; preserved legacy modes keep their steering. */
  useNavigation = false;
  fusionEnabled = false;
  private tick = 0;
  private fusionCursor = 0;
  bursts = 0;
  childShots = 0;
  private navigation: GroundNavigation;
  private navigationGoal = { x: 0, z: 0 };
  /** Optional P1 context; absent for all preserved legacy modes. */
  party?: PartySystem;
  readonly enemies: Enemy[] = Array.from({ length: COMBAT_LIMITS.enemies }, () => ({ active: false, id: 0, kind: 'normal', hp: 0, x: 0, z: 0, previousX: 0, previousZ: 0, age: 0, spawnTime: 0, flash: 0, knockX: 0, knockZ: 0, facing: 0, orbitCooldown: 0, intent: 'chase', intentTime: 0, intentCooldown: 0, aimX: 0, aimZ: 1, stagger: 0, hornDash: 0 }));
  readonly projectiles: Projectile[] = Array.from({ length: COMBAT_LIMITS.projectiles }, () => ({ active: false, x: 0, z: 0, previousX: 0, previousZ: 0, vx: 0, vz: 0, life: 0, damage: 0, distance: 0 }));
  readonly orbs: ExperienceOrb[] = Array.from({ length: COMBAT_LIMITS.orbs }, () => ({ active: false, x: 0, z: 0, previousX: 0, previousZ: 0, value: 0, magnetized: false }));
  readonly effects: CombatEffect[] = Array.from({ length: COMBAT_LIMITS.effects }, () => ({ active: false, x: 0, z: 0, time: 0, duration: 0, kind: 'hit', enemyKind: 'normal' }));
  readonly shockwaves: Shockwave[] = Array.from({ length: COMBAT_LIMITS.shockwaves }, () => ({ active: false, x: 0, z: 0, age: 0, radius: 0, previousRadius: 0, maxRadius: 0, damage: 0, hitIds: new Int32Array(COMBAT_LIMITS.enemies) }));
  readonly progression: Progression;
  hp = 100;
  kills = 0;
  invulnerability = 0;
  hurtFlash = 0;
  targetId = 0;
  elapsed = 0;
  shotsFired = 0;
  hits = 0;
  spawned = 0;
  collected = 0;
  orbitAngle = 0;
  previousOrbitAngle = 0;
  anchorX = 0;
  anchorZ = 0;
  private previousAnchorX = 0;
  private previousAnchorZ = 0;
  private anchorInitialized = false;
  private shockClock = 0;
  private spawnClock = 2.6;
  private fireClock = 0;
  private nextId = 1;
  private ruleset: Ruleset = 'classic';
  private dashSerial = 0;
  hornHits = 0;
  hornKills = 0;
  interrupts = 0;

  constructor(private obstacles: readonly Obstacle[] = [], private boundary = 32.3, private random: () => number = Math.random, ruleset: Ruleset = 'classic') {
    this.ruleset = ruleset; this.progression = new Progression(random);
    this.navigation = new GroundNavigation(obstacles, boundary);
  }

  get isTrial() { return this.ruleset !== 'classic'; }
  get isChallenge() { return this.ruleset === 'horn-challenge'; }
  enemyMaxHp(kind: EnemyKind) { return this.isTrial && kind === 'fast' ? POUNCE.hp : ENEMY_TYPES[kind].hp; }
  get xp() { return this.progression.totalExperience; }
  get stats() { return this.progression.stats; }
  get maxHp() { return this.stats.maxHp; }
  get baseAttack() { return CREATURES[this.party?.leader.species ?? 'yanrong'].skill; }
  get fusions() { return this.fusionEnabled ? resolveFusions(this.baseAttack, this.progression.ranks) : []; }
  get fusion() { return this.fusions[0]; }

  chooseUpgrade(id: SkillId) {
    if (this.hp <= 0) return false;
    const previous = this.stats;
    if (!this.progression.pick(id)) return false;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp - previous.maxHp);
    this.fireClock *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
    if (this.party) for (const member of this.party.members) member.attackCooldown *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
    if (previous.shockDamage === 0 && this.stats.shockDamage > 0) this.shockClock = 0;
    return true;
  }

  reset(ruleset: Ruleset = this.ruleset) {
    this.clearTransientEffects();
    this.navigation.invalidate();
    this.tick = this.bursts = this.childShots = 0;
    this.fusionCursor = 0;
    if (this.party) this.party.reset(this.party.members.map(member => member.species));
    this.ruleset = ruleset;
    this.dashSerial = this.hornHits = this.hornKills = this.interrupts = 0;
    for (const pool of [this.enemies, this.projectiles, this.orbs, this.effects, this.shockwaves]) {
      for (const item of pool) item.active = false;
    }
    this.hp = 100;
    this.progression.fusionBase = this.baseAttack;
    this.progression.reset(this.fusionEnabled);
    this.kills = this.invulnerability = this.hurtFlash = this.targetId = this.elapsed = 0;
    this.shotsFired = this.hits = this.spawned = this.collected = 0;
    this.spawnClock = 2.6;
    this.fireClock = 0;
    this.nextId = 1;
    this.orbitAngle = this.previousOrbitAngle = this.shockClock = 0;
    this.anchorX = this.anchorZ = this.previousAnchorX = this.previousAnchorZ = 0;
    this.anchorInitialized = false;
    for (const wave of this.shockwaves) wave.hitIds.fill(0);
  }

  /** Also used by deterministic simulation tests to arrange encounter positions. */
  spawn(kind: EnemyKind, x: number, z: number, spawnTime = 0.75): Enemy | undefined {
    const enemy = this.enemies.find((candidate) => !candidate.active);
    if (!enemy) return;
    Object.assign(enemy, { active: true, id: this.nextId++, kind, x, z, previousX: x, previousZ: z, hp: this.enemyMaxHp(kind), age: 0, spawnTime, flash: 0, knockX: 0, knockZ: 0, facing: 0, orbitCooldown: 0, intent: 'chase', intentTime: 0, intentCooldown: 0, aimX: 0, aimZ: 1, stagger: 0, hornDash: 0, slowTime: 0, walkPhase: (this.nextId * 2.399963) % (Math.PI * 2), walkAmount: 0, steerX: undefined, steerZ: undefined });
    this.spawned++;
    return enemy;
  }

  private spawnNear(player: Point) {
    if (this.enemies.every(enemy => enemy.active)) return;
    if (this.useNavigation) {
      const point = this.spawnPosition(player, 8, 12, ENEMY_TYPES.tank.radius);
      if (!point) return;
      const roll = this.random();
      const kind = this.spawned === 0 ? 'normal' : this.spawned === 1 ? 'fast' : this.spawned === 2 ? 'tank' : roll < .58 ? 'normal' : roll < .86 ? 'fast' : 'tank';
      this.spawn(kind, point.x, point.z);
      return;
    }
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = this.random() * Math.PI * 2, distance = 8 + this.random() * 4;
      const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
      if (Math.hypot(x, z) > this.boundary - 1) continue;
      if (this.obstacles.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 1.1)) continue;
      const roll = this.random();
      // Introduce each silhouette once, then use a weighted mix.
      const kind = this.spawned === 0 ? 'normal' : this.spawned === 1 ? 'fast' : this.spawned === 2 ? 'tank' : roll < 0.58 ? 'normal' : roll < 0.86 ? 'fast' : 'tank';
      this.spawn(kind, x, z);
      return;
    }
  }

  /** Finite encounters use the same pool, spawn warning, collision and enemy data. */
  spawnEncounter(kind: EnemyKind, player: Point) {
    if (this.useNavigation) {
      const point = this.spawnPosition(player, 6, 9, ENEMY_TYPES[kind].radius);
      return point ? this.spawn(kind, point.x, point.z) : undefined;
    }
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = this.random() * Math.PI * 2, distance = 6 + this.random() * 3;
      const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
      const radius = ENEMY_TYPES[kind].radius;
      if (Math.hypot(x, z) > this.boundary - radius - .2) continue;
      if (this.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + radius + .3)) continue;
      if (this.enemies.some(e => e.active && Math.hypot(x - e.x, z - e.z) < radius + ENEMY_TYPES[e.kind].radius + .3)) continue;
      return this.spawn(kind, x, z);
    }
    return undefined;
  }

  private spawnPosition(player: Point, min: number, max: number, radius: number): Point | undefined {
    const candidate = (angle: number, distance: number) => {
      const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
      if (Math.hypot(x, z) > this.boundary - radius - .2) return;
      if (this.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + radius + .3)) return;
      if (this.enemies.some(e => e.active && Math.hypot(x - e.x, z - e.z) < radius + ENEMY_TYPES[e.kind].radius + .3)) return;
      const point = { x, z };
      return this.navigation.reachable(point, player) ? point : undefined;
    };
    for (let attempt = 0; attempt < 24; attempt++) {
      const point = candidate(this.random() * Math.PI * 2, min + this.random() * (max - min));
      if (point) return point;
    }
    // Bounded deterministic fallback avoids losing a wave beside water or edges.
    for (const distance of [(min + max) / 2, min, max]) for (let i = 0; i < 24; i++) {
      const point = candidate(i * Math.PI / 12 + this.spawned * 2.399963, distance);
      if (point) return point;
    }
    return undefined;
  }

  findTarget(player: Point, range = WEAPON.range * this.stats.rangeMultiplier): Enemy | undefined {
    let nearest: Enemy | undefined, best = range ** 2;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0) continue;
      const squared = (enemy.x - player.x) ** 2 + (enemy.z - player.z) ** 2;
      if (squared >= best) continue;
      // Trunks and rocks are cover; select the nearest enemy with a clear shot.
      if (this.obstacles.some((obstacle) => segmentHit(player.x, player.z, enemy.x, enemy.z, obstacle.x, obstacle.z, obstacle.radius + WEAPON.radius) !== Infinity)) continue;
      nearest = enemy;
      best = squared;
    }
    return nearest;
  }

  update(dt: number, player: Point, dash?: DashStep) {
    if (this.hp <= 0 || dt <= 0 || this.progression.awaitingChoice) return;
    this.tick++;
    if (this.isTrial && dash?.active && dash.started) this.dashSerial++;
    this.previousAnchorX = this.anchorInitialized ? this.anchorX : player.x;
    this.previousAnchorZ = this.anchorInitialized ? this.anchorZ : player.z;
    this.anchorX = player.x;
    this.anchorZ = player.z;
    this.anchorInitialized = true;
    this.elapsed += dt;
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (!this.isChallenge) this.spawnClock -= dt;
    if (!this.isChallenge && this.spawnClock <= 0) {
      this.spawnNear(player);
      this.spawnClock += Math.max(0.5, 1.3 - this.elapsed * 0.006);
    }
    for (const effect of this.effects) {
      if (effect.active) { effect.time -= dt; effect.active = effect.time > 0; }
    }
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.previousX = enemy.x;
      enemy.previousZ = enemy.z;
      enemy.slowTime = Math.max(0, (enemy.slowTime ?? 0) - dt);
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.orbitCooldown = Math.max(0, enemy.orbitCooldown - dt);
      if (Math.hypot(enemy.x - player.x, enemy.z - player.z) > 29) { enemy.active = false; continue; }
      if (enemy.spawnTime > 0) { enemy.spawnTime = Math.max(0, enemy.spawnTime - dt); continue; }
      const type = ENEMY_TYPES[enemy.kind];
      const dx = player.x - enemy.x, dz = player.z - enemy.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      let steerX = dx / length, steerZ = dz / length;
      const guided = this.useNavigation && this.navigation.guide(enemy, player, type.radius, this.navigationGoal);
      if (guided) {
        const gx = this.navigationGoal.x - enemy.x, gz = this.navigationGoal.z - enemy.z;
        const distance = Math.max(.001, Math.hypot(gx, gz));
        steerX = gx / distance; steerZ = gz / distance;
      }
      for (const other of this.enemies) {
        if (!other.active || other === enemy || other.spawnTime > 0) continue;
        const ox = enemy.x - other.x, oz = enemy.z - other.z;
        const distance = Math.hypot(ox, oz), avoid = type.radius + ENEMY_TYPES[other.kind].radius;
        if (distance <= .001) {
          // An antisymmetric, stable direction also separates exactly coincident spawns.
          const angle = Math.min(enemy.id, other.id) * 2.399963, sign = enemy.id < other.id ? 1 : -1;
          steerX += Math.cos(angle) * sign * 1.7; steerZ += Math.sin(angle) * sign * 1.7;
        } else if (distance < avoid) {
          const strength = (avoid - distance) / avoid * 1.7;
          steerX += ox / distance * strength;
          steerZ += oz / distance * strength;
        }
      }
      if (!guided) for (const obstacle of this.obstacles) {
        const ox = enemy.x - obstacle.x, oz = enemy.z - obstacle.z;
        const distance = Math.hypot(ox, oz), avoid = obstacle.radius + type.radius + 0.7;
        if (distance < avoid && distance > 0.001) {
          const strength = (avoid - distance) / avoid * 2.4;
          const side = enemy.id % 2 ? 1 : -1;
          steerX += (ox - oz * side * 0.8) / distance * strength;
          steerZ += (oz + ox * side * 0.8) / distance * strength;
        }
      }
      const steeringLength = Math.max(1, Math.hypot(steerX, steerZ));
      const desiredX = steerX / steeringLength, desiredZ = steerZ / steeringLength, smoothing = 1 - Math.exp(-14 * dt);
      enemy.steerX = (enemy.steerX ?? desiredX) + (desiredX - (enemy.steerX ?? desiredX)) * smoothing;
      enemy.steerZ = (enemy.steerZ ?? desiredZ) + (desiredZ - (enemy.steerZ ?? desiredZ)) * smoothing;
      const smoothLength = Math.max(1, Math.hypot(enemy.steerX, enemy.steerZ));
      let moveX = enemy.steerX / smoothLength * type.speed, moveZ = enemy.steerZ / smoothLength * type.speed;
      if (this.isTrial) {
        enemy.stagger = Math.max(0, enemy.stagger - dt);
        if (enemy.stagger > 0) { moveX = moveZ = 0; }
        else if (enemy.kind === 'fast') {
          this.updatePounce(enemy, dt, dx, dz, length);
          if (enemy.intent === 'pounce') { moveX = enemy.aimX * POUNCE.speed; moveZ = enemy.aimZ * POUNCE.speed; }
          else if (enemy.intent !== 'chase') { moveX = moveZ = 0; }
        }
      }
      if ((enemy.slowTime ?? 0) > 0) { moveX *= ELEMENTAL_RULES.slowFactor; moveZ *= ELEMENTAL_RULES.slowFactor; }
      this.moveEnemy(enemy, (moveX + enemy.knockX) * dt, (moveZ + enemy.knockZ) * dt, type.radius);
      const decay = Math.exp(-14 * dt);
      enemy.knockX *= decay;
      enemy.knockZ *= decay;
      enemy.facing = this.isTrial && (enemy.intent === 'windup' || enemy.intent === 'pounce') ? Math.atan2(enemy.aimX, enemy.aimZ) : Math.atan2(dx, dz);
      const boundaryDistance = Math.hypot(enemy.x, enemy.z), limit = this.boundary - type.radius;
      if (boundaryDistance > limit) { enemy.x *= limit / boundaryDistance; enemy.z *= limit / boundaryDistance; }
      const travelled = Math.hypot(enemy.x - enemy.previousX, enemy.z - enemy.previousZ);
      const moving = Math.min(1, travelled / Math.max(.001, type.speed * dt));
      enemy.walkAmount = (enemy.walkAmount ?? 0) + (moving - (enemy.walkAmount ?? 0)) * (1 - Math.exp(-12 * dt));
      enemy.walkPhase = ((enemy.walkPhase ?? 0) + travelled * ENEMY_MOTION[enemy.kind].cadence) % (Math.PI * 2);
    }

    if (this.isTrial && dash?.active && this.dashSerial > 0) this.resolveHorn(player, dash);
    if (this.party) {
      for (const member of this.party.members) {
        const stats = this.party.statsFor(member, this.stats);
        const target = this.findTarget(member, stats.range);
        member.targetId = target?.id ?? 0;
        member.attackCooldown = Math.max(0, member.attackCooldown - dt);
        if (target && member.attackCooldown <= 1e-8 && this.fireBolts(member, target, stats.damage, stats.projectileCount, stats.range, member.id, member.species)) {
          member.attackCooldown = stats.interval;
          member.shotsFired += stats.projectileCount;
        }
      }
      this.targetId = this.party.leader.targetId;
    } else {
      const target = this.findTarget(player);
      this.targetId = target?.id ?? 0;
      this.fireClock = Math.max(0, this.fireClock - dt);
      if (target && this.fireClock <= 1e-8 && this.fireBolts(player, target, WEAPON.damage * this.stats.damageMultiplier, this.stats.projectileCount, WEAPON.range * this.stats.rangeMultiplier)) {
        this.fireClock = WEAPON.interval / this.stats.attackRateMultiplier;
      }
    }
    for (const shot of this.projectiles) {
      if (!shot.active || (shot.generation === BURST_SEED.maxGeneration && shot.bornTick === this.tick)) continue;
      shot.age = (shot.age ?? 0) + dt;
      shot.previousX = shot.x;
      shot.previousZ = shot.z;
      if (shot.elemental && shot.hopTargetId) { this.advanceHop(shot, dt); continue; }
      const travelTime = Math.min(dt, shot.life);
      shot.x += shot.vx * travelTime;
      shot.z += shot.vz * travelTime;
      shot.life -= dt;
      shot.distance += WEAPON.speed * travelTime;
      if (shot.elemental) { this.elementalHit(shot); continue; }
      let earliest = Infinity, victim: Enemy | undefined;
      for (const obstacle of this.obstacles) {
        earliest = Math.min(earliest, segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, obstacle.x, obstacle.z, obstacle.radius + WEAPON.radius));
      }
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.spawnTime > 0 || enemy.id === shot.ignoreEnemyId) continue;
        const t = segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, ENEMY_TYPES[enemy.kind].radius + WEAPON.radius);
        if (t < earliest) { earliest = t; victim = enemy; }
      }
      if (earliest !== Infinity) {
        shot.active = false;
        const x = shot.previousX + (shot.x - shot.previousX) * earliest, z = shot.previousZ + (shot.z - shot.previousZ) * earliest;
        this.effect(x, z, 'hit');
        if (victim) {
          this.damageEnemy(victim, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed);
          if (shot.burst && (shot.generation ?? 0) < BURST_SEED.maxGeneration) this.burstSeed(shot, victim, x, z);
        }
      } else if (shot.life <= 0) shot.active = false;
    }

    this.updateSkills(dt, player);
    // Resolve hits after magic: an enemy killed on this tick cannot bite.
    if (this.invulnerability === 0) {
      let damage = 0;
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.spawnTime > 0) continue;
        if (this.isTrial && (enemy.stagger > 0 || enemy.intent === 'windup' || enemy.intent === 'recover')) continue;
        const type = ENEMY_TYPES[enemy.kind];
        // Relative sweep catches a fast pounce crossing the player between ticks.
        const pounceHit = this.isTrial && enemy.intent === 'pounce' && segmentHit(enemy.previousX - this.previousAnchorX, enemy.previousZ - this.previousAnchorZ, enemy.x - player.x, enemy.z - player.z, 0, 0, type.radius + 0.62) !== Infinity;
        if (pounceHit || Math.hypot(enemy.x - player.x, enemy.z - player.z) < type.radius + 0.62) damage = Math.max(damage, type.damage);
      }
      if (damage > 0) {
        this.hp = Math.max(0, this.hp - damage);
        this.invulnerability = 0.85;
        this.hurtFlash = 0.25;
        this.effect(player.x, player.z, 'hurt');
      }
    }
    if (this.hp <= 0) return;
    for (const orb of this.orbs) {
      if (!orb.active) continue;
      orb.previousX = orb.x;
      orb.previousZ = orb.z;
      const dx = player.x - orb.x, dz = player.z - orb.z, distance = Math.hypot(dx, dz);
      if (distance < 3) orb.magnetized = true;
      if (!orb.magnetized) continue;
      const travel = Math.min(distance, 11 * dt);
      if (distance > 0.001) { orb.x += dx / distance * travel; orb.z += dz / distance * travel; }
      if (distance - travel < 0.65) {
        this.progression.gainExperience(orb.value);
        this.collected++;
        orb.active = false;
        this.effect(orb.x, orb.z, 'collect');
        if (this.progression.awaitingChoice) break;
      }
    }
  }

  /** Shared pool + swept collision + damageEnemy for every controlled/partner bolt. */
  private fireBolts(origin: Point, target: Enemy, damage: number, count: number, range: number, sourceId = 0, species?: SpeciesId) {
    let available = 0;
    for (const shot of this.projectiles) if (!shot.active) available++;
    if (available < count) return false;
    const x = target.x - origin.x, z = target.z - origin.z, length = Math.max(0.001, Math.hypot(x, z));
    // One fusion per volley. Multi-shot does not accelerate the alternation.
    const recipes = this.fusions;
    const recipe = recipes.length ? recipes[this.fusionCursor++ % recipes.length] : undefined;
    const fusionIds: FusionId[] = recipe ? [recipe.id] : [];
    for (let i = 0; i < count; i++) {
      const shot = this.projectiles.find(candidate => !candidate.active)!;
      // Retain a center shot even for an even number of fan projectiles.
      const spread = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 0.11;
      const angle = Math.atan2(x / length, z / length) + spread;
      Object.assign(shot, { active: true, x: origin.x, z: origin.z, previousX: origin.x, previousZ: origin.z, vx: Math.sin(angle) * WEAPON.speed, vz: Math.cos(angle) * WEAPON.speed, distance: 0, life: Math.max(WEAPON.lifetime, range / WEAPON.speed + 0.12), damage, baseDamage: damage, sourceId, species, generation: 0, bornTick: this.tick, ignoreEnemyId: 0, burst: recipe?.id === 'burst-seed' && species === 'yanrong', age: 0, elemental: this.fusionEnabled && (species === 'bubblesalamander' || species === 'sproutspike'), fusionIds, hitIds: [], damageIds: [], hopTargetId: 0, hopDelay: 0, hopElapsed: 0, hopDuration: 0, pierces: this.fusionEnabled && species === 'sproutspike' && recipe?.id !== 'jump-thorn' ? ELEMENTAL_RULES.leafPierces : 0, bounces: recipe?.id === 'chain-bubble' || recipe?.id === 'jump-thorn' ? recipe.maxHops : 0, scatter: recipe?.id === 'thorn-scatter' });
      this.shotsFired++;
    }
    return true;
  }

  /** Instant one-pass AoE. Children share the 24-slot pool and start next tick. */
  private burstSeed(parent: Projectile, original: Enemy, x: number, z: number) {
    const damage = parent.damage, angle = Math.atan2(parent.vx, parent.vz), sourceId = parent.sourceId;
    this.bursts++;
    this.effect(x, z, 'burst', original.kind, BURST_SEED.explosionRadius);
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.id === original.id) continue;
      const dx = enemy.x - x, dz = enemy.z - z, distance = Math.hypot(dx, dz);
      if (distance > BURST_SEED.explosionRadius + ENEMY_TYPES[enemy.kind].radius) continue;
      this.damageEnemy(enemy, damage * BURST_SEED.explosionDamage, dx / Math.max(.001, distance), dz / Math.max(.001, distance));
    }
    // Cache parent data before its just-freed slot can be reused by a child.
    for (let i = 0; i < BURST_SEED.childCount; i++) {
      const child = this.projectiles.find(shot => !shot.active);
      if (!child) break;
      const direction = angle + (i === 0 ? -1 : 1) * BURST_SEED.childAngle;
      Object.assign(child, { active: true, x, z, previousX: x, previousZ: z, vx: Math.sin(direction) * WEAPON.speed, vz: Math.cos(direction) * WEAPON.speed,
        life: BURST_SEED.childLifetime, damage: damage * BURST_SEED.childDamage, distance: 0, sourceId, species: 'yanrong', generation: BURST_SEED.maxGeneration,
        bornTick: this.tick, ignoreEnemyId: original.id, burst: false, age: 0, elemental: false, fusionIds: [], hitIds: [], pierces: 0, bounces: 0, scatter: false });
      this.childShots++;
    }
  }

  /** Swept circle contact plus bounded tangent sliding; never project a crowd through cover. */
  private moveEnemy(enemy: Enemy, dx: number, dz: number, radius: number) {
    for (let pass = 0; pass < 3 && Math.hypot(dx, dz) > 1e-8; pass++) {
      let earliest = Infinity, blocker: Obstacle | undefined;
      for (const obstacle of this.obstacles) {
        const ox = enemy.x - obstacle.x, oz = enemy.z - obstacle.z;
        // Invalid external fixtures can start inside cover: allow only outward recovery.
        if (ox * ox + oz * oz < (obstacle.radius + radius) ** 2 && ox * dx + oz * dz > 0) continue;
        const t = segmentHit(enemy.x, enemy.z, enemy.x + dx, enemy.z + dz, obstacle.x, obstacle.z, obstacle.radius + radius);
        if (t < earliest) { earliest = t; blocker = obstacle; }
      }
      if (!blocker) { enemy.x += dx; enemy.z += dz; return; }
      const safe = Math.max(0, earliest - .0001);
      enemy.x += dx * safe; enemy.z += dz * safe;
      const ox = enemy.x - blocker.x, oz = enemy.z - blocker.z, length = Math.max(.0001, Math.hypot(ox, oz));
      const nx = ox / length, nz = oz / length;
      dx *= 1 - earliest; dz *= 1 - earliest;
      const inward = Math.min(0, dx * nx + dz * nz);
      dx -= nx * inward; dz -= nz * inward;
    }
  }

  private chainRule(shot: Projectile) {
    return shot.fusionIds?.includes('chain-bubble') ? CHAIN_BUBBLE : JUMP_THORN;
  }

  clearTransientEffects() {
    for (const shot of this.projectiles) { shot.active = false; shot.hitIds = []; shot.damageIds = []; shot.hopTargetId = 0; shot.hopDelay = shot.hopElapsed = 0; shot.fusionIds = []; }
    for (const effect of this.effects) { effect.active = false; effect.fusionId = undefined; }
    for (const wave of this.shockwaves) wave.active = false;
  }

  private nextHop(shot: Projectile, x: number, z: number) {
    const rule = this.chainRule(shot);
    return this.enemies.filter(e => e.active && e.spawnTime <= 0 && e.hp > 0 && !shot.damageIds?.includes(e.id)
      && Math.hypot(e.x-x,e.z-z) <= rule.range && !this.covered(x,z,e.x,e.z))
      .sort((a,b) => Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z) || a.id-b.id)[0];
  }

  private covered(x: number, z: number, tx: number, tz: number) {
    return this.obstacles.some(o => segmentHit(x,z,tx,tz,o.x,o.z,o.radius+WEAPON.radius) !== Infinity);
  }

  private beginHop(shot: Projectile, target: Enemy) {
    const rule = this.chainRule(shot);
    shot.bounces = (shot.bounces ?? 0) - 1;
    shot.pierces = 0;
    shot.damage = (shot.baseDamage ?? shot.damage) * rule.hopDamage;
    shot.hopTargetId = target.id; shot.hopDelay = rule.delay;
    shot.hopElapsed = 0; shot.hopDuration = rule.hopDuration;
    shot.hopFromX = shot.x; shot.hopFromZ = shot.z;
  }

  private advanceHop(shot: Projectile, dt: number) {
    let target = this.enemies.find(e => e.active && e.id === shot.hopTargetId && e.hp > 0 && e.spawnTime <= 0 && !shot.damageIds?.includes(e.id));
    if (!target || Math.hypot(target.x-shot.hopFromX!,target.z-shot.hopFromZ!) > this.chainRule(shot).range || this.covered(shot.x,shot.z,target.x,target.z)) {
      target = this.nextHop(shot,shot.x,shot.z);
      if (!target) { shot.active = false; shot.hopTargetId = 0; return; }
      // Retargeting consumes no additional jump and starts from current position.
      shot.hopTargetId = target.id; shot.hopElapsed = 0; shot.hopFromX = shot.x; shot.hopFromZ = shot.z;
    }
    const wait = Math.min(dt, shot.hopDelay ?? 0);
    shot.hopDelay = Math.max(0,(shot.hopDelay ?? 0)-wait);
    dt -= wait;
    if (dt <= 0) return;
    shot.hopElapsed = Math.min(shot.hopDuration!, (shot.hopElapsed ?? 0)+dt);
    const t = shot.hopElapsed / shot.hopDuration!;
    shot.vx = (target.x-shot.x) / Math.max(.001,shot.hopDuration!);
    shot.vz = (target.z-shot.z) / Math.max(.001,shot.hopDuration!);
    shot.x = shot.hopFromX! + (target.x-shot.hopFromX!) * t;
    shot.z = shot.hopFromZ! + (target.z-shot.hopFromZ!) * t;
    if (t >= 1) this.elementalHit(shot);
  }

  /** Swept collision; one damage ledger includes primary and splash victims. */
  private elementalHit(shot: Projectile) {
    const ids = shot.hitIds ?? (shot.hitIds = []);
    const damaged = shot.damageIds ?? (shot.damageIds = []);
    const chain = shot.fusionIds?.includes('chain-bubble') || shot.fusionIds?.includes('jump-thorn');
    const wall = this.obstacles.reduce((t, o) => Math.min(t, segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, o.x, o.z, o.radius + WEAPON.radius)), Infinity);
    const contacts = this.enemies.filter(e => e.active && e.spawnTime <= 0 && !ids.includes(e.id) && (!chain || !damaged.includes(e.id)) && e.id !== shot.ignoreEnemyId && (!shot.hopTargetId || e.id === shot.hopTargetId))
      .map(enemy => ({ enemy, t: segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, ENEMY_TYPES[enemy.kind].radius + WEAPON.radius) }))
      .filter(c => c.t < wall && c.t !== Infinity).sort((a, b) => a.t - b.t || a.enemy.id - b.enemy.id);
    for (const { enemy, t } of contacts) {
      if (!enemy.active) continue;
      const x = shot.previousX + (shot.x - shot.previousX) * t, z = shot.previousZ + (shot.z - shot.previousZ) * t;
      ids.push(enemy.id); damaged.push(enemy.id);
      this.damageEnemy(enemy, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed);
      const fusionId = shot.fusionIds?.[0];
      const deep = fusionId === 'deep-bubble', waterChain = fusionId === 'chain-bubble';
      this.effect(x, z, shot.species === 'bubblesalamander' ? 'water' : 'thorn', enemy.kind,
        deep ? DEEP_BUBBLE.radius : waterChain ? CHAIN_BUBBLE.radius : .6, fusionId);
      if (shot.species === 'bubblesalamander') {
        if (enemy.active) enemy.slowTime = ELEMENTAL_RULES.slowDuration;
        if (deep || waterChain) {
          const rule = deep ? DEEP_BUBBLE : CHAIN_BUBBLE;
          for (const other of this.enemies) {
            if (!other.active || other.spawnTime > 0 || other.id === enemy.id || (waterChain && damaged.includes(other.id))
              || Math.hypot(other.x - x, other.z - z) > rule.radius + ENEMY_TYPES[other.kind].radius || this.covered(x,z,other.x,other.z)) continue;
            this.damageEnemy(other, (shot.baseDamage ?? shot.damage) * rule.damage, 0, 0);
            if (waterChain) damaged.push(other.id);
            if (other.active) other.slowTime = ELEMENTAL_RULES.slowDuration;
          }
        }
      }
      if (shot.scatter && (shot.generation ?? 0) === 0) {
        shot.scatter = false;
        this.scatterThorns(shot, x, z, enemy.id);
      }
      if (chain) {
        shot.x = shot.previousX = x; shot.z = shot.previousZ = z;
        shot.hopTargetId = 0;
        const target = (shot.bounces ?? 0) > 0 ? this.nextHop(shot,x,z) : undefined;
        if (target) { this.beginHop(shot,target); return; }
        shot.active = false; return;
      }
      if ((shot.pierces ?? 0) > 0) { shot.pierces = (shot.pierces ?? 0) - 1; continue; }
      shot.active = false; return;
    }
    if (wall !== Infinity || (!shot.hopTargetId && shot.life <= 0)) { shot.active = false; shot.hopTargetId = 0; }
  }

  private scatterThorns(parent: Projectile, x: number, z: number, originalId: number) {
    const angle = Math.atan2(parent.vx, parent.vz);
    for (let i=0;i<THORN_SCATTER.childCount;i++) {
      const child = this.projectiles.find(s => !s.active);
      if (!child) break;
      const direction = angle + (i-1)*THORN_SCATTER.angle;
      Object.assign(child, { active:true,x,z,previousX:x,previousZ:z,vx:Math.sin(direction)*WEAPON.speed,vz:Math.cos(direction)*WEAPON.speed,
        life:THORN_SCATTER.lifetime,damage:parent.damage*THORN_SCATTER.childDamage,distance:0,sourceId:parent.sourceId,species:'sproutspike',
        generation:1,bornTick:this.tick,ignoreEnemyId:originalId,burst:false,age:0,elemental:true,fusionIds:[],hitIds:[originalId],pierces:0,bounces:0,scatter:false,damageIds:[],hopTargetId:0,hopDelay:0,hopElapsed:0,hopDuration:0 });
      this.childShots++;
    }
  }

  private updatePounce(enemy: Enemy, dt: number, dx: number, dz: number, distance: number) {
    enemy.intentCooldown = Math.max(0, enemy.intentCooldown - dt);
    if (enemy.intent === 'chase') {
      if (enemy.intentCooldown === 0 && distance <= POUNCE.range) {
        enemy.intent = 'windup'; enemy.intentTime = POUNCE.windup;
        enemy.aimX = dx / distance; enemy.aimZ = dz / distance;
      }
      return;
    }
    enemy.intentTime = Math.max(0, enemy.intentTime - dt);
    if (enemy.intentTime > 1e-8) return;
    if (enemy.intent === 'windup') { enemy.intent = 'pounce'; enemy.intentTime = POUNCE.duration; }
    else if (enemy.intent === 'pounce') { enemy.intent = 'recover'; enemy.intentTime = POUNCE.recovery; }
    else { enemy.intent = 'chase'; enemy.intentCooldown = POUNCE.cooldown; }
  }

  private resolveHorn(player: Point, dash: DashStep) {
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.hornDash === this.dashSerial) continue;
      const t = segmentHit(dash.fromX - enemy.previousX, dash.fromZ - enemy.previousZ, player.x - enemy.x, player.z - enemy.z, 0, 0, HORN.radius + ENEMY_TYPES[enemy.kind].radius);
      if (t === Infinity) continue;
      const px = dash.fromX + (player.x - dash.fromX) * t, pz = dash.fromZ + (player.z - dash.fromZ) * t;
      const ex = enemy.previousX + (enemy.x - enemy.previousX) * t, ez = enemy.previousZ + (enemy.z - enemy.previousZ) * t;
      if ((ex - px) * dash.dx + (ez - pz) * dash.dz < -0.2) continue;
      if (this.obstacles.some(obstacle => segmentHit(px, pz, ex, ez, obstacle.x, obstacle.z, obstacle.radius) !== Infinity)) continue;
      enemy.hornDash = this.dashSerial;
      const interrupted = enemy.intent === 'windup' || enemy.intent === 'pounce';
      this.damageEnemy(enemy, HORN.damage, dash.dx, dash.dz);
      this.hornHits++;
      if (!enemy.active) this.hornKills++;
      if (interrupted) this.interrupts++;
      if (enemy.active) {
        enemy.knockX = dash.dx * HORN.knockback; enemy.knockZ = dash.dz * HORN.knockback;
        enemy.stagger = HORN.stagger;
        if (enemy.kind === 'fast') { enemy.intent = 'recover'; enemy.intentTime = POUNCE.recovery; }
      }
      this.effect(ex, ez, 'hit');
    }
  }

  private damageEnemy(enemy: Enemy, damage: number, dx: number, dz: number) {
    if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0) return;
    this.hits++;
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.flash = 0.16;
    const strength = enemy.kind === 'tank' ? 1.2 : 3;
    enemy.knockX = dx * strength;
    enemy.knockZ = dz * strength;
    if (enemy.hp === 0) {
      enemy.active = false;
      this.kills++;
      this.dropExperience(enemy.x, enemy.z, ENEMY_TYPES[enemy.kind].xp);
      this.effect(enemy.x, enemy.z, 'death', enemy.kind, 0, undefined, enemy);
    }
  }

  private updateSkills(dt: number, player: Point) {
    const stats = this.stats;
    this.previousOrbitAngle = this.orbitAngle;
    this.orbitAngle += stats.orbitSpeed * dt;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.orbitCooldown > 0) continue;
      for (let i = 0; i < stats.orbitCount; i++) {
        const offset = i / stats.orbitCount * Math.PI * 2;
        const oldX = this.previousAnchorX + Math.cos(this.previousOrbitAngle + offset) * stats.orbitRadius;
        const oldZ = this.previousAnchorZ + Math.sin(this.previousOrbitAngle + offset) * stats.orbitRadius;
        const x = player.x + Math.cos(this.orbitAngle + offset) * stats.orbitRadius;
        const z = player.z + Math.sin(this.orbitAngle + offset) * stats.orbitRadius;
        if (segmentHit(oldX, oldZ, x, z, enemy.x, enemy.z, ENEMY_TYPES[enemy.kind].radius + SKILL_RULES.orbitBallRadius) === Infinity) continue;
        const dx = enemy.x - player.x, dz = enemy.z - player.z, distance = Math.max(0.001, Math.hypot(dx, dz));
        this.damageEnemy(enemy, stats.orbitDamage, dx / distance, dz / distance);
        this.effect(enemy.x, enemy.z, 'hit');
        enemy.orbitCooldown = SKILL_RULES.orbitHitInterval;
        break;
      }
    }
    if (stats.shockDamage > 0) {
      this.shockClock -= dt;
      if (this.shockClock <= 0) {
        const wave = this.shockwaves.find((candidate) => !candidate.active);
        if (wave) {
          Object.assign(wave, { active: true, x: player.x, z: player.z, age: 0, radius: 0, previousRadius: 0, maxRadius: stats.shockRadius, damage: stats.shockDamage });
          wave.hitIds.fill(0);
          this.shockClock += stats.shockInterval;
        }
      }
    }
    for (const wave of this.shockwaves) {
      if (!wave.active) continue;
      wave.age = Math.min(SKILL_RULES.waveDuration, wave.age + dt);
      wave.previousRadius = wave.radius;
      wave.radius = wave.maxRadius * wave.age / SKILL_RULES.waveDuration;
      for (let index = 0; index < this.enemies.length; index++) {
        const enemy = this.enemies[index];
        if (!enemy.active || enemy.spawnTime > 0 || wave.hitIds[index] === enemy.id) continue;
        const dx = enemy.x - wave.x, dz = enemy.z - wave.z, distance = Math.hypot(dx, dz);
        if (distance > wave.radius + ENEMY_TYPES[enemy.kind].radius) continue;
        wave.hitIds[index] = enemy.id;
        this.damageEnemy(enemy, wave.damage, dx / Math.max(0.001, distance), dz / Math.max(0.001, distance));
        this.effect(enemy.x, enemy.z, 'hit');
      }
      if (wave.age >= SKILL_RULES.waveDuration) wave.active = false;
    }
  }

  private dropExperience(x: number, z: number, value: number) {
    let orb = this.orbs.find((candidate) => !candidate.active);
    if (!orb) {
      // Preserve XP when the pool fills by merging into the nearest existing drop.
      orb = this.orbs.reduce((best, candidate) => (candidate.x - x) ** 2 + (candidate.z - z) ** 2 < (best.x - x) ** 2 + (best.z - z) ** 2 ? candidate : best);
      orb.value += value;
      return;
    }
    Object.assign(orb, { active: true, x, z, previousX: x, previousZ: z, value, magnetized: false });
  }

  private effect(x: number, z: number, kind: CombatEffect['kind'], enemyKind: EnemyKind = 'normal', radius = 0, fusionId?: FusionId, enemy?: Enemy) {
    const effect = this.effects.find((candidate) => !candidate.active);
    const duration = kind === 'burst' ? BURST_SEED.explosionDuration : fusionId === 'deep-bubble' ? DEEP_BUBBLE.duration : fusionId === 'thorn-scatter' ? .375 : kind === 'death' ? 0.55 : 0.32;
    if (effect) Object.assign(effect, { active: true, x, z, kind, enemyKind, radius, duration, time: duration, fusionId, enemyId: enemy?.id, moveX: enemy ? enemy.x - enemy.previousX : 0, moveZ: enemy ? enemy.z - enemy.previousZ : 0 });
  }

  inspect() {
    return {
      hp: this.hp, kills: this.kills, xp: this.xp, shotsFired: this.shotsFired, hits: this.hits,
      fusion: { enabled: this.fusionEnabled, active: this.fusion?.id ?? null, recipes: this.fusions.map(f => f.id), bursts: this.bursts, childShots: this.childShots, children: this.projectiles.filter(shot => shot.active && shot.generation === 1).length },
      spawned: this.spawned, collected: this.collected, invulnerability: this.invulnerability,
      enemies: this.enemies.filter((enemy) => enemy.active).map((enemy) => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, z: enemy.z, hp: enemy.hp, spawning: enemy.spawnTime > 0 })),
      projectiles: this.projectiles.filter((shot) => shot.active).length,
      orbs: this.orbs.filter((orb) => orb.active).map((orb) => ({ x: orb.x, z: orb.z, value: orb.value })),
      effects: this.effects.filter((effect) => effect.active).length,
      targetId: this.targetId, limits: COMBAT_LIMITS, maxHp: this.maxHp,
      progression: this.progression.inspect(),
      orbitAngle: this.orbitAngle,
      trial: this.isTrial ? { organ: 'charge-horns', hits: this.hornHits, kills: this.hornKills, interrupts: this.interrupts, goal: HORN.goal, complete: this.hornHits >= HORN.goal, intents: this.enemies.filter(enemy => enemy.active).map(enemy => ({ id: enemy.id, state: enemy.intent, remaining: enemy.intentTime, aimX: enemy.aimX, aimZ: enemy.aimZ, stagger: enemy.stagger })) } : undefined,
      shockwaves: this.shockwaves.filter((wave) => wave.active).map((wave) => ({ x: wave.x, z: wave.z, radius: wave.radius, damage: wave.damage, age: wave.age })),
    };
  }
}
