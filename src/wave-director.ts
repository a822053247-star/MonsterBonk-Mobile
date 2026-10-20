/** Pure, deterministic threat choreography for the six-wave formal run.
 * No damage, reward, spawn-cap or graphics changes live in this file.
 * "end" uses elapsed seconds, exclusive except the final boundary.
 */
export type DirectorBeat = 'warmup' | 'pressure' | 'release';
export type DirectorEscort = 'fast' | 'tank';

export interface DirectorStage {
  readonly end: number;
  readonly beat: DirectorBeat;
  /** Multiplies the wave's existing interval: lower means faster replacement. */
  readonly pace: number;
  /** Number of incoming half-batches that may carry one dangerous escort. */
  readonly escortPulses: 0 | 1 | 2;
  readonly escortEvery: number;
  readonly escorts: readonly DirectorEscort[];
  readonly fastCap: number;
  readonly tankCap: number;
  readonly sporeCap: number;
}
export interface WaveDirectorPlan {
  readonly stages: readonly [DirectorStage, DirectorStage, DirectorStage];
  readonly crystalFirst: number;
  readonly crystalInterval: number;
  readonly sporeFirst: number | null;
  readonly sporeInterval: number;
  readonly treasureFirst: number | null;
}

export const WAVE_DIRECTOR: readonly WaveDirectorPlan[] = [
  { stages: [
    { end:20, beat:'warmup', pace:1.15, escortPulses:0, escortEvery:2, escorts:['fast'], fastCap:0, tankCap:0, sporeCap:0 },
    { end:45, beat:'pressure',pace:.95, escortPulses:1, escortEvery:2, escorts:['fast'], fastCap:2, tankCap:0, sporeCap:0 },
    { end:65, beat:'release', pace:1.05, escortPulses:1, escortEvery:2, escorts:['fast'], fastCap:3, tankCap:0, sporeCap:0 },
  ], crystalFirst:8, crystalInterval:12, sporeFirst:null, sporeInterval:18, treasureFirst:null },
  { stages: [
    { end:18, beat:'warmup', pace:1.15, escortPulses:1, escortEvery:3, escorts:['fast'], fastCap:2, tankCap:0, sporeCap:1 },
    { end:50, beat:'pressure',pace:.90, escortPulses:2, escortEvery:1, escorts:['fast','tank','fast'], fastCap:6, tankCap:2, sporeCap:1 },
    { end:70, beat:'release', pace:1.08, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:4, tankCap:2, sporeCap:1 },
  ], crystalFirst:8, crystalInterval:14, sporeFirst:14, sporeInterval:25, treasureFirst:22 },
  { stages: [
    { end:20, beat:'warmup', pace:1.12, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:4, tankCap:2, sporeCap:1 },
    { end:55, beat:'pressure',pace:.86, escortPulses:2, escortEvery:1, escorts:['fast','tank','fast'], fastCap:10, tankCap:5, sporeCap:2 },
    { end:75, beat:'release', pace:1.1, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:5, tankCap:3, sporeCap:1 },
  ], crystalFirst:8, crystalInterval:12, sporeFirst:18, sporeInterval:18, treasureFirst:30 },
  { stages: [
    { end:10, beat:'warmup', pace:1.2, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:5, tankCap:3, sporeCap:0 },
    { end:50, beat:'pressure',pace:.9, escortPulses:2, escortEvery:1, escorts:['fast','tank','fast'], fastCap:12, tankCap:7, sporeCap:1 },
    { end:75, beat:'release', pace:1.07, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:6, tankCap:3, sporeCap:1 },
  ], crystalFirst:8, crystalInterval:16, sporeFirst:25, sporeInterval:22, treasureFirst:40 },
  { stages: [
    { end:25, beat:'release', pace:1.0, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:7, tankCap:4, sporeCap:1 },
    { end:60, beat:'pressure',pace:.78, escortPulses:2, escortEvery:1, escorts:['fast','tank','fast'], fastCap:16, tankCap:10, sporeCap:2 },
    { end:80, beat:'release', pace:.92, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:10, tankCap:5, sporeCap:2 },
  ], crystalFirst:8, crystalInterval:10, sporeFirst:16, sporeInterval:18, treasureFirst:30 },
  { stages: [
    { end:25, beat:'warmup', pace:1.2, escortPulses:1, escortEvery:2, escorts:['fast','tank'], fastCap:4, tankCap:2, sporeCap:0 },
    { end:60, beat:'pressure',pace:.95, escortPulses:2, escortEvery:2, escorts:['fast','tank'], fastCap:8, tankCap:5, sporeCap:1 },
    { end:90, beat:'pressure',pace:.88, escortPulses:1, escortEvery:1, escorts:['fast','tank'], fastCap:8, tankCap:4, sporeCap:1 },
  ], crystalFirst:8, crystalInterval:17, sporeFirst:28, sporeInterval:24, treasureFirst:38 },
] as const;

export function directorStage(wave: number, elapsed: number): DirectorStage {
  const plan = WAVE_DIRECTOR[wave - 1];
  if (!plan) throw new RangeError('Invalid director wave');
  return plan.stages.find(stage => elapsed < stage.end) ?? plan.stages[2];
}
