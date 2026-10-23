import { MOONDEW_SHELL } from './special-enemies';
import { rangedEnemyRule } from './ranged-enemies';
import type { Combat, EnemyKind } from './combat';
import { EndlessRoster, type EndlessEnemyType } from './endless-roster';
import { EndlessEncounterDeck, APPROACH_NAMES, endlessEntryHeading, type EndlessApproach } from './endless-encounters';
import { RunShop } from './shop';
import { CRYSTAL_SWARM, SPORE_BOMBER, TREASURE_RUNNER, firstBossTreasureCount } from './special-enemies';
import { populationBudget, SPAWN_LAYOUT, FORMAL_SPAWN_CAPS } from './spawn-layout';
import { WAVE_DIRECTOR, ENDLESS_WAVE_DIRECTOR, ENDLESS_WAVE_SECONDS, directorStage, releaseLeadIn, ENDLESS_MODIFIERS, ENDLESS_SCALING, type EndlessModifierId, type DirectorStage, type DirectorEscort } from './wave-director';

export const WAVE_INTERMISSION_SECONDS = 3.5;
export const ENDLESS_FLAG_WARNING_SECONDS = 8;
export const SHOP_AFTER_WAVE = 5;
export type RunMode = 'campaign' | 'endless';

export const RUN_WAVES: readonly { seconds: number; reward: number; cap: number }[] = [
  { seconds: 65, reward: 35, cap: FORMAL_SPAWN_CAPS[0] },
  { seconds: 70, reward: 40, cap: FORMAL_SPAWN_CAPS[1] },
  { seconds: 75, reward: 45, cap: FORMAL_SPAWN_CAPS[2] },
  { seconds: 75, reward: 50, cap: FORMAL_SPAWN_CAPS[3] },
  { seconds: 80, reward: 55, cap: FORMAL_SPAWN_CAPS[4] },
  { seconds: 90, reward: 0, cap: FORMAL_SPAWN_CAPS[5] },
];

/** Six-wave finite challenge or repeating six-wave Endless survival loop. */
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
  bossesDefeated = 0;
  bossOvertime = false;
  bossOvertimeElapsed = 0;
  failure: 'health' | 'boss-timeout' | null = null;
  shop?: RunShop;
  private collectedGold = 0;
  private settledTreasureCaught = 0;
  private cycleTreasureCaught = 0;
  private settledSporeChains = 0;
  /** Per-wave reward summary, useful for the existing shop status text. */
  lastWaveGrowth = { treasureCaught: 0, sporeBonus: 0 };
  private spawnClock = 1.2;
  private spawnIndex = 0;
  private escorts: DirectorEscort[] = [];
  private escortClock = 2;
  private arrivalClock = 0;
  private escortArrivalClock = 0;
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
  private modifierIds: EndlessModifierId[] = [];
  private rosterWave = 0;
  private roster?: EndlessRoster;
  private readonly encounterDeck = new EndlessEncounterDeck();
  private encounterKinds: DirectorEscort[] = [];
  private approach: EndlessApproach = 'adjacent';
  private formationHeading = 0;
  private formationBatch = 0;
  private firstBossChestGranted = false;
  private firstBossChest?: {active: boolean};
  private readonly shopHistory: {wave:number; enteringCoins:number; leavingCoins:number; intervalIncome:number; purchases:number; itemSpent:number; refreshSpent:number}[] = [];
  private shopEnteringCoins = 0;
  private shopIncome = 0;
  private previousShopEarned = 0;

  constructor(private random: () => number = Math.random, private runMode: RunMode = 'campaign') {}

  get mode() { return this.runMode; }
  get endless() { return this.mode === 'endless'; }
  get canContinueEndless() {
    return !this.endless && this.phase === 'won' && this.wave === RUN_WAVES.length
      && this.completedWaves === RUN_WAVES.length && this.bossDefeated;
  }

  /** Continue the same run; progression, wallet and accumulated statistics stay intact. */
  continueEndless(combat: Combat, player: { x: number; z: number }) {
    if (!this.canContinueEndless || combat.hp <= 0) return false;
    this.runMode = 'endless';
    this.firstBossChestGranted = true;
    this.cycleTreasureCaught = 0;
    combat.clearWave();
    this.advanceWave(combat);
    this.prepare(combat, player);
    return true;
  }
  get cycle() { return Math.floor((this.wave - 1) / RUN_WAVES.length) + 1; }
  get cycleIndex() { return this.cycle - 1; }
  get waveInCycle() { return ((this.wave - 1) % RUN_WAVES.length) + 1; }
  get isShopWave() { return this.endless ? this.waveInCycle === SHOP_AFTER_WAVE : this.wave === SHOP_AFTER_WAVE; }
  get isBossWave() { return this.endless ? this.waveInCycle === RUN_WAVES.length : this.wave === RUN_WAVES.length; }
  get isFlagWave() { return this.endless && this.waveInCycle === SHOP_AFTER_WAVE; }
  get waveLabel() { return this.endless ? `第 ${this.wave} 波` : `第 ${this.wave} / ${RUN_WAVES.length} 波`; }
  private get plan() { return (this.endless ? ENDLESS_WAVE_DIRECTOR : WAVE_DIRECTOR)[this.waveInCycle - 1]; }

  private prepareRoster(combat: Combat) {
    if (!this.endless) return;
    if (this.rosterWave !== this.wave) {
      const types: EndlessEnemyType[] = [this.hasModifier('crystal-surge') && !this.isBossWave
        ? 'draft-crystal-swarm' : 'normal'];
      if (this.isBossWave) types.push('boss');
      if (this.waveInCycle === 4 || combat.enemies.some(e => e.active && e.rank === 'elite')) types.push('elite');
      // Reserve a treasure type only on reward waves, leaving ordinary waves
      // room for a real three-threat recipe rather than isolated random picks.
      if (this.waveInCycle === 2 || this.isShopWave || this.hasModifier('treasure-bait')) types.push('draft-treasure-runner');
      this.encounterKinds = this.encounterDeck.draw(this.wave, 4 - types.length, this.random);
      types.push(...this.encounterKinds);
      this.approach = this.encounterDeck.approach(this.wave, this.random);
      this.formationHeading = this.random() * Math.PI * 2;
      this.formationBatch = 0;
      this.roster = new EndlessRoster(types);
      this.rosterWave = this.wave;
    }
    combat.endlessRoster = this.roster;
  }
  get approachLabel() { return this.endless ? APPROACH_NAMES[this.approach] : ''; }
  get activeModifiers() { return this.modifierIds.map(id => ENDLESS_MODIFIERS.find(modifier => modifier.id === id)!).filter(Boolean); }
  get modifierLabel() { return this.activeModifiers.map(modifier => modifier.title).join(' · '); }
  get modifierDescription() { return this.activeModifiers.map(modifier => modifier.description).join('；'); }
  private hasModifier(id: EndlessModifierId) { return this.endless && this.modifierIds.includes(id); }
  private get spawnRateMultiplier() {
    return this.endless ? Math.min(ENDLESS_SCALING.maxSpawnRateMultiplier, 1 + this.cycleIndex * ENDLESS_SCALING.spawnRatePerCycle) : 1;
  }

  private rollCycleModifiers() {
    if (!this.endless || this.cycle < 2) { this.modifierIds = []; return; }
    const count = this.cycle >= 4 ? 2 : 1;
    const pool = ENDLESS_MODIFIERS.map(modifier => modifier.id);
    this.modifierIds = [];
    while (this.modifierIds.length < count && pool.length) {
      const index = Math.min(pool.length - 1, Math.floor(Math.max(0, this.random()) * pool.length));
      this.modifierIds.push(pool.splice(index, 1)[0]);
    }
  }

  private populationTarget(stage: DirectorStage) {
    const elapsed = this.endless ? this.waveIndex * ENDLESS_WAVE_SECONDS + this.waveElapsed
      : RUN_WAVES.slice(0, this.waveIndex).reduce((sum, w) => sum + w.seconds, 0) + this.waveElapsed;
    return populationBudget(this.definition.cap, stage.population, elapsed);
  }

  private ensureSchedule() {
    if (this.scheduledWave === this.wave) return;
    const plan = this.plan;
    this.scheduledWave = this.wave;
    this.treasureClock = plan.treasureFirst ?? (this.hasModifier('treasure-bait') ? 32 : Infinity);
    this.treasureWaiting = false;
    this.treasureSpawned = false;
  }

  /** Prevent fresh dangerous escorts while a major elite/Boss warning needs attention.
   * Existing enemies keep their behavior and the normal swarm still refills. */
  private majorWarning(combat: Combat) {
    return ((this.endless || this.waveInCycle === 4) && combat.encounters.elitePulsing)
      || (this.isBossWave && (combat.encounters.bossState === 'dash-windup'
        || combat.encounters.bossState === 'spread-windup'
        || combat.encounters.bossState === 'summon-windup'));
  }

  /** Crystals and spores participate in the same deterministic mob budget. */
  private mixedCaps(combat: Combat, stage: DirectorStage, waveCap: number) {
    const plan = this.plan;
    const major = this.majorWarning(combat)||stage.beat==='release'||releaseLeadIn(this.waveInCycle,this.waveElapsed,this.endless,this.cycleIndex);
    const sporeWarning = combat.sporeExplosions.some(e => e.active && !e.detonated);
    const fastCap = Math.min(stage.fastCap + (this.hasModifier('fast-advance') ? 2 : 0), Math.floor(waveCap * .25));
    const tankCap = Math.min(stage.tankCap + (this.hasModifier('armored-line') ? 1 : 0), Math.floor(waveCap * .2));
    const sporeCap = Math.min(stage.sporeCap + (this.hasModifier('spore-chain') ? 1 : 0), SPORE_BOMBER.maxAlive);
    return {
      fastCap: major ? 0 : fastCap,
      tankCap: major ? 0 : tankCap,
      crystalCap: Math.max(CRYSTAL_SWARM.maxGroup, Math.floor(waveCap * (this.hasModifier('crystal-surge') ? .55 : .4))),
      sporeCap: major ? 0 : sporeCap,
      crystalAllowed: this.hasModifier('crystal-surge') || this.waveElapsed >= plan.crystalFirst,
      sporeAllowed: this.waveInCycle!==4&&this.waveInCycle!==6&&(plan.sporeFirst !== null || this.hasModifier('spore-chain'))
        && this.waveElapsed >= (plan.sporeFirst ?? 14) && !major && !sporeWarning && sporeCap > 0,
    };
  }

  get wave() { return this.waveIndex + 1; }
  get definition() {
    const base = RUN_WAVES[this.endless ? this.waveInCycle - 1 : this.waveIndex];
    if (!this.endless) return base;
    const capMultiplier = Math.min(ENDLESS_SCALING.maxPopulationMultiplier, 1 + this.cycleIndex * ENDLESS_SCALING.populationPerCycle);
    return { ...base, seconds: ENDLESS_WAVE_SECONDS, cap: Math.min(ENDLESS_SCALING.maxPopulation, Math.ceil(base.cap * capMultiplier)) };
  }
  get remaining() { return Math.max(0, this.definition.seconds - this.waveElapsed); }
  get totalElapsed() { return this.combatElapsed + this.restElapsed; }

  /** Called before the combat tick; also callable by headless simulations. */
  prepare(combat: Combat, player: {x: number; z: number}) {
    if (this.phase !== 'fighting') return;
    this.prepareRoster(combat);
    combat.progression.endless = this.endless;
    combat.endlessCycleIndex = this.endless ? this.cycleIndex : 0;
    if (combat.encounters.wave !== this.waveInCycle) combat.encounters.beginWave(this.waveInCycle, this.waveInCycle <= SHOP_AFTER_WAVE, !this.endless);
    combat.encounters.releaseWindow=directorStage(this.waveInCycle,this.waveElapsed,this.endless,this.cycleIndex).beat==='release';
    if (this.isBossWave) combat.encounters.spawnBoss(combat,player);
    if (this.waveInCycle === 4 && this.waveElapsed >= (this.endless ? 12 * ENDLESS_WAVE_SECONDS / RUN_WAVES[3].seconds : 12)) combat.encounters.spawnElite(combat,player);
  }

  private collectGold(combat: Combat) {
    const amount = Math.max(0, combat.goldEarned - this.collectedGold);
    this.collectedGold = combat.goldEarned;
    this.coins += amount; this.earned += amount;
    combat.relicBehaviors.gigapack.earnedCoins(amount,this.wave);
  }

  update(dt: number, combat: Combat, player: { x: number; z: number }) {
    if (this.phase !== 'fighting' || !Number.isFinite(dt) || dt <= 0) return;
    this.collectGold(combat);
    if (combat.hp <= 0) { this.phase = 'lost'; this.failure = 'health'; return; }
    this.ensureSchedule();
    this.prepare(combat,player);
    // A timed-out Endless Boss keeps fighting in overtime. Its wave clock is frozen,
    // while the overall combat clock and overtime counter continue.
    const overtimeAtStart = this.bossOvertime;
    const elapsed = overtimeAtStart ? dt : Math.min(dt, this.remaining);
    if (!overtimeAtStart) this.waveElapsed += elapsed;
    else this.bossOvertimeElapsed += dt;
    this.combatElapsed += elapsed;

    if (this.isBossWave && this.remaining <= 1e-8 && !combat.encounters.defeated) {
      if (this.endless) {
        if (!this.bossOvertime) {
          this.bossOvertime = true;
          combat.encounters.forceEnraged = true;
        }
      } else {
        this.resolveBoundary(combat);
        return;
      }
    }
    if (this.isBossWave && combat.encounters.defeated) { this.resolveBoundary(combat); return; }
    if (this.remaining <= 1e-8 && !this.bossOvertime) { this.resolveBoundary(combat); return; }
    if (combat.encounters.dying) return;
    if (combat.progression.awaitingChoice) return;

    const { cap: waveCap } = this.definition;
    const stage = directorStage(this.waveInCycle, this.waveElapsed, this.endless, this.cycleIndex);
    // The fourth-wave elite needs a free pool slot even at the swarm limit.
    const cap = this.waveInCycle === 4 && !combat.encounters.elite ? waveCap - 1 : waveCap;
    this.spawnSpecials(dt, combat, player, cap);
    if (this.stageEnd !== stage.end) {
      this.stageEnd = stage.end;
      this.escorts = []; this.escortClock = 2;
      this.escortArrivalClock = 0;
      // A new harvest starts promptly; it does not inherit a slow pressure interval.
      this.spawnClock = Math.min(this.spawnClock, 1 / (stage.fodderPerSecond * this.spawnRateMultiplier));
    }
    this.escortClock -= dt;
    if (this.majorWarning(combat)||stage.beat==='release'||releaseLeadIn(this.waveInCycle,this.waveElapsed,this.endless,this.cycleIndex)) {
      // Suppressed events expire rather than bursting after the warning.
      this.escorts = []; this.escortClock = 2;
    } else if (stage.escortEvery > 0 && this.escortClock <= 0 && (!this.endless || !this.escorts.length)) {
      this.escorts = this.endless ? [...this.encounterKinds] : [...stage.escorts];
      // Cycle modifiers change the actual scheduled mix, not just the quota labels.
      if (this.hasModifier('fast-advance')) this.escorts.push('fast');
      if (this.hasModifier('armored-line')) this.escorts.push('tank');
      if (this.hasModifier('spore-chain')) this.escorts.push('draft-spore-bomber');
      if (this.roster) this.escorts = this.escorts.filter(kind => this.roster!.types.includes(kind));
      this.escortHeading = this.endless ? this.formationHeading : this.random() * Math.PI * 2;
      this.escortIndex = 0;
      this.formationBatch++;
      // Endless authored intervals already express the pressure tier; don't
      // multiply them again by the old per-cycle feed-rate scaling.
      this.escortClock = stage.escortEvery / (this.endless ? 1 : this.spawnRateMultiplier);
    }
    const target = Math.min(cap, this.populationTarget(stage));
    // Leave room for authored threats even when fodder has filled its budget.
    const reserve = this.escorts.length + Number(this.treasureWaiting);
    const swarmCap = Math.max(0, Math.min(target, cap - reserve));
    const active = combat.enemies.filter(e => e.active).length;
    const near = combat.enemies.filter(e => e.active && Math.hypot(e.x-player.x,e.z-player.z) < 5.5).length;
    const nearLimit = [7, 9, 12, 15, 18, 10][this.waveInCycle - 1];
    this.spawnClock -= dt;
    this.arrivalClock -= dt;
    this.escortArrivalClock = Math.max(0, this.escortArrivalClock - dt);
    if (this.arrivalClock > 0) return;
    const mix = this.mixedCaps(combat, stage, cap);
    if (this.escorts.length && this.escortArrivalClock <= 0) {
      const kind = this.escorts.shift()!;
      const limit = kind==='sand-shell' ? 2 : kind==='frost-fluff' ? 1 : kind==='nightshade-bat' ? 3 : kind==='molten-fruit' ? 2 : kind==='moondew-shell' ? MOONDEW_SHELL.maxAlive : rangedEnemyRule(kind) ? rangedEnemyRule(kind)!.cap : kind === 'fast' ? mix.fastCap : kind === 'tank' ? mix.tankCap : mix.sporeAllowed ? mix.sporeCap : 0;
      const occupied = combat.enemies.filter(e => e.active && !e.rank && e.kind === kind).length;
      // Two adjacent approach lanes leave the opposite side available for escape.
      const member = this.escortIndex++;
      const heading = this.endless ? endlessEntryHeading(this.approach, this.escortHeading, this.formationBatch, member)
        : this.escortHeading + (member % 2 ? .7 : -.7);
      if (occupied < limit && active < cap - Number(this.treasureWaiting)) {
        this.escortArrivals += combat.spawnSwarm(player, 1, cap - Number(this.treasureWaiting), kind,
          { ...mix, kinds: [kind] }, heading);
      }
      this.escortArrivalClock = this.endless ? (this.approach === 'wings' ? 1.75 : .65) : SPAWN_LAYOUT.stagger;
      this.arrivalClock = this.endless ? .12 : SPAWN_LAYOUT.stagger;
      return;
    }
    if (this.spawnClock <= 0) {
      // Crowding slows background feed by 30%, never cancels an authored encounter.
      this.spawnClock = 1 / (stage.fodderPerSecond * this.spawnRateMultiplier * (near >= nearLimit ? .7 : 1));
      this.arrivalClock = .12;
      if (active >= swarmCap) return;
      if (this.spawnIndex % 4 === 0) this.perimeterHeading = this.endless && this.wave >= 7 && stage.beat !== 'release'
        ? endlessEntryHeading(this.approach, this.formationHeading, this.formationBatch, this.spawnIndex / 4)
        : this.random() * Math.PI * 2 + this.spawnIndex * SPAWN_LAYOUT.goldenAngle;
      const fuel: readonly EnemyKind[] = ['normal', 'draft-crystal-swarm', 'normal', 'draft-crystal-swarm'];
      const kinds = this.roster ? fuel.filter(kind => this.roster!.types.includes(kind)) : fuel;
      const spawned = combat.spawnSwarm(player, 1, swarmCap, 'normal', { ...mix, kinds }, this.perimeterHeading);
      this.fodderArrivals += spawned; this.spawnIndex++;
    }
  }

  /** Treasure remains a rare once-per-wave event rather than a generic batch slot. */
  private spawnSpecials(dt: number, combat: Combat, player: {x: number; z: number}, cap: number) {
    const plan = this.plan;
    if (this.roster && !this.roster.types.includes('draft-treasure-runner')) return;
    if ((plan.treasureFirst === null && !this.hasModifier('treasure-bait')) || this.treasureSpawned) return;
    this.treasureClock -= dt;
    if (this.treasureClock > 0) return;
    if (combat.enemies.filter(e => e.active).length < cap
      && combat.spawnEncounter('draft-treasure-runner', player, 6, 8)) this.treasureSpawned = true;
    else this.treasureClock = 2;
    this.treasureWaiting = !this.treasureSpawned;
  }

  resolveBoundary(combat: Combat) {
    if (this.phase !== 'fighting' || this.remaining > 1e-8 && !(this.isBossWave && combat.encounters.defeated)) return;
    this.collectGold(combat);
    if (combat.hp <= 0) { this.phase = 'lost'; this.failure='health'; return; }
    const chestPoint = {x:combat.encounters.boss?.x ?? 0,z:combat.encounters.boss?.z ?? 0};
    if (this.isBossWave) {
      if (combat.encounters.dying && !combat.encounters.defeated) return;
      if (!combat.encounters.defeated) {
        if (this.endless) {
          this.bossOvertime = true;
          combat.encounters.forceEnraged = true;
          return;
        }
        this.phase='lost'; this.failure='boss-timeout'; combat.clearTransientEffects(); return;
      }
      this.bossDefeated=true;
    }
    // Survival waves change spawn rules without interrupting the battle.
    // Leave living enemies, loose XP and ongoing attacks in their current state.
    const seamless = this.endless ? !this.isShopWave && !this.isBossWave : this.wave < SHOP_AFTER_WAVE;
    if (!seamless && !this.claimedExperience) {
      let experience = 0;
      for (const orb of combat.orbs) if (orb.active) { experience += orb.value; orb.active = false; }
      combat.progression.gainExperience(experience);
      this.claimedExperience = true;
    }
    // In Endless, resolve queued level-up choices before clearing a shop/Boss boundary.
    // The defeated Boss is allowed to open an upgrade card even though its death state is active.
    if (!seamless && combat.progression.awaitingChoice && (this.endless || this.wave < RUN_WAVES.length)) return;
    // One-time boundary settlement: deferred upgrade choices cannot duplicate rewards.
    const treasureCaught = Math.max(0, combat.treasureCaught - this.settledTreasureCaught);
    this.cycleTreasureCaught += treasureCaught;
    const sporeChains = Math.max(0, combat.balanceTelemetry.sporeChainKills - this.settledSporeChains);
    this.settledTreasureCaught = combat.treasureCaught;
    this.settledSporeChains = combat.balanceTelemetry.sporeChainKills;
    const sporeBonus = Math.min(sporeChains, 3) * 3;
    this.lastWaveGrowth = { treasureCaught, sporeBonus };
    this.coins += sporeBonus; this.earned += sporeBonus;
    if (!seamless) combat.clearWave();
    this.escorts = []; this.arrivalClock = 0;
    this.completedWaves++;
    const bossBonus = this.endless && this.isBossWave ? ENDLESS_SCALING.bossReward : 0;
    const reward = this.definition.reward + bossBonus;
    this.coins += reward; this.earned += reward;
    if (this.isBossWave) {
      this.bossesDefeated++;
      if (this.endless) this.cycleTreasureCaught = 0;
    }
    combat.relicBehaviors.gigapack.earnedCoins(sporeBonus+reward,this.wave);
    if (seamless) { this.advanceWave(combat); return; }
    this.phase = !this.endless && this.wave === RUN_WAVES.length ? 'won' : 'intermission';
    if (this.phase === 'intermission') this.intermissionRemaining = WAVE_INTERMISSION_SECONDS;
    if(this.endless && this.wave===6 && this.bossDefeated && !this.firstBossChestGranted) {
      this.firstBossChestGranted=true;
      this.firstBossChest=combat.grantTreasure(firstBossTreasureCount(this.random()),chestPoint,true);
      this.collectGold(combat);
    }
    if (this.phase === 'intermission' && this.isShopWave) this.prepareShop(combat);
  }

  private prepareShop(combat: Combat) {
    if (this.shop) return;
    // Settle the offers once so their artwork can load during the rest period.
    this.shop = new RunShop(combat, this.wave, this.random, this.endless ? this.cycleTreasureCaught : combat.treasureCaught,
      this.endless ? this.cycleIndex : undefined);
    this.shopEnteringCoins = this.coins;
    this.shopIncome = this.earned - this.previousShopEarned;
    this.previousShopEarned = this.earned;
  }

  updateRest(dt: number, combat?: Combat) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if(this.firstBossChest) {
      if(this.firstBossChest.active)return;
      this.firstBossChest=undefined;
    }
    if (this.phase === 'shop') { this.restElapsed += dt; return; }
    if (this.phase !== 'intermission') return;
    const step = Math.min(dt, this.intermissionRemaining);
    this.restElapsed += step;
    this.intermissionRemaining = Math.max(0, this.intermissionRemaining - step);
    if (this.intermissionRemaining > 1e-8) return;
    if (this.isShopWave) {
      this.prepareShop(combat!);
      this.phase = 'shop';
    } else if (combat) this.advanceWave(combat);
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

  private advanceWave(combat?: Combat) {
    const previousCycle = this.cycle;
    this.waveIndex++; this.waveElapsed = 0;
    this.spawnClock = 1.2; this.spawnIndex = 0; this.claimedExperience = false;
    this.escorts = []; this.arrivalClock = 0; this.stageEnd = -1; this.escortClock = 2;
    this.escortArrivalClock = 0;
    this.scheduledWave = 0;
    this.treasureClock = TREASURE_RUNNER.first; this.treasureSpawned = false;
    this.treasureWaiting = false;
    this.bossOvertime = false; this.bossOvertimeElapsed = 0;
    if (this.cycle !== previousCycle) this.rollCycleModifiers();
    this.shop = undefined; this.phase = 'fighting'; this.intermissionRemaining = 0;
    if (combat) this.prepareRoster(combat);
  }

  nextWave(token: string, combat: Combat) {
    if (this.phase !== 'shop' || !this.isShopWave || token !== this.shop?.token || combat.hp <= 0 || combat.progression.awaitingChoice) return false;
    if(this.endless && this.shop) {
      this.shopHistory.push({wave:this.wave,enteringCoins:this.shopEnteringCoins,leavingCoins:this.coins,
        intervalIncome:this.shopIncome,purchases:this.shop.purchases,itemSpent:this.shop.spent,refreshSpent:this.shop.refreshSpent});
      if(this.shopHistory.length>12)this.shopHistory.shift();
    }
    this.advanceWave(combat);
    return true;
  }

  finish(combat: Combat, won: boolean) {
    this.collectGold(combat); this.phase = won ? 'won' : 'lost'; this.shop = undefined; this.intermissionRemaining = 0;
    if (!won && !this.failure) this.failure='health';
  }

  inspect() {
    const stage = directorStage(this.waveInCycle, this.waveElapsed, this.endless, this.cycleIndex);
    return { mode: this.mode, endless: this.endless, phase: this.phase, wave: this.wave, waves: RUN_WAVES.length,
      cycle: this.cycle, cycleIndex: this.cycleIndex, waveInCycle: this.waveInCycle, waveLabel: this.waveLabel,
      isShopWave: this.isShopWave, isBossWave: this.isBossWave, bossOvertime: this.bossOvertime,
      bossOvertimeElapsed: this.bossOvertimeElapsed, bossesDefeated: this.bossesDefeated,
      firstBossChestGranted: this.firstBossChestGranted, firstBossChestActive: this.firstBossChest?.active ?? false,
      economy: {shops:this.shopHistory.map(s=>({...s})),currentPurchases:this.shop?.purchases ?? 0,
        currentItemSpent:this.shop?.spent ?? 0,currentRefreshSpent:this.shop?.refreshSpent ?? 0,
        currentEnteringCoins:this.shop ? this.shopEnteringCoins : null,currentIntervalIncome:this.shop ? this.shopIncome : null},
      cycleTreasureCaught: this.cycleTreasureCaught, modifiers: this.activeModifiers,
      completedWaves: this.completedWaves, remaining: this.remaining, intermissionRemaining: this.intermissionRemaining,
      combatElapsed: this.combatElapsed, restElapsed: this.restElapsed, totalElapsed: this.totalElapsed, coins: this.coins, earned: this.earned,
      bossDefeated:this.bossDefeated,failure:this.failure, growth: { ...this.lastWaveGrowth },
      director: { populationTarget: this.populationTarget(stage), pendingArrivals: this.escorts.length,
        roster: this.roster ? [...this.roster.types] : null,
        composition: [...this.encounterKinds], approach: this.approachLabel,
        fodderArrivals: this.fodderArrivals, escortArrivals: this.escortArrivals,
        beat: stage.beat, stage },
      shop: this.shop ? { token: this.shop.token, refreshCost: this.shop.refreshCost, treasureRefreshes: this.shop.treasureRefreshes, items: this.shop.items.map(s => ({ ...s })) } : null };
  }
}
