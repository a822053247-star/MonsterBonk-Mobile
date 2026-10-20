/** Six-wave baseline using the real Combat / RunFlow simulation, without a renderer.
 * Every row is an INDEPENDENT wave with a declared starting build and full HP.
 * This is scripted movement, not a real player's win rate or a continuous campaign.
 */
import { Combat, COMBAT_LIMITS } from '../src/combat';
import { PartySystem, type SpeciesId } from '../src/party';
import { RunFlow, RUN_WAVES } from '../src/run-flow';
import type { SkillId } from '../src/progression';

export const BALANCE_SPECIES = ['yanrong', 'bubblesalamander', 'sproutspike'] as const;
export const BALANCE_BUILDS = ['focused', 'survival'] as const;
export type BalanceBuild = typeof BALANCE_BUILDS[number];
export type BalanceSpecies = typeof BALANCE_SPECIES[number];

export interface WaveBalanceOptions {
  seed?: number;
  /** Undefined runs the entire wave (or until real player death / Boss victory). */
  maxSeconds?: number;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function startingBuild(species: SpeciesId, build: BalanceBuild, wave: number): SkillId[] {
  const weapon: SkillId = species === 'yanrong' ? 'spark-weapon'
    : species === 'bubblesalamander' ? 'bubble-weapon' : 'leaf-weapon';
  const plan: SkillId[] = build === 'focused'
    ? [weapon, 'damage', weapon, 'haste', weapon, 'multishot', weapon, 'damage', 'haste', 'multishot']
    : ['orbit', 'movement', 'shockwave', 'vitality', 'orbit', 'range', 'shockwave', 'haste', 'orbit', 'damage'];
  // Exactly two extra paid/earned choices per completed preceding wave.
  return plan.slice(0, (wave - 1) * 2);
}

function pickUpgrade(combat: Combat, build: BalanceBuild, species: SpeciesId): SkillId {
  const offered = combat.progression.offers;
  const weapon: SkillId = species === 'yanrong' ? 'spark-weapon'
    : species === 'bubblesalamander' ? 'bubble-weapon' : 'leaf-weapon';
  const priorities: SkillId[] = build === 'focused'
    ? [weapon, 'split-on-hit', 'area', 'chain', 'damage', 'haste', 'multishot', 'shockwave', 'orbit', 'vitality', 'movement']
    : ['vitality', 'orbit', 'shockwave', 'movement', 'range', weapon, 'haste', 'damage', 'multishot', 'area', 'chain'];
  return priorities.find(id => offered.includes(id)) ?? offered[0]!;
}

const round = (value: number, places = 2) => Number(value.toFixed(places));
const pointAt = (seconds: number) => ({
  x: Math.cos(seconds * .43) * 6,
  z: Math.sin(seconds * .43) * 6,
});

/** One fixed-seed, fixed-starting-build independent wave; combat damage is never mocked. */
export function measureWave(
  species: BalanceSpecies,
  build: BalanceBuild,
  wave: number,
  options: WaveBalanceOptions = {},
) {
  if (!BALANCE_SPECIES.includes(species) || !BALANCE_BUILDS.includes(build)
    || !Number.isInteger(wave) || wave < 1 || wave > RUN_WAVES.length
    || (options.maxSeconds !== undefined && (!Number.isFinite(options.maxSeconds) || options.maxSeconds <= 0))
    || (options.seed !== undefined && !Number.isSafeInteger(options.seed))) {
    throw new RangeError('Invalid wave balance scenario');
  }

  const seed = options.seed ?? 20261020;
  const scenarioSeed = (seed + wave * 1009 + BALANCE_SPECIES.indexOf(species) * 7919) >>> 0;
  const combat = new Combat([], 32, seededRandom(scenarioSeed));
  combat.party = new PartySystem();
  combat.party.reset([species]);
  combat.fusionEnabled = true;
  combat.automaticSpawning = false;
  combat.useNavigation = true;
  combat.reset();

  const grants = startingBuild(species, build, wave);
  for (const id of grants) {
    if (!combat.grantUpgrade(id)) throw new Error('Invalid preset upgrade: ' + id);
  }
  const run = new RunFlow(seededRandom(scenarioSeed ^ 0x9e3779b9));
  run.waveIndex = wave - 1;
  const definition = RUN_WAVES[wave - 1];
  const duration = Math.min(definition.seconds, options.maxSeconds ?? definition.seconds);
  const treasureIds = new Set<number>();
  const picked: SkillId[] = [];
  let maximumActive = 0;
  let maximumProjectiles = 0;
  let maximumDangerous = 0;
  let advanced = 0;

  function settleChoices() {
    let guard = 0;
    while (combat.progression.awaitingChoice) {
      if (++guard > 200) throw new Error('Upgrade selection did not settle');
      const chosen = pickUpgrade(combat, build, species);
      if (!chosen || !combat.chooseUpgrade(chosen)) throw new Error('Unable to resolve upgrade choice');
      picked.push(chosen);
    }
  }

  while (advanced + 1e-8 < duration && run.phase === 'fighting' && combat.hp > 0) {
    settleChoices();
    const dt = Math.min(1 / 60, duration - advanced);
    const player = pointAt(advanced);
    combat.party!.syncLeader(player, advanced * .43);
    // Order mirrors Game: combat first, RunFlow second, then optional level-up.
    combat.update(dt, player);
    run.update(dt, combat, player);
    advanced += dt;
    settleChoices();
    const alive = combat.enemies.filter(enemy => enemy.active);
    maximumActive = Math.max(maximumActive, alive.length);
    maximumProjectiles = Math.max(maximumProjectiles, combat.projectiles.filter(shot => shot.active).length);
    maximumDangerous = Math.max(maximumDangerous, alive.filter(enemy =>
      enemy.kind !== 'normal' && enemy.kind !== 'draft-crystal-swarm' && enemy.kind !== 'draft-treasure-runner').length);
    for (const enemy of alive) if (enemy.kind === 'draft-treasure-runner') treasureIds.add(enemy.id);
  }

  // RunFlow can defer wave settlement while end-of-wave experience choices are pending.
  settleChoices();
  if (run.phase === 'fighting' && run.remaining <= 1e-8) run.resolveBoundary(combat);

  const observedSeconds = round(advanced, 3);
  const escapes = combat.treasureEscapes;
  const seen = treasureIds.size;
  return {
    character: species, build, wave, seed: scenarioSeed,
    movement: 'fixed-circle-r6-omega0.43', independentWave: true,
    presetUpgrades: grants, chosenUpgrades: picked,
    scheduledSeconds: definition.seconds, observedSeconds,
    truncated: advanced + 1e-8 < definition.seconds && run.phase === 'fighting',
    phase: run.phase, bossDefeated: run.bossDefeated,
    hpStart: 100 + grants.filter(id => id === 'vitality').length * 20,
    hpEnd: round(combat.hp), damageEvents: combat.balanceTelemetry.damageEvents,
    kills: combat.kills, xp: combat.progression.totalExperience,
    xpPerMinute: round(advanced ? combat.progression.totalExperience / advanced * 60 : 0),
    weaponShots: Object.fromEntries(combat.runBuild.attacks.map(a => [a.attackId, a.shotsFired])),
    firedProjectiles: combat.shotsFired,
    projectileBlockedAttempts: combat.balanceTelemetry.projectileBlockedAttempts,
    projectilePeak: maximumProjectiles, projectileCapacity: COMBAT_LIMITS.projectiles,
    treasureSpawnsObserved: seen, treasureEscapes: escapes,
    treasureEscapeRate: seen ? round(escapes / seen, 4) : null,
    sporeExplosionKills: combat.sporeKills,
    sporeChainKills: combat.balanceTelemetry.sporeChainKills,
    activePeak: maximumActive, dangerousPeak: maximumDangerous,
    cap: definition.cap, level: combat.progression.level, coinsEarned: combat.goldEarned,
  };
}

export function waveBalanceMatrix(options: WaveBalanceOptions = {}) {
  return BALANCE_SPECIES.flatMap(character => BALANCE_BUILDS.flatMap(build =>
    RUN_WAVES.map((_, index) => measureWave(character, build, index + 1, options))));
}
