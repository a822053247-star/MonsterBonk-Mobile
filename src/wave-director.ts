/** Time-authored difficulty. Fodder feeds growth; bounded escorts create pressure.
 * Rates never depend on the player's damage or chosen upgrades. */
export type DirectorBeat = 'warmup' | 'pressure' | 'release';
export type DirectorEscort = 'fast' | 'tank' | 'draft-spore-bomber';
export interface DirectorStage {
  readonly end: number;
  readonly beat: DirectorBeat;
  readonly fodderPerSecond: number;
  readonly population: number;
  readonly escortEvery: number;
  readonly escorts: readonly DirectorEscort[];
  readonly fastCap: number;
  readonly tankCap: number;
  readonly sporeCap: number;
}
export interface WaveDirectorPlan {
  readonly stages: readonly DirectorStage[];
  readonly crystalFirst: number;
  readonly sporeFirst: number | null;
  readonly treasureFirst: number | null;
}

export const ENDLESS_SCALING = {
  maxPopulation: 128,
  enemyHealthPerCycle: .10, maxEnemyHealthMultiplier: 1.6,
  contactDamagePerCycle: .05, maxContactDamageMultiplier: 1.25,
  spawnRatePerCycle: .04, maxSpawnRateMultiplier: 1.35,
  bossHealthPerCycle: .18, maxBossHealthMultiplier: 2.2,
  bossReward: 60,
} as const;

export type EndlessModifierId = 'fast-advance' | 'armored-line' | 'spore-chain' | 'crystal-surge' | 'treasure-bait';
export interface EndlessModifierDefinition {
  readonly id: EndlessModifierId;
  readonly title: string;
  readonly description: string;
}
export const ENDLESS_MODIFIERS: readonly EndlessModifierDefinition[] = [
  { id: 'fast-advance', title: '疾芽先锋', description: '快速敌人的编队配额增加，注意走位与冲刺' },
  { id: 'armored-line', title: '岩甲列阵', description: '重甲敌人的编队配额增加，优先考虑穿透与范围伤害' },
  { id: 'spore-chain', title: '孢子连锁', description: '爆孢怪更频繁地加入混编，利用爆炸清怪并留意预警' },
  { id: 'crystal-surge', title: '晶屑狂潮', description: '晶屑虫更早、更频繁出现，考验群体清理能力' },
  { id: 'treasure-bait', title: '携宝诱饵', description: '本轮每波至少尝试出现一次携宝兽，追击仍有风险' },
] as const;
function stage(end: number, beat: DirectorBeat, rate: number, every: number,
  escorts: readonly DirectorEscort[], fastCap: number, tankCap = 0, sporeCap = 0): DirectorStage {
  return { end, beat, fodderPerSecond: rate, population: beat === 'warmup' ? .8 : beat === 'release' ? 1 : .9,
    escortEvery: every, escorts, fastCap, tankCap, sporeCap };
}
const F = 'fast', T = 'tank', S = 'draft-spore-bomber';
export const WAVE_DIRECTOR: readonly WaveDirectorPlan[] = [
  { stages: [
    stage(20, 'warmup', 1.5, 0, [], 0),
    stage(45, 'pressure', 1.8, 7, [F,F], 5),
    stage(65, 'release', 2.8, 0, [], 0),
  ], crystalFirst:8, sporeFirst:null, treasureFirst:null },
  { stages: [
    stage(12, 'release', 3, 0, [], 0),
    stage(42, 'pressure', 2.6, 6, [F,T,F], 9, 3, 1),
    stage(60, 'release', 4, 0, [], 0),
    stage(70, 'pressure', 3, 5, [F,F,T,S], 10, 4, 1),
  ], crystalFirst:0, sporeFirst:14, treasureFirst:22 },
  { stages: [
    stage(28, 'pressure', 3.4, 5, [F,T,F,S], 12, 5, 2),
    stage(48, 'release', 5.5, 0, [], 0),
    stage(62, 'pressure', 3.8, 4, [F,F,T,F,S], 14, 6, 2),
    stage(75, 'release', 6, 0, [], 0),
  ], crystalFirst:0, sporeFirst:18, treasureFirst:30 },
  { stages: [
    stage(10, 'release', 5, 0, [], 0),
    stage(40, 'pressure', 4, 5, [T,F,F,T,F], 16, 8, 1),
    stage(60, 'release', 7, 0, [], 0),
    stage(75, 'pressure', 4.5, 4, [F,T,F,S,F], 18, 8, 2),
  ], crystalFirst:0, sporeFirst:25, treasureFirst:40 },
  { stages: [
    stage(25, 'pressure', 5, 4, [F,T,F,S,T,F], 20, 10, 2),
    stage(55, 'release', 8, 0, [], 0),
    stage(70, 'pressure', 5.5, 3.5, [F,F,T,S,F,T], 22, 10, 2),
    stage(80, 'release', 8, 0, [], 0),
  ], crystalFirst:0, sporeFirst:16, treasureFirst:30 },
  { stages: [
    stage(10, 'warmup', 2.5, 0, [], 0),
    stage(25, 'pressure', 3, 6, [F,T,F], 8, 4, 1),
    stage(35, 'release', 5, 0, [], 0),
    stage(50, 'pressure', 3.5, 5, [F,F,T,S], 10, 5, 1),
    stage(62, 'release', 5.5, 0, [], 0),
    stage(78, 'pressure', 4, 4, [F,T,F,S,F], 12, 5, 2),
    stage(84, 'release', 6, 0, [], 0),
    stage(90, 'pressure', 4.5, 3.5, [F,F,T,F], 14, 5, 2),
  ], crystalFirst:0, sporeFirst:28, treasureFirst:38 },
];

const endlessFlagWave: WaveDirectorPlan = {
  ...WAVE_DIRECTOR[4],
  stages: [
    ...WAVE_DIRECTOR[4].stages.slice(0, 3),
    stage(75, 'pressure', 6.5, 3, [F,F,T,S,F,T,F], 24, 12, 2),
    stage(80, 'release', 8, 0, [], 0),
  ],
};
/** Only Endless gets the stronger final surge; the finite campaign keeps its authored pacing. */
export const ENDLESS_WAVE_DIRECTOR: readonly WaveDirectorPlan[] = WAVE_DIRECTOR.map((plan, index) =>
  index === 4 ? endlessFlagWave : plan);

export function directorStage(wave: number, elapsed: number, endless = false): DirectorStage {
  const plan = (endless ? ENDLESS_WAVE_DIRECTOR : WAVE_DIRECTOR)[wave - 1];
  if (!plan) throw new RangeError('Invalid director wave');
  return plan.stages.find(s => elapsed < s.end) ?? plan.stages[plan.stages.length - 1];
}
