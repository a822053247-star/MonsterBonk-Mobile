import type { RelicDefinition, Requirements, ContentTag } from '../content-types';
import { gigapackCopy, GIGAPACK_FIELDS, type GigapackBehavior } from './gigapack-relics';

export type RelicBehavior = GigapackBehavior
  | { handler: 'refract'; damage: number; count: number }
  | { handler: 'return'; damage: number }
  | { handler: 'pull'; distance: number; cooldown: number }
  | { handler: 'mine'; every: number; delay: number; radius: number; damage: number; cap: number }
  | { handler: 'fire-zone'; duration: number; interval: number; damage: number; cooldown: number; cap: number; radius: number }
  | { handler: 'poison-zone'; duration: number; interval: number; damage: number; cooldown: number; cap: number; radius: number }
  | { handler: 'back-shot'; every: number; damage: number }
  | { handler: 'kill-wave'; window: number; kills: number; radius: number; damage: number; cooldown: number }
  | { handler: 'wet-bind'; duration: number; cooldown: number; slow: number; bossSlow: number }
  | { handler: 'blood'; maxHp: number; threshold: number; interval: number; heal: number; healCap: number };

function relic<const Id extends string>(id: Id, title: string, requirements: Requirements, tags: readonly ContentTag[],
  palette: RelicDefinition['art']['palette'], preset: string, behavior: RelicBehavior): RelicDefinition<Id> {
  return { id, title, category:'relic',rarity:'rare',modes:['formal'],tags,requirements,modifiers:[],behavior,
    art:{symbol:'orb',palette,png:`assets/ui/upgrade/illustrations/relics/${id}.png`},
    vfx:{preset,target:'all-weapons'},maxRank:1,rewards:{upgrade:true,shop:true} };
}
// Batch 01–05. Zone radius is a shared, bounded visual/gameplay footprint, not a weapon modifier.
export const FIRST_RELIC_BATCH = [
  relic('mirror-prism','镜面棱晶',{projectile:true},['projectile'],'water','water-impact',{handler:'refract',damage:.5,count:1}),
  relic('returning-crown','回旋叶冠',{weapon:'leaf'},['grass','projectile'],'grass','water-impact',{handler:'return',damage:.4}),
  relic('tidal-magnet','潮汐磁核',{weapon:'bubble',skills:['area']},['water','area'],'water','tidal-ring',{handler:'pull',distance:.7,cooldown:1.5}),
  relic('hive-fuse','蜂巢引信',{projectile:true},['projectile','area'],'fire','fire-explosion',{handler:'mine',every:4,delay:.7,radius:1.6,damage:.55,cap:2}),
  relic('ember-sigil','灼烬徽记',{anyWeapons:['spark','flame-sweep']},['fire','area'],'fire','ember-area',{handler:'fire-zone',duration:1.2,interval:.4,damage:.14,cooldown:2,cap:1,radius:1.6}),
] as const;

export const SECOND_RELIC_BATCH = [
  relic('spore-crown','孢子花冠',{weapon:'leaf'},['grass','area'],'grass','spore-area',{handler:'poison-zone',duration:1.6,interval:.4,damage:.12,cooldown:1.5,cap:2,radius:1.6}),
  relic('back-mirror','背影魔镜',{projectile:true},['projectile'],'water','water-impact',{handler:'back-shot',every:4,damage:.5}),
  relic('slaughter-drum','屠戮战鼓',{},['area'],'fire','fire-explosion',{handler:'kill-wave',window:3,kills:6,radius:3,damage:.35,cooldown:8}),
  relic('wet-vines','湿藤缠绕',{weapon:'leaf',weapons:['bubble']},['grass','water'],'grass','water-impact',{handler:'wet-bind',duration:.7,cooldown:1.2,slow:.3,bossSlow:.9}),
  relic('blood-pact','绝境血契',{},['melee','projectile'],'fire','fire-impact',{handler:'blood',maxHp:.85,threshold:.4,interval:.85,heal:1,healCap:2}),
] as const;

export function behaviorCopy(b: RelicBehavior) {
  const pct=(n:number)=>`${Number((n*100).toPrecision(8))}%`;
  switch(b.handler){
    case 'refract':return {benefit:`主弹命中折射 ${b.count} 名敌人 · ${pct(b.damage)}原伤`,tradeoff:`每根攻击链最多 ${b.count} 次；折射不再派生`};
    case 'return':return {benefit:`飞叶射程结束后返回 · ${pct(b.damage)}原伤`,tradeoff:'返回只命中此弹尚未命中的敌人'};
    case 'pull':return {benefit:`水系范围牵引普通怪 ${b.distance} 单位`,tradeoff:`冷却 ${b.cooldown} 秒；精英和Boss免疫位移`};
    case 'mine':return {benefit:`每 ${b.every} 次主弹命中生成地雷 · ${pct(b.damage)}原伤`,tradeoff:`${b.delay}秒后爆炸，半径${b.radius}；最多${b.cap}枚`};
    case 'fire-zone':case 'poison-zone':return {benefit:`${b.handler==='fire-zone'?'火系命中燃烧区':'草系击杀毒雾'} · 每${b.interval}秒${pct(b.damage)}原伤`,tradeoff:`持续${b.duration}秒，冷却${b.cooldown}秒；最多${b.cap}处`};
    case 'back-shot':return {benefit:`每第 ${b.every} 次主远程施放追加背射`,tradeoff:`幻影弹${pct(b.damage)}原伤；不再触发派生`};
    case 'kill-wave':return {benefit:`${b.window}秒内${b.kills}杀触发半径${b.radius}冲击波`,tradeoff:`${pct(b.damage)}原伤；冷却${b.cooldown}秒，冲击波不再蓄杀`};
    case 'wet-bind':return {benefit:`飞叶消耗湿润 · 移速降至${pct(b.slow)}，持续${b.duration}秒`,tradeoff:`同目标冷却${b.cooldown}秒；Boss移速降至${pct(b.bossSlow)}；精英最终移速不低于55%`};
    case 'blood':return {benefit:`生命≤${pct(b.threshold)}时间隔×${b.interval}；击杀恢复${b.heal}`,tradeoff:`最大生命-${pct(1-b.maxHp)}；每秒最多恢复${b.healCap}点；临时攻速合计上限×1.5`};
    default:return gigapackCopy(b);
  }
}

/** Known handler schemas are shared by authoring validation and event dispatch. */
export const BEHAVIOR_FIELDS = {
  ...GIGAPACK_FIELDS,
  refract:['damage','count'],return:['damage'],pull:['distance','cooldown'],mine:['every','delay','radius','damage','cap'],
  'fire-zone':['duration','interval','damage','cooldown','cap','radius'],'poison-zone':['duration','interval','damage','cooldown','cap','radius'],
  'back-shot':['every','damage'],'kill-wave':['window','kills','radius','damage','cooldown'],
  'wet-bind':['duration','cooldown','slow','bossSlow'],blood:['maxHp','threshold','interval','heal','healCap'],
} as const;
