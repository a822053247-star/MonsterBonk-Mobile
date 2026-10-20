import type { Combat, EnemyKind } from './combat';
import { RunShop } from './shop';
import { CRYSTAL_SWARM, SPORE_BOMBER, TREASURE_RUNNER } from './special-enemies';
import { WAVE_DIRECTOR, directorStage, type DirectorStage } from './wave-director';

export const RUN_WAVES: readonly { seconds: number; reward: number; interval: number; groupSize: number; cap: number; enemies: readonly EnemyKind[] }[] = [
  { seconds: 65, reward: 35, interval: 1.4, groupSize: 12, cap: 60, enemies: ['normal', 'normal', 'normal', 'fast'] },
  { seconds: 70, reward: 40, interval: 1.2, groupSize: 18, cap: 90, enemies: ['normal', 'fast', 'normal', 'tank'] },
  { seconds: 75, reward: 45, interval: 1.0, groupSize: 24, cap: 120, enemies: ['normal', 'fast', 'tank', 'normal', 'fast'] },
  { seconds: 75, reward: 50, interval: 0.9, groupSize: 32, cap: 160, enemies: ['normal', 'fast', 'tank', 'normal', 'fast'] },
  { seconds: 80, reward: 55, interval: 0.8, groupSize: 40, cap: 200, enemies: ['normal', 'tank', 'fast', 'fast'] },
  { seconds: 90, reward: 0, interval: 1.0, groupSize: 16, cap: 120, enemies: ['normal', 'fast', 'normal', 'tank'] },
];

/** Five survival waves and a final Boss. Timing out never grants a Boss victory. */
export class RunFlow {
  phase: 'fighting' | 'shop' | 'won' | 'lost' = 'fighting';
  waveIndex = 0;
  waveElapsed = 0;
  combatElapsed = 0;
  restElapsed = 0;
  coins = 0;
  earned = 0;
  completedWaves = 0;
  bossDefeated = false;
  failure: 'health' | 'boss-timeout' | null = null;
  shop?: RunShop;
  private collectedGold = 0;
  private settledTreasureCaught = 0;
  private settledSporeChains = 0;
  /** Per-wave reward summary, useful for the existing shop status text. */
  lastWaveGrowth = { treasureCaught: 0, sporeBonus: 0 };
  private spawnClock = 1.2;
  private spawnIndex = 0;
  private pendingSwarm = 0;
  private pendingClock = 0;
  private pendingEscort: EnemyKind = 'normal';
  private claimedExperience = false;
  private crystalClock: number = CRYSTAL_SWARM.first;
  private sporeClock: number = SPORE_BOMBER.first;
  private treasureClock: number = TREASURE_RUNNER.first;
  private treasureSpawned = false;
  private crystalWaiting = false;
  private sporeWaiting = false;
  private treasureWaiting = false;
  private scheduledWave = 0;

  private ensureSchedule() {
    if (this.scheduledWave === this.wave) return;
    const plan = WAVE_DIRECTOR[this.waveIndex];
    this.scheduledWave = this.wave;
    this.crystalClock = plan.crystalFirst;
    this.sporeClock = plan.sporeFirst ?? Infinity;
    this.treasureClock = plan.treasureFirst ?? Infinity;
    this.crystalWaiting = this.sporeWaiting = this.treasureWaiting = false;
    this.treasureSpawned = false;
  }

  /** Prevent fresh dangerous escorts while a major elite/Boss warning needs attention.
   * Existing enemies keep their behavior and the normal swarm still refills. */
  private majorWarning(combat: Combat) {
    return (this.wave === 4 && combat.encounters.elitePulsing)
      || (this.wave === 6 && (combat.encounters.bossState === 'dash-windup'
        || combat.encounters.bossState === 'spread-windup'
        || combat.encounters.bossState === 'summon-windup'));
  }

  /** One dangerous escort per eligible half-batch, with explicit live caps. */
  private escortFor(combat: Combat, stage: DirectorStage, pulse: 0 | 1): EnemyKind {
    if (this.majorWarning(combat) || pulse >= stage.escortPulses || this.spawnIndex % stage.escortEvery !== 0 || !stage.escorts.length) return 'normal';
    const kind = stage.escorts[(this.spawnIndex * 2 + pulse) % stage.escorts.length];
    const alive = combat.enemies.filter(e => e.active && !e.rank && e.kind === kind).length;
    return alive < (kind === 'fast' ? stage.fastCap : stage.tankCap) ? kind : 'normal';
  }

  get wave() { return this.waveIndex + 1; }
  get definition() { return RUN_WAVES[this.waveIndex]; }
  get remaining() { return Math.max(0, this.definition.seconds - this.waveElapsed); }
  get totalElapsed() { return this.combatElapsed + this.restElapsed; }

  constructor(private random: () => number = Math.random) {}

  /** Called before the combat tick; also callable by headless simulations. */
  prepare(combat: Combat, player: {x: number; z: number}) {
    if (this.phase !== 'fighting') return;
    if (combat.encounters.wave !== this.wave) combat.encounters.beginWave(this.wave);
    if (this.wave === 6) combat.encounters.spawnBoss(combat,player);
    if (this.wave === 4 && this.waveElapsed >= 10) combat.encounters.spawnElite(combat,player);
  }

  private collectGold(combat: Combat) {
    const amount = Math.max(0, combat.goldEarned - this.collectedGold);
    this.collectedGold = combat.goldEarned;
    this.coins += amount; this.earned += amount;
  }

  update(dt: number, combat: Combat, player: { x: number; z: number }) {
    if (this.phase !== 'fighting' || !Number.isFinite(dt) || dt <= 0) return;
    this.collectGold(combat);
    if (combat.hp <= 0) { this.phase = 'lost'; this.failure = 'health'; return; }
    this.ensureSchedule();
    this.prepare(combat,player);
    // Called after an executed combat tick; an upgrade earned on that tick still counts its time.
    const elapsed = Math.min(dt, this.remaining);
    this.waveElapsed += elapsed; this.combatElapsed += elapsed;
    if (this.remaining <= 1e-8 || this.wave === 6 && combat.encounters.defeated) { this.resolveBoundary(combat); return; }
    if (combat.encounters.dying) return;
    if (combat.progression.awaitingChoice) return;
    const { cap: waveCap, groupSize, interval } = this.definition;
    const stage = directorStage(this.wave, this.waveElapsed);
    const pacedInterval = interval * stage.pace * (this.majorWarning(combat) ? 1.2 : 1);
    // The fourth-wave elite needs a free pool slot even at the swarm limit.
    const cap = this.wave === 4 && !combat.encounters.elite ? waveCap - 1 : waveCap;
    this.spawnSpecials(dt, combat, player, cap, stage);
    // Let kills open room for a waiting special encounter instead of immediately
    // refilling every free slot with ordinary enemies and starving the encounter.
    const swarmCap = Math.max(0, cap - (this.crystalWaiting ? CRYSTAL_SWARM.minGroup : 0) - Number(this.sporeWaiting) - Number(this.treasureWaiting));
    // Half the incoming group arrives 0.35s later; never queue multiple late batches.
    if (this.pendingSwarm > 0) {
      this.pendingClock -= dt;
      if (this.pendingClock <= 0) {
        const allowed = this.pendingEscort === 'fast'
          ? combat.enemies.filter(e => e.active && !e.rank && e.kind === 'fast').length < stage.fastCap
          : this.pendingEscort === 'tank'
            ? combat.enemies.filter(e => e.active && !e.rank && e.kind === 'tank').length < stage.tankCap : true;
        combat.spawnSwarm(player, this.pendingSwarm, swarmCap, allowed && !this.majorWarning(combat) ? this.pendingEscort : 'normal');
        this.pendingSwarm = 0;
        this.pendingClock = 0;
      }
    }
    this.spawnClock -= dt;
    const active = combat.enemies.filter(e => e.active).length;
    // A rapidly cleared map refills sooner without an unbounded catch-up loop.
    if (this.spawnIndex > 0 && active < Math.floor(cap * .45)) {
      this.spawnClock = Math.min(this.spawnClock, pacedInterval * .6);
    }
    if (this.spawnClock <= 0) {
      if (active >= swarmCap) { this.spawnClock = .2; return; }
      const firstHalf = Math.ceil(groupSize / 2);
      const spawned = combat.spawnSwarm(player, firstHalf, swarmCap, this.escortFor(combat, stage, 0));
      if (spawned) {
        this.pendingSwarm = groupSize - firstHalf;
        this.pendingEscort = this.escortFor(combat, stage, 1);
        this.pendingClock = .35;
        this.spawnIndex++;
        this.spawnClock = pacedInterval;
      } else this.spawnClock = .2;
    }
  }

  private spawnSpecials(dt: number, combat: Combat, player: {x: number; z: number}, cap: number, stage: DirectorStage) {
    const plan = WAVE_DIRECTOR[this.waveIndex];
    this.crystalClock -= dt;
    if (this.crystalClock <= 0) {
      this.crystalWaiting = !combat.spawnCrystalSwarm(player, cap);
      this.crystalClock = this.crystalWaiting ? 2 : plan.crystalInterval;
    }
    if (plan.sporeFirst !== null) {
      this.sporeClock -= dt;
      if (this.sporeClock <= 0) {
        const active = combat.enemies.filter(e => e.active);
        const livingSpores = active.filter(e => e.kind === 'draft-spore-bomber').length;
        // Keep fresh explosive warnings clear of elite/Boss attack telegraphs.
        const bossWindup = this.wave === 6 && (
          combat.encounters.bossState === 'spread-windup' ||
          combat.encounters.bossState === 'dash-windup' ||
          combat.encounters.bossState === 'summon-windup');
        const overlappingWarning = combat.sporeExplosions.some(e => e.active && !e.detonated);
        if (!stage.sporeCap || livingSpores >= Math.min(stage.sporeCap, SPORE_BOMBER.maxAlive)) {
          this.sporeWaiting = false;
          this.sporeClock = 1;
        } else if (combat.encounters.elitePulsing || bossWindup || overlappingWarning) {
          this.sporeWaiting = false;
          this.sporeClock = 1;
        } else {
          const spawned = active.length < cap && combat.spawnEncounter('draft-spore-bomber', player, 7, 10);
          this.sporeWaiting = !spawned;
          this.sporeClock = spawned ? plan.sporeInterval : 2;
        }
      }
    }
    if (plan.treasureFirst !== null && !this.treasureSpawned) {
      this.treasureClock -= dt;
      if (this.treasureClock <= 0) {
        if (combat.enemies.filter(e => e.active).length < cap && combat.spawnEncounter('draft-treasure-runner', player, 6, 8)) this.treasureSpawned = true;
        else this.treasureClock = 2;
        this.treasureWaiting = !this.treasureSpawned;
      }
    }
  }

  resolveBoundary(combat: Combat) {
    if (this.phase !== 'fighting' || this.remaining > 1e-8 && !(this.wave === 6 && combat.encounters.defeated)) return;
    this.collectGold(combat);
    if (combat.hp <= 0) { this.phase = 'lost'; this.failure='health'; return; }
    if (this.wave === 6) {
      if (combat.encounters.dying && !combat.encounters.defeated) return;
      if (!combat.encounters.defeated) { this.phase='lost'; this.failure='boss-timeout'; combat.clearTransientEffects(); return; }
      this.bossDefeated=true;
    }
    if (!this.claimedExperience) {
      let experience = 0;
      for (const orb of combat.orbs) if (orb.active) { experience += orb.value; orb.active = false; }
      combat.progression.gainExperience(experience);
      this.claimedExperience = true;
    }
    if (combat.progression.awaitingChoice && this.wave < RUN_WAVES.length) return;
    // One-time boundary settlement: deferred upgrade choices cannot duplicate rewards.
    const treasureCaught = Math.max(0, combat.treasureCaught - this.settledTreasureCaught);
    const sporeChains = Math.max(0, combat.balanceTelemetry.sporeChainKills - this.settledSporeChains);
    this.settledTreasureCaught = combat.treasureCaught;
    this.settledSporeChains = combat.balanceTelemetry.sporeChainKills;
    const sporeBonus = Math.min(sporeChains, 3) * 3;
    this.lastWaveGrowth = { treasureCaught, sporeBonus };
    this.coins += sporeBonus; this.earned += sporeBonus;
    combat.clearWave();
    this.pendingSwarm = this.pendingClock = 0;
    this.completedWaves++;
    this.coins += this.definition.reward; this.earned += this.definition.reward;
    this.phase = this.wave === RUN_WAVES.length ? 'won' : 'shop';
    if (this.phase === 'shop') this.shop = new RunShop(combat, this.wave, this.random, treasureCaught);
  }

  updateRest(dt: number) { if (this.phase === 'shop' && Number.isFinite(dt) && dt > 0) this.restElapsed += dt; }

  buy(index: number, token: string) {
    if (this.phase !== 'shop' || !this.shop) return false;
    const balance = this.shop.buy(index, token, this.coins);
    if (balance === undefined) return false;
    this.coins = balance; return true;
  }

  refresh(token: string) {
    if (this.phase !== 'shop' || !this.shop) return false;
    const balance = this.shop.refresh(token, this.coins);
    if (balance === undefined) return false;
    this.coins = balance; return true;
  }

  nextWave(token: string, combat: Combat) {
    if (this.phase !== 'shop' || token !== this.shop?.token || combat.hp <= 0 || combat.progression.awaitingChoice) return false;
    this.waveIndex++; this.waveElapsed = 0;
    this.spawnClock = 1.2; this.spawnIndex = 0; this.claimedExperience = false;
    this.pendingSwarm = this.pendingClock = 0; this.pendingEscort = 'normal';
    this.scheduledWave = 0;
    this.crystalClock = CRYSTAL_SWARM.first; this.sporeClock = SPORE_BOMBER.first;
    this.treasureClock = TREASURE_RUNNER.first; this.treasureSpawned = false;
    this.crystalWaiting = this.sporeWaiting = this.treasureWaiting = false;
    this.shop = undefined; this.phase = 'fighting'; return true;
  }

  finish(combat: Combat, won: boolean) {
    this.collectGold(combat); this.phase = won ? 'won' : 'lost'; this.shop = undefined;
    if (!won && !this.failure) this.failure='health';
  }

  inspect() {
    return { phase: this.phase, wave: this.wave, waves: RUN_WAVES.length, completedWaves: this.completedWaves, remaining: this.remaining,
      combatElapsed: this.combatElapsed, restElapsed: this.restElapsed, totalElapsed: this.totalElapsed, coins: this.coins, earned: this.earned,
      bossDefeated:this.bossDefeated,failure:this.failure, growth: { ...this.lastWaveGrowth },
      director: { beat: directorStage(this.wave, this.waveElapsed).beat, stage: directorStage(this.wave, this.waveElapsed) },
      shop: this.shop ? { token: this.shop.token, refreshCost: this.shop.refreshCost, treasureRefreshes: this.shop.treasureRefreshes, items: this.shop.items.map(s => ({ ...s })) } : null };
  }
}
