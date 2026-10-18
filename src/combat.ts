import { Progression, SKILL_RULES, type SkillId } from './progression';
import { HORN, POUNCE, type DashStep, type EnemyIntent, type Ruleset } from './trial';
import type { PartySystem, SpeciesId } from './party';

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
export interface Enemy extends Moving { id: number; kind: EnemyKind; hp: number; age: number; spawnTime: number; flash: number; knockX: number; knockZ: number; facing: number; orbitCooldown: number; intent: EnemyIntent; intentTime: number; intentCooldown: number; aimX: number; aimZ: number; stagger: number; hornDash: number }
export interface Projectile extends Moving { vx: number; vz: number; life: number; damage: number; distance: number; sourceId?: number; species?: SpeciesId }
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

  constructor(private obstacles: readonly Obstacle[] = [], private boundary = 32.3, private random: () => number = Math.random, ruleset: Ruleset = 'classic') { this.ruleset = ruleset; this.progression = new Progression(random); }

  get isTrial() { return this.ruleset !== 'classic'; }
  get isChallenge() { return this.ruleset === 'horn-challenge'; }
  enemyMaxHp(kind: EnemyKind) { return this.isTrial && kind === 'fast' ? POUNCE.hp : ENEMY_TYPES[kind].hp; }
  get xp() { return this.progression.totalExperience; }
  get stats() { return this.progression.stats; }
  get maxHp() { return this.stats.maxHp; }

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
    if (this.party) this.party.reset(this.party.members.map(member => member.species));
    this.ruleset = ruleset;
    this.dashSerial = this.hornHits = this.hornKills = this.interrupts = 0;
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
    Object.assign(enemy, { active: true, id: this.nextId++, kind, x, z, previousX: x, previousZ: z, hp: this.enemyMaxHp(kind), age: 0, spawnTime, flash: 0, knockX: 0, knockZ: 0, facing: 0, orbitCooldown: 0, intent: 'chase', intentTime: 0, intentCooldown: 0, aimX: 0, aimZ: 1, stagger: 0, hornDash: 0 });
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

  /** Finite encounters use the same pool, spawn warning, collision and enemy data. */
  spawnEncounter(kind: EnemyKind, player: Point) {
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
      let moveX = steerX / steeringLength * type.speed, moveZ = steerZ / steeringLength * type.speed;
      if (this.isTrial) {
        enemy.stagger = Math.max(0, enemy.stagger - dt);
        if (enemy.stagger > 0) { moveX = moveZ = 0; }
        else if (enemy.kind === 'fast') {
          this.updatePounce(enemy, dt, dx, dz, length);
          if (enemy.intent === 'pounce') { moveX = enemy.aimX * POUNCE.speed; moveZ = enemy.aimZ * POUNCE.speed; }
          else if (enemy.intent !== 'chase') { moveX = moveZ = 0; }
        }
      }
      enemy.x += (moveX + enemy.knockX) * dt;
      enemy.z += (moveZ + enemy.knockZ) * dt;
      const decay = Math.exp(-14 * dt);
      enemy.knockX *= decay;
      enemy.knockZ *= decay;
      enemy.facing = this.isTrial && (enemy.intent === 'windup' || enemy.intent === 'pounce') ? Math.atan2(enemy.aimX, enemy.aimZ) : Math.atan2(dx, dz);
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
    for (let i = 0; i < count; i++) {
      const shot = this.projectiles.find(candidate => !candidate.active)!;
      // Retain a center shot even for an even number of fan projectiles.
      const spread = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 0.11;
      const angle = Math.atan2(x / length, z / length) + spread;
      Object.assign(shot, { active: true, x: origin.x, z: origin.z, previousX: origin.x, previousZ: origin.z, vx: Math.sin(angle) * WEAPON.speed, vz: Math.cos(angle) * WEAPON.speed, distance: 0, life: Math.max(WEAPON.lifetime, range / WEAPON.speed + 0.12), damage, sourceId, species });
      this.shotsFired++;
    }
    return true;
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
      trial: this.isTrial ? { organ: 'charge-horns', hits: this.hornHits, kills: this.hornKills, interrupts: this.interrupts, goal: HORN.goal, complete: this.hornHits >= HORN.goal, intents: this.enemies.filter(enemy => enemy.active).map(enemy => ({ id: enemy.id, state: enemy.intent, remaining: enemy.intentTime, aimX: enemy.aimX, aimZ: enemy.aimZ, stagger: enemy.stagger })) } : undefined,
      shockwaves: this.shockwaves.filter((wave) => wave.active).map((wave) => ({ x: wave.x, z: wave.z, radius: wave.radius, damage: wave.damage, age: wave.age })),
    };
  }
}
