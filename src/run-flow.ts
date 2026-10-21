import type { Combat, EnemyKind } from './combat';
import { RunShop } from './shop';
import { CRYSTAL_SWARM, SPORE_BOMBER, TREASURE_RUNNER } from './special-enemies';
import { populationBudget, SPAWN_LAYOUT, FORMAL_SPAWN_CAPS } from './spawn-layout';
import { WAVE_DIRECTOR, directorStage, type DirectorStage, type DirectorEscort } from './wave-director';

export const WAVE_INTERMISSION_SECONDS = 3.5;
export const SHOP_AFTER_WAVE = 5;

/** Exploration rewards stay useful without allowing an infinite map to print infinite power. */
export const TREASURE_REWARDS = {
  coinsBase: 30,
  coinsPerWave: 5,
  maxCoinsPerRun: 100,
  healPerChest: 35,
  maxHealingPerRun: 70,
} as const;

export const RUN_WAVES: readonly { seconds: number; reward: number; cap: number }[] = [
  { seconds: 65, reward: 35, cap: FORMAL_SPAWN_CAPS[0] },
  { seconds: 70, reward: 40, cap: FORMAL_SPAWN_CAPS[1] },
  { seconds: 75, reward: 45, cap: FORMAL_SPAWN_CAPS[2] },
  { seconds: 75, reward: 50, cap: FORMAL_SPAWN_CAPS[3] },
  { seconds: 80, reward: 55, cap: FORMAL_SPAWN_CAPS[4] },
  { seconds: 90, reward: 0, cap: FORMAL_SPAWN_CAPS[5] },
];

/** Five survival waves and a final Boss. Timing out never grants a Boss victory. */
export class RunFlow {
  phase: 'fighting' | 'intermission' | 'shop' | 'won' | 'lost' = 'fighting';
  intermissionRemaining = 0;
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
  private treasureCoinsEarned = 0;
  private treasureHealingEarned = 0;
  treasureUpgradeClaimed = false;
  /** Per-wave reward summary, useful for the existing shop status text. */
  lastWaveGrowth = { treasureCaught: 0, sporeBonus: 0 };
  private spawnClock = 1.2;
  private spawnIndex = 0;
  private escorts: DirectorEscort[] = [];
  private escortClock = 2;
  private arrivalClock = 0;
  private stageEnd = -1;
  private escortHeading = 0;
  private escortIndex = 0;
  private fodderArrivals = 0;
  private escortArrivals = 0;
  private perimeterHeading = 0;
  private claimedExperience = false;
  private treasureClock: number = TREASURE_RUNNER.first;
  private treasureSpawned = false;
  private treasureWaiting = false;
  private scheduledWave = 0;

  private populationTarget(stage: DirectorStage) {
    const elapsed = RUN_WAVES.slice(0, this.waveIndex).reduce((sum, w) => sum + w.seconds, 0) + this.waveElapsed;
    return populationBudget(this.definition.cap, stage.population, elapsed);
  }

  private ensureSchedule() {
    if (this.scheduledWave === this.wave) return;
    const plan = WAVE_DIRECTOR[this.waveIndex];
    this.scheduledWave = this.wave;
    this.treasureClock = plan.treasureFirst ?? Infinity;
    this.treasureWaiting = false;
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

  /** Crystals and spores participate in the same deterministic mob budget. */
  private mixedCaps(combat: Combat, stage: DirectorStage, waveCap: number) {
    const plan = WAVE_DIRECTOR[this.waveIndex];
    const major = this.majorWarning(combat);
    const sporeWarning = combat.sporeExplosions.some(e => e.active && !e.detonated);
    return {
      fastCap: major ? 0 : stage.fastCap,
      tankCap: major ? 0 : stage.tankCap,
      crystalCap: Math.max(CRYSTAL_SWARM.maxGroup, Math.floor(waveCap * .4)),
      sporeCap: Math.min(stage.sporeCap, SPORE_BOMBER.maxAlive),
      crystalAllowed: this.waveElapsed >= plan.crystalFirst,
      sporeAllowed: plan.sporeFirst !== null && this.waveElapsed >= plan.sporeFirst
        && !major && !sporeWarning && stage.sporeCap > 0,
    };
  }

  get wave() { return this.waveIndex + 1; }
  get definition() { return RUN_WAVES[this.waveIndex]; }
  get remaining() { return Math.max(0, this.definition.seconds - this.waveElapsed); }
  get totalElapsed() { return this.combatElapsed + this.restElapsed; }
  get treasureCoinReward() {
    return Math.min(TREASURE_REWARDS.coinsBase + (this.wave - 1) * TREASURE_REWARDS.coinsPerWave,
      Math.max(0, TREASURE_REWARDS.maxCoinsPerRun - this.treasureCoinsEarned));
  }
  get treasureHealRemaining() { return Math.max(0, TREASURE_REWARDS.maxHealingPerRun - this.treasureHealingEarned); }
  get canClaimTreasureUpgrade() { return this.phase === 'fighting' && !this.treasureUpgradeClaimed; }

  constructor(private random: () => number = Math.random) {}

  /** Called before the combat tick; also callable by headless simulations. */
  prepare(combat: Combat, player: {x: number; z: number}) {
    if (this.phase !== 'fighting') return;
    if (combat.encounters.wave !== this.wave) combat.encounters.beginWave(this.wave, this.wave <= SHOP_AFTER_WAVE);
    if (this.wave === 6) combat.encounters.spawnBoss(combat,player);
    if (this.wave === 4 && this.waveElapsed >= 10) combat.encounters.spawnElite(combat,player);
  }

  private collectGold(combat: Combat) {
    const amount = Math.max(0, combat.goldEarned - this.collectedGold);
    this.collectedGold = combat.goldEarned;
    this.coins += amount; this.earned += amount;
  }

  /** Exploration chests share the shop wallet, with a run-wide cap against infinite-map farming. */
  grantTreasureCoins(amount: number) {
    if (this.phase !== 'fighting' || !Number.isSafeInteger(amount) || amount <= 0) return 0;
    const granted = Math.min(amount, this.treasureCoinReward);
    if (granted <= 0) return 0;
    this.treasureCoinsEarned += granted;
    this.coins += granted; this.earned += granted;
    return granted;
  }

  /** Chest healing is capped across the run, not merely per chest. */
  grantTreasureHealing(amount: number) {
    if (this.phase !== 'fighting' || !Number.isSafeInteger(amount) || amount <= 0) return 0;
    const healed = Math.min(amount, this.treasureHealRemaining);
    if (healed <= 0) return 0;
    this.treasureHealingEarned += healed;
    return healed;
  }

  claimTreasureUpgrade() {
    if (!this.canClaimTreasureUpgrade) return false;
    this.treasureUpgradeClaimed = true;
    return true;
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
    const { cap: waveCap } = this.definition;
    const stage = directorStage(this.wave, this.waveElapsed);
    // The fourth-wave elite needs a free pool slot even at the swarm limit.
    const cap = this.wave === 4 && !combat.encounters.elite ? waveCap - 1 : waveCap;
    this.spawnSpecials(dt, combat, player, cap);
    if (this.stageEnd !== stage.end) {
      this.stageEnd = stage.end;
      this.escorts = []; this.escortClock = 2;
      // A new harvest starts promptly; it does not inherit a slow pressure interval.
      this.spawnClock = Math.min(this.spawnClock, 1 / stage.fodderPerSecond);
    }
    this.escortClock -= dt;
    if (this.majorWarning(combat)) {
      // Suppressed events expire rather than bursting after the warning.
      this.escorts = []; this.escortClock = 2;
    } else if (stage.escortEvery > 0 && this.escortClock <= 0) {
      this.escorts = [...stage.escorts];
      this.escortHeading = this.random() * Math.PI * 2; this.escortIndex = 0;
      this.escortClock = stage.escortEvery;
    }
    const target = Math.min(cap, this.populationTarget(stage));
    // Leave room for authored threats even when fodder has filled its budget.
    const reserve = stage.escorts.length + Number(this.treasureWaiting);
    const swarmCap = Math.max(0, Math.min(target, cap - reserve));
    const active = combat.enemies.filter(e => e.active).length;
    const near = combat.enemies.filter(e => e.active && Math.hypot(e.x-player.x,e.z-player.z) < 5.5).length;
    const nearLimit = [7, 9, 12, 15, 18, 10][this.waveIndex];
    this.spawnClock -= dt;
    this.arrivalClock -= dt;
    if (this.arrivalClock > 0) return;
    const mix = this.mixedCaps(combat, stage, cap);
    if (this.escorts.length) {
      const kind = this.escorts.shift()!;
      const limit = kind === 'fast' ? mix.fastCap : kind === 'tank' ? mix.tankCap : mix.sporeAllowed ? mix.sporeCap : 0;
      const occupied = combat.enemies.filter(e => e.active && !e.rank && e.kind === kind).length;
      // Two adjacent approach lanes leave the opposite side available for escape.
      const heading = this.escortHeading + (this.escortIndex++ % 2 ? .7 : -.7);
      if (occupied < limit && active < cap - Number(this.treasureWaiting)) {
        this.escortArrivals += combat.spawnSwarm(player, 1, cap - Number(this.treasureWaiting), kind,
          { ...mix, kinds: [kind] }, heading);
      }
      this.arrivalClock = SPAWN_LAYOUT.stagger;
      return;
    }
    if (this.spawnClock <= 0) {
      // Crowding slows background feed by 30%, never cancels an authored encounter.
      this.spawnClock = 1 / (stage.fodderPerSecond * (near >= nearLimit ? .7 : 1));
      this.arrivalClock = .12;
      if (active >= swarmCap) return;
      if (this.spawnIndex % 4 === 0) this.perimeterHeading = this.random() * Math.PI * 2 + this.spawnIndex * SPAWN_LAYOUT.goldenAngle;
      const kinds: readonly EnemyKind[] = ['normal', 'draft-crystal-swarm', 'normal', 'draft-crystal-swarm'];
      const spawned = combat.spawnSwarm(player, 1, swarmCap, 'normal', { ...mix, kinds }, this.perimeterHeading);
      this.fodderArrivals += spawned; this.spawnIndex++;
    }
  }

  /** Treasure remains a rare once-per-wave event rather than a generic batch slot. */
  private spawnSpecials(dt: number, combat: Combat, player: {x: number; z: number}, cap: number) {
    const plan = WAVE_DIRECTOR[this.waveIndex];
    if (plan.treasureFirst === null || this.treasureSpawned) return;
    this.treasureClock -= dt;
    if (this.treasureClock > 0) return;
    if (combat.enemies.filter(e => e.active).length < cap
      && combat.spawnEncounter('draft-treasure-runner', player, 6, 8)) this.treasureSpawned = true;
    else this.treasureClock = 2;
    this.treasureWaiting = !this.treasureSpawned;
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
    // Survival waves change spawn rules without interrupting the battle.
    // Leave living enemies, loose XP and ongoing attacks in their current state.
    const seamless = this.wave < SHOP_AFTER_WAVE;
    if (!seamless && !this.claimedExperience) {
      let experience = 0;
      for (const orb of combat.orbs) if (orb.active) { experience += orb.value; orb.active = false; }
      combat.progression.gainExperience(experience);
      this.claimedExperience = true;
    }
    if (!seamless && combat.progression.awaitingChoice && this.wave < RUN_WAVES.length) return;
    // One-time boundary settlement: deferred upgrade choices cannot duplicate rewards.
    const treasureCaught = Math.max(0, combat.treasureCaught - this.settledTreasureCaught);
    const sporeChains = Math.max(0, combat.balanceTelemetry.sporeChainKills - this.settledSporeChains);
    this.settledTreasureCaught = combat.treasureCaught;
    this.settledSporeChains = combat.balanceTelemetry.sporeChainKills;
    const sporeBonus = Math.min(sporeChains, 3) * 3;
    this.lastWaveGrowth = { treasureCaught, sporeBonus };
    this.coins += sporeBonus; this.earned += sporeBonus;
    if (!seamless) combat.clearWave();
    this.escorts = []; this.arrivalClock = 0;
    this.completedWaves++;
    this.coins += this.definition.reward; this.earned += this.definition.reward;
    if (seamless) { this.advanceWave(); return; }
    this.phase = this.wave === RUN_WAVES.length ? 'won' : 'intermission';
    if (this.phase === 'intermission') this.intermissionRemaining = WAVE_INTERMISSION_SECONDS;
  }

  updateRest(dt: number, combat?: Combat) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.phase === 'shop') { this.restElapsed += dt; return; }
    if (this.phase !== 'intermission') return;
    const step = Math.min(dt, this.intermissionRemaining);
    this.restElapsed += step;
    this.intermissionRemaining = Math.max(0, this.intermissionRemaining - step);
    if (this.intermissionRemaining > 1e-8) return;
    if (this.wave === SHOP_AFTER_WAVE) {
      // Catches in any of the first five waves earn one *final* shop refresh.
      this.shop = new RunShop(combat!, this.wave, this.random, combat!.treasureCaught);
      this.phase = 'shop';
    } else if (combat) this.advanceWave();
  }

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

  private advanceWave() {
    this.waveIndex++; this.waveElapsed = 0;
    this.spawnClock = 1.2; this.spawnIndex = 0; this.claimedExperience = false;
    this.escorts = []; this.arrivalClock = 0; this.stageEnd = -1; this.escortClock = 2;
    this.scheduledWave = 0;
    this.treasureClock = TREASURE_RUNNER.first; this.treasureSpawned = false;
    this.treasureWaiting = false;
    this.shop = undefined; this.phase = 'fighting'; this.intermissionRemaining = 0;
  }

  nextWave(token: string, combat: Combat) {
    if (this.phase !== 'shop' || this.wave !== SHOP_AFTER_WAVE || token !== this.shop?.token || combat.hp <= 0 || combat.progression.awaitingChoice) return false;
    this.advanceWave();
    return true;
  }

  finish(combat: Combat, won: boolean) {
    this.collectGold(combat); this.phase = won ? 'won' : 'lost'; this.shop = undefined; this.intermissionRemaining = 0;
    if (!won && !this.failure) this.failure='health';
  }

  inspect() {
    return { phase: this.phase, wave: this.wave, waves: RUN_WAVES.length, completedWaves: this.completedWaves, remaining: this.remaining, intermissionRemaining: this.intermissionRemaining,
      combatElapsed: this.combatElapsed, restElapsed: this.restElapsed, totalElapsed: this.totalElapsed, coins: this.coins, earned: this.earned,
      bossDefeated:this.bossDefeated,failure:this.failure, growth: { ...this.lastWaveGrowth },
      director: { populationTarget: this.populationTarget(directorStage(this.wave, this.waveElapsed)), pendingArrivals: this.escorts.length,
        fodderArrivals: this.fodderArrivals, escortArrivals: this.escortArrivals,
        beat: directorStage(this.wave, this.waveElapsed).beat, stage: directorStage(this.wave, this.waveElapsed) },
      shop: this.shop ? { token: this.shop.token, refreshCost: this.shop.refreshCost, treasureRefreshes: this.shop.treasureRefreshes, items: this.shop.items.map(s => ({ ...s })) } : null };
  }
}
