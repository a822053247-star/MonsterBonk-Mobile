import type {RelicDefinition,Requirements,ContentTag} from '../content-types';
export type AdvancedRelicBehavior=
 | {handler:'resonant-aftershock';delay:number;radius:number;damage:number;cooldown:number;targets:number}
 | {handler:'reverse-tide';every:number;radius:number;distance:number;eliteDistance:number;cooldown:number}
 | {handler:'charge-chamber';idle:number;radius:number;damage:number;cooldown:number;pierce:number}
 | {handler:'azure-ward';idle:number;reduction:number;cooldown:number}
 | {handler:'swift-weave';window:number;count:number;duration:number;interval:number;cooldown:number}
 | {handler:'pristine-halo';every:number;radius:number;damage:number;cooldown:number}
 | {handler:'blazing-satellite';window:number;count:number;duration:number;radius:number;interval:number;damage:number;cooldown:number}
 | {handler:'prism-shower';window:number;count:number;damage:number;cooldown:number}
 | {handler:'scarlet-reprisal';duration:number;damage:number;cooldown:number}
 | {handler:'starlit-magnet';window:number;kills:number;radius:number;cap:number;cooldown:number};
function relic<const Id extends string>(id:Id,title:string,tags:readonly ContentTag[],requirements:Requirements,palette:RelicDefinition['art']['palette'],behavior:AdvancedRelicBehavior):RelicDefinition<Id>{
 return {id,title,tags,requirements,category:'relic',rarity:'rare',modes:['formal'],modifiers:[],behavior,
  art:{symbol:'orb',palette,png:`assets/ui/upgrade/illustrations/relics/${id}.png`},vfx:{preset:id,target:'all-weapons'},maxRank:1,rewards:{upgrade:true,shop:true}};
}
export const GIGAPACK_BATCH_21_25=[
 relic('resonant-aftershock','余震熔晶',['fire','area'],{weaponTags:['fire','explosion']},'fire',{handler:'resonant-aftershock',delay:.28,radius:1.5,damage:.4,cooldown:2.8,targets:2}),
 relic('reverse-tide','逆潮波纹',['water','knockback'],{weaponTags:['water']},'water',{handler:'reverse-tide',every:4,radius:2,distance:.8,eliteDistance:.25,cooldown:2.5}),
 relic('charge-chamber','蓄能膛室',['projectile','charge'],{projectile:true},'fire',{handler:'charge-chamber',idle:1.5,radius:1.6,damage:.55,cooldown:5,pierce:1}),
 relic('azure-ward','苍蓝守印',['defense','guard'],{},'water',{handler:'azure-ward',idle:6,reduction:.4,cooldown:10}),
 relic('swift-weave','疾风共振',['hit-streak','haste'],{},'grass',{handler:'swift-weave',window:2.5,count:4,duration:2.5,interval:.88,cooldown:7}),
] as const;
export const GIGAPACK_BATCH_26_30=[
 relic('pristine-halo','无瑕光轮',['full-health','pulse'],{},'fire',{handler:'pristine-halo',every:5,radius:2.3,damage:.35,cooldown:4}),
 relic('blazing-satellite','炽焰卫星',['melee','orbit'],{weaponTags:['fire','melee']},'fire',{handler:'blazing-satellite',window:3,count:3,duration:3,radius:2.2,interval:.6,damage:.25,cooldown:6}),
 relic('prism-shower','棱光星雨',['multishot','shards'],{projectile:true,skills:['multishot']},'grass',{handler:'prism-shower',window:.7,count:3,damage:.25,cooldown:2.5}),
 relic('scarlet-reprisal','赤痕回响',['hurt','echo'],{},'fire',{handler:'scarlet-reprisal',duration:4,damage:.45,cooldown:10}),
 relic('starlit-magnet','星辉磁环',['xp','magnet'],{},'fire',{handler:'starlit-magnet',window:4,kills:7,radius:6.5,cap:12,cooldown:8}),
] as const;
export function advancedCopy(b:AdvancedRelicBehavior){
 switch(b.handler){
 case 'resonant-aftershock':return {benefit:'火系主爆炸命中至少2敌，0.28秒后原爆心余震：半径1.5、主攻击基础40%伤害',tradeoff:'冷却2.8秒，每主攻击根链1次；不触发燃烧或额外余震'};
 case 'reverse-tide':return {benefit:'每4次水系主命中，在命中位置释放半径2无伤害推波',tradeoff:'普通怪推0.8，精英最多0.25，Boss免疫；冷却2.5秒，不打断预警或冲刺'};
 case 'charge-chamber':return {benefit:'1.5秒未发出主投射物蓄满1层；下一主弹命中冲击半径1.6、55%原伤，并额外穿透1敌',tradeoff:'触发后冷却5秒，最多1层；无目标保留蓄能，派生不递归'};
 case 'azure-ward':return {benefit:'连续6秒未实际掉血获得1层守印，下次有效受击伤害减少40%',tradeoff:'消耗后冷却10秒，最多1层；与其他挡伤按统一顺序处理，不重复消耗'};
 case 'swift-weave':return {benefit:'2.5秒内主攻击命中4名不同敌人：攻击间隔×0.88，持续2.5秒',tradeoff:'冷却7秒，不叠加或自刷新；派生弹和DOT不计入'};
 case 'pristine-halo':return {benefit:'满生命累计5次主命中，释放玩家中心半径2.3光波，35%触发原伤',tradeoff:'冷却4秒；实际掉血清零，光波不触发其他遗物'};
 case 'blazing-satellite':return {benefit:'3秒内火系近战主攻击命中3名不同敌人，生成1枚半径2.2火卫星，持续3秒',tradeoff:'每目标0.6秒最多1次、横扫基础25%伤害；冷却6秒，最多1枚，不递归'};
 case 'prism-shower':return {benefit:'同次主施放至少2枚不同主弹，在0.7秒内命中2名不同敌人：第二命中点生成3枚索敌星屑，各25%根攻击伤害',tradeoff:'冷却2.5秒；每次施放1次，派生弹不再触发，受共享弹池和派生预算限制'};
 case 'scarlet-reprisal':return {benefit:'实际掉血后4秒内，下次主武器施放附带45%伤害同型复制',tradeoff:'冷却10秒；消耗一次，不计主施放次数，不触发自身或其他主施放复制，受派生预算限制'};
 case 'starlit-magnet':return {benefit:'4秒内7个合格击杀：将6.5单位内最多12颗已有经验宝珠标记磁吸',tradeoff:'冷却8秒，触发后清零；不新增经验或改变宝珠数值'};
 }
}
export const ADVANCED_FIELDS={
 'resonant-aftershock':['delay','radius','damage','cooldown','targets'],'reverse-tide':['every','radius','distance','eliteDistance','cooldown'],
 'charge-chamber':['idle','radius','damage','cooldown','pierce'],'azure-ward':['idle','reduction','cooldown'],'swift-weave':['window','count','duration','interval','cooldown'],
 'pristine-halo':['every','radius','damage','cooldown'],'blazing-satellite':['window','count','duration','radius','interval','damage','cooldown'],
 'prism-shower':['window','count','damage','cooldown'],'scarlet-reprisal':['duration','damage','cooldown'],'starlit-magnet':['window','kills','radius','cap','cooldown'],
} as const;
