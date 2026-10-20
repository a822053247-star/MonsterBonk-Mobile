import type { Combat, EnemyKind } from './combat';
import { RunShop } from './shop';

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
  private spawnClock = 1.2;
  private spawnIndex = 0;
  private pendingSwarm = 0;
  private pendingClock = 0;
  private pendingEscort: EnemyKind = 'normal';
  private claimedExperience = false;
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
    this.prepare(combat,player);
    // Called after an executed combat tick; an upgrade earned on that tick still counts its time.
    const elapsed = Math.min(dt, this.remaining);
    this.waveElapsed += elapsed; this.combatElapsed += elapsed;
    if (this.remaining <= 1e-8 || this.wave === 6 && combat.encounters.defeated) { this.resolveBoundary(combat); return; }
    if (combat.encounters.dying) return;
    if (combat.progression.awaitingChoice) return;
    const { cap: waveCap, groupSize, interval } = this.definition;
    // The fourth-wave elite needs a free pool slot even at the swarm limit.
    const cap = this.wave === 4 && !combat.encounters.elite ? waveCap - 1 : waveCap;
    // Half the incoming group arrives 0.35s later; never queue multiple late batches.
    if (this.pendingSwarm > 0) {
      this.pendingClock -= dt;
      if (this.pendingClock <= 0) {
        combat.spawnSwarm(player, this.pendingSwarm, cap, this.pendingEscort);
        this.pendingSwarm = 0;
        this.pendingClock = 0;
      }
    }
    this.spawnClock -= dt;
    const active = combat.enemies.filter(e => e.active).length;
    // A rapidly cleared map refills sooner without an unbounded catch-up loop.
    if (this.spawnIndex > 0 && active < Math.floor(cap * .45)) {
      this.spawnClock = Math.min(this.spawnClock, interval * .6);
    }
    if (this.spawnClock <= 0) {
      if (active >= cap) { this.spawnClock = .2; return; }
      const kind = this.definition.enemies[this.spawnIndex % this.definition.enemies.length];
      const firstHalf = Math.ceil(groupSize / 2);
      const spawned = combat.spawnSwarm(player, firstHalf, cap);
      if (spawned) {
        this.pendingSwarm = groupSize - firstHalf;
        this.pendingEscort = kind;
        this.pendingClock = .35;
        this.spawnIndex++;
        this.spawnClock = interval;
      } else this.spawnClock = .2;
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
    combat.clearWave();
    this.pendingSwarm = this.pendingClock = 0;
    this.completedWaves++;
    this.coins += this.definition.reward; this.earned += this.definition.reward;
    this.phase = this.wave === RUN_WAVES.length ? 'won' : 'shop';
    if (this.phase === 'shop') this.shop = new RunShop(combat, this.wave, this.random);
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
    this.shop = undefined; this.phase = 'fighting'; return true;
  }

  finish(combat: Combat, won: boolean) {
    this.collectGold(combat); this.phase = won ? 'won' : 'lost'; this.shop = undefined;
    if (!won && !this.failure) this.failure='health';
  }

  inspect() {
    return { phase: this.phase, wave: this.wave, waves: RUN_WAVES.length, completedWaves: this.completedWaves, remaining: this.remaining,
      combatElapsed: this.combatElapsed, restElapsed: this.restElapsed, totalElapsed: this.totalElapsed, coins: this.coins, earned: this.earned,
      bossDefeated:this.bossDefeated,failure:this.failure,
      shop: this.shop ? { token: this.shop.token, refreshCost: this.shop.refreshCost, items: this.shop.items.map(s => ({ ...s })) } : null };
  }
}
