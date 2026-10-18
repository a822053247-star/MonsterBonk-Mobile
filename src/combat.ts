import { Progression, SKILL_RULES, type SkillId } from './progression';

/** Combat owns no DOM/GPU state. Every clock and movement is measured in seconds. */
export const COMBAT_LIMITS = { enemies: 48, projectiles: 24, orbs: 96, effects: 48, shockwaves: 2 } as const;
export type EnemyKind = 'normal' | 'fast' | 'tank';
export const ENEMY_TYPES = {
  normal: { name: '赤团', hp: 30, speed: 1.25, radius: 0.55, damage: 8, xp: 3, color: '#e59472' },
  fast: { name: '疾芽', hp: 18, speed: 2.7, radius: 0.4, damage: 6, xp: 2, color: '#edd779' },
  tank: { name: '岩甲', hp: 100, speed: 0.75, radius: 0.85, damage: 16, xp: 8, color: '#799fbc' },
} as const;
export const WEAPON = { range: 10.5, interval: 0.44, speed: 18, damage: 18, lifetime: 0.8, radius: 0.2 } as const;
type Point = { x: number; z: number };
type Obstacle = Point & { radius: number };
type Moving = Point & { previousX: number; previousZ: number; active: boolean };
export interface Enemy extends Moving { id: number; kind: EnemyKind; hp: number; age: number; spawnTime: number; flash: number; knockX: number; knockZ: number; facing: number; orbitCooldown: number }
export interface Projectile extends Moving { vx: number; vz: number; life: number; damage: number; distance: number }
export interface Shockwave { active: boolean; x: number; z: number; age: number; radius: number; previousRadius: number; maxRadius: number; damage: number; hitIds: Int32Array }
export interface ExperienceOrb extends Moving { value: number; magnetized: boolean }
export interface CombatEffect extends Point { active: boolean; time: number; duration: number; kind: 'hit' | 'death' | 'collect' | 'hurt'; enemyKind: EnemyKind }

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
  readonly enemies: Enemy[] = Array.from({ length: COMBAT_LIMITS.enemies }, () => ({ active: false, id: 0, kind: 'normal', hp: 0, x: 0, z: 0, previousX: 0, previousZ: 0, age: 0, spawnTime: 0, flash: 0, knockX: 0, knockZ: 0, facing: 0, orbitCooldown: 0 }));
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

  constructor(private obstacles: readonly Obstacle[] = [], private boundary = 32.3, private random: () => number = Math.random) { this.progression = new Progression(random); }

  get xp() { return this.progression.totalExperience; }
  get stats() { return this.progression.stats; }
  get maxHp() { return this.stats.maxHp; }

  chooseUpgrade(id: SkillId) {
    if (this.hp <= 0) return false;
    const previous = this.stats;
    if (!this.progression.pick(id)) return false;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp - previous.maxHp);
    this.fireClock *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
    if (previous.shockDamage === 0 && this.stats.shockDamage > 0) this.shockClock = 0;
    return true;
  }

  reset() {
    for (const pool of [this.enemies, this.projectiles, this.orbs, this.effects, this.shockwaves]) {
      for (const item of pool) item.active = false;
    }
    this.hp = 100;
    this.progression.reset();
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
    Object.assign(enemy, { active: true, id: this.nextId++, kind, x, z, previousX: x, previousZ: z, hp: ENEMY_TYPES[kind].hp, age: 0, spawnTime, flash: 0, knockX: 0, knockZ: 0, facing: 0, orbitCooldown: 0 });
    this.spawned++;
    return enemy;
  }

  private spawnNear(player: Point) {
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

  findTarget(player: Point): Enemy | undefined {
    let nearest: Enemy | undefined, best = (WEAPON.range * this.stats.rangeMultiplier) ** 2;
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

  update(dt: number, player: Point) {
    if (this.hp <= 0 || dt <= 0 || this.progression.awaitingChoice) return;
    this.previousAnchorX = this.anchorInitialized ? this.anchorX : player.x;
    this.previousAnchorZ = this.anchorInitialized ? this.anchorZ : player.z;
    this.anchorX = player.x;
    this.anchorZ = player.z;
    this.anchorInitialized = true;
    this.elapsed += dt;
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
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
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.orbitCooldown = Math.max(0, enemy.orbitCooldown - dt);
      if (Math.hypot(enemy.x - player.x, enemy.z - player.z) > 29) { enemy.active = false; continue; }
      if (enemy.spawnTime > 0) { enemy.spawnTime = Math.max(0, enemy.spawnTime - dt); continue; }
      const type = ENEMY_TYPES[enemy.kind];
      const dx = player.x - enemy.x, dz = player.z - enemy.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      let steerX = dx / length, steerZ = dz / length;
      for (const other of this.enemies) {
        if (!other.active || other === enemy || other.spawnTime > 0) continue;
        const ox = enemy.x - other.x, oz = enemy.z - other.z;
        const distance = Math.hypot(ox, oz), avoid = type.radius + ENEMY_TYPES[other.kind].radius;
        if (distance < avoid && distance > 0.001) {
          const strength = (avoid - distance) / avoid * 1.7;
          steerX += ox / distance * strength;
          steerZ += oz / distance * strength;
        }
      }
      for (const obstacle of this.obstacles) {
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
      enemy.x += (steerX / steeringLength * type.speed + enemy.knockX) * dt;
      enemy.z += (steerZ / steeringLength * type.speed + enemy.knockZ) * dt;
      const decay = Math.exp(-14 * dt);
      enemy.knockX *= decay;
      enemy.knockZ *= decay;
      enemy.facing = Math.atan2(dx, dz);
      for (const obstacle of this.obstacles) {
        const ox = enemy.x - obstacle.x, oz = enemy.z - obstacle.z, distance = Math.hypot(ox, oz);
        const radius = type.radius + obstacle.radius;
        if (distance < radius) {
          enemy.x = obstacle.x + (distance > 0.001 ? ox / distance : 1) * radius;
          enemy.z = obstacle.z + (distance > 0.001 ? oz / distance : 0) * radius;
        }
      }
      const boundaryDistance = Math.hypot(enemy.x, enemy.z), limit = this.boundary - type.radius;
      if (boundaryDistance > limit) { enemy.x *= limit / boundaryDistance; enemy.z *= limit / boundaryDistance; }
    }

    const target = this.findTarget(player);
    this.targetId = target?.id ?? 0;
    this.fireClock = Math.max(0, this.fireClock - dt);
    if (target && this.fireClock <= 1e-8) {
      let available = 0;
      for (const shot of this.projectiles) if (!shot.active) available++;
      if (available >= this.stats.projectileCount) {
        const x = target.x - player.x, z = target.z - player.z, length = Math.max(0.001, Math.hypot(x, z));
        for (let i = 0; i < this.stats.projectileCount; i++) {
          const shot = this.projectiles.find((candidate) => !candidate.active)!;
          // Always retain a center shot: adding an even number of fan projectiles
          // must not make every shot miss a lone target at maximum range.
          const spread = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 0.11;
          const angle = Math.atan2(x / length, z / length) + spread;
          Object.assign(shot, { active: true, x: player.x, z: player.z, previousX: player.x, previousZ: player.z, vx: Math.sin(angle) * WEAPON.speed, vz: Math.cos(angle) * WEAPON.speed, distance: 0, life: Math.max(WEAPON.lifetime, WEAPON.range * this.stats.rangeMultiplier / WEAPON.speed + 0.12), damage: WEAPON.damage * this.stats.damageMultiplier });
          this.shotsFired++;
        }
        this.fireClock = WEAPON.interval / this.stats.attackRateMultiplier;
      }
    }
    for (const shot of this.projectiles) {
      if (!shot.active) continue;
      shot.previousX = shot.x;
      shot.previousZ = shot.z;
      const travelTime = Math.min(dt, shot.life);
      shot.x += shot.vx * travelTime;
      shot.z += shot.vz * travelTime;
      shot.life -= dt;
      shot.distance += WEAPON.speed * travelTime;
      let earliest = Infinity, victim: Enemy | undefined;
      for (const obstacle of this.obstacles) {
        earliest = Math.min(earliest, segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, obstacle.x, obstacle.z, obstacle.radius + WEAPON.radius));
      }
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.spawnTime > 0) continue;
        const t = segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, ENEMY_TYPES[enemy.kind].radius + WEAPON.radius);
        if (t < earliest) { earliest = t; victim = enemy; }
      }
      if (earliest !== Infinity) {
        shot.active = false;
        const x = shot.previousX + (shot.x - shot.previousX) * earliest, z = shot.previousZ + (shot.z - shot.previousZ) * earliest;
        this.effect(x, z, 'hit');
        if (victim) {
          this.damageEnemy(victim, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed);
        }
      } else if (shot.life <= 0) shot.active = false;
    }

    this.updateSkills(dt, player);
    // Resolve hits after magic: an enemy killed on this tick cannot bite.
    if (this.invulnerability === 0) {
      let damage = 0;
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.spawnTime > 0) continue;
        const type = ENEMY_TYPES[enemy.kind];
        if (Math.hypot(enemy.x - player.x, enemy.z - player.z) < type.radius + 0.62) damage = Math.max(damage, type.damage);
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
      this.effect(enemy.x, enemy.z, 'death', enemy.kind);
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

  private effect(x: number, z: number, kind: CombatEffect['kind'], enemyKind: EnemyKind = 'normal') {
    const effect = this.effects.find((candidate) => !candidate.active);
    if (effect) Object.assign(effect, { active: true, x, z, kind, enemyKind, duration: kind === 'death' ? 0.55 : 0.32, time: kind === 'death' ? 0.55 : 0.32 });
  }

  inspect() {
    return {
      hp: this.hp, kills: this.kills, xp: this.xp, shotsFired: this.shotsFired, hits: this.hits,
      spawned: this.spawned, collected: this.collected, invulnerability: this.invulnerability,
      enemies: this.enemies.filter((enemy) => enemy.active).map((enemy) => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, z: enemy.z, hp: enemy.hp, spawning: enemy.spawnTime > 0 })),
      projectiles: this.projectiles.filter((shot) => shot.active).length,
      orbs: this.orbs.filter((orb) => orb.active).map((orb) => ({ x: orb.x, z: orb.z, value: orb.value })),
      effects: this.effects.filter((effect) => effect.active).length,
      targetId: this.targetId, limits: COMBAT_LIMITS, maxHp: this.maxHp,
      progression: this.progression.inspect(),
      orbitAngle: this.orbitAngle,
      shockwaves: this.shockwaves.filter((wave) => wave.active).map((wave) => ({ x: wave.x, z: wave.z, radius: wave.radius, damage: wave.damage, age: wave.age })),
    };
  }
}
