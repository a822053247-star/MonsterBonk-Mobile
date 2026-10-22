import {WEAPON_PAIR_RECIPES,PAIR_IDS,type PairSkillId,type WeaponPairId} from './weapon-pair-fusion';
import { factoryRelic } from './content/relic-registry';
import { meetsRequirements, type ContentSkillId } from './content/content-types';
import type { RunBuild } from './run-build';
import type { BaseAttackId } from './fusion';
import { flameSweepStats } from './flame-sweep';
import { bladeStats, isBlade } from './blade-weapons';
import { thunderStats } from './thunder-weapon';
import { frostStats } from './frost-combat';
import { dreamEchoStats, seedPierces } from './dream-combat';
import { ICE_SKILL_IDS, ICE_SKILL_NAMES, iceSkillStats, type IceSkill } from './ice-skills';
import { WATER_AOE_IDS, WATER_NAMES, waterStats, type WaterSkill } from './water-aoe';
import { POSITION_IDS, POSITION_NAMES, positionStats, type PositionSkill } from './position-aoe';
import { WATER_EVOLUTION_IDS, WATER_EVOLUTIONS, isWaterEvolution, evolutionReady, consumedByEvolution } from './water-evolution';
import { RELICS, EVOLUTIONS, isRelicId, isEvolutionId, WEAPON_DAMAGE_PER_LEVEL, type RelicId, type EvolutionId } from './relics';

export type SkillId = ContentSkillId | RelicId | EvolutionId | PairSkillId;
export type SkillRanks = Record<SkillId, number>;
export interface SkillStats {
  damageMultiplier: number; attackRateMultiplier: number; projectileCount: number;
  maxHp: number; moveMultiplier: number; rangeMultiplier: number;
  orbitCount: number; orbitDamage: number; orbitRadius: number; orbitSpeed: number;
  shockDamage: number; shockRadius: number; shockInterval: number;
  splitOnHit: number;
}
type AdditiveStat = 'damageMultiplier' | 'attackRateMultiplier' | 'projectileCount' | 'maxHp' | 'moveMultiplier' | 'rangeMultiplier';
type Effect = { type: 'add'; stat: AdditiveStat; perRank: number; percent?: boolean }
  | { type: 'spell'; levels: readonly Partial<SkillStats>[] };
export interface SkillDefinition {
  id: SkillId; title: string; benefit: string; description: string;
  category?: 'relic' | 'evolution'; tradeoff?: string;
  maxRank: number; icon: 'spark' | 'dash' | 'battle' | 'heart' | 'leaf' | 'compass' | 'orbit' | 'wave';
  color: string; effect: Effect;
}

/** Balance lives here; percentages are additive relative to the unmodified base. */
export const SKILLS: readonly SkillDefinition[] = [
  { id: 'damage', title: '魔力浓缩', benefit: '魔法弹伤害 +20%', description: '每级增加基础魔法弹伤害的 20%，让每一发魔法更有分量。', maxRank: 5, icon: 'spark', color: '#d6b9f5', effect: { type: 'add', stat: 'damageMultiplier', perRank: 0.2, percent: true } },
  { id: 'haste', title: '施法节拍', benefit: '攻击速度 +15%', description: '每级增加基础攻击频率的 15%，缩短两次自动施法之间的等待。', maxRank: 5, icon: 'dash', color: '#f4ce93', effect: { type: 'add', stat: 'attackRateMultiplier', perRank: 0.15, percent: true } },
  { id: 'multishot', title: '分枝魔法', benefit: '投射物数量 +1', description: '每次施法额外发射一颗魔法弹，以扇形同时覆盖更多敌人。', maxRank: 3, icon: 'battle', color: '#b4d3fc', effect: { type: 'add', stat: 'projectileCount', perRank: 1 } },
  { id: 'vitality', title: '蓬勃生长', benefit: '最大生命值 +20', description: '每级增加 20 点最大生命，并立即恢复同样数值的生命。', maxRank: 5, icon: 'heart', color: '#f4ae9d', effect: { type: 'add', stat: 'maxHp', perRank: 20 } },
  { id: 'movement', title: '草叶轻步', benefit: '移动速度 +10%', description: '每级增加基础移动速度的 10%，轻巧地穿行在怪物之间。', maxRank: 5, icon: 'leaf', color: '#d8ec9f', effect: { type: 'add', stat: 'moveMultiplier', perRank: 0.1, percent: true } },
  { id: 'range', title: '远星回响', benefit: '攻击范围 +15%', description: '每级增加基础锁敌范围的 15%，同时延长魔法弹的有效飞行距离。', maxRank: 5, icon: 'compass', color: '#a2dfd2', effect: { type: 'add', stat: 'rangeMultiplier', perRank: 0.15, percent: true } },
  { id: 'orbit', title: '伴星魔法球', benefit: '环绕玩家的魔法球', description: '习得一颗自动环绕并伤害敌人的伴星；强化可增加数量、伤害与轨道半径。', maxRank: 3, icon: 'orbit', color: '#a7edf0', effect: { type: 'spell', levels: [
    { orbitCount: 1, orbitDamage: 12, orbitRadius: 2.2, orbitSpeed: 2.4 },
    { orbitCount: 2, orbitDamage: 18, orbitRadius: 2.4, orbitSpeed: 2.7 },
    { orbitCount: 3, orbitDamage: 24, orbitRadius: 2.6, orbitSpeed: 3 },
  ] } },
  { id: 'shockwave', title: '草原冲击波', benefit: '周期性范围冲击波', description: '向周围释放扩散魔法波；同一波对每个敌人只造成一次伤害。强化会扩大范围并缩短周期。', maxRank: 3, icon: 'wave', color: '#f3de9a', effect: { type: 'spell', levels: [
    { shockDamage: 24, shockRadius: 3.8, shockInterval: 4.5 },
    { shockDamage: 34, shockRadius: 4.6, shockInterval: 4 },
    { shockDamage: 44, shockRadius: 5.4, shockInterval: 3.5 },
  ] } },
];
export const FUSION_SKILLS: readonly SkillDefinition[] = [...SKILLS,
  { id: 'split-on-hit', title: '命中分裂', benefit: '命中派生两枚小火种', description: '火花弹命中后分裂，与焰绒自动融合为爆裂火种：小范围爆炸并派生两枚火种。可与分枝魔法同时生效。', maxRank: 1, icon: 'spark', color: '#ffb45f', effect: { type: 'spell', levels: [{ splitOnHit: 1 }] } },
];
/** Development-only pools; no new water/grass cards leak into historical or P1 modes. */
const AREA_CARD: SkillDefinition = { id: 'area', title: '范围扩张', benefit: '水泡命中扩散', description: '水泡弹自动融合为深海泡影，命中时扩散范围伤害与减速。', maxRank: 1, icon: 'wave', color: '#8fe8ff', effect: { type: 'spell', levels: [{}] } };
const CHAIN_CARD: SkillDefinition = { id: 'chain', title: '连锁弹射', benefit: '命中后跳向附近敌人', description: '自动形成连环水爆或跳跃荆棘；最多两次额外跳跃，不重复锁定已命中的敌人。', maxRank: 1, icon: 'compass', color: '#a5edbe', effect: { type: 'spell', levels: [{}] } };
export const WATER_SKILLS: readonly SkillDefinition[] = [...SKILLS, AREA_CARD, CHAIN_CARD];
export const GRASS_SKILLS: readonly SkillDefinition[] = [...SKILLS, { ...FUSION_SKILLS[FUSION_SKILLS.length - 1], title: '命中分裂', benefit: '飞叶弹命中散射三枚荆棘', description: '飞叶弹自动融合为荆棘散射；派生荆棘不会再次分裂。', icon: 'leaf', color: '#b4ea86' }, CHAIN_CARD];
const BUBBLE_WEAPON: SkillDefinition = { id: 'bubble-weapon', title: '获得水泡弹', benefit: '增加独立自动攻击 · 命中减速', description: '装备第二种武器。水泡弹独立索敌、自动释放，命中使敌人减速 30%，持续 1.5 秒。副武器初始攻击间隔为基础的 1.6 倍。', maxRank: 1, icon: 'wave', color: '#55c9ed', effect: { type: 'spell', levels: [{}] } };
export const WEAPON_CARDS: Partial<Record<SkillId, BaseAttackId>> = { 'spark-weapon': 'spark', 'bubble-weapon': 'bubble', 'leaf-weapon': 'leaf', 'flame-sweep-weapon': 'flame-sweep', 'thorn-wheel-weapon': 'thorn-wheel', 'tidal-blade-weapon': 'tidal-blade', 'thunder-bud-weapon': 'thunder-bud', 'frost-crystal-weapon': 'frost-crystal', 'dream-dart-weapon': 'dream-dart', 'resonance-seed-weapon': 'resonance-seed' };
const WATER_AOE_DESCRIPTIONS: Record<WaterSkill, string> = {
  'azure-burst': '自动瞄准附近密集敌群，短暂聚光后对圆内造成一次水系伤害并施加湿润。每4.5秒释放；升级扩大范围并提高伤害。',
  'star-tide': '从施法位置向外扩张水环，仅圆环经过时命中，同一圈不重复伤害。3级双环、5级三环，并轻推普通怪；每5.5秒释放。',
  'still-sea': '在敌群脚下留下固定领域，每0.5秒伤害并减速。多个同类领域重叠不叠加跳伤。升级延长持续时间、扩大范围并提高伤害。',
  'returning-ring': '持续围绕角色的水流光环，每0.5秒伤害并减速圆内敌人，随角色移动。升级提高范围和伤害；不提供无敌或护盾。',
};
const WATER_AOE_CARDS: readonly SkillDefinition[] = WATER_AOE_IDS.map(id => ({
  id, title: WATER_NAMES[id], benefit: id === 'azure-burst' ? '自动锁定敌群 · 圆形震爆' : id === 'star-tide' ? '扩张水环 · 升级增加波次' : id === 'still-sea' ? '持续范围伤害 · 减速领域' : '随身水环 · 持续伤害与减速',
  description: WATER_AOE_DESCRIPTIONS[id] + ' 水系命中可配合现有元素协同；精英受到70%、首领受到40%伤害，首领减速效果减弱。',
  maxRank: 5, icon: 'wave', color: '#88deff', effect: { type: 'spell', levels: [{}, {}, {}, {}, {}] },
}));
const POSITION_DESCRIPTIONS: Record<PositionSkill, string> = {
  'abyss-vortex': '每6秒在附近敌群中心召唤漩涡，每0.5秒伤害。持续吸引普通怪，精英受弱吸引，首领不被拖动。升级提高伤害、范围与持续时间。',
  'ice-radiance': '每4.5秒从附近静海法阵或角色位置释放攻击，放射光束与扩张圆环交替。光束间留有空隙；每次对同一目标只伤害一次。升级从8道增加到16道。',
  'spore-trail': '移动约1.2米留下绿色毒焰区域，持续跳伤；站立不生成。同类足迹重叠不叠加跳伤，最多保留16块，满池时替换最旧足迹。升级扩大范围并延长残留。',
  'tidal-recall': '每7秒释放外扩后回收的水浪，两阶段各命中一次。回收水浪向角色收束，扫过的经验球进入原有吸引流程，经验值不额外复制。升级提高范围与伤害。',
};
const POSITION_CARDS: readonly SkillDefinition[] = POSITION_IDS.map(id => ({
  id, title: POSITION_NAMES[id], benefit: id === 'abyss-vortex' ? '漩涡聚怪 · 精英弱吸引' : id === 'ice-radiance' ? '光束与圆环交替' : id === 'spore-trail' ? '移动留下毒焰足迹' : '往返水浪 · 回收经验',
  description: POSITION_DESCRIPTIONS[id] + ' 精英承受70%、首领承受40%伤害；派生协同受预算限制。',
  maxRank: 5, icon: id === 'spore-trail' ? 'leaf' : 'wave', color: id === 'spore-trail' ? '#c6ec65' : '#88deff',
  effect: { type: 'spell', levels: [{}, {}, {}, {}, {}] },
}));
const ICE_CARDS: readonly SkillDefinition[] = ICE_SKILL_IDS.map(id => ({
  id, title: ICE_SKILL_NAMES[id], benefit: id === 'shatter-ring' ? '扩散冰环 · 冻结目标额外伤害' : '移动铺冰 · 持续伤害与减速',
  description: (id === 'shatter-ring'
    ? '每5秒从角色位置释放碎冰震环，对扫过的敌人造成24伤害，同次只命中一次；已冻结目标额外承受50%伤害，保留剩余冻结时间。升级提高伤害和范围，缩短间隔。'
    : '移动每1米留下一段冰川滑痕，持续3秒，每0.5秒造成5伤害并施加霜寒。站立不铺冰，重叠区域不叠加跳伤；最多24段，满池替换最旧冰痕。升级提高伤害、宽度和持续时间。')
    + ' 冰系命中可与湿润组合冻结；精英承受70%、首领40%伤害。独立技能，不占武器槽，最高5级。',
  maxRank: 5, icon: 'wave', color: '#9de5ff', effect: { type: 'spell', levels: [{}, {}, {}, {}, {}] },
}));
const BUILD_SKILLS: readonly SkillDefinition[] = [...SKILLS, ...WATER_AOE_CARDS, ...POSITION_CARDS, ...ICE_CARDS,
  { ...BUBBLE_WEAPON, id: 'dream-dart-weapon', title: '获得绯梦弹', benefit: '叠加梦印 · 三层绽放', description: '自动发射14伤害粉色光弹，命中添加1层梦印，持续4秒；同一目标积满3层后清空梦印，绽放造成160%本次命中伤害，半径2.2。绽放不会继续叠梦印。武器最高5级，每级伤害+14%；占用武器槽。', icon: 'spark', color: '#ff80c7' },
  { ...BUBBLE_WEAPON, id: 'resonance-seed-weapon', title: '获得共鸣花种', benefit: '穿透挂印 · 击杀传伤', description: '自动发射15伤害花种，穿透3个目标，施加4秒共鸣印记。带印敌人被击败时，向4米内最多3名带共鸣印记的敌人传递65%花种命中伤害。传伤击杀不会再次传递，障碍阻挡。3级穿透4个、5级5个目标，每级伤害+14%；占用武器槽。', icon: 'leaf', color: '#f797df' },
  { id: 'sakura-echo', title: '绯樱回响', benefit: '梦印扩圈 · 延长共鸣', description: '每4.6秒选取10米内带梦印或共鸣印记的敌人，优先梦印较多者，释放16伤害粉色脉冲。基础半径2，每层梦印增加0.55；不消耗梦印。命中仍存活的共鸣目标时，印记延长1秒，剩余时长最多6秒。升级提高伤害、范围、延长时间并缩短间隔；最高5级，不占武器槽。粉色派生范围伤害对精英70%、首领40%。', maxRank: 5, icon: 'spark', color: '#ff91d1', effect: { type: 'spell', levels: [{}, {}, {}, {}, {}] } },
  { ...BUBBLE_WEAPON, id: 'frost-crystal-weapon', title: '获得霜晶弹', benefit: '冰晶减速 · 与水系命中组合冻结', description: '自动发射16伤害冰晶，霜寒使普通敌人减速35%，持续1.6秒。湿润与霜寒相遇时消耗湿润：普通怪冻结1.25秒，精英0.45秒；首领只减速。先水后冰或先冰后水均可触发，解冻后抗性2.5秒。3级可额外穿透1名、5级2名；每级伤害+14%、间隔略缩短。副武器受槽位间隔系数影响。', icon: 'wave', color: '#9de5ff' },
  { ...BUBBLE_WEAPON, id: 'thunder-bud-weapon', title: '获得雷芽连锁', benefit: '黄色雷芽放电 · 最多连击3个不同目标', description: '每1.3秒自动锁定附近敌人，短暂蓄电后造成22点电系伤害，再跳向3.2范围内的其他敌人。每跳保留82%伤害，升级逐步提高至90%；同次施放不重复命中，最高级最多6个目标。升级提高伤害、跳跃距离并缩短间隔。障碍和出生保护阻挡选敌；分枝、分裂、连锁不额外复制攻击。', icon: 'spark', color: '#ffe26b' },
  { ...BUBBLE_WEAPON, id: 'thorn-wheel-weapon', title: '获得环刃荆轮', benefit: '双荆轮绕身切割 · 3级增加第三枚', description: '两枚荆轮沿轨道切割，每次命中伤害14；同一敌人每0.55秒最多受一次主荆轮伤害。3级三枚、4级轻推普通怪、5级周期扩圈。轨道中心留空隙，不提供护盾；不穿障碍。攻速加快公转，分枝、分裂、连锁不复制荆轮。精英承受70%、首领40%伤害。', icon: 'orbit', color: '#b6db65' },
  { ...BUBBLE_WEAPON, id: 'tidal-blade-weapon', title: '获得回旋潮刃', benefit: '宽刃穿透敌群 · 往返各命中一次', description: '自动朝附近敌人掷出水刃，伤害26、射程8、间隔2.1秒。飞至远端后追随角色返回；同一敌人去程和回程各命中一次并减速。升级扩大刃面、增加射程并缩短间隔；障碍阻挡伤害，不阻止回收。分枝、分裂、连锁不复制水刃。精英承受70%、首领40%伤害。', icon: 'wave', color: '#72dfff' },
  { id: 'screen-barrage', title: '星雨弹幕', benefit: '每5秒释放12道弹幕 · 环形/扇形/交叉轮换', description: '升级至18/24道，分2/3轮发射。每道最多命中3个目标，穿透伤害保留80%；同次施法对每个目标只直接命中一次。弹幕穿越障碍，精英受到70%、首领受到40%伤害。', maxRank: 3, icon: 'battle', color: '#ffcd87', effect: { type: 'spell', levels: [{}, {}, {}] } },
  { id: 'screen-nova', title: '星陨爆发', benefit: '每12秒轰击当前全屏 · 伤害85', description: '短暂预警后，对爆发瞬间镜头内的敌人造成一次伤害，穿越障碍。精英受到70%、首领受到40%伤害。每级伤害增加25%，可触发有限元素击杀协同。', maxRank: 3, icon: 'wave', color: '#ffcb70', effect: { type: 'spell', levels: [{}, {}, {}] } },
  { ...BUBBLE_WEAPON, id: 'flame-sweep-weapon', title: '获得火焰横扫', benefit: '扇形火浪 · 升级扩大覆盖', description: '向附近敌人展开一片火焰：伤害 36、半径 2.8、180°、间隔 0.72 秒。升级逐步扩大火浪，5 级覆盖一整圈；每次只有一次横扫。对精英和首领造成 70% 伤害；不穿障碍，分枝、分裂和连锁不复制攻击。', icon: 'battle', color: '#ff8c35' },
  { ...FUSION_SKILLS[FUSION_SKILLS.length - 1], benefit: '火花爆炸分裂 / 飞叶弹散射', description: '所有已装备火花弹自动形成爆裂火种，飞叶弹形成荆棘散射；派生最多一代，可与连锁共存。' },
  AREA_CARD, CHAIN_CARD,
  { ...BUBBLE_WEAPON, description: '独立自动释放水泡弹，命中减速 30%，持续 1.5 秒。副武器一 / 二的攻击间隔分别为基础的 1.6 / 1.9 倍。' },
  { ...BUBBLE_WEAPON, id: 'spark-weapon', title: '获得火花弹', benefit: '增加火系独立自动攻击', description: '装备火花弹，基础伤害 18。获得命中分裂后自动融合爆裂火种。副武器间隔按槽位为基础的 1.6 / 1.9 倍。', icon: 'spark', color: '#ff9849' },
  { ...BUBBLE_WEAPON, id: 'leaf-weapon', title: '获得飞叶弹', benefit: '增加草系独立自动攻击 · 穿透', description: '装备飞叶弹，基础伤害 16，可穿透一名额外敌人。支持命中分裂与连锁弹射，副武器间隔按槽位为基础的 1.6 / 1.9 倍。', icon: 'leaf', color: '#70bc52' },
];
const RARE_SKILLS: readonly SkillDefinition[] = [
  ...Object.entries(RELICS).map(([id, data]) => ({ ...data, id: id as RelicId, category: 'relic' as const, description: 'description' in data ? data.description : '获得后本局持续生效，同一道具不能重复获得。', maxRank: 1, effect: { type: 'spell' as const, levels: [{}] } })),
  ...Object.entries(EVOLUTIONS).map(([id, data]) => ({ ...data, id: id as EvolutionId, category: 'evolution' as const, description: '爆裂火种的互斥进化，选择后本局不可切换。', maxRank: 1, effect: { type: 'spell' as const, levels: [{}] } })),
];
const PAIR_SKILLS:readonly SkillDefinition[]=[
  {id:'weapon-pair-fusion',title:'双武器融合',benefit:'选择配方 · 两把合为一把',description:'两把不同基础武器达到3级可自愿融合，释放一个槽位，保留技能和遗物。取消可返回普通升级。',maxRank:1,icon:'battle',color:'#f4d69c',effect:{type:'spell',levels:[{}]}},
  ...PAIR_IDS.map(id=>({id:`${id}-weapon` as PairSkillId,title:WEAPON_PAIR_RECIPES[id].title+'强化',benefit:'融合武器直接伤害提升',description:`每级伤害较3级基础增加${Math.round(WEAPON_PAIR_RECIPES[id].growth*100)}%；最高5级。保留来源、技能与遗物，攻击间隔不随等级缩短。`,maxRank:5,icon:'battle' as const,color:'#f4d69c',effect:{type:'spell' as const,levels:[{},{},{},{},{}]}}))
];
const WATER_EVOLUTION_CARDS: readonly SkillDefinition[] = WATER_EVOLUTION_IDS.map(id => ({
  id, title: WATER_EVOLUTIONS[id].title, benefit: WATER_EVOLUTIONS[id].benefit,
  description: WATER_EVOLUTIONS[id].description + ' 条件：' + WATER_EVOLUTIONS[id].requirement + '；选择后接替两项基础攻击，材料锁定，本局不能再用于其他进化。精英受到70%、首领受到40%伤害。',
  category: 'evolution', maxRank: 1, icon: id === 'undertow-pyre' ? 'leaf' : 'wave', color: id === 'undertow-pyre' ? '#c6ec65' : '#88deff', effect: { type: 'spell', levels: [{}] },
}));
const RUN_SKILLS = [...BUILD_SKILLS.map(skill => WEAPON_CARDS[skill.id] ? { ...skill, maxRank: 5 } : skill), ...RARE_SKILLS, ...PAIR_SKILLS, ...WATER_EVOLUTION_CARDS];
const ALL_SKILLS = RUN_SKILLS;
export const EXPERIENCE = { initial: 8, increment: 4 } as const;
export const MAX_LEVEL = 1 + SKILLS.reduce((total, skill) => total + skill.maxRank, 0);
export const SKILL_RULES = { orbitHitInterval: 0.55, orbitBallRadius: 0.28, waveDuration: 0.55, maxOrbitBalls: 3 } as const;

export function emptyRanks(): SkillRanks {
  return Object.fromEntries(ALL_SKILLS.map((skill) => [skill.id, 0])) as SkillRanks;
}
export function experienceThreshold(level: number) {
  return level >= MAX_LEVEL ? Infinity : EXPERIENCE.initial + Math.max(0, level - 1) * EXPERIENCE.increment;
}
export function calculateStats(ranks: SkillRanks): Readonly<SkillStats> {
  const stats: SkillStats = { damageMultiplier: 1, attackRateMultiplier: 1, projectileCount: 1, maxHp: 100, moveMultiplier: 1, rangeMultiplier: 1, orbitCount: 0, orbitDamage: 0, orbitRadius: 0, orbitSpeed: 0, shockDamage: 0, shockRadius: 0, shockInterval: 0, splitOnHit: 0 };
  for (const skill of ALL_SKILLS) {
    const rank = Math.min(skill.maxRank, Math.max(0, Math.floor(ranks[skill.id] || 0)));
    if (skill.effect.type === 'add') stats[skill.effect.stat] += rank * skill.effect.perRank;
    else if (rank > 0) Object.assign(stats, skill.effect.levels[rank - 1]);
  }
  return Object.freeze(stats);
}

export function upgradePreview(skill: SkillDefinition, ranks: SkillRanks) {
  if (ranks[skill.id] >= skill.maxRank) return;
  const before = calculateStats(ranks), after = calculateStats({ ...ranks, [skill.id]: ranks[skill.id] + 1 });
  if (skill.effect.type === 'add') {
    const stat = skill.effect.stat;
    const format = (value: number) => skill.effect.type === 'add' && skill.effect.percent ? `${Math.round(value * 100)}%` : String(value);
    return `${format(before[stat])} → ${format(after[stat])}`;
  }
  if (skill.category === 'relic') return '稀有道具 · 本局生效';
  if (isWaterEvolution(skill.id)) return WATER_EVOLUTIONS[skill.id].requirement + ' · 组合进化';
  if (skill.category === 'evolution') return '互斥进化 · 本局不可切换';
  if (WATER_AOE_IDS.includes(skill.id as WaterSkill)) {
    const rank = ranks[skill.id], next = waterStats(skill.id as WaterSkill, rank + 1);
    return `${rank ? rank + '级' : '未习得'} → ${rank + 1}级 · 半径 ${next.radius.toFixed(1)} · ${next.damage.toFixed(1)}伤害${skill.id === 'star-tide' ? ' · ' + next.waves + '环' : ''}`;
  }
  if (WEAPON_CARDS[skill.id]) return skill.title.includes('强化') ? `武器 ${ranks[skill.id]} → ${ranks[skill.id] + 1}级` : `空副武器槽 → ${skill.title.replace('获得', '')} · 独立自动攻击`;
  if (skill.id === 'sakura-echo') {
    const rank = ranks[skill.id], stats = dreamEchoStats(rank + 1);
    return `${rank ? rank + '级' : '未习得'} → ${rank + 1}级 · ${stats.damage.toFixed(1)}伤害 · ${stats.interval.toFixed(1)}秒/次`;
  }
  if (ICE_SKILL_IDS.includes(skill.id as IceSkill)) {
    const rank = ranks[skill.id], stats = iceSkillStats(skill.id as IceSkill, rank + 1);
    return `${rank ? rank + '级' : '未习得'} → ${rank + 1}级 · ${stats.damage.toFixed(1)}伤害 · ${skill.id === 'shatter-ring' ? '范围 ' + stats.radius.toFixed(1) : '残留 ' + stats.duration.toFixed(1) + '秒'}`;
  }
  if (POSITION_IDS.includes(skill.id as PositionSkill)) {
    const rank = ranks[skill.id], stats = positionStats(skill.id as PositionSkill, rank + 1);
    return `${rank ? rank + '级' : '未习得'} → ${rank + 1}级 · 范围 ${stats.radius.toFixed(1)}${skill.id === 'ice-radiance' ? ' · ' + stats.beams + '道' : ' · ' + stats.damage.toFixed(1) + '伤害'}`;
  }
  if (skill.id === 'orbit') return `${before.orbitCount ? `${before.orbitCount} 颗` : '未习得'} → ${after.orbitCount} 颗 · ${after.orbitDamage} 伤害`;
  if (skill.id === 'screen-nova') return `${ranks[skill.id] ? 85 * (1 + .25 * (ranks[skill.id] - 1)) + ' 伤害' : '未习得'} → ${85 * (1 + .25 * ranks[skill.id])} 全屏伤害 · 12秒/次`;
  if (skill.id === 'screen-barrage') return `${ranks[skill.id] ? 12 + (ranks[skill.id] - 1) * 6 + ' 道' : '未习得'} → ${12 + ranks[skill.id] * 6} 道 · ${ranks[skill.id] + 1}轮 · 5秒/次`;
  if (skill.id === 'split-on-hit' && skill.description.includes('所有已装备')) return '已装备火花 / 飞叶弹 → 对应融合';
  if (skill.id === 'split-on-hit') return skill.icon === 'leaf' ? '飞叶弹 → 荆棘散射 · 自动融合' : '火花弹 → 爆裂火种 · 自动融合';
  if (skill.id === 'area' || skill.id === 'chain') return '未习得 → 自动融合';
  return `${before.shockDamage ? `${before.shockDamage} 伤害` : '未习得'} → ${after.shockDamage} 伤害 · ${after.shockInterval} 秒/次`;
}

export class Progression {
  level = 1;
  experience = 0;
  totalExperience = 0;
  pendingChoices = 0;
  readonly ranks = emptyRanks();
  private currentStats = calculateStats(this.ranks);
  private currentOffers: SkillId[] = [];
  private fusionSkills = false;
  private purchasedRanks = 0;
  private rollsWithoutCore = 0;
  private runBuild?: RunBuild;
  get build() { return this.runBuild; }
  set build(value: RunBuild | undefined) {
    this.runBuild = value;
    if (value) value.skillRanks = this.ranks;
  }
  fusionBase: 'spark' | 'bubble' | 'leaf' = 'spark';

  constructor(private random: () => number = Math.random) {}
  get stats() { return this.currentStats; }
  private get pool() {
    return !this.fusionSkills ? SKILLS : this.build ? RUN_SKILLS
      : this.fusionBase === 'bubble' ? WATER_SKILLS : this.fusionBase === 'leaf' ? GRASS_SKILLS : FUSION_SKILLS;
  }
  get skills() {
    if (!this.build || !this.fusionSkills) return this.pool;
    return this.pool.filter(skill => {
      if (isWaterEvolution(skill.id)) return evolutionReady(skill.id, this.ranks);
      if (consumedByEvolution(skill.id, this.ranks)) return false;
      if(skill.id==='weapon-pair-fusion')return this.build!.availablePairs().length>0;
      const pair=PAIR_IDS.find(id=>skill.id===`${id}-weapon`);
      if(pair)return this.build!.attacks.some(a=>a.pairId===pair&&a.level<5);
      if(WEAPON_CARDS[skill.id]&&this.build!.consumed(WEAPON_CARDS[skill.id]!))return false;
      const definition = factoryRelic(skill.id);
      if (definition && !meetsRequirements(definition.requirements, this.build!.relicContext)) return false;
      const weapon = WEAPON_CARDS[skill.id];
      if (skill.id === 'sakura-echo') return this.build!.hasOrigin('dream-dart') || this.build!.hasOrigin('resonance-seed');
      if (weapon && !this.build!.has(weapon) && this.build!.attacks.length >= 3) return false;
      if (skill.category === 'evolution') return this.build!.hasOrigin('spark') && this.ranks['split-on-hit'] > 0 && !this.build!.evolution;
      if (skill.id === 'overload-core') return this.build!.hasOrigin('flame-sweep') || (this.build!.hasOrigin('spark') && this.ranks['split-on-hit'] > 0) || (this.build!.hasOrigin('bubble') && this.ranks.area > 0);
      if (skill.id === 'hunter-eye' || skill.id === 'shattered-core') return (this.ranks['split-on-hit'] > 0 && (this.build!.hasOrigin('spark') || this.build!.hasOrigin('leaf'))) || this.build!.relics.includes('draft-thorn-testament');
      if (skill.id === 'draft-martyr-core' || skill.id === 'draft-kindling-flask') return this.build!.hasOrigin('spark') || this.build!.hasOrigin('flame-sweep');
      if (skill.id === 'draft-boiling-core') return this.build!.hasOrigin('bubble') && (this.build!.hasOrigin('spark') || this.build!.hasOrigin('flame-sweep'));
      if (skill.id === 'draft-thorn-testament') return this.build!.hasOrigin('leaf');
      if (skill.id === 'draft-bubble-spore') return this.build!.hasOrigin('bubble');
      if (skill.id === 'tidal-pearl') return this.build!.hasOrigin('bubble');
      if (skill.id === 'specialist-badge') return this.build!.attacks.length === 1;
      if (skill.id === 'echo-rune') return this.build!.hasOrigin('thunder-bud') || (this.ranks.chain > 0 && (this.build!.hasOrigin('bubble') || this.build!.hasOrigin('leaf'))) || this.build!.relics.includes('draft-bubble-spore');
      if (skill.id === 'area') return this.build!.hasOrigin('bubble');
      if (skill.id === 'chain') return this.build!.hasOrigin('bubble') || this.build!.hasOrigin('leaf');
      if (skill.id === 'split-on-hit') return this.build!.hasOrigin('spark') || this.build!.hasOrigin('leaf');
      return true;
    }).map(skill => {
      const weapon = WEAPON_CARDS[skill.id];
      if (!weapon || !this.build!.has(weapon)) return skill;
      const title = skill.title.replace('获得', '');
      if (weapon === 'dream-dart' || weapon === 'resonance-seed') {
        const level = this.build!.attacks.find(a => a.attackId === weapon)!.level;
        return { ...skill, title: title + '强化', benefit: weapon === 'dream-dart' ? '伤害 +14% · 梦印三层绽放'
          : `伤害 +14% · 穿透 ${seedPierces(level) + 1} → ${seedPierces(level + 1) + 1}名`, description: skill.description };
      }
      if (weapon === 'frost-crystal') {
        const level = this.build!.attacks.find(a => a.attackId === weapon)!.level;
        const before = frostStats(level), after = frostStats(level + 1);
        return { ...skill, title: title + '强化', benefit: `基础伤害 +14% · 额外穿透 ${before.pierces} → ${after.pierces}名`,
          description: `基础攻击间隔 ${before.interval.toFixed(2)} → ${after.interval.toFixed(2)}秒；最高5级。霜寒与湿润组合冻结，解冻后2.5秒抗性；精英短暂冻结，首领仅减速。` };
      }
      if (weapon === 'thunder-bud') {
        const level = this.build!.attacks.find(a => a.attackId === weapon)!.level;
        const before = thunderStats(level), after = thunderStats(level + 1);
        return { ...skill, title: title + '强化', benefit: `${before.targets} → ${after.targets}个目标 · 间隔 ${after.interval.toFixed(2)}秒`,
          description: `基础伤害每级 +12%；跳跃距离 ${before.hopRange.toFixed(1)} → ${after.hopRange.toFixed(1)}。每跳保留伤害 ${Math.round(before.decay * 100)}% → ${Math.round(after.decay * 100)}%，同次施放不重复命中，最高5级。` };
      }
      if (isBlade(weapon)) {
        const level = this.build!.attacks.find(a => a.attackId === weapon)!.level;
        const before = bladeStats(weapon, level), after = bladeStats(weapon, level + 1);
        return { ...skill, title: title + '强化', benefit: weapon === 'thorn-wheel'
          ? `${before.count} → ${after.count}枚荆轮 · ${after.expand ? '周期扩圈' : after.push ? '命中轻推' : '轨道扩大'}`
          : `射程 ${before.range.toFixed(1)} → ${after.range.toFixed(1)} · 间隔 ${after.interval.toFixed(1)}秒`,
          description: `基础伤害每级 +${Math.round(WEAPON_DAMAGE_PER_LEVEL[weapon] * 100)}%。${skill.description}最高5级。` };
      }
      if (weapon === 'flame-sweep') {
        const level = this.build!.attacks.find(a => a.attackId === weapon)!.level;
        const before = flameSweepStats(level), after = flameSweepStats(level + 1);
        return { ...skill, title: title+'强化', benefit: `半径 ${before.radius} → ${after.radius} · ${after.degrees}° 横扫`,
          description: `基础伤害每级 +12%；火浪角度 ${before.degrees}° → ${after.degrees}°，间隔 ${before.interval} → ${after.interval} 秒。${after.degrees === 360 ? '本次横扫覆盖一整圈。' : '同一片火浪扩大覆盖，5级达到一整圈。'}精英与首领受到 70% 伤害；最高 5 级。` };
      }
      return { ...skill, title: title + '强化', benefit: `该武器基础伤害 +${Math.round(WEAPON_DAMAGE_PER_LEVEL[weapon] * 100)}%`, description: `每级基础伤害 +${Math.round(WEAPON_DAMAGE_PER_LEVEL[weapon] * 100)}%；最高 5 级。火花每级爆炸半径 +6%；水泡每级减速时长 +0.1 秒；飞叶弹 3 级额外穿透一名敌人。` };
    });
  }
  get maxLevel() { return 1 + this.pool.reduce((total, skill) => total + skill.maxRank, 0) - this.purchasedRanks - (this.build && this.fusionSkills ? 2 + (this.build.attacks.length > 1 && !this.ranks['specialist-badge'] ? 1 : 0)
    + (this.build.attacks.length >= 3 ? this.pool.filter(s => WEAPON_CARDS[s.id] && !this.build!.hasOrigin(WEAPON_CARDS[s.id]!)).reduce((sum,s) => sum+s.maxRank,0) : 0) : 0); }
  get awaitingChoice() { return this.pendingChoices > 0; }
  get offers(): readonly SkillId[] { return this.currentOffers; }
  get threshold() { return this.level >= this.maxLevel ? Infinity : EXPERIENCE.initial + Math.max(0, this.level - 1) * EXPERIENCE.increment; }
  get choiceLevel() { return this.level - this.pendingChoices + 1; }

  gainExperience(amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(this.totalExperience + amount)) return 0;
    this.totalExperience += amount;
    this.experience += amount;
    let gained = 0;
    while (this.level < this.maxLevel && this.experience >= this.threshold) {
      this.experience -= this.threshold;
      this.level++;
      this.pendingChoices++;
      gained++;
    }
    if (this.level === this.maxLevel) this.experience = 0;
    if (this.awaitingChoice && this.currentOffers.length === 0) this.rollOffers();
    return gained;
  }

  pick(id: SkillId) {
    const skill = this.skills.find((candidate) => candidate.id === id);
    if (!this.awaitingChoice || !skill || !this.currentOffers.includes(id) || this.ranks[id] >= skill.maxRank) return false;
    if (!this.applyReward(skill)) return false;
    this.pendingChoices--;
    this.currentStats = calculateStats(this.ranks);
    this.currentOffers = [];
    if (this.awaitingChoice) this.rollOffers();
    return true;
  }

  confirmPair(id:WeaponPairId){
    if(!this.fusionSkills||!this.awaitingChoice||!this.currentOffers.includes('weapon-pair-fusion')||!this.build?.fusePair(id))return false;
    this.ranks[`${id}-weapon`]=this.build.attacks.find(a=>a.pairId===id)!.level;
    this.pendingChoices--;this.currentOffers=[];if(this.awaitingChoice)this.rollOffers();return true;
  }
  canGrant(id: SkillId) {
    return !!this.build && !this.awaitingChoice && this.skills.some(skill => skill.id === id && this.ranks[id] < skill.maxRank);
  }

  grant(id: SkillId) {
    if (!this.canGrant(id)) return false;
    const skill = this.skills.find(candidate => candidate.id === id)!;
    if (!this.applyReward(skill)) return false;
    this.purchasedRanks++;
    this.level = Math.min(this.level, this.maxLevel);
    if (this.level >= this.maxLevel) this.experience = 0;
    this.currentStats = calculateStats(this.ranks);
    return true;
  }

  private applyReward(skill: SkillDefinition) {
    const id = skill.id;
    if(id==='weapon-pair-fusion')return false;
    const pair=PAIR_IDS.find(pair=>id===`${pair}-weapon`);
    if(pair){const attack=this.build?.attacks.find(a=>a.pairId===pair);if(!attack||!this.build!.upgrade(attack.attackId))return false;this.ranks[id]=attack.level;return true;}
    const weapon = WEAPON_CARDS[id];
    if (weapon && (!this.build || !(this.build.has(weapon) ? this.build.upgrade(weapon) : this.build.acquire(weapon)))) return false;
    if (skill.category === 'relic' && (!isRelicId(id) || !this.build?.addRelic(id))) return false;
    if (skill.category === 'evolution' && !isWaterEvolution(id) && (!isEvolutionId(id) || !this.build?.evolve(id))) return false;
    if (this.coreReward(id)) this.rollsWithoutCore = 0;
    this.ranks[id]++;
    return true;
  }

  private rollOffers() {
    const candidates = this.skills.filter((skill) => skill.id!=='weapon-pair-fusion' && this.ranks[skill.id] < skill.maxRank && (factoryRelic(skill.id)?.rewards.upgrade ?? true)).map((skill) => skill.id);
    if (!candidates.length) { this.pendingChoices = 0; this.currentOffers = []; return; }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    if (!this.build || !this.fusionSkills) { this.currentOffers = candidates.slice(0, 3); return; }
    const skills = this.skills;
    const normal = candidates.filter(id => !skills.find(s => s.id === id)!.category);
    const rare = candidates.filter(id => !!skills.find(s => s.id === id)!.category);
    const core = rare.filter(id => this.coreReward(id));
    this.rollsWithoutCore++;
    const pity = this.rollsWithoutCore >= 6 && core.length > 0;
    const rareAllowed = this.random() < Math.min(.55, .25 + Math.max(0, this.rollsWithoutCore - 3) * .1) || pity;
    const rareChoice = pity ? core[0] : rare[0];
    this.currentOffers = normal.slice(0, rareAllowed && rareChoice ? 2 : 3);
    // Keep exploration; one ordinary slot advances an equipped weapon or its fusion.
    const support = normal.find(id => this.supportsBuild(id));
    if (support && !this.currentOffers.some(id => this.supportsBuild(id))) {
      if (this.currentOffers.length) this.currentOffers[this.currentOffers.length - 1] = support;
      else this.currentOffers.push(support);
    }
    if (rareAllowed && rareChoice) this.currentOffers.push(rareChoice);
    // Exhaustion can leave only rare choices; do not trap an earned level-up.
    if (!this.currentOffers.length && candidates.length) this.currentOffers = [candidates[0]];
    if(this.build.availablePairs().length){this.currentOffers=this.currentOffers.filter(id=>id!=='weapon-pair-fusion').slice(0,2);this.currentOffers.push('weapon-pair-fusion');}
    // A completed AOE recipe should be reviewable on the next earned choice.
    const waterEvolution = candidates.find(isWaterEvolution);
    if (waterEvolution && !this.currentOffers.includes(waterEvolution)) this.currentOffers = [...this.currentOffers.slice(0, 2), waterEvolution];
  }

  private coreReward(id: SkillId) {
    return ['draft-martyr-core', 'draft-kindling-flask', 'draft-thorn-testament', 'draft-bubble-spore', 'draft-boiling-core'].includes(id);
  }

  private supportsBuild(id: SkillId) {
    const weapon = WEAPON_CARDS[id];
    if (weapon) return this.build!.hasOrigin(weapon);
    if (id === 'split-on-hit') return this.build!.hasOrigin('spark') || this.build!.hasOrigin('leaf');
    if (id === 'area') return this.build!.hasOrigin('bubble');
    if (id === 'chain') return this.build!.hasOrigin('bubble') || this.build!.hasOrigin('leaf');
    return false;
  }

  reset(fusionSkills = this.fusionSkills) {
    this.fusionSkills = fusionSkills;
    if (this.build) this.build.skillRanks = this.ranks;
    this.level = 1;
    this.purchasedRanks = 0;
    this.rollsWithoutCore = 0;
    this.experience = this.totalExperience = this.pendingChoices = 0;
    for (const skill of ALL_SKILLS) this.ranks[skill.id] = 0;
    if (this.build && this.fusionSkills) this.ranks[`${this.fusionBase}-weapon`] = 1;
    this.currentStats = calculateStats(this.ranks);
    this.currentOffers = [];
  }

  inspect() {
    return { level: this.level, experience: this.experience, totalExperience: this.totalExperience, threshold: Number.isFinite(this.threshold) ? this.threshold : null, pendingChoices: this.pendingChoices, choiceLevel: this.choiceLevel, offers: [...this.currentOffers], ranks: { ...this.ranks }, stats: { ...this.stats }, maxLevel: this.maxLevel };
  }
}
