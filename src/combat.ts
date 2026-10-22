import { ARENA_HALF_EXTENT, clampToRectangularBoundary, isInsideRectangularBoundary } from './arena-boundary';
import {WEAPON_PAIR_RECIPES,sourceHasAttack,type WeaponPairId} from './weapon-pair-fusion';
import { CombatRelicBehaviors } from './combat-relic-behaviors';
import { COMBAT_CLARITY } from './combat-clarity';
import { perimeterPoint, SPAWN_LAYOUT, type SpawnViewport } from './spawn-layout';
import { REACTION_RULES, matureFire, martyrDamage, reserveReaction } from './combat-reactions';
import { SKILL_SOUNDS } from './sound-design';
import { FLAME_SWEEP, flameSweepStats, insideSweep } from './flame-sweep';
import { EnemyChallenge, ENCOUNTER_RULES, predictPosition } from './enemy-challenge';
import { TRIGGER_RELIC_RULES, resolveAttackRules, type RelicDamageSource, type AttackRules } from './relics';
import { ATTACKS, RunBuild } from './run-build';
import type { BaseAttackId } from './fusion';
import { ENEMY_MOTION } from './enemy-motion';
import { GRASS_BLOB, stepGrassRoll } from './grass-blob';
import { PLAYER_FEEDBACK } from './player-feedback';
import { CRYSTAL_SWARM, SPORE_BOMBER, TREASURE_RUNNER, type SporeExplosion, type TreasureReward } from './special-enemies';
import { Progression, SKILL_RULES, type SkillId } from './progression';
import { HORN, POUNCE, type DashStep, type EnemyIntent, type Ruleset } from './trial';
import { CREATURES, type PartySystem, type SpeciesId } from './party';
import { ENDLESS_SCALING } from './wave-director';
import { GroundNavigation } from './navigation';
import { BURST_SEED, resolveFusions, DEEP_BUBBLE, CHAIN_BUBBLE, THORN_SCATTER, JUMP_THORN, ELEMENTAL_RULES, type FusionId } from './fusion';

/** Combat owns no DOM/GPU state. Every clock and movement is measured in seconds. */
export const COMBAT_LIMITS = { enemies: 256, projectiles: 24, orbs: 96, effects: 48, shockwaves: 2 } as const;
export type EnemyKind = 'normal' | 'fast' | 'tank' | 'draft-crystal-swarm' | 'draft-spore-bomber' | 'draft-treasure-runner';
export const ENEMY_TYPES = {
  normal: { name: '赤团', hp: 30, speed: 1.25, radius: 0.55, damage: 8, xp: 3, color: '#e59472' },
  fast: { name: '疾芽', hp: 18, speed: 2.7, radius: 0.4, damage: 6, xp: 2, color: '#edd779' },
  tank: { name: '岩甲', hp: 100, speed: 0.75, radius: 0.85, damage: 16, xp: 8, color: '#a58b6e' },
  'draft-crystal-swarm': { name: '晶屑虫', hp: 8, speed: 1.65, radius: .3, damage: 3, xp: 0, color: '#ba83d5' },
  'draft-spore-bomber': { name: '爆孢怪', hp: 28, speed: 1.05, radius: .6, damage: 6, xp: 2, color: '#e97a73' },
  'draft-treasure-runner': { name: '携宝兽', hp: 65, speed: 3.5, radius: .48, damage: 0, xp: TREASURE_RUNNER.xp, color: '#f1cd68' },
} as const;
export const WEAPON = { range: 10.5, interval: 0.44, speed: 18, damage: 18, lifetime: 0.8, radius: 0.2 } as const;
/** Rock tanks are tougher only in the formal six-wave run, not legacy modes. */
export const FORMAL_ROCK_HP = 125;
/** Rock armor inexorably marches and hurts only on actual close contact. It never performs a red slam. */
export const ROCK_MARCH = { turnResponse: 3.2, contactPadding: .17 } as const;
export const FORMAL_SPORE_HP = 140;
/** Red blobs hold ground for a short area slam; only sprinters can lunge.
 * The hit radius matches the ground warning, and recovery is punishable. */
export const RED_BLOB_BASH = GRASS_BLOB;
/** Five enemy silhouettes share normal group slots; spores remain live-capped. */
export const FORMAL_MIX: readonly EnemyKind[] = ['normal','fast','draft-crystal-swarm','tank','draft-crystal-swarm','normal','fast','draft-crystal-swarm','tank','draft-crystal-swarm','normal','draft-spore-bomber'] as const;
export const FORMAL_POUNCE = { ...POUNCE, range: 6, windup: .85, speed: 13, duration: .5, recovery: 1.1, cooldown: 2 } as const;
export const SWARM_RULES = { health: [12, 14, 16, 18, 20, 22], minDistance: 7.5, maxDistance: 14, halfAngle: .42, laneAngle: .78, xp: 1, killsPerXp: 3, killsPerCoin: 9, contactDamage: 3 } as const;
type Point = { x: number; z: number };
type Obstacle = Point & { radius: number };
export interface WeaponSnapshot {
  suppressRelics?:boolean;
  attackId: BaseAttackId; damage: number; range: number; rules: AttackRules; fusions: FusionId[];
  sweep?: ReturnType<typeof flameSweepStats>; mature?: boolean;
}
type Moving = Point & { previousX: number; previousZ: number; active: boolean };
export interface Enemy extends Moving { pairSlowUntil?:number; pairSlowFactor?:number; pairBurnTime?:number; pairBurnClock?:number; pairBurnDamage?:number; pairBurnSource?:RelicDamageSource; venomUntil?:number; venomReady?:number; smokeUntil?:number; vineUntil?: number; vineReadyAt?: number; wetTime?: number; steamReadyAt?: number; grassRollDistance?: number; grassCycle?: number; grassRollX?: number; grassRollZ?: number; grassAttackX?: number; grassAttackZ?: number; grassHit?: boolean; burnTime?: number; burnClock?: number; burnDamage?: number; burnStacks?: number; burnSource?: RelicDamageSource; specialTime?: number; swarm?: boolean; rank?: 'elite' | 'boss'; maxHp?: number; radius?: number; id: number; kind: EnemyKind; hp: number; age: number; spawnTime: number; flash: number; knockX: number; knockZ: number; facing: number; orbitCooldown: number; intent: EnemyIntent; intentTime: number; intentCooldown: number; aimX: number; aimZ: number; stagger: number; hornDash: number; slowTime?: number; walkPhase?: number; walkAmount?: number; steerX?: number; steerZ?: number; walkX?: number; walkZ?: number }
export interface Projectile extends Moving { chargedPierceSource?:number; returning?: boolean; outboundSpent?: boolean; flightRange?: number; behaviorRoot?: number; vfxPresetId?: string; relicSource?: RelicDamageSource; vx: number; vz: number; life: number; damage: number; distance: number; sourceId?: number; species?: SpeciesId; attackId?: BaseAttackId; attackRules?: AttackRules; homing?: boolean; generation?: number; bornTick?: number; ignoreEnemyId?: number; burst?: boolean; age?: number; elemental?: boolean; fusionIds?: FusionId[]; hitIds?: number[]; pierces?: number; bounces?: number; scatter?: boolean; baseDamage?: number; damageIds?: number[]; hopTargetId?: number; hopDelay?: number; hopElapsed?: number; hopDuration?: number; hopFromX?: number; hopFromZ?: number }
export interface Shockwave { active: boolean; x: number; z: number; age: number; radius: number; previousRadius: number; maxRadius: number; damage: number; hitIds: Int32Array }
export interface ExperienceOrb extends Moving { value: number; magnetized: boolean }
export interface CombatEffect extends Point { active: boolean; time: number; duration: number; kind: 'hit' | 'death' | 'collect' | 'hurt' | 'burst' | 'water' | 'thorn' | 'steam'; enemyKind: EnemyKind; radius?: number; fusionId?: FusionId; enemyId?: number; chainDepth?: number; vfxPresetId?: string; anchorX?: number; anchorZ?: number; moveX?: number; moveZ?: number }

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
  /** Tick-local feedback flags; no queue, no effect-pool dependency, no gameplay RNG. */
  soundEvents = 0;
  readonly encounters = new EnemyChallenge();
  readonly melee = { active: false, attackInstanceId: 0, x: 0, z: 0, aimX: 0, aimZ: 1, age: 0, radius: 0, angle: FLAME_SWEEP.angle as number, hitIds: new Int32Array(COMBAT_LIMITS.enemies) };
  /** Enabled by the map prototype; preserved legacy modes keep their steering. */
  useNavigation = false;
  infiniteWorld = false;
  /** Zero for every non-endless mode; Endless uses zero-based completed cycles. */
  endlessCycleIndex = 0;
  /** Updated by the camera; absent in headless simulations, which use a fixed footprint. */
  spawnViewport?: SpawnViewport;
  private worldRevision = -1;
  fusionEnabled = false;
  automaticSpawning = true;
  goldEarned = 0;
  private swarmCoinRemainder = 0;
  private swarmExperienceRemainder = 0;
  private crystalCoinRemainder = 0;
  private crystalExperienceRemainder = 0;
  sporeKills = 0;
  treasureEscapes = 0;
  /** Genuine treasure-runner kills in formal mode, shared only as shop entitlement data. */
  treasureCaught = 0;
  /** Passive diagnostic counters; never influence combat decisions or the RNG. */
  readonly balanceTelemetry = { damageEvents: 0, projectileBlockedAttempts: 0, sporeChainKills: 0, derivedDenied: 0, queuePeak: 0 };
  readonly sporeExplosions: SporeExplosion[] = Array.from({ length: SPORE_BOMBER.capacity }, () => ({ active: false, x: 0, z: 0, createdAt: 0, age: 0, detonated: false, sourceEnemyId: 0, origin: 'player' }));
  readonly treasureRewards: TreasureReward[] = Array.from({ length: TREASURE_RUNNER.rewardCapacity }, () => ({ active: false, x: 0, z: 0, age: 0, coins: 0 }));
  private fleeGoal = { x: 0, z: 0 };
  private grassMotion = { x: 0, z: 0 };
  readonly runBuild = new RunBuild();
  get usesRunBuild() { return this.fusionEnabled && !!this.party; }
  private tick = 0;
  private nextRelicSource = 0;
  private nextRelicCast = 0;
  private relicEvents: { x: number; z: number; enemyId: number; enemyKind: EnemyKind; damage: number; radius: number; source: RelicDamageSource; type: 'martyr' | 'testament' | 'bubble' | 'steam'; readyAt: number }[] = [];
  readonly relicTelemetry = { explosions: 0, thorns: 0, maxGeneration: 0, bubbles: 0, echoes: 0, echoesSkipped: 0, hourglassProcs: 0, steamBursts: 0, chainKills: 0, maxNodes: 0 };
  private bubbleReadyAt = 0;
  private weaponCastCount = 0;
  private previousWeapon?: WeaponSnapshot;
  private pendingEchoes: { attack: WeaponSnapshot; readyAt: number; expiresAt: number }[] = [];
  private recentRelicKills: number[] = [];
  private hourglassUntil = 0;
  private hourglassReadyAt = 0;
  private nextWeapon = 0;
  private launchClock = 0;
  private salvo?: { attackId: BaseAttackId; sourceId: number; species: SpeciesId; damage: number; range: number; total: number; index: number; castId:number; volley?:{id:number;showerTriggered?:boolean}; rules: AttackRules; fusions: FusionId[]; mature: boolean };
  get firingWeapon() { return this.salvo?.attackId; }
  private childrenThisTick = 0;
  private childWindow = 0;
  private childrenInWindow = 0;
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
  readonly relicBehaviors = new CombatRelicBehaviors(this, {
    launch:(parent,x,z,dx,dz,damage,preset)=>this.relicBehaviors.launch(parent,x,z,dx,dz,damage,preset),
    copy:(attack,damage)=>this.pendingEchoes.push({attack:{...attack,damage:attack.damage*damage,suppressRelics:true},readyAt:this.elapsed+TRIGGER_RELIC_RULES.echo.delay,expiresAt:this.elapsed+TRIGGER_RELIC_RULES.echo.expiry}),
    damage: (enemy,damage,source) => this.damageEnemy(enemy,damage,0,0,'player',source),
    visual: (x,z,kind,radius,preset,duration) => {
      const event=this.effect(x,z,kind,'normal',radius,undefined,undefined,preset);
      if(event&&duration!==undefined)event.time=event.duration=duration;
      return event;
    },
    reserve: () => this.reserveChild(), covered: (x,z,tx,tz) => this.covered(x,z,tx,tz),
    move: (enemy,dx,dz) => this.moveEnemy(enemy,dx,dz,this.enemyRadius(enemy)),
    source: damage => this.newRelicSource(this.baseAttack,this.runBuild.rules(this.baseAttack),damage),
  });
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
  playerVelocityX = 0;
  playerVelocityZ = 0;
  playerTurnRate = 0;
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

  constructor(private obstacles: readonly Obstacle[] = [], private boundary = ARENA_HALF_EXTENT, private random: () => number = Math.random, ruleset: Ruleset = 'classic') {
    this.ruleset = ruleset; this.progression = new Progression(random);
    this.navigation = new GroundNavigation(obstacles, boundary);
  }

  refreshWorld(x: number, z: number, revision: number) {
    this.navigation.setCenter(this.infiniteWorld ? x : 0, this.infiniteWorld ? z : 0);
    if (this.worldRevision !== revision) {
      this.worldRevision = revision;
      this.navigation.invalidate();
    }
  }

  get isTrial() { return this.ruleset !== 'classic'; }
  get isChallenge() { return this.ruleset === 'horn-challenge'; }
  get endlessEnemyHealthMultiplier() {
    return Math.min(ENDLESS_SCALING.maxEnemyHealthMultiplier, 1 + Math.max(0, this.endlessCycleIndex) * ENDLESS_SCALING.enemyHealthPerCycle);
  }
  get endlessContactDamageMultiplier() {
    return Math.min(ENDLESS_SCALING.maxContactDamageMultiplier, 1 + Math.max(0, this.endlessCycleIndex) * ENDLESS_SCALING.contactDamagePerCycle);
  }
  get endlessBossHealthMultiplier() {
    return Math.min(ENDLESS_SCALING.maxBossHealthMultiplier, 1 + Math.max(0, this.endlessCycleIndex) * ENDLESS_SCALING.bossHealthPerCycle);
  }
  private scaledContactDamage(enemy: Enemy) {
    const base = enemy.rank === 'boss' ? 24 : enemy.swarm ? SWARM_RULES.contactDamage : ENEMY_TYPES[enemy.kind].damage;
    return base * this.endlessContactDamageMultiplier;
  }
  enemyMaxHp(kind: EnemyKind) {
    return (this.isTrial && kind === 'fast' ? POUNCE.hp : ENEMY_TYPES[kind].hp) * this.endlessEnemyHealthMultiplier;
  }
  enemyRadius(enemy: Enemy) { return enemy.radius ?? ENEMY_TYPES[enemy.kind].radius; }
  enemyHealth(enemy: Enemy) { return enemy.maxHp ?? this.enemyMaxHp(enemy.kind); }
  get hasAttackIntents() { return this.isTrial || this.encounters.enabled; }
  get xp() { return this.progression.totalExperience; }
  get stats() { return this.progression.stats; }
  get maxHp() { return this.stats.maxHp * this.relicBehaviors.maxHpFactor(); }
  get baseAttack() { return CREATURES[this.party?.leader.species ?? 'yanrong'].skill; }
  get fusions() { return this.fusionEnabled ? (this.usesRunBuild ? this.runBuild.attacks.flatMap(attack => (attack.pairId?[]:resolveFusions(attack.attackId, this.progression.ranks))) : resolveFusions(this.baseAttack, this.progression.ranks)) : []; }
  get fusion() { return this.fusions[0]; }
  get resonances() {
    if (!this.usesRunBuild) return [];
    const active: string[] = [];
    if (this.runBuild.relics.includes('draft-martyr-core') && this.runBuild.attacks.some(a => matureFire(a.attackId, a.level, this.progression.ranks))) active.push('连爆觉醒');
    if (this.runBuild.relics.includes('draft-boiling-core')) active.push('湿润 → 蒸爆');
    return active;
  }

  chooseUpgrade(id: SkillId) { return this.applyUpgrade(id, true); }
  grantUpgrade(id: SkillId) { return this.usesRunBuild && this.applyUpgrade(id, false); }

  confirmWeaponPair(id:WeaponPairId){
    if(!this.usesRunBuild||this.hp<=0||!this.progression.confirmPair(id))return false;
    if(this.salvo&&WEAPON_PAIR_RECIPES[id].sources.some(source=>source===this.salvo!.attackId))this.salvo=undefined;
    this.nextWeapon=0;this.relicBehaviors.gigapack.choiceConfirmed();return true;
  }

  private applyUpgrade(id: SkillId, fromChoice: boolean) {
    if (this.hp <= 0) return false;
    const previous = this.stats, previousMaxHp = this.maxHp;
    const previousSweep = flameSweepStats(this.runBuild.attacks.find(a => a.attackId === 'flame-sweep')?.level ?? 1);
    const intervals = new Map(this.runBuild.attacks.map(a => [a.attackId, this.runBuild.rules(a.attackId).intervalMultiplier]));
    if (!(fromChoice ? this.progression.pick(id) : this.progression.grant(id))) return false;
    for (const attack of this.runBuild.attacks) {
      const interval = this.runBuild.rules(attack.attackId).intervalMultiplier;
      let ratio = previous.attackRateMultiplier / this.stats.attackRateMultiplier * interval / (intervals.get(attack.attackId) ?? interval);
      if (attack.attackId === 'flame-sweep') {
        const nextSweep = flameSweepStats(attack.level);
        ratio *= nextSweep.interval / previousSweep.interval;
      }
      attack.cooldown *= ratio; attack.cooldownTotal *= ratio;
    }
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp - previousMaxHp);
    this.fireClock *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
    if (this.party) for (const member of this.party.members) member.attackCooldown *= previous.attackRateMultiplier / this.stats.attackRateMultiplier;
    if (previous.shockDamage === 0 && this.stats.shockDamage > 0) this.shockClock = 0;
    if(fromChoice)this.relicBehaviors.gigapack.choiceConfirmed();
    return true;
  }

  reset(ruleset: Ruleset = this.ruleset) {
    this.soundEvents = 0;
    this.endlessCycleIndex = 0;
    this.encounters.reset();
    this.clearTransientEffects();
    this.navigation.setCenter(0, 0, true);
    this.worldRevision = -1;
    this.nextRelicSource = this.nextRelicCast = 0;
    for (const key of Object.keys(this.relicTelemetry) as (keyof typeof this.relicTelemetry)[]) this.relicTelemetry[key] = 0;
    this.tick = this.bursts = this.childShots = this.goldEarned = 0;
    this.swarmCoinRemainder = 0;
    this.swarmExperienceRemainder = 0;
    this.crystalCoinRemainder = this.crystalExperienceRemainder = this.sporeKills = this.treasureEscapes = this.treasureCaught = 0;
    for (const key of Object.keys(this.balanceTelemetry) as (keyof typeof this.balanceTelemetry)[]) this.balanceTelemetry[key] = 0;
    this.melee.attackInstanceId = 0; this.melee.age = 0; this.melee.hitIds.fill(0);
    this.nextWeapon = this.launchClock = this.childrenThisTick = this.childWindow = this.childrenInWindow = 0;
    this.salvo = undefined;
    if (this.party) this.party.reset(this.party.members.map(member => member.species));
    this.ruleset = ruleset;
    this.dashSerial = this.hornHits = this.hornKills = this.interrupts = 0;
    for (const pool of [this.enemies, this.projectiles, this.orbs, this.effects, this.shockwaves]) {
      for (const item of pool) item.active = false;
    }
    this.hp = 100;
    this.runBuild.reset(this.party?.leader.species ?? 'yanrong');
    this.progression.build = this.usesRunBuild ? this.runBuild : undefined;
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
    this.playerVelocityX = this.playerVelocityZ = this.playerTurnRate = 0;
    for (const wave of this.shockwaves) wave.hitIds.fill(0);
  }

  /** Also used by deterministic simulation tests to arrange encounter positions. */
  spawn(kind: EnemyKind, x: number, z: number, spawnTime = 0.75): Enemy | undefined {
    // Reserve one future explosion slot per live bomber, including its burst tail.
    if (kind === 'draft-spore-bomber' && this.sporeExplosions.filter(e => e.active).length + this.enemies.filter(e => e.active && e.kind === kind).length >= SPORE_BOMBER.capacity) return;
    const enemy = this.enemies.find((candidate) => !candidate.active && candidate !== this.encounters.boss && candidate !== this.encounters.elite);
    if (!enemy) return;
    Object.assign(enemy, { active: true, id: this.nextId++, kind, x, z, previousX: x, previousZ: z, hp: this.enemyMaxHp(kind), age: 0, spawnTime, flash: 0, knockX: 0, knockZ: 0, facing: 0, orbitCooldown: 0, intent: 'chase', intentTime: 0, intentCooldown: 0, aimX: 0, aimZ: 1, stagger: 0, hornDash: 0, slowTime: 0, walkPhase: (this.nextId * 2.399963) % (Math.PI * 2), walkAmount: 0, walkX: 0, walkZ: 0, steerX: undefined, steerZ: undefined });
    enemy.rank = undefined; enemy.maxHp = enemy.radius = undefined; enemy.swarm = false;
    enemy.specialTime = 0;
    enemy.grassRollDistance = 0; enemy.grassCycle = 0; enemy.grassRollX = enemy.grassRollZ = enemy.grassAttackX = enemy.grassAttackZ = undefined; enemy.grassHit = false;
    enemy.wetTime = enemy.steamReadyAt = 0; enemy.vineUntil=enemy.vineReadyAt=0; enemy.venomUntil=enemy.venomReady=enemy.smokeUntil=0;
    enemy.pairSlowUntil=enemy.pairBurnTime=enemy.pairBurnClock=0;enemy.pairBurnSource=undefined;
    enemy.burnTime = enemy.burnClock = enemy.burnDamage = enemy.burnStacks = 0; enemy.burnSource = undefined;
    if (this.encounters.enabled) enemy.hp = enemy.maxHp =
      (kind==='fast'?40:kind==='tank'?FORMAL_ROCK_HP:kind==='draft-spore-bomber'?FORMAL_SPORE_HP:ENEMY_TYPES[kind].hp)
      *(ENCOUNTER_RULES.waveHealth[this.encounters.wave-1]??1)*this.endlessEnemyHealthMultiplier;
    this.spawned++;
    return enemy;
  }

  private spawnNear(player: Point) {
    // Legacy auto-spawn modes preserve their prior 48-enemy ceiling.
    if (this.enemies.filter(enemy => enemy.active).length >= 48) return;
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
      if (!this.infiniteWorld && !isInsideRectangularBoundary(x, z, this.boundary, 1)) continue;
      if (this.obstacles.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 1.1)) continue;
      const roll = this.random();
      // Introduce each silhouette once, then use a weighted mix.
      const kind = this.spawned === 0 ? 'normal' : this.spawned === 1 ? 'fast' : this.spawned === 2 ? 'tank' : roll < 0.58 ? 'normal' : roll < 0.86 ? 'fast' : 'tank';
      this.spawn(kind, x, z);
      return;
    }
  }

  /** Finite encounters use the same pool, spawn warning, collision and enemy data. */
  spawnEncounter(kind: EnemyKind, player: Point, min = 6, max = 9) {
    if (this.useNavigation) {
      const point = this.spawnPosition(player, min, max, ENEMY_TYPES[kind].radius);
      return point ? this.spawn(kind, point.x, point.z) : undefined;
    }
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = this.random() * Math.PI * 2, distance = min + this.random() * (max-min);
      const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
      const radius = ENEMY_TYPES[kind].radius;
      if (!this.infiniteWorld && !isInsideRectangularBoundary(x, z, this.boundary, radius + .2)) continue;
      if (this.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + radius + .3)) continue;
      if (this.enemies.some(e => e.active && Math.hypot(x - e.x, z - e.z) < radius + this.enemyRadius(e) + .3)) continue;
      return this.spawn(kind, x, z);
    }
    return undefined;
  }

  spawnRank(rank: 'elite' | 'boss', player: Point) {
    const boss = rank === 'boss', radius = boss ? ENCOUNTER_RULES.bossRadius : ENCOUNTER_RULES.eliteRadius;
    const point = this.spawnPosition(player, 6, 8.5, radius);
    const enemy = point ? this.spawn('tank', point.x, point.z, boss ? ENCOUNTER_RULES.bossSpawn : 1.2) : undefined;
    if (enemy) {
      enemy.rank = rank; enemy.radius = radius;
      enemy.hp = enemy.maxHp = boss
        ? ENCOUNTER_RULES.bossHp * this.endlessBossHealthMultiplier
        : ENCOUNTER_RULES.eliteHp * this.endlessEnemyHealthMultiplier;
    }
    return enemy;
  }

  /** One incoming sector per batch leaves the opposite side open at birth.
   * Finite placement attempts skip blocked members, never queue a catch-up burst. */
  spawnSwarm(player: Point, count: number, cap: number, escort: EnemyKind = 'normal',
    mix?: { fastCap: number; tankCap: number; crystalCap?: number; sporeCap?: number; crystalAllowed?: boolean; sporeAllowed?: boolean; kinds?: readonly EnemyKind[] }, perimeterHeading?: number) {
    if (!this.encounters.enabled || !Number.isFinite(count) || !Number.isFinite(cap)) return 0;
    if (perimeterHeading !== undefined && !Number.isFinite(perimeterHeading)) return 0;
    const available = Math.min(Math.floor(count), Math.floor(cap) - this.enemies.filter(e => e.active).length, COMBAT_LIMITS.enemies);
    if (available <= 0 || this.enemies.every(e => e.active)) return 0;
    const anchor = perimeterHeading === undefined
      ? this.spawnPosition(player, SWARM_RULES.minDistance, SWARM_RULES.maxDistance, ENEMY_TYPES.tank.radius)
      : this.spawnPerimeterPosition(player, ENEMY_TYPES.tank.radius, perimeterHeading);
    if (!anchor) return 0;
    const heading = Math.atan2(anchor.x-player.x, anchor.z-player.z);
    let spawned = 0;
    const alive: Partial<Record<EnemyKind, number>> = {};
    if (mix) for (const enemy of this.enemies) if (enemy.active && !enemy.rank)
      alive[enemy.kind] = (alive[enemy.kind] ?? 0) + 1;
    for (let i = 0; i < available; i++) {
      // The director can select fodder or a specific escort. Other callers retain
      // the legacy five-kind cycle and its bounded crystal fallback.
      const cycle = mix?.kinds?.length ? mix.kinds : FORMAL_MIX;
      const candidate: EnemyKind = mix ? cycle[this.spawned % cycle.length]
        : i === available - 1 ? escort : 'normal';
      const quota = candidate === 'fast' ? mix?.fastCap
        : candidate === 'tank' ? mix?.tankCap
        : candidate === 'draft-crystal-swarm' ? (mix?.crystalAllowed ? mix.crystalCap : 0)
        : candidate === 'draft-spore-bomber' ? (mix?.sporeAllowed ? mix.sporeCap : 0)
        : Infinity;
      const occupied = (alive[candidate] ?? 0);
      const eventFull = candidate === 'draft-spore-bomber' &&
        this.sporeExplosions.filter(e => e.active).length + occupied >= SPORE_BOMBER.capacity;
      const crystalRoom = mix?.crystalAllowed && (alive['draft-crystal-swarm'] ?? 0) < (mix.crystalCap ?? 0);
      const kind: EnemyKind = mix && (occupied >= (quota ?? 0) || eventFull)
        ? crystalRoom ? 'draft-crystal-swarm' : 'normal' : candidate;
      const lane = i % 3 === 1 ? -SWARM_RULES.laneAngle : i % 3 === 2 ? SWARM_RULES.laneAngle : 0;
      const point = i === 0 ? anchor : perimeterHeading === undefined
        ? this.spawnPosition(player, SWARM_RULES.minDistance, SWARM_RULES.maxDistance, ENEMY_TYPES[kind].radius, heading + lane)
        : this.spawnPerimeterPosition(player, ENEMY_TYPES[kind].radius, perimeterHeading + i * SPAWN_LAYOUT.goldenAngle);
      if (!point) continue;
      const enemy = this.spawn(kind, point.x, point.z);
      if (!enemy) break;
      if (kind === 'normal') {
        enemy.swarm = true;
        enemy.hp = enemy.maxHp = SWARM_RULES.health[this.encounters.wave-1] ?? 18;
      }
      if (mix) alive[kind] = (alive[kind] ?? 0) + 1;
      spawned++;
    }
    return spawned;
  }

  /** Bounded, deterministic off-screen placement. A blocked edge never falls back inside the view. */
  private spawnPerimeterPosition(player: Point, radius: number, heading: number) {
    const view = this.spawnViewport ?? { x: player.x, z: player.z, halfWidth: 14, halfDepth: 12 };
    if (![view.x, view.z, view.halfWidth, view.halfDepth].every(Number.isFinite) || view.halfWidth <= 0 || view.halfDepth <= 0) return undefined;
    for (let attempt = 0; attempt < 48; attempt++) {
      const angle = heading + (attempt < 12 ? (this.random() - .5) * .65 : (attempt - 12) * SPAWN_LAYOUT.goldenAngle);
      const point = perimeterPoint(view, angle, attempt < 12 ? this.random() : (attempt % 3) / 2);
      const distance = Math.hypot(point.x - player.x, point.z - player.z);
      if (distance < SPAWN_LAYOUT.minDistance || distance > SPAWN_LAYOUT.maxDistance) continue;
      if (!this.infiniteWorld && !isInsideRectangularBoundary(point.x, point.z, this.boundary, radius + .2)) continue;
      if (this.obstacles.some(o => Math.hypot(point.x-o.x,point.z-o.z) < o.radius+radius+.3)) continue;
      if (this.enemies.some(e => e.active && Math.hypot(point.x-e.x,point.z-e.z) < radius+this.enemyRadius(e)+.6)) continue;
      if (this.navigation.reachable(point, player)) return point;
    }
    return undefined;
  }

  /** A compact group is committed only when at least five safe positions exist. */
  spawnCrystalSwarm(player: Point, cap: number) {
    if (!this.encounters.enabled || !Number.isFinite(cap)) return 0;
    const free = Math.min(Math.floor(cap) - this.enemies.filter(e => e.active).length, this.enemies.filter(e => !e.active && e !== this.encounters.boss && e !== this.encounters.elite).length);
    if (free < CRYSTAL_SWARM.minGroup) return 0;
    const count = Math.min(free, CRYSTAL_SWARM.minGroup + Math.floor(Math.min(.999999, Math.max(0, this.random())) * (CRYSTAL_SWARM.maxGroup-CRYSTAL_SWARM.minGroup+1)));
    const radius = ENEMY_TYPES['draft-crystal-swarm'].radius;
    const anchor = this.spawnPosition(player, 8, 11, radius);
    if (!anchor) return 0;
    const group: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      let point: Point | undefined;
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = attempt * 2.399963 + i, distance = attempt === 0 && i === 0 ? 0 : .95 + Math.floor(attempt / 8) * .48;
        const x = anchor.x + Math.cos(angle) * distance, z = anchor.z + Math.sin(angle) * distance;
        if ((!this.infiniteWorld && !isInsideRectangularBoundary(x, z, this.boundary, radius + .2)) || Math.hypot(x-player.x, z-player.z) < 6) continue;
        if (this.obstacles.some(o => Math.hypot(x-o.x,z-o.z) < o.radius+radius+.3)) continue;
        if (this.enemies.some(e => e.active && Math.hypot(x-e.x,z-e.z) < radius+this.enemyRadius(e)+.3)) continue;
        if (!this.navigation.reachable({x,z},player)) continue;
        point = {x,z}; break;
      }
      if (!point) continue;
      const enemy = this.spawn('draft-crystal-swarm',point.x,point.z);
      if (enemy) group.push(enemy);
    }
    if (group.length < CRYSTAL_SWARM.minGroup) {
      for (const enemy of group) enemy.active = false;
      this.spawned -= group.length;
      return 0;
    }
    return group.length;
  }

  private spawnPosition(player: Point, min: number, max: number, radius: number, heading?: number): Point | undefined {
    const candidate = (angle: number, distance: number) => {
      const x = player.x + Math.sin(angle) * distance, z = player.z + Math.cos(angle) * distance;
      if (!this.infiniteWorld && !isInsideRectangularBoundary(x, z, this.boundary, radius + .2)) return;
      if (this.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + radius + .3)) return;
      if (this.enemies.some(e => e.active && Math.hypot(x - e.x, z - e.z) < radius + this.enemyRadius(e) + .3)) return;
      const point = { x, z };
      return this.navigation.reachable(point, player) ? point : undefined;
    };
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = heading === undefined ? this.random() * Math.PI * 2 : heading + (this.random()*2-1)*SWARM_RULES.halfAngle;
      const point = candidate(angle, min + this.random() * (max - min));
      if (point) return point;
    }
    // Bounded deterministic fallback avoids losing a wave beside water or edges.
    for (const distance of [(min + max) / 2, min, max]) for (let i = 0; i < 24; i++) {
      const angle = heading === undefined ? i * Math.PI / 12 + this.spawned * 2.399963 : heading + (i/23*2-1)*SWARM_RULES.halfAngle;
      const point = candidate(angle, distance);
      if (point) return point;
    }
    return undefined;
  }

  findTarget(player: Point, range = WEAPON.range * this.stats.rangeMultiplier, includeBodyRadius = false): Enemy | undefined {
    let nearest: Enemy | undefined, best = Infinity;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0) continue;
      const squared = (enemy.x - player.x) ** 2 + (enemy.z - player.z) ** 2;
      if (squared >= best || squared >= (range + (includeBodyRadius ? this.enemyRadius(enemy) : 0)) ** 2) continue;
      // Trunks and rocks are cover; select the nearest enemy with a clear shot.
      if (this.obstacles.some((obstacle) => segmentHit(player.x, player.z, enemy.x, enemy.z, obstacle.x, obstacle.z, obstacle.radius + WEAPON.radius) !== Infinity)) continue;
      nearest = enemy;
      best = squared;
    }
    return nearest;
  }

  update(dt: number, player: Point, dash?: DashStep) {
    this.soundEvents = 0;
    if (this.hp <= 0 || dt <= 0) return;
    // A final kill wins before an unused upgrade. Only the death presentation
    // clock advances; queued XP is settled by RunFlow at the victory boundary.
    if (this.encounters.dying) { this.encounters.beforeTick(dt); return; }
    if (this.progression.awaitingChoice) return;
    this.tick++;
    if (this.infiniteWorld) {
      // Reclaim far-off objects without kill credit; a moving player never fills the pool.
      for (const enemy of this.enemies) if (enemy.active && (enemy.x-player.x)**2 + (enemy.z-player.z)**2 > 46**2) enemy.active = false;
      for (const orb of this.orbs) if (orb.active && (orb.x-player.x)**2 + (orb.z-player.z)**2 > 48**2) orb.active = false;
    }
    if (this.encounters.enabled) this.encounters.beforeTick(dt);
    this.childrenThisTick = 0;
    this.childWindow += dt;
    if (this.childWindow >= 1) { this.childWindow %= 1; this.childrenInWindow = 0; }
    if (this.isTrial && dash?.active && dash.started) this.dashSerial++;
    this.previousAnchorX = this.anchorInitialized ? this.anchorX : player.x;
    this.previousAnchorZ = this.anchorInitialized ? this.anchorZ : player.z;
    this.anchorX = player.x;
    this.anchorZ = player.z;
    const vx=Math.max(-8,Math.min(8,(this.anchorX-this.previousAnchorX)/dt)), vz=Math.max(-8,Math.min(8,(this.anchorZ-this.previousAnchorZ)/dt));
    const turn=Math.hypot(vx,vz)>.2&&Math.hypot(this.playerVelocityX,this.playerVelocityZ)>.2 ? Math.atan2(this.playerVelocityX*vz-this.playerVelocityZ*vx,this.playerVelocityX*vx+this.playerVelocityZ*vz)/dt : 0;
    this.playerTurnRate+=(Math.max(-1.5,Math.min(1.5,turn))-this.playerTurnRate)*(1-Math.exp(-12*dt));
    this.playerVelocityX=vx; this.playerVelocityZ=vz;
    this.anchorInitialized = true;
    this.elapsed += dt;
    if(dash?.active&&dash.started)this.relicBehaviors.gigapack.dash(dash.fromX,dash.fromZ);
    if (this.melee.active) { this.melee.age += dt; if (this.melee.age >= FLAME_SWEEP.duration) this.melee.active = false; }
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.automaticSpawning && !this.isChallenge) this.spawnClock -= dt;
    if (this.automaticSpawning && !this.isChallenge && this.spawnClock <= 0) {
      this.spawnNear(player);
      this.spawnClock += Math.max(0.5, 1.3 - this.elapsed * 0.006);
    }
    for (const effect of this.effects) {
      if (effect.active) { effect.time -= dt; effect.active = effect.time > 0; }
    }
    this.updateBurns(dt);
    this.relicBehaviors.update(dt);
    if (this.encounters.dying) return;
    for (const reward of this.treasureRewards) if (reward.active) {
      reward.age += dt; reward.active = reward.age < TREASURE_RUNNER.rewardDuration;
    }
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.previousX = enemy.x;
      enemy.previousZ = enemy.z;
      enemy.slowTime = Math.max(0, (enemy.slowTime ?? 0) - dt);
      enemy.wetTime = Math.max(0, (enemy.wetTime ?? 0) - dt);
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.orbitCooldown = Math.max(0, enemy.orbitCooldown - dt);
      if (!enemy.rank && Math.hypot(enemy.x - player.x, enemy.z - player.z) > 29) {
        enemy.active = false;
        if (enemy.kind === 'draft-treasure-runner') this.treasureEscapes++;
        continue;
      }
      if (enemy.spawnTime > 0) { enemy.spawnTime = Math.max(0, enemy.spawnTime - dt); continue; }
      const runner = enemy.kind === 'draft-treasure-runner';
      if (runner) {
        enemy.specialTime = (enemy.specialTime ?? 0) + dt;
        if (enemy.specialTime >= TREASURE_RUNNER.lifetime) { enemy.active = false; this.treasureEscapes++; continue; }
      }
      const type = ENEMY_TYPES[enemy.kind], radius = this.enemyRadius(enemy);
      const dx = player.x - enemy.x, dz = player.z - enemy.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      let steerX = dx / length, steerZ = dz / length;
      let goal: Point = player;
      if (runner) {
        // Flee away from the player through the same obstacle-safe navigation.
        steerX = length > .01 ? -dx / length : Math.sin(enemy.id * 2.399963);
        steerZ = length > .01 ? -dz / length : Math.cos(enemy.id * 2.399963);
        this.fleeGoal.x = enemy.x + steerX * 5; this.fleeGoal.z = enemy.z + steerZ * 5;
        if (!this.infiniteWorld) clampToRectangularBoundary(this.fleeGoal, this.boundary, radius + .2);
        goal = this.fleeGoal;
      }
      const guided = this.useNavigation && this.navigation.guide(enemy, goal, radius, this.navigationGoal);
      if (guided) {
        const gx = this.navigationGoal.x - enemy.x, gz = this.navigationGoal.z - enemy.z;
        const distance = Math.max(.001, Math.hypot(gx, gz));
        steerX = gx / distance; steerZ = gz / distance;
      }
      for (const other of this.enemies) {
        if (!other.active || other === enemy || other.spawnTime > 0) continue;
        const ox = enemy.x - other.x, oz = enemy.z - other.z;
        const distance = Math.hypot(ox, oz), avoid = radius + this.enemyRadius(other);
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
        const distance = Math.hypot(ox, oz), avoid = obstacle.radius + radius + 0.7;
        if (distance < avoid && distance > 0.001) {
          const strength = (avoid - distance) / avoid * 2.4;
          const side = enemy.id % 2 ? 1 : -1;
          steerX += (ox - oz * side * 0.8) / distance * strength;
          steerZ += (oz + ox * side * 0.8) / distance * strength;
        }
      }
      const steeringLength = Math.max(1, Math.hypot(steerX, steerZ));
      const desiredX = steerX / steeringLength, desiredZ = steerZ / steeringLength;
      // The ordinary rock troop has weight: it turns in a wide arc rather than
      // snapping toward the player like a red blob. Ranked elite/Boss unchanged.
      const steeringResponse = this.encounters.enabled && enemy.kind === 'tank' && !enemy.rank
        ? ROCK_MARCH.turnResponse : 14;
      const smoothing = 1 - Math.exp(-steeringResponse * dt);
      enemy.steerX = (enemy.steerX ?? desiredX) + (desiredX - (enemy.steerX ?? desiredX)) * smoothing;
      enemy.steerZ = (enemy.steerZ ?? desiredZ) + (desiredZ - (enemy.steerZ ?? desiredZ)) * smoothing;
      const smoothLength = Math.max(1, Math.hypot(enemy.steerX, enemy.steerZ));
      let moveX = enemy.steerX / smoothLength * type.speed, moveZ = enemy.steerZ / smoothLength * type.speed;
      if (runner && (enemy.specialTime ?? 0) < TREASURE_RUNNER.linger) moveX = moveZ = 0;
      if (this.hasAttackIntents && !enemy.rank && !runner) {
        enemy.stagger = Math.max(0, enemy.stagger - dt);
        if (enemy.stagger > 0) { moveX = moveZ = 0; }
        else if (enemy.kind === 'fast') {
          const rule = this.encounters.enabled ? FORMAL_POUNCE : POUNCE;
          if (!this.encounters.enabled || enemy.intent !== 'chase' || !this.covered(enemy.x,enemy.z,player.x,player.z)) this.updatePounce(enemy, dt, dx, dz, length, rule);
          if (enemy.intent === 'pounce') { moveX = enemy.aimX * rule.speed; moveZ = enemy.aimZ * rule.speed; }
          else if (this.encounters.enabled && enemy.intent === 'recover') {
            // Disengage after a missed leap; players can punish the recovery.
            moveX = -dx / length * type.speed * .55; moveZ = -dz / length * type.speed * .55;
          } else if (enemy.intent !== 'chase') { moveX = moveZ = 0; }
          else if (this.encounters.enabled && length > 2.2 && length < 8 && enemy.intentCooldown > 0) {
            // Alternate flanking sides per enemy; lock-on/charge remains fully telegraphed.
            const side = enemy.id % 2 ? 1 : -1;
            moveX = (moveX - steerZ * type.speed * .72 * side) * .8;
            moveZ = (moveZ + steerX * type.speed * .72 * side) * .8;
          }
        }
        else if (this.encounters.enabled && enemy.kind === 'normal') {
          this.updateRedBash(enemy,dt,dx,dz,length);
          if (enemy.intent !== 'chase') moveX = moveZ = 0;
          else {
            stepGrassRoll(enemy,dt,enemy.steerX,enemy.steerZ,type.speed,this.grassMotion);
            moveX=this.grassMotion.x; moveZ=this.grassMotion.z;
          }
        } else if (this.encounters.enabled && enemy.kind === 'tank') {
          // No windup/pounce/recover: a heavy, continuously moving body-blocker,
          // distinct from red's stationary circle and sprinter's directional dash.
          enemy.intent = 'chase';
          enemy.intentTime = enemy.intentCooldown = 0;
        } else if (this.encounters.enabled) {
          this.updateMelee(enemy,dt,dx,dz,length);
          if (enemy.intent !== 'chase') moveX = moveZ = 0;
          else if (enemy.kind === 'draft-crystal-swarm') {
            // Crystal bugs zigzag instead of the red blob's stop-and-bash.
            const phase = enemy.id * 2.399963 + this.elapsed * 4.2;
            const sway = Math.sin(phase) * .65 * type.speed;
            moveX += -dz / length * sway;
            moveZ += dx / length * sway;
          }
        }
      }
      if (this.encounters.enabled && enemy.rank) {
        const motion = this.encounters.movement(enemy,dt,player,this,moveX,moveZ); moveX=motion.x; moveZ=motion.z;
      }
      const bindingSlow=Math.min(this.relicBehaviors.slowFactor(enemy),(enemy.pairSlowUntil??0)>this.elapsed?enemy.rank==='boss'?Math.max(.85,enemy.pairSlowFactor??1):enemy.pairSlowFactor??1:1);moveX*=bindingSlow;moveZ*=bindingSlow;
      if ((enemy.slowTime ?? 0) > 0) { const slow = enemy.rank === 'boss' ? .85 : ELEMENTAL_RULES.slowFactor; moveX *= slow; moveZ *= slow; }
      // Resolve voluntary locomotion before external impulses. Art follows the
      // collision-resolved walk (including cover sliding), never hit knockback.
      this.moveEnemy(enemy, moveX * dt, moveZ * dt, radius);
      enemy.walkX = enemy.x - enemy.previousX;
      enemy.walkZ = enemy.z - enemy.previousZ;
      this.moveEnemy(enemy, enemy.knockX * dt, enemy.knockZ * dt, radius);
      const decay = Math.exp(-14 * dt);
      enemy.knockX *= decay;
      enemy.knockZ *= decay;
      enemy.facing = this.hasAttackIntents && (enemy.intent === 'windup' || enemy.intent === 'pounce') ? Math.atan2(enemy.aimX, enemy.aimZ) : Math.atan2(dx, dz);
      if (!this.infiniteWorld) clampToRectangularBoundary(enemy, this.boundary, radius);
      const travelled = Math.hypot(enemy.walkX, enemy.walkZ);
      if(this.encounters.enabled && enemy.kind==='normal' && !enemy.rank && enemy.intent==='chase')
        enemy.grassRollDistance=(enemy.grassRollDistance ?? 0)+travelled;
      const moving = Math.min(1, travelled / Math.max(.001, type.speed * dt));
      enemy.walkAmount = (enemy.walkAmount ?? 0) + (moving - (enemy.walkAmount ?? 0)) * (1 - Math.exp(-12 * dt));
      enemy.walkPhase = ((enemy.walkPhase ?? 0) + travelled * ENEMY_MOTION[enemy.kind].cadence) % (Math.PI * 2);
    }

    if (this.isTrial && dash?.active && this.dashSerial > 0) this.resolveHorn(player, dash);
    if (this.usesRunBuild && this.party) {
      const member = this.party.leader, attacks = this.runBuild.attacks;
      const boostedTime = Math.max(0, Math.min(dt, this.hourglassUntil - (this.elapsed-dt)));
      const bloodTempo=1/(this.relicBehaviors.intervalFactor()*this.relicBehaviors.gigapack.intervalFactor());
      const attackTime = (dt + boostedTime * TRIGGER_RELIC_RULES.hourglass.haste)*bloodTempo;
      for (const attack of attacks) attack.cooldown = Math.max(0, attack.cooldown - attackTime);
      // Independent melee cooldown: a full bolt pool or an ongoing salvo cannot suppress a sweep.
      for (const attack of attacks) {
        if (ATTACKS[attack.attackId].kind !== 'melee_arc') continue;
        const rules = this.runBuild.rules(attack.attackId);
        const growth = flameSweepStats(attack.level, this.stats.rangeMultiplier * rules.rangeMultiplier, rules.areaMultiplier);
        if (this.encounters.dying || attack.cooldown > 1e-8) continue;
        const snapshot: WeaponSnapshot = { attackId: 'flame-sweep', damage: FLAME_SWEEP.damage*this.stats.damageMultiplier*rules.damageMultiplier,
          range: growth.radius, rules, fusions: [], sweep: growth, mature: matureFire(attack.attackId, attack.level, this.progression.ranks) };
        if (!this.performSweep(member, snapshot)) continue;
        this.recordWeaponCast(snapshot);
        attack.cooldown = growth.interval*rules.intervalMultiplier/this.stats.attackRateMultiplier;
        attack.cooldownTotal = attack.cooldown; attack.shotsFired++;
      }
      member.targetId = this.findTarget(member, ATTACKS[attacks[0].attackId].range * this.stats.rangeMultiplier * this.runBuild.rules(attacks[0].attackId).rangeMultiplier)?.id ?? 0;
      this.targetId = member.targetId;
      this.launchClock = Math.max(0, this.launchClock - dt);
      if (this.launchClock <= 1e-8) {
        if (!this.salvo) {
          for (let offset = 0; offset < attacks.length; offset++) {
            const index = (this.nextWeapon + offset) % attacks.length, attack = attacks[index];
            const weapon = ATTACKS[attack.attackId], rules = this.runBuild.rules(attack.attackId);
            if (weapon.kind !== 'projectile') continue;
            const range = weapon.range * this.stats.rangeMultiplier * rules.rangeMultiplier;
            if (attack.cooldown > 1e-8 || !this.findTarget(member, range)) continue;
            const free = this.projectiles.filter(s => !s.active).length;
            if (free < this.stats.projectileCount + (attack.slot ? this.stats.projectileCount : 0)) {
              this.balanceTelemetry.projectileBlockedAttempts++;
              continue;
            }
            this.salvo = { attackId: attack.attackId, sourceId: member.id, species: member.species,
              damage: weapon.damage * this.stats.damageMultiplier * rules.damageMultiplier, range,
              total: Math.min(4, this.stats.projectileCount), index: 0, castId:++this.nextRelicCast, rules, mature: matureFire(attack.attackId, attack.level, this.progression.ranks),
              fusions: attack.pairId?[]:resolveFusions(attack.attackId, this.progression.ranks).map(recipe => recipe.id) };
            attack.cooldown = weapon.interval * (attack.slot === 0 ? 1 : attack.slot === 1 ? 1.6 : 1.9) * rules.intervalMultiplier / this.stats.attackRateMultiplier;
            attack.cooldownTotal = attack.cooldown;
            this.nextWeapon = (index + 1) % attacks.length;
            break;
          }
        }
        const salvo = this.salvo;
        if (salvo) {
          const target = this.findTarget(member, salvo.range);
          if (!target) { this.salvo = undefined; this.launchClock = COMBAT_CLARITY.volleyGap / this.stats.attackRateMultiplier; }
          else if (this.fireBolts(member, target, salvo.damage, 1, salvo.range, salvo.sourceId, salvo.species, salvo.attackId, salvo)) {
            attacks.find(a => a.attackId === salvo.attackId)!.shotsFired++;
            if (salvo.index === 0) this.recordWeaponCast({ attackId: salvo.attackId, damage: salvo.damage, range: salvo.range, rules: salvo.rules, fusions: [...salvo.fusions], mature: salvo.mature });
            member.shotsFired++; salvo.index++;
            const tempo = this.stats.attackRateMultiplier * (this.elapsed < this.hourglassUntil ? 1 + TRIGGER_RELIC_RULES.hourglass.haste : 1);
            if (salvo.index >= salvo.total) { this.salvo = undefined; this.launchClock = COMBAT_CLARITY.volleyGap / tempo; }
            else this.launchClock = COMBAT_CLARITY.shotGap / tempo;
          }
        }
      }
    } else if (this.party) {
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
      this.relicBehaviors.prepare(shot,dt);
      if(!shot.active)continue;
      shot.age = (shot.age ?? 0) + dt;
      shot.previousX = shot.x;
      shot.previousZ = shot.z;
      if (shot.elemental && shot.hopTargetId) { this.advanceHop(shot, dt); continue; }
      if (shot.homing) this.steerChild(shot, dt);
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
        if (!enemy.active || enemy.spawnTime > 0 || enemy.id === shot.ignoreEnemyId || (shot.hitIds??[]).includes(enemy.id)) continue;
        const t = segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, this.enemyRadius(enemy) + WEAPON.radius);
        if (t < earliest) { earliest = t; victim = enemy; }
      }
      if (earliest !== Infinity) {
        shot.active = false;
        const x = shot.previousX + (shot.x - shot.previousX) * earliest, z = shot.previousZ + (shot.z - shot.previousZ) * earliest;
        this.effect(x, z, 'hit', 'normal', 0, undefined, undefined, shot.attackRules?.impactVfx);
        if (victim) {
          this.damageEnemy(victim, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed, 'player', this.projectileSource(shot));
          (shot.hitIds??=[]).push(victim.id);
          this.relicBehaviors.projectileHit(shot,victim,x,z);
          if((shot.pierces??0)>0){shot.pierces!--;shot.active=true;}
          if (shot.burst && ((shot.generation ?? 0) < BURST_SEED.maxGeneration || shot.relicSource?.copied)) this.burstSeed(shot, victim, x, z);
        }
      } else if (shot.life <= 0) shot.active = false;
    }

    this.balanceTelemetry.queuePeak = Math.max(this.balanceTelemetry.queuePeak, this.relicEvents.length);
    this.drainRelicEvents();
    this.updateEchoes();
    this.updateSkills(dt, player);
    if (!this.encounters.dying) this.updateSporeExplosions(player);
    if (this.encounters.enabled) this.encounters.advanceHazards(dt,this,player,{x:this.previousAnchorX,z:this.previousAnchorZ});
    // Resolve hits after magic: an enemy killed on this tick cannot bite.
    if (this.invulnerability === 0) {
      let damage = 0;
      let contactDamage = 0;
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.spawnTime > 0) continue;
        // Body contact is independent of special attack state, with relative
        // sweeps to catch player dashes/crossings between sampled positions.
        if (this.encounters.enabled && enemy.kind !== 'draft-treasure-runner') {
          const bodyRadius = this.enemyRadius(enemy)+(enemy.kind==='tank' && !enemy.rank ? ROCK_MARCH.contactPadding : PLAYER_FEEDBACK.bodyPadding);
          const contact = segmentHit(enemy.previousX-this.previousAnchorX,enemy.previousZ-this.previousAnchorZ,
            enemy.x-player.x,enemy.z-player.z,0,0,bodyRadius);
          if(contact!==Infinity && !this.covered(enemy.x,enemy.z,player.x,player.z))
            contactDamage=Math.max(contactDamage,this.scaledContactDamage(enemy));
        }
        if (this.hasAttackIntents && (enemy.stagger > 0 || enemy.intent === 'windup' || enemy.intent === 'recover')) continue;
        if (this.encounters.enabled && (enemy.rank === 'elite' || enemy.rank === 'boss' && this.encounters.bossState !== 'dash'
          || !enemy.rank && enemy.kind !== 'tank' && enemy.intent !== 'pounce')) continue;
        // Relative sweep catches a fast pounce crossing the player between ticks.
        const pounceHit = this.hasAttackIntents && (enemy.intent === 'pounce' || enemy.rank === 'boss') && segmentHit(enemy.previousX - this.previousAnchorX, enemy.previousZ - this.previousAnchorZ, enemy.x - player.x, enemy.z - player.z, 0, 0, this.enemyRadius(enemy) + 0.62) !== Infinity;
        const radius = this.encounters.enabled && !enemy.rank && enemy.kind === 'normal'
          ? RED_BLOB_BASH.radius
          : this.encounters.enabled && !enemy.rank && enemy.kind === 'tank'
            ? this.enemyRadius(enemy) + ROCK_MARCH.contactPadding
            : this.enemyRadius(enemy) + 0.62;
        // Red blobs hit inside a stationary warning ring. Rocks require actual
        // close body contact; sprinters/Boss retain swept movement-based hits.
        const grass = enemy.kind === 'normal' && this.encounters.enabled && !enemy.rank;
        const ax = grass ? enemy.grassAttackX ?? enemy.x : enemy.x, az = grass ? enemy.grassAttackZ ?? enemy.z : enemy.z;
        const hit = grass ? !enemy.grassHit && Math.hypot(ax-player.x,az-player.z) < radius
          : pounceHit || Math.hypot(enemy.x-player.x,enemy.z-player.z) < radius;
        if (hit && (!this.encounters.enabled || !this.covered(ax,az,player.x,player.z))) {
          if (grass) enemy.grassHit = true;
          damage = Math.max(damage, this.scaledContactDamage(enemy));
        }
      }
      if (Math.max(damage,contactDamage) > 0) {
        this.hitPlayer(Math.max(damage,contactDamage),damage>=contactDamage ? PLAYER_FEEDBACK.attackProtection : PLAYER_FEEDBACK.contactProtection);
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

  hitPlayer(damage: number, protection: number = PLAYER_FEEDBACK.attackProtection) {
    if (this.hp <= 0 || this.invulnerability > 0 || !Number.isFinite(damage) || damage<=0) return;
    if(this.relicBehaviors.gigapack.incoming()){this.invulnerability=protection;return;}
    damage=this.relicBehaviors.gigapack.mitigateDamage(damage);
    this.hp = Math.max(0,this.hp-damage); this.invulnerability=protection; this.hurtFlash=PLAYER_FEEDBACK.hurtDuration;
    this.relicBehaviors.gigapack.afterDamage();
    if(this.hp<=0){
      this.relicBehaviors.gigapack.clearTransient();
      this.salvo=undefined;
      for(const p of this.projectiles)if(p.attackRules?.pairId)p.active=false;
      for(const e of this.enemies){e.pairBurnTime=e.pairBurnClock=e.pairSlowUntil=0;e.pairBurnSource=undefined;}
    }
    this.balanceTelemetry.damageEvents++;
    this.effect(this.anchorX,this.anchorZ,'hurt');
  }
  hostileWallHit(ax: number, az: number, bx: number, bz: number, radius: number) {
    return this.obstacles.reduce((t,o)=>Math.min(t,segmentHit(ax,az,bx,bz,o.x,o.z,o.radius+radius)),Infinity);
  }
  hostilePlayerHit(ax: number, az: number, bx: number, bz: number, radius: number) { return segmentHit(ax,az,bx,bz,0,0,radius); }

  /** Shared pool + swept collision + damageEnemy for every controlled/partner bolt. */
  private fireBolts(origin: Point, target: Enemy, damage: number, count: number, range: number, sourceId = 0, species?: SpeciesId, attackId: BaseAttackId = CREATURES[species ?? 'yanrong'].skill, salvo?: { index: number; castId?:number; volley?:{id:number;showerTriggered?:boolean}; rules: AttackRules; fusions: FusionId[]; copied?: boolean; mature?: boolean; suppressRelics?:boolean }) {
    if (ATTACKS[attackId].kind !== 'projectile') return false;
    let available = 0;
    for (const shot of this.projectiles) if (!shot.active) available++;
    if (available < count) return false;
    const x = target.x - origin.x, z = target.z - origin.z, length = Math.max(0.001, Math.hypot(x, z));
    // All compatible recipes belong to the same volley and share its hit ledger.
    const recipes = this.fusionEnabled && !salvo?.rules.pairId ? resolveFusions(attackId, this.progression.ranks) : [];
    const fusionIds: FusionId[] = salvo?.fusions ?? recipes.map(recipe => recipe.id);
    const rules = salvo?.rules ?? (this.usesRunBuild ? this.runBuild.rules(attackId) : resolveAttackRules(attackId, [], 1));
    const castId=salvo?.castId??++this.nextRelicCast;
    const volley=salvo?(salvo.volley??={id:castId}):{id:castId};
    for (let i = 0; i < count; i++) {
      const shot = this.projectiles.find(candidate => !candidate.active)!;
      // Retain a center shot even for an even number of fan projectiles.
      const sequence = salvo?.index ?? i;
      const spread = sequence === 0 ? 0 : Math.ceil(sequence / 2) * (sequence % 2 ? 1 : -1) * 0.11;
      const angle = Math.atan2(x / length, z / length) + spread;
      Object.assign(shot, { active: true, x: origin.x, z: origin.z, previousX: origin.x, previousZ: origin.z, vx: Math.sin(angle) * WEAPON.speed, vz: Math.cos(angle) * WEAPON.speed, relicSource: { ...this.newRelicSource(attackId, rules, damage * rules.directMultiplier, salvo?.mature), copied: salvo?.copied, suppressRelics:salvo?.suppressRelics, castId,volley }, distance: 0, life: Math.max(WEAPON.lifetime, range / WEAPON.speed + 0.12), damage: damage * rules.directMultiplier, baseDamage: damage, sourceId, species, attackId, flightRange:range,vfxPresetId:undefined,attackRules: rules, homing: false, generation: salvo?.copied ? 1 : 0, bornTick: this.tick, ignoreEnemyId: 0, burst: fusionIds.includes('burst-seed') && attackId === 'spark', age: 0, elemental: this.fusionEnabled && (attackId === 'bubble' || attackId === 'leaf'), fusionIds, hitIds: [], damageIds: [], hopTargetId: 0, hopDelay: 0, hopElapsed: 0, hopDuration: 0, pierces: this.fusionEnabled && attackId === 'leaf' && !fusionIds.includes('jump-thorn') ? ELEMENTAL_RULES.leafPierces + rules.pierceBonus : 0, bounces: fusionIds.includes('chain-bubble') ? CHAIN_BUBBLE.maxHops : fusionIds.includes('jump-thorn') ? JUMP_THORN.maxHops : 0, scatter: fusionIds.includes('thorn-scatter') });
      shot.returning=false;shot.outboundSpent=false;shot.chargedPierceSource=undefined;shot.behaviorRoot=undefined;
      if(rules.pairId){const recipe=WEAPON_PAIR_RECIPES[rules.pairId];shot.burst=false;shot.elemental=true;shot.fusionIds=[];shot.scatter=false;shot.pierces=recipe.chain&&rules.pairChain?0:recipe.pierces;shot.bounces=recipe.chain&&rules.pairChain?2:0;}
      this.relicBehaviors.gigapack.projectileEmitted(shot.relicSource!);
      this.shotsFired++;
    }
    return true;
  }

  /** Instant one-pass AoE. Children share the 24-slot pool and start next tick. */
  private burstSeed(parent: Projectile, original: Enemy, x: number, z: number) {
    const damage = parent.baseDamage ?? parent.damage, angle = Math.atan2(parent.vx, parent.vz), sourceId = parent.sourceId;
    const rules = parent.attackRules ?? resolveAttackRules('spark', [], 1), species = parent.species;
    const radius = BURST_SEED.explosionRadius * rules.areaMultiplier * this.consumeKindling(original);
    const relicSource = { ...this.projectileSource(parent), kind: 'explosion' as const };
    const childCount = BURST_SEED.childCount + rules.childCountBonus;
    this.bursts++;
    this.effect(x, z, 'burst', original.kind, radius, undefined, undefined, rules.impactVfx);
    let explosionHits=0;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.id === original.id) continue;
      const dx = enemy.x - x, dz = enemy.z - z, distance = Math.hypot(dx, dz);
      if (distance > radius + this.enemyRadius(enemy)) continue;
      explosionHits++;
      this.damageEnemy(enemy, damage * BURST_SEED.explosionDamage, dx / Math.max(.001, distance), dz / Math.max(.001, distance), 'player', relicSource);
    }
    if((parent.generation??0)===0)this.relicBehaviors.gigapack.explosion(x,z,explosionHits,damage,relicSource);
    // Cache parent data before its just-freed slot can be reused by a child.
    for (let i = 0; i < childCount; i++) {
      const child = this.projectiles.find(shot => !shot.active);
      if (!child || !this.reserveChild()) break;
      const direction = angle + (i - (childCount - 1) / 2) * 2 * BURST_SEED.childAngle / Math.max(1, childCount - 1);
      Object.assign(child, { active: true, x, z, previousX: x, previousZ: z, vx: Math.sin(direction) * WEAPON.speed, vz: Math.cos(direction) * WEAPON.speed,
        life: BURST_SEED.childLifetime, damage: damage * BURST_SEED.childDamage * rules.childDamageMultiplier * rules.directMultiplier, baseDamage: damage * BURST_SEED.childDamage * rules.childDamageMultiplier, attackRules: rules, homing: rules.childHoming, distance: 0, sourceId, species, attackId: 'spark', relicSource: { ...relicSource, kind: 'hit', primary:false }, generation: BURST_SEED.maxGeneration,
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

  /** A bounded trigger budget; children never crowd out an entire main volley. */
  private reserveChild() {
    let free = 0;
    for (const shot of this.projectiles) if (!shot.active) free++;
    if (this.childrenThisTick >= 6 || this.childrenInWindow >= 24 || (this.usesRunBuild && this.runBuild.attacks.length > 1 && free <= this.stats.projectileCount)) { this.balanceTelemetry.derivedDenied++; return false; }
    this.childrenThisTick++; this.childrenInWindow++;
    return true;
  }

  private steerChild(shot: Projectile, dt: number) {
    let target: Enemy | undefined, nearest = 4;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.id === shot.ignoreEnemyId || shot.hitIds?.includes(enemy.id)) continue;
      const distance = Math.hypot(enemy.x - shot.x, enemy.z - shot.z);
      if (distance < nearest && !this.covered(shot.x, shot.z, enemy.x, enemy.z)) { nearest = distance; target = enemy; }
    }
    if (!target) return;
    const current = Math.atan2(shot.vx, shot.vz), desired = Math.atan2(target.x - shot.x, target.z - shot.z);
    const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    const angle = current + Math.max(-2.5 * dt, Math.min(2.5 * dt, delta)), speed = Math.hypot(shot.vx, shot.vz);
    shot.vx = Math.sin(angle) * speed; shot.vz = Math.cos(angle) * speed;
  }

  private chainRange(shot: Projectile) { return this.chainRule(shot).range * (shot.attackRules?.chainRangeMultiplier ?? 1); }

  private chainRule(shot: Projectile) {
    return shot.attackId === 'bubble' ? CHAIN_BUBBLE : JUMP_THORN;
  }

  clearWave() {
    this.clearTransientEffects(true);
    for (const enemy of this.enemies) enemy.active = false;
    for (const orb of this.orbs) orb.active = false;
    this.targetId = this.hurtFlash = this.invulnerability = 0;
    if (this.party) for (const member of this.party.members) member.targetId = 0;
    this.encounters.reset();
  }

  clearTransientEffects(preserveRunRelics=false) {
    this.relicBehaviors.reset(preserveRunRelics);
    this.soundEvents = 0;
    this.clearSpecialEvents();
    this.relicEvents = [];
    this.pendingEchoes = []; this.previousWeapon = undefined; this.weaponCastCount = 0;
    this.recentRelicKills = []; this.hourglassUntil = this.hourglassReadyAt = this.bubbleReadyAt = 0;
    for (const enemy of this.enemies) { enemy.pairSlowUntil=enemy.pairBurnTime=enemy.pairBurnClock=0;enemy.pairBurnSource=undefined;enemy.wetTime = enemy.steamReadyAt = 0; enemy.vineUntil=enemy.vineReadyAt=0; enemy.venomUntil=enemy.venomReady=enemy.smokeUntil=0; enemy.burnTime = enemy.burnClock = enemy.burnStacks = 0; enemy.burnSource = undefined; }
    this.melee.active = false;
    this.encounters.clearShots();
    this.salvo = undefined; this.launchClock = 0;
    for (const shot of this.projectiles) { shot.active = false; shot.hitIds = []; shot.damageIds = []; shot.hopTargetId = 0; shot.hopDelay = shot.hopElapsed = 0; shot.fusionIds = []; }
    for (const effect of this.effects) { effect.active = false; effect.fusionId = undefined; }
    for (const wave of this.shockwaves) wave.active = false;
  }

  clearSpecialEvents() {
    for (const explosion of this.sporeExplosions) explosion.active = false;
    for (const reward of this.treasureRewards) reward.active = false;
  }

  private updateSporeExplosions(player: Point) {
    for (const explosion of this.sporeExplosions) {
      if (!explosion.active) continue;
      explosion.age = this.elapsed - explosion.createdAt;
      if (explosion.age + 1e-8 >= SPORE_BOMBER.warning && !explosion.detonated) {
        explosion.detonated = true; // Mark before damage can schedule another death.
        this.soundEvents |= SKILL_SOUNDS.burst;
        const {x,z} = explosion;
        if (Math.hypot(player.x-x,player.z-z) <= SPORE_BOMBER.radius+.62 && !this.covered(x,z,player.x,player.z)) this.hitPlayer(SPORE_BOMBER.playerDamage);
        for (const enemy of this.enemies) {
          if (!enemy.active || enemy.spawnTime > 0) continue;
          const dx = enemy.x-x, dz = enemy.z-z, distance = Math.hypot(dx,dz);
          if (distance > SPORE_BOMBER.radius+this.enemyRadius(enemy) || this.covered(x,z,enemy.x,enemy.z)) continue;
          this.damageEnemy(enemy,SPORE_BOMBER.enemyDamage * (enemy.kind === 'draft-spore-bomber' ? SPORE_BOMBER.chainMultiplier : 1),dx/Math.max(.001,distance),dz/Math.max(.001,distance),'spore');
          if (this.encounters.dying) return;
        }
      }
      if (explosion.age >= SPORE_BOMBER.warning+SPORE_BOMBER.burst) explosion.active = false;
    }
  }

  private nextHop(shot: Projectile, x: number, z: number) {
    return this.enemies.filter(e => e.active && e.spawnTime <= 0 && e.hp > 0 && !shot.damageIds?.includes(e.id)
      && Math.hypot(e.x-x,e.z-z) <= this.chainRange(shot) && !this.covered(x,z,e.x,e.z))
      .sort((a,b) => Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z) || a.id-b.id)[0];
  }

  covered(x: number, z: number, tx: number, tz: number) {
    return this.obstacles.some(o => segmentHit(x,z,tx,tz,o.x,o.z,o.radius+WEAPON.radius) !== Infinity);
  }

  private beginHop(shot: Projectile, target: Enemy) {
    const rule = this.chainRule(shot);
    shot.bounces = (shot.bounces ?? 0) - 1;
    shot.pierces = 0;
    const hop = rule.maxHops - shot.bounces;
    shot.damage = (shot.baseDamage ?? shot.damage) * rule.hopDamage * (shot.attackRules?.chainDecay ?? 1) ** hop * (shot.attackRules?.directMultiplier ?? 1);
    shot.hopTargetId = target.id; shot.hopDelay = rule.delay;
    shot.hopElapsed = 0; shot.hopDuration = rule.hopDuration;
    shot.hopFromX = shot.x; shot.hopFromZ = shot.z;
  }

  private advanceHop(shot: Projectile, dt: number) {
    let target = this.enemies.find(e => e.active && e.id === shot.hopTargetId && e.hp > 0 && e.spawnTime <= 0 && !shot.damageIds?.includes(e.id));
    if (!target || Math.hypot(target.x-shot.hopFromX!,target.z-shot.hopFromZ!) > this.chainRange(shot) || this.covered(shot.x,shot.z,target.x,target.z)) {
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
    if(shot.outboundSpent){ if(shot.life<=0&&!this.relicBehaviors.preserveLeaf(shot))shot.active=false; return; }
    const ids = shot.hitIds ?? (shot.hitIds = []);
    const damaged = shot.damageIds ?? (shot.damageIds = []);
    const chain = !!(shot.attackRules?.pairId&&WEAPON_PAIR_RECIPES[shot.attackRules.pairId].chain&&shot.attackRules.pairChain)||shot.fusionIds?.includes('chain-bubble') || shot.fusionIds?.includes('jump-thorn') || shot.relicSource?.kind === 'bubble-spore';
    const wall = this.obstacles.reduce((t, o) => Math.min(t, segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, o.x, o.z, o.radius + WEAPON.radius)), Infinity);
    const contacts = this.enemies.filter(e => e.active && e.spawnTime <= 0 && !ids.includes(e.id) && (!chain || !damaged.includes(e.id)) && e.id !== shot.ignoreEnemyId && (!shot.hopTargetId || e.id === shot.hopTargetId))
      .map(enemy => ({ enemy, t: segmentHit(shot.previousX, shot.previousZ, shot.x, shot.z, enemy.x, enemy.z, this.enemyRadius(enemy) + WEAPON.radius) }))
      .filter(c => c.t < wall && c.t !== Infinity).sort((a, b) => a.t - b.t || a.enemy.id - b.enemy.id);
    for (const { enemy, t } of contacts) {
      if (!enemy.active) continue;
      const x = shot.previousX + (shot.x - shot.previousX) * t, z = shot.previousZ + (shot.z - shot.previousZ) * t;
      ids.push(enemy.id); damaged.push(enemy.id);
      this.damageEnemy(enemy, shot.damage, shot.vx / WEAPON.speed, shot.vz / WEAPON.speed, 'player', this.projectileSource(shot));
      this.relicBehaviors.projectileHit(shot,enemy,x,z);
      const fusionId = shot.relicSource?.kind === 'bubble-spore' ? 'chain-bubble' : shot.fusionIds?.[0];
      const deep = shot.fusionIds?.includes('deep-bubble'), waterChain = shot.fusionIds?.includes('chain-bubble');
      const rules = shot.attackRules ?? resolveAttackRules(shot.attackId ?? 'bubble', [], 1);
      // Visual anchor only. AoE and direct damage retain the actual swept contact (x, z).
      this.effect(x, z, shot.attackId === 'bubble' ? 'water' : 'thorn', enemy.kind,
        (deep ? DEEP_BUBBLE.radius : waterChain ? CHAIN_BUBBLE.radius : .6) * rules.areaMultiplier, fusionId,
        shot.attackId === 'bubble' ? enemy : undefined, rules.impactVfx);
      if(shot.attackRules?.pairId)this.pairHit(shot,enemy,x,z);
      if (!shot.attackRules?.pairId && shot.attackId === 'bubble') {
        if (enemy.active) enemy.slowTime = rules.slowDuration;
        if (deep || waterChain) {
          const rule = deep ? DEEP_BUBBLE : CHAIN_BUBBLE;
          this.relicBehaviors.areaHit(x,z,rule.radius*rules.areaMultiplier,this.projectileSource(shot));
          for (const other of this.enemies) {
            if (!other.active || other.spawnTime > 0 || other.id === enemy.id || damaged.includes(other.id)
              || Math.hypot(other.x - x, other.z - z) > rule.radius * rules.areaMultiplier + this.enemyRadius(other) || this.covered(x,z,other.x,other.z)) continue;
            this.damageEnemy(other, (shot.baseDamage ?? shot.damage) * rule.damage, 0, 0, 'player', this.projectileSource(shot));
            damaged.push(other.id);
            if (other.active) other.slowTime = rules.slowDuration;
          }
        }
      }
      if (!shot.attackRules?.pairId && shot.scatter && ((shot.generation ?? 0) === 0 || shot.relicSource?.copied)) {
        shot.scatter = false;
        this.scatterThorns(shot, x, z, enemy.id);
      }
      if(shot.attackRules?.pairId==='blazing-thorn'&&ids.length>=3){shot.active=false;return;}
      if (chain) {
        if(shot.chargedPierceSource===shot.relicSource?.rootId){
          shot.chargedPierceSource=undefined;shot.pierces=Math.max(0,(shot.pierces??0)-1);shot.hopTargetId=0;
          const speed=Math.max(.001,Math.hypot(shot.vx,shot.vz));shot.vx=shot.vx/speed*WEAPON.speed;shot.vz=shot.vz/speed*WEAPON.speed;
          continue;
        }
        shot.x = shot.previousX = x; shot.z = shot.previousZ = z;
        shot.hopTargetId = 0;
        const target = (shot.bounces ?? 0) > 0 ? this.nextHop(shot,x,z) : undefined;
        if (target) { this.beginHop(shot,target); return; }
        shot.active = false; return;
      }
      if ((shot.pierces ?? 0) > 0) { shot.pierces = (shot.pierces ?? 0) - 1; continue; }
      if(!this.relicBehaviors.preserveLeaf(shot))shot.active = false; return;
    }
    if (wall !== Infinity || (!shot.hopTargetId && shot.life <= 0)) { shot.active = false; shot.hopTargetId = 0; }
  }

  private pairHit(shot:Projectile,enemy:Enemy,x:number,z:number){
    const rules=shot.attackRules!,id=rules.pairId!,recipe=WEAPON_PAIR_RECIPES[id],source=this.projectileSource(shot);
    if(source.behavior||((shot.generation??0)>0&&!source.copied))return;
    if(recipe.slowDuration&&enemy.active){enemy.pairSlowUntil=this.elapsed+rules.slowDuration;enemy.pairSlowFactor=recipe.slow;}
    if(recipe.burnDuration&&enemy.active){
      if(!(enemy.pairBurnTime!>0))enemy.pairBurnClock=0;
      enemy.pairBurnTime=recipe.burnDuration;enemy.pairBurnDamage=shot.damage*recipe.burnDamage;
      enemy.pairBurnSource={...source,kind:'burn',primary:false};
    }
    // bramble converts the acquired chain into wider control, never extra jumps.
    const radius=(recipe.radius||(rules.pairSplit?recipe.splitRadius:0))*rules.areaMultiplier*(rules.pairArea?recipe.areaScale:1)*(id==='bramble-tide'&&rules.pairChain?recipe.chainAreaScale*rules.chainRangeMultiplier:1);
    if(radius){
      this.effect(enemy.x,enemy.z,recipe.effect,enemy.kind,radius,recipe.fusionVisual,undefined,recipe.visual);
      const splash={...source,kind:'explosion' as const,primary:false};let explosionHits=0;
      this.relicBehaviors.areaHit(enemy.x,enemy.z,radius,source);
      for(const other of this.enemies){
        if(!other.active||other.spawnTime>0||other.id===enemy.id||shot.damageIds?.includes(other.id)||Math.hypot(other.x-enemy.x,other.z-enemy.z)>radius+this.enemyRadius(other)||this.covered(enemy.x,enemy.z,other.x,other.z))continue;
        explosionHits++;shot.damageIds!.push(other.id);this.damageEnemy(other,shot.damage*(recipe.splash||recipe.splitSplash),0,0,'player',splash);
        if(other.active){other.pairSlowUntil=this.elapsed+rules.slowDuration;other.pairSlowFactor=recipe.slow;}
      }
      this.relicBehaviors.gigapack.explosion(enemy.x,enemy.z,explosionHits,shot.damage,{...source,kind:'explosion'});
    }
    if(rules.pairSplit&&!source.copied&&!source.suppressRelics&&!shot.scatter){
      shot.scatter=true;this.scatterThorns(shot,x,z,enemy.id);
    }
  }

  private scatterThorns(parent: Projectile, x: number, z: number, originalId: number) {
    const angle = Math.atan2(parent.vx, parent.vz);
    const rules = parent.attackRules ?? resolveAttackRules('leaf', [], 1), count = (rules.pairId?WEAPON_PAIR_RECIPES[rules.pairId].splitCount:THORN_SCATTER.childCount) + rules.childCountBonus;
    for (let i=0;i<count;i++) {
      const child = this.projectiles.find(s => !s.active);
      if (!child || !this.reserveChild()) break;
      const direction = angle + (i-(count-1)/2)*THORN_SCATTER.angle;
      Object.assign(child, { active:true,x,z,previousX:x,previousZ:z,vx:Math.sin(direction)*WEAPON.speed,vz:Math.cos(direction)*WEAPON.speed,
        life:THORN_SCATTER.lifetime,damage:(parent.baseDamage ?? parent.damage)*(rules.pairId?WEAPON_PAIR_RECIPES[rules.pairId].splitDamage:THORN_SCATTER.childDamage)*rules.childDamageMultiplier*rules.directMultiplier,baseDamage:(parent.baseDamage ?? parent.damage)*(rules.pairId?WEAPON_PAIR_RECIPES[rules.pairId].splitDamage:THORN_SCATTER.childDamage)*rules.childDamageMultiplier,attackRules:rules,homing:rules.childHoming,distance:0,sourceId:parent.sourceId,species:parent.species,attackId:rules.pairId?parent.attackId:'leaf',
        relicSource:rules.pairId?{...this.projectileSource(parent),primary:false,suppressRelics:true,generation:1}:this.projectileSource(parent),generation:1,bornTick:this.tick,ignoreEnemyId:originalId,burst:false,age:0,elemental:true,fusionIds:[],hitIds:[originalId],pierces:0,bounces:0,scatter:false,damageIds:[],hopTargetId:0,hopDelay:0,hopElapsed:0,hopDuration:0 });
      this.childShots++;
    }
  }

  private updatePounce(enemy: Enemy, dt: number, dx: number, dz: number, distance: number, rule: typeof POUNCE | typeof FORMAL_POUNCE = POUNCE) {
    enemy.intentCooldown = Math.max(0, enemy.intentCooldown - dt);
    if (enemy.intent === 'chase') {
      if (enemy.intentCooldown === 0 && distance <= rule.range) {
        enemy.intent = 'windup'; enemy.intentTime = rule.windup;
        if (this.encounters.enabled) {
          const lead=rule.windup+Math.min(rule.duration,distance/rule.speed);
          const point=predictPosition({x:enemy.x+dx,z:enemy.z+dz},this.playerVelocityX,this.playerVelocityZ,this.playerTurnRate,lead);
          const tx=point.x-enemy.x,tz=point.z-enemy.z,length=Math.max(.001,Math.hypot(tx,tz));enemy.aimX=tx/length;enemy.aimZ=tz/length;
        } else { enemy.aimX = dx / distance; enemy.aimZ = dz / distance; }
      }
      return;
    }
    enemy.intentTime = Math.max(0, enemy.intentTime - dt);
    if (enemy.intentTime > 1e-8) return;
    if (enemy.intent === 'windup') { enemy.intent = 'pounce'; enemy.intentTime = rule.duration; }
    else if (enemy.intent === 'pounce') { enemy.intent = 'recover'; enemy.intentTime = rule.recovery; }
    else { enemy.intent = 'chase'; enemy.intentCooldown = rule.cooldown; }
  }

  private updateRedBash(enemy: Enemy, dt: number, dx: number, dz: number, distance: number) {
    enemy.intentCooldown = Math.max(0,enemy.intentCooldown-dt);
    if (enemy.intent === 'chase') {
      if (!enemy.intentCooldown && distance < RED_BLOB_BASH.range
        && !this.covered(enemy.x,enemy.z,enemy.x+dx,enemy.z+dz)) {
        // Only two local red slams may telegraph at once, preventing an
        // unreadable pile of overlapping floor rings in later 200-mob waves.
        let warningCount = 0;
        for (const other of this.enemies) {
          if (other === enemy || !other.active || other.kind !== 'normal' ||
              (other.intent !== 'windup' && other.intent !== 'pounce')) continue;
          if (Math.hypot(other.x-enemy.x,other.z-enemy.z) < RED_BLOB_BASH.radius * 2)
            warningCount++;
          if (warningCount >= RED_BLOB_BASH.nearbyWarningCap) return;
        }
        enemy.intent = 'windup'; enemy.intentTime = RED_BLOB_BASH.windup;
        enemy.grassAttackX=enemy.x; enemy.grassAttackZ=enemy.z; enemy.grassHit=false;
        enemy.aimX = dx/distance; enemy.aimZ = dz/distance;
      }
      return;
    }
    enemy.intentTime = Math.max(0,enemy.intentTime-dt);
    if (enemy.intentTime > 1e-8) return;
    if (enemy.intent === 'windup') { enemy.intent='pounce'; enemy.intentTime=RED_BLOB_BASH.active; }
    else if (enemy.intent === 'pounce') { enemy.intent='recover'; enemy.intentTime=RED_BLOB_BASH.recovery; }
    else { enemy.intent='chase'; enemy.intentCooldown=RED_BLOB_BASH.cooldown; enemy.grassCycle=GRASS_BLOB.roll; }
  }

  private updateMelee(enemy: Enemy, dt: number, dx: number, dz: number, distance: number) {
    enemy.intentCooldown=Math.max(0,enemy.intentCooldown-dt);
    if (enemy.intent === 'chase') {
      if (!enemy.intentCooldown && distance < this.enemyRadius(enemy)+1 && !this.covered(enemy.x,enemy.z,enemy.x+dx,enemy.z+dz)) {
        enemy.intent='windup'; enemy.intentTime=ENCOUNTER_RULES.meleeWindup;
        enemy.aimX=dx/distance; enemy.aimZ=dz/distance;
      }
    } else {
      enemy.intentTime=Math.max(0,enemy.intentTime-dt);
      if (enemy.intentTime<=1e-8) {
        if (enemy.intent==='windup') { enemy.intent='pounce'; enemy.intentTime=ENCOUNTER_RULES.meleeActive; }
        else if (enemy.intent==='pounce') { enemy.intent='recover'; enemy.intentTime=ENCOUNTER_RULES.meleeRecovery; }
        else { enemy.intent='chase'; enemy.intentCooldown=.3; }
      }
    }
  }

  private resolveHorn(player: Point, dash: DashStep) {
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.spawnTime > 0 || enemy.hornDash === this.dashSerial) continue;
      const t = segmentHit(dash.fromX - enemy.previousX, dash.fromZ - enemy.previousZ, player.x - enemy.x, player.z - enemy.z, 0, 0, HORN.radius + this.enemyRadius(enemy));
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

  /** Reused by normal melee and dice copies; cooldown/counting belongs to the real weapon only. */
  private performSweep(member: Point, attack: WeaponSnapshot, copied = false) {
    const growth = attack.sweep!;
    const offset = growth.degrees === 360 ? 0 : FLAME_SWEEP.bodyOffset;
    const target = this.findTarget(member, growth.radius+offset, true);
    if (!target || this.encounters.dying) return false;
    const dx = target.x-member.x, dz = target.z-member.z, length = Math.max(.001,Math.hypot(dx,dz));
    const aimX = length > .001 ? dx/length : 0, aimZ = length > .001 ? dz/length : 1;
    Object.assign(this.melee, { active: true, attackInstanceId: this.melee.attackInstanceId+1,
      x: member.x+aimX*offset, z: member.z+aimZ*offset, aimX, aimZ, age: 0, radius: growth.radius, angle: growth.angle });
    this.melee.hitIds.fill(0);
    this.soundEvents |= SKILL_SOUNDS.sweep;
    const source = { ...this.newRelicSource('flame-sweep',attack.rules,attack.damage*attack.rules.directMultiplier,attack.mature), copied, suppressRelics:attack.suppressRelics };
    for (let i=0;i<this.enemies.length;i++) {
      const enemy = this.enemies[i];
      if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0 || this.melee.hitIds[i] === enemy.id
        || !insideSweep(enemy.x-this.melee.x,enemy.z-this.melee.z,aimX,aimZ,growth.radius,this.enemyRadius(enemy),growth.angle)
        || this.covered(this.melee.x,this.melee.z,enemy.x,enemy.z) || this.covered(member.x,member.z,enemy.x,enemy.z)) continue;
      this.melee.hitIds[i] = enemy.id;
      this.damageEnemy(enemy,attack.damage*attack.rules.directMultiplier*(enemy.rank ? FLAME_SWEEP.eliteMultiplier : 1),aimX,aimZ,'player',source);
      this.effect(enemy.x,enemy.z,'hit',enemy.kind,0,undefined,undefined,attack.rules.impactVfx);
      if (this.encounters.dying) { this.melee.active = false; break; }
    }
    return true;
  }

  private recordWeaponCast(attack: WeaponSnapshot) {
    this.relicBehaviors.gigapack.weaponCast(attack);
    this.relicBehaviors.cast(attack.attackId,!!attack.sweep,attack.damage*attack.rules.directMultiplier);
    if (!this.usesRunBuild || this.encounters.dying || !this.runBuild.relics.includes('draft-echo-bone-dice')) return;
    this.weaponCastCount++;
    if (this.weaponCastCount % TRIGGER_RELIC_RULES.echo.every === 0 && this.previousWeapon) {
      this.pendingEchoes.push({ attack: { ...this.previousWeapon, damage: this.previousWeapon.damage * TRIGGER_RELIC_RULES.echo.damage },
        readyAt: this.elapsed+TRIGGER_RELIC_RULES.echo.delay, expiresAt: this.elapsed+TRIGGER_RELIC_RULES.echo.expiry });
    }
    this.previousWeapon = attack;
  }

  /** A blocked copy waits up to .75s; it never delays the real volley or enters its cast counter. */
  private updateEchoes() {
    if (this.encounters.dying || !this.party) return;
    for (const pending of [...this.pendingEchoes]) {
      if (this.elapsed+1e-8 < pending.readyAt) continue;
      if (this.elapsed > pending.expiresAt+1e-8) {
        this.pendingEchoes.splice(this.pendingEchoes.indexOf(pending),1); this.relicTelemetry.echoesSkipped++; continue;
      }
      const attack = pending.attack, member = this.party.leader;
      const target = this.findTarget(member,attack.range+(attack.sweep ? FLAME_SWEEP.bodyOffset : 0),!!attack.sweep);
      if (!target || (!attack.sweep && !this.projectiles.some(p=>!p.active)) || !this.reserveChild()) continue;
      // Remove before execution: a copied Boss kill can clear all pending state.
      this.pendingEchoes.splice(this.pendingEchoes.indexOf(pending),1);
      if (attack.sweep) this.performSweep(member,attack,true);
      else this.fireBolts(member,target,attack.damage,1,attack.range,member.id,member.species,attack.attackId,
        { index: 0, rules: attack.rules, fusions: attack.fusions, copied: true, mature: attack.mature,suppressRelics:attack.suppressRelics });
      this.relicTelemetry.echoes++;
      this.soundEvents |= SKILL_SOUNDS.echo;
      if (this.encounters.dying) break;
    }
  }

  private recordHourglassKill() {
    if (!this.usesRunBuild || !this.runBuild.relics.includes('draft-slaughter-hourglass') || this.elapsed+1e-8 < this.hourglassReadyAt) return;
    const rule = TRIGGER_RELIC_RULES.hourglass;
    this.recentRelicKills = this.recentRelicKills.filter(time => this.elapsed-time <= rule.window+1e-8);
    this.recentRelicKills.push(this.elapsed);
    if (this.recentRelicKills.length < rule.kills) return;
    this.recentRelicKills = [];
    this.hourglassUntil = this.elapsed+rule.duration; this.hourglassReadyAt = this.elapsed+rule.cooldown;
    this.relicTelemetry.hourglassProcs++;
    this.soundEvents |= SKILL_SOUNDS.hourglass;
    this.effect(this.anchorX,this.anchorZ,'burst','normal',.6);
  }

  private newRelicSource(attackId: BaseAttackId, rules: AttackRules, rootDamage?: number, mature?: boolean): RelicDamageSource {
    const level = this.runBuild.attacks.find(a => a.attackId === attackId)?.level ?? 1;
    return { rootId: ++this.nextRelicSource, attackId, rules, rootDamage,primary:true,weaponTags:this.runBuild.capabilities(attackId).tags,baseWeaponDamage:ATTACKS[attackId].damage,
      mature: mature ?? (this.usesRunBuild && matureFire(rules.pairId&&sourceHasAttack({attackId,rules},'spark')?'spark':attackId, level, this.progression.ranks)), chain: { nodes: 0 },
      kind: 'hit', generation: 0, martyrHits: new Set() };
  }

  private projectileSource(shot: Projectile) {
    return shot.relicSource ??= this.newRelicSource(shot.attackId ?? 'spark', shot.attackRules ?? resolveAttackRules(shot.attackId ?? 'spark', [], 1), shot.damage);
  }

  private consumeKindling(enemy: Enemy) {
    const multiplier = 1 + ((enemy.burnTime ?? 0) > 0 ? enemy.burnStacks ?? 0 : 0) * TRIGGER_RELIC_RULES.kindling.radiusPerStack;
    enemy.burnStacks = 0;
    return multiplier;
  }

  private queueRelicKill(enemy: Enemy, damage: number, source: RelicDamageSource) {
    const common = { x: enemy.x, z: enemy.z, enemyId: enemy.id, enemyKind: enemy.kind,
      readyAt: this.elapsed + (source.mature ? REACTION_RULES.propagationDelay : 0) };
    if ((sourceHasAttack(source,'spark') || sourceHasAttack(source,'flame-sweep')) && this.runBuild.relics.includes('draft-martyr-core') && source.generation < (source.mature ? REACTION_RULES.mature.generations : TRIGGER_RELIC_RULES.martyr.maxGeneration)
      && (source.kind !== 'burn' || source.mature) && (!source.mature || reserveReaction(source))) {
      source.martyrHits.add(enemy.id);
      this.relicEvents.push({ ...common, type: 'martyr', damage: martyrDamage(source, damage, !!source.mature),
        radius: TRIGGER_RELIC_RULES.martyr.radius * source.rules.areaMultiplier * this.consumeKindling(enemy),
        source: { ...source, kind: 'explosion', generation: source.generation + 1 } });
    }
    if (sourceHasAttack(source,'leaf') && source.kind !== 'testament' && this.runBuild.relics.includes('draft-thorn-testament')) {
      this.relicEvents.push({ ...common, type: 'testament', damage: damage * TRIGGER_RELIC_RULES.testament.damage,
        radius: TRIGGER_RELIC_RULES.testament.range, source: { ...source, kind: 'testament' } });
    }
    if (sourceHasAttack(source,'bubble') && source.kind !== 'bubble-spore' && this.runBuild.relics.includes('draft-bubble-spore') && this.elapsed+1e-8 >= this.bubbleReadyAt) {
      this.bubbleReadyAt = this.elapsed+TRIGGER_RELIC_RULES.bubble.cooldown;
      this.relicEvents.push({ ...common, type: 'bubble', damage: damage*TRIGGER_RELIC_RULES.bubble.damage,
        radius: TRIGGER_RELIC_RULES.bubble.range, source: { ...source, kind: 'bubble-spore' } });
    }
  }

  /** First-ready order, 32 complete events per tick. Future propagation never blocks ready events. */
  private drainRelicEvents() {
    for (let count = 0; count < TRIGGER_RELIC_RULES.martyr.eventsPerTick && this.relicEvents.length && !this.encounters.dying; count++) {
      const index = this.relicEvents.findIndex(event => event.readyAt <= this.elapsed + 1e-8);
      if (index < 0) break;
      const event = this.relicEvents.splice(index, 1)[0], source = event.source;
      this.relicTelemetry.maxNodes = Math.max(this.relicTelemetry.maxNodes, source.chain?.nodes ?? 0);
      if (event.type === 'steam') {
        this.relicTelemetry.steamBursts++;
        this.effect(event.x, event.z, 'steam', event.enemyKind, event.radius);
        for (const enemy of this.enemies) {
          if (this.encounters.dying) break;
          if (!enemy.active || enemy.spawnTime > 0
            || Math.hypot(enemy.x-event.x, enemy.z-event.z) > event.radius + this.enemyRadius(enemy)
            || this.covered(event.x,event.z,enemy.x,enemy.z)) continue;
          this.damageEnemy(enemy, event.damage, 0, 0, 'player', source);
        }
      } else if (event.type === 'martyr') {
        this.relicTelemetry.explosions++;
        this.relicTelemetry.maxGeneration = Math.max(this.relicTelemetry.maxGeneration, source.generation);
        const visual = this.effect(event.x, event.z, 'burst', event.enemyKind, event.radius);
        if (visual) visual.chainDepth = source.generation;
        for (const enemy of this.enemies) {
          if (this.encounters.dying) break;
          if (!enemy.active || enemy.spawnTime > 0 || source.martyrHits.has(enemy.id)
            || Math.hypot(enemy.x-event.x, enemy.z-event.z) > event.radius + this.enemyRadius(enemy)
            || this.covered(event.x,event.z,enemy.x,enemy.z)) continue;
          source.martyrHits.add(enemy.id);
          this.damageEnemy(enemy, event.damage, 0, 0, 'player', source);
        }
      } else if (event.type === 'bubble') {
        const shot = this.projectiles.find(p=>!p.active);
        if (!shot || !this.reserveChild()) continue; // Explicit derived-projectile budget, like testament.
        const target = this.enemies.filter(e=>e.active && e.spawnTime<=0 && Math.hypot(e.x-event.x,e.z-event.z)<=event.radius && !this.covered(event.x,event.z,e.x,e.z))
          .sort((a,b)=>Math.hypot(a.x-event.x,a.z-event.z)-Math.hypot(b.x-event.x,b.z-event.z) || a.id-b.id)[0];
        const angle = target ? Math.atan2(target.x-event.x,target.z-event.z) : event.enemyId*2.399963;
        const rules = source.rules, damage = event.damage*rules.childDamageMultiplier;
        Object.assign(shot, { active:true,x:event.x,z:event.z,previousX:event.x,previousZ:event.z,
          vx:Math.sin(angle)*WEAPON.speed,vz:Math.cos(angle)*WEAPON.speed,life:TRIGGER_RELIC_RULES.bubble.lifetime,
          damage,baseDamage:damage/rules.directMultiplier,distance:0,sourceId:0,species:'bubblesalamander',attackId:'bubble',attackRules:rules,
          relicSource:source,homing:rules.childHoming,generation:1,bornTick:this.tick,ignoreEnemyId:event.enemyId,
          burst:false,age:0,elemental:true,fusionIds:[],hitIds:[event.enemyId],damageIds:[event.enemyId],
          pierces:0,bounces:TRIGGER_RELIC_RULES.bubble.hops,scatter:false,hopTargetId:0,hopDelay:0,hopElapsed:0,hopDuration:0 });
        this.childShots++; this.relicTelemetry.bubbles++;
        this.effect(event.x,event.z,'water',event.enemyKind,.6,'chain-bubble');
      } else {
        const targets = this.enemies.filter(e => e.active && e.spawnTime <= 0 && Math.hypot(e.x-event.x,e.z-event.z) <= event.radius && !this.covered(event.x,event.z,e.x,e.z))
          .sort((a,b) => Math.hypot(a.x-event.x,a.z-event.z)-Math.hypot(b.x-event.x,b.z-event.z) || a.id-b.id);
        const rules = source.rules, total = TRIGGER_RELIC_RULES.testament.count + rules.childCountBonus;
        this.effect(event.x,event.z,'thorn',event.enemyKind,.6,'thorn-scatter');
        for (let i = 0; i < total; i++) {
          const shot = this.projectiles.find(p => !p.active);
          if (!shot || !this.reserveChild()) break;
          const target = targets[i % Math.max(1,targets.length)];
          const angle = target ? Math.atan2(target.x-event.x,target.z-event.z) : i/total*Math.PI*2;
          const damage = event.damage * rules.childDamageMultiplier;
          Object.assign(shot, { active: true, x: event.x, z: event.z, previousX: event.x, previousZ: event.z,
            vx: Math.sin(angle)*WEAPON.speed, vz: Math.cos(angle)*WEAPON.speed, life: TRIGGER_RELIC_RULES.testament.lifetime,
            damage, baseDamage: damage, distance: 0, attackId: 'leaf', attackRules: rules, relicSource: source,
            sourceId: 0, species: 'sproutspike', homing: rules.childHoming, generation: 1, bornTick: this.tick,
            ignoreEnemyId: event.enemyId, burst: false, age: 0, elemental: true, fusionIds: [], hitIds: [event.enemyId],
            pierces: 0, bounces: 0, scatter: false, damageIds: [], hopTargetId: 0, hopDelay: 0, hopElapsed: 0, hopDuration: 0 });
          this.childShots++; this.relicTelemetry.thorns++;
        }
      }
    }
  }

  private updateBurns(dt: number) {
    for (const enemy of this.enemies) {
      if (this.encounters.dying) break;
      if(enemy.active&&(enemy.pairBurnTime??0)>0&&enemy.pairBurnSource){
        const elapsed=Math.min(dt,enemy.pairBurnTime!);enemy.pairBurnTime=Math.max(0,enemy.pairBurnTime!-dt);enemy.pairBurnClock=(enemy.pairBurnClock??0)+elapsed;
        while(enemy.active&&enemy.pairBurnClock>=WEAPON_PAIR_RECIPES['blazing-thorn'].burnInterval-1e-8){enemy.pairBurnClock-=WEAPON_PAIR_RECIPES['blazing-thorn'].burnInterval;this.damageEnemy(enemy,enemy.pairBurnDamage??0,0,0,'player',enemy.pairBurnSource);}
        if(!enemy.pairBurnTime)enemy.pairBurnSource=undefined;
      }
      if (!enemy.active || enemy.spawnTime > 0 || !(enemy.burnTime! > 0) || !enemy.burnSource) continue;
      const elapsed = Math.min(dt, enemy.burnTime!);
      enemy.burnTime = Math.max(0, enemy.burnTime! - dt);
      enemy.burnClock = (enemy.burnClock ?? 0) + elapsed;
      while (enemy.active && enemy.burnClock + 1e-8 >= TRIGGER_RELIC_RULES.kindling.interval) {
        enemy.burnClock -= TRIGGER_RELIC_RULES.kindling.interval;
        this.damageEnemy(enemy, enemy.burnDamage ?? 0, 0, 0, 'player', enemy.burnSource);
        this.effect(enemy.x,enemy.z,'burst',enemy.kind,.3);
      }
      if (enemy.burnTime === 0) { enemy.burnStacks = 0; enemy.burnSource = undefined; }
    }
  }

  private damageEnemy(enemy: Enemy, damage: number, dx: number, dz: number, origin: 'player' | 'spore' = 'player', source?: RelicDamageSource) {
    if (!enemy.active || enemy.spawnTime > 0 || enemy.hp <= 0) return;
    if (!Number.isFinite(damage) || damage <= 0) return;
    if (this.usesRunBuild && source && !source.suppressRelics) {
      source.rootDamage ??= damage;
      this.relicBehaviors.hit(enemy,source);
      if (!source.behavior && source.kind !== 'burn' && sourceHasAttack(source,'bubble')) enemy.wetTime = REACTION_RULES.wetDuration;
      const fire = sourceHasAttack(source,'spark') || sourceHasAttack(source,'flame-sweep');
      if (fire && !source.behavior && source.kind !== 'burn' && !source.reaction && (enemy.wetTime ?? 0) > 0
        && this.runBuild.relics.includes('draft-boiling-core') && this.elapsed + 1e-8 >= (enemy.steamReadyAt ?? 0)
        && source.generation < REACTION_RULES.mature.generations && reserveReaction(source)) {
        enemy.wetTime = 0; enemy.steamReadyAt = this.elapsed + REACTION_RULES.steam.cooldown;
        this.relicEvents.push({ type: 'steam', x: enemy.x, z: enemy.z, enemyId: enemy.id, enemyKind: enemy.kind,
          readyAt: this.elapsed, damage: source.rootDamage * REACTION_RULES.steam.damage,
          radius: REACTION_RULES.steam.radius * source.rules.areaMultiplier,
          source: { ...source, kind: 'steam', reaction: 'steam', generation: source.generation + 1 } });
      }
    }
    if (this.usesRunBuild && source && !source.suppressRelics && !source.behavior && source.kind !== 'burn' && (sourceHasAttack(source,'spark') || sourceHasAttack(source,'flame-sweep')) && this.runBuild.relics.includes('draft-kindling-flask')) {
      const rule = TRIGGER_RELIC_RULES.kindling;
      enemy.burnStacks = (enemy.burnTime ?? 0) > 0 ? Math.min(rule.maxStacks, (enemy.burnStacks ?? 0) + 1) : 0;
      if (!(enemy.burnTime! > 0)) enemy.burnClock = 0;
      enemy.burnTime = rule.duration; enemy.burnDamage = damage * rule.damage;
      enemy.burnSource = { ...source, kind: 'burn' };
    }
    this.hits++;
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.flash = 0.16;
    const strength = enemy.rank === 'boss' ? 0 : enemy.kind === 'tank' ? 1.2 : 3;
    enemy.knockX = dx * strength;
    enemy.knockZ = dz * strength;
    if (this.encounters.enabled && enemy.kind === 'normal' && !enemy.rank && enemy.intent === 'windup'
      && Math.hypot(enemy.knockX,enemy.knockZ) >= GRASS_BLOB.interruptKnockback) {
      enemy.intent='recover'; enemy.intentTime=GRASS_BLOB.interruptedRecovery;
      enemy.grassAttackX=enemy.grassAttackZ=undefined; enemy.grassHit=true;
      this.interrupts++;
    }
    if (enemy.hp === 0) {
      enemy.active = false;
      this.kills++;
      this.relicBehaviors.kill(enemy,damage,source,origin);
      if(!source?.suppressRelics)this.recordHourglassKill();
      if (source && source.generation > 0) this.relicTelemetry.chainKills++;
      if (this.usesRunBuild && source && !source.behavior && (source.kind !== 'burn' || source.mature)) this.queueRelicKill(enemy, damage, source);
      if (origin === 'spore') {
        this.sporeKills++;
        if (enemy.kind === 'draft-spore-bomber') this.balanceTelemetry.sporeChainKills++;
      }
      if (enemy.kind === 'draft-spore-bomber') {
        const explosion = this.sporeExplosions.find(e => !e.active);
        if (explosion) Object.assign(explosion, { active: true, x: enemy.x, z: enemy.z, createdAt: this.elapsed, age: 0, detonated: false, sourceEnemyId: enemy.id, origin });
      }
      const crystal = enemy.kind === 'draft-crystal-swarm', treasure = enemy.kind === 'draft-treasure-runner';
      if (this.usesRunBuild) {
        if (crystal) {
          if (++this.crystalCoinRemainder === CRYSTAL_SWARM.killsPerCoin) { this.goldEarned++; this.crystalCoinRemainder = 0; }
        } else if (enemy.swarm) {
          this.swarmCoinRemainder++;
          if (this.swarmCoinRemainder === SWARM_RULES.killsPerCoin) { this.goldEarned++; this.swarmCoinRemainder = 0; }
        } else this.goldEarned += treasure ? TREASURE_RUNNER.coins : enemy.rank === 'boss' ? 0 : enemy.rank === 'elite' ? 18 : enemy.kind === 'tank' ? 2 : 1;
        if (treasure) {
          this.treasureCaught++;
          const reward = this.treasureRewards.find(e => !e.active) ?? this.treasureRewards.reduce((oldest,e) => e.age > oldest.age ? e : oldest);
          Object.assign(reward, { active: true, x: enemy.x, z: enemy.z, age: 0, coins: TREASURE_RUNNER.coins });
        }
      }
      if (enemy.rank === 'boss') this.encounters.killedBoss(this);
      else {
        let experience = enemy.rank === 'elite' ? 24 : ENEMY_TYPES[enemy.kind].xp;
        if (crystal) {
          experience = ++this.crystalExperienceRemainder === CRYSTAL_SWARM.killsPerXp ? 1 : 0;
          if (experience) this.crystalExperienceRemainder = 0;
        } else if (enemy.swarm) {
          this.swarmExperienceRemainder++;
          experience = this.swarmExperienceRemainder === SWARM_RULES.killsPerXp ? SWARM_RULES.xp : 0;
          if (experience) this.swarmExperienceRemainder = 0;
        }
        if (experience) this.dropExperience(enemy.x, enemy.z, experience);
        this.effect(enemy.x, enemy.z, 'death', enemy.kind, 0, undefined, enemy);
      }
    }
    if(origin==='player'&&source)this.relicBehaviors.gigapack.hit(enemy,source,damage);
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
        if (segmentHit(oldX, oldZ, x, z, enemy.x, enemy.z, this.enemyRadius(enemy) + SKILL_RULES.orbitBallRadius) === Infinity) continue;
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
          this.soundEvents |= SKILL_SOUNDS.shockwave;
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
        if (distance > wave.radius + this.enemyRadius(enemy)) continue;
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

  private effect(x: number, z: number, kind: CombatEffect['kind'], enemyKind: EnemyKind = 'normal', radius = 0, fusionId?: FusionId, enemy?: Enemy, vfxPresetId?: string) {
    if ((kind === 'burst' || kind === 'steam') && radius >= .6) this.soundEvents |= SKILL_SOUNDS.burst;
    if ((kind === 'water' || kind === 'thorn') && fusionId) this.soundEvents |= SKILL_SOUNDS[kind];
    const important = kind === 'steam' || kind === 'burst' && radius >= .6;
    const effect = this.effects.find(candidate => !candidate.active) ?? (important
      ? this.effects.find(candidate => candidate.kind === 'hit' || candidate.kind === 'collect' || candidate.kind === 'death') : undefined);
    const duration = kind === 'steam' ? .55 : kind === 'burst' ? BURST_SEED.explosionDuration : fusionId === 'deep-bubble' ? DEEP_BUBBLE.duration : fusionId === 'thorn-scatter' ? .375 : kind === 'death' ? 0.55 : 0.32;
    if (effect) Object.assign(effect, { active: true, x, z, kind, enemyKind, radius, vfxPresetId, chainDepth: 0, duration, time: duration, fusionId, enemyId: enemy?.id,
      anchorX: enemy?.x, anchorZ: enemy?.z, moveX: enemy?.walkX ?? 0, moveZ: enemy?.walkZ ?? 0 });
    return effect;
  }

  inspect() {
    return {
      balanceTelemetry: { ...this.balanceTelemetry },
      gigapack:this.relicBehaviors.gigapack.inspect(),
      triggerRelics: { ...this.relicTelemetry, casts: this.weaponCastCount, pendingEchoes: this.pendingEchoes.length, hasteRemaining: Math.max(0,this.hourglassUntil-this.elapsed), hasteCooldown: Math.max(0,this.hourglassReadyAt-this.elapsed), bubbleCooldown: Math.max(0,this.bubbleReadyAt-this.elapsed), pending: this.relicEvents.length, wet: this.enemies.filter(e => e.active && (e.wetTime ?? 0) > 0).length, burning: this.enemies.filter(e => e.active && (e.burnTime ?? 0) > 0).length },
      specialEnemies: { sporeKills: this.sporeKills, treasureEscapes: this.treasureEscapes, treasureCaught: this.treasureCaught, explosions: this.sporeExplosions.filter(e => e.active).map(e => ({...e})), rewards: this.treasureRewards.filter(e => e.active).map(e => ({...e})) },
      build: { enabled: this.usesRunBuild, species: this.runBuild.species, relics: [...this.runBuild.relics], evolution: this.runBuild.evolution ?? null, attacks: this.runBuild.attacks.map(attack => ({ ...attack })) },
      melee: { ...this.melee, hitIds: Array.from(this.melee.hitIds).filter(Boolean) },
      firing: { weapon: this.salvo?.attackId ?? null, remaining: this.salvo ? this.salvo.total - this.salvo.index : 0, gap: this.launchClock },
      hp: this.hp, kills: this.kills, goldEarned: this.goldEarned, xp: this.xp, shotsFired: this.shotsFired, hits: this.hits,
      fusion: { enabled: this.fusionEnabled, active: this.fusion?.id ?? null, recipes: this.fusions.map(f => f.id), bursts: this.bursts, childShots: this.childShots, children: this.projectiles.filter(shot => shot.active && shot.generation === 1).length },
      spawned: this.spawned, collected: this.collected, invulnerability: this.invulnerability,
      enemies: this.enemies.filter((enemy) => enemy.active).map((enemy) => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, z: enemy.z, hp: enemy.hp, spawning: enemy.spawnTime > 0 })),
      projectiles: this.projectiles.filter((shot) => shot.active).length,
      orbs: this.orbs.filter((orb) => orb.active).map((orb) => ({ x: orb.x, z: orb.z, value: orb.value })),
      effects: this.effects.filter((effect) => effect.active).length,
      targetId: this.targetId, limits: COMBAT_LIMITS, maxHp: this.maxHp,
      progression: this.progression.inspect(),
      encounters: this.encounters.inspect(),
      orbitAngle: this.orbitAngle,
      trial: this.isTrial ? { organ: 'charge-horns', hits: this.hornHits, kills: this.hornKills, interrupts: this.interrupts, goal: HORN.goal, complete: this.hornHits >= HORN.goal, intents: this.enemies.filter(enemy => enemy.active).map(enemy => ({ id: enemy.id, state: enemy.intent, remaining: enemy.intentTime, aimX: enemy.aimX, aimZ: enemy.aimZ, stagger: enemy.stagger })) } : undefined,
      shockwaves: this.shockwaves.filter((wave) => wave.active).map((wave) => ({ x: wave.x, z: wave.z, radius: wave.radius, damage: wave.damage, age: wave.age })),
    };
  }
}
