import type { Combat, EnemyKind } from './combat';
import { RunShop } from './shop';

export const RUN_WAVES: readonly { seconds: number; reward: number; interval: number; enemies: readonly EnemyKind[] }[] = [
  { seconds: 65, reward: 35, interval: 1.5, enemies: ['normal', 'normal', 'normal', 'fast'] },
  { seconds: 70, reward: 40, interval: 1.2, enemies: ['normal', 'fast', 'normal', 'tank'] },
  { seconds: 75, reward: 45, interval: 1.05, enemies: ['normal', 'fast', 'tank', 'normal', 'fast'] },
  { seconds: 75, reward: 50, interval: 1, enemies: ['normal', 'fast', 'tank', 'normal', 'fast'] },
  { seconds: 80, reward: 55, interval: .8, enemies: ['normal', 'tank', 'fast', 'fast'] },
  { seconds: 90, reward: 0, interval: 3.2, enemies: ['normal', 'fast', 'normal', 'tank'] },
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
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      const cap = this.wave === 6 ? 12 : 12 + this.wave*4;
      if (combat.enemies.filter(e=>e.active).length >= cap) { this.spawnClock=.3; return; }
      const kind = this.definition.enemies[this.spawnIndex % this.definition.enemies.length];
      if (combat.spawnEncounter(kind, player)) { this.spawnIndex++; this.spawnClock = this.definition.interval; }
      else this.spawnClock = .2;
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
