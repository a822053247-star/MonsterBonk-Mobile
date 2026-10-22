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
  enemyHealthPerCycle: .16,
  contactDamagePerCycle: .05, maxContactDamageMultiplier: 1.40,
  spawnRatePerCycle: .03, maxSpawnRateMultiplier: 1.24,
  populationPerCycle: .025, maxPopulationMultiplier: 1.15,
  bossHealthPerCycle: .28,
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
  {stages:[stage(20,'warmup',1.8,0,[],0),stage(40,'pressure',2,9,[F,F],3),stage(65,'release',3,0,[],0)],crystalFirst:8,sporeFirst:null,treasureFirst:null},
  {stages:[stage(12,'release',3.2,0,[],0),stage(36,'pressure',2.6,7,[F,T],5,2),stage(55,'release',3.6,0,[],0),stage(70,'pressure',2.8,8,[F,T],4,2)],crystalFirst:0,sporeFirst:null,treasureFirst:22},
  {stages:[stage(24,'pressure',3.2,6,[F,F,T,S],8,3,1),stage(44,'pressure',4,10,[F,T],5,2,1),stage(75,'release',5,0,[],0)],crystalFirst:0,sporeFirst:12,treasureFirst:30},
  {stages:[stage(12,'release',4,0,[],0),stage(35,'pressure',3,10,[T],3,2),stage(55,'pressure',4.5,10,[F,T],5,3),stage(75,'release',6,0,[],0)],crystalFirst:0,sporeFirst:null,treasureFirst:40},
  {stages:[stage(22,'pressure',4,5,[F,F,T,S],10,4,1),stage(50,'pressure',4.8,8,[F,T],7,3,1),stage(80,'release',5.8,0,[],0)],crystalFirst:0,sporeFirst:12,treasureFirst:30},
  {stages:[stage(10,'warmup',1.8,0,[],0),stage(30,'pressure',2.4,10,[F],3,1),stage(45,'release',3.6,0,[],0),stage(65,'pressure',2.6,10,[F,T],4,1),stage(90,'release',3.8,0,[],0)],crystalFirst:0,sporeFirst:null,treasureFirst:38},
];
const endlessFlagWave: WaveDirectorPlan={...WAVE_DIRECTOR[4],stages:[...WAVE_DIRECTOR[4].stages.slice(0,2),
  stage(70,'pressure',5.2,5,[F,F,T,S],12,5,1),stage(80,'release',5.8,0,[],0)]};
export const ENDLESS_WAVE_DIRECTOR: readonly WaveDirectorPlan[]=WAVE_DIRECTOR.map((plan,i)=>i===4?endlessFlagWave:plan);
/** Stop new dangerous arrivals before a harvest; never delete living enemies. */
export function releaseLeadIn(wave:number,elapsed:number,endless=false){
  const stages=(endless?ENDLESS_WAVE_DIRECTOR:WAVE_DIRECTOR)[wave-1].stages;
  const index=stages.findIndex(s=>elapsed<s.end);
  return index>=0&&stages[index+1]?.beat==='release'&&elapsed>=stages[index].end-6;
}

export function directorStage(wave: number, elapsed: number, endless = false, cycleIndex = 0): DirectorStage {
  const plan = (endless ? ENDLESS_WAVE_DIRECTOR : WAVE_DIRECTOR)[wave - 1];
  if (!plan) throw new RangeError('Invalid director wave');
  const current=plan.stages.find(s => elapsed < s.end) ?? plan.stages[plan.stages.length - 1];
  if(endless&&cycleIndex>0&&wave===1&&elapsed<20)return {...current,fodderPerSecond:3.5,
    escortEvery:elapsed<10?0:9,escorts:elapsed<10?[]:[F],fastCap:elapsed<10?0:3};
  return current;
}

