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
export function directorStage(wave: number, elapsed: number): DirectorStage {
  const plan = WAVE_DIRECTOR[wave - 1];
  if (!plan) throw new RangeError('Invalid director wave');
  return plan.stages.find(s => elapsed < s.end) ?? plan.stages[plan.stages.length - 1];
}
