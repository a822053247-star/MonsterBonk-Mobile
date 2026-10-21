import type { RelicDefinition, Requirements, ContentTag } from '../content-types';

export type GigapackBehavior =
  | {handler:'storm-relay'; window:number; sameHits:number; damage:number; count:number; radius:number; cooldown:number}
  | {handler:'void-vessel'; cooldown:number; radius:number; damage:number}
  | {handler:'warp-eye'; every:number; range:number; exit:number}
  | {handler:'reaper-decree'; kills:number; cooldown:number; range:number; delay:number; damage:number}
  | {handler:'rhythm-seal'; every:number; cooldown:number; range:number; degrees:number; damage:number}
  | {handler:'alchemist-ledger'; coins:number; experience:number; cap:number}
  | {handler:'venom-insignia'; duration:number; radius:number; damage:number; cooldown:number}
  | {handler:'heart-keeper'; kills:number; cap:number; heal:number}
  | {handler:'smokescreen-feather'; duration:number; radius:number; slow:number; eliteSlow:number; linger:number; cooldown:number}
  | {handler:'levelup-salute'; count:number; range:number; damage:number; expiry:number};

function relic<const Id extends string>(id:Id,title:string,requirements:Requirements,tags:readonly ContentTag[],palette:RelicDefinition['art']['palette'],behavior:GigapackBehavior):RelicDefinition<Id>{
  return {id,title,category:'relic',rarity:'rare',modes:['formal'],requirements,tags,modifiers:[],behavior,
    art:{symbol:'orb',palette,png:`assets/ui/upgrade/illustrations/relics/${id}.png`},
    vfx:{preset:id,target:'all-weapons'},maxRank:1,rewards:{upgrade:true,shop:true}};
}
export const GIGAPACK_BATCH_11_15 = [
  relic('storm-relay','雷鸣中继',{projectile:true},['chain','multiweapon'],'fire',{handler:'storm-relay',window:2.5,sameHits:4,damage:.45,count:2,radius:3.2,cooldown:4}),
  relic('void-vessel','虚空收纳匣',{},['defense','retaliation'],'water',{handler:'void-vessel',cooldown:16,radius:1.6,damage:.6}),
  relic('warp-eye','折跃之瞳',{projectile:true},['projectile','position'],'water',{handler:'warp-eye',every:6,range:9,exit:1.1}),
  relic('reaper-decree','死神点名',{},['on-kill','execute'],'fire',{handler:'reaper-decree',kills:8,cooldown:6,range:6,delay:.6,damage:.75}),
  relic('rhythm-seal','律动破阵',{},['on-cast','cone'],'fire',{handler:'rhythm-seal',every:7,cooldown:4.5,range:3,degrees:90,damage:.55}),
] as const;
export const GIGAPACK_BATCH_16_20 = [
  relic('alchemist-ledger','点金秘典',{},['economy','experience'],'fire',{handler:'alchemist-ledger',coins:6,experience:5,cap:3}),
  relic('venom-insignia','蚀毒棱印',{weapon:'leaf',anyWeapons:['spark','bubble','flame-sweep']},['grass','cross-element'],'grass',{handler:'venom-insignia',duration:3,radius:1.4,damage:.5,cooldown:1.2}),
  relic('heart-keeper','无伤心铃',{},['kill-streak','healing'],'fire',{handler:'heart-keeper',kills:10,cap:3,heal:4}),
  relic('smokescreen-feather','烟幕羽坠',{},['dash','control'],'water',{handler:'smokescreen-feather',duration:1.5,radius:1.6,slow:.4,eliteSlow:.2,linger:.5,cooldown:7}),
  relic('levelup-salute','升阶礼炮',{},['level-up','multi-target'],'grass',{handler:'levelup-salute',count:4,range:8,damage:.7,expiry:3}),
] as const;
export function gigapackCopy(b:GigapackBehavior){
  switch(b.handler){
    case 'storm-relay':return {benefit:'2.5秒内异武器2次或同武器4次主命中：雷击另外2敌 · 45%原伤',tradeoff:'半径3.2；冷却4秒，触发后清空计数；雷击不再派生'};
    case 'void-vessel':return {benefit:'每16秒抵消一次有效受伤，储存1层虚空',tradeoff:'下次主命中消耗，半径1.6脉冲 · 60%原伤；最多1层，不再派生'};
    case 'warp-eye':return {benefit:'每第6次主远程施放，将同一枚弹折跃至9范围最远敌前1.1单位',tradeoff:'重新瞄准，无额外弹或跨段碰撞；无目标照常发射并继续计数'};
    case 'reaper-decree':return {benefit:'主武器谱系8杀后点名6范围内最高生命普通敌，0.6秒后处决',tradeoff:'冷却6秒；无普通敌则对可见精英/首领造成主武器基础75%伤害；处决不蓄杀'};
    case 'rhythm-seal':return {benefit:'每第7次主施放：朝最近敌释放90°、长3音浪 · 55%施放快照伤害',tradeoff:'全局冷却4.5秒；每敌一次，音浪不再派生'};
    case 'alchemist-ledger':return {benefit:'每新赚6金币，通过现有成长系统获得5经验',tradeoff:'每波最多3次；花费不扣累计，超过波内上限的奖励不储存'};
    case 'venom-insignia':return {benefit:'主飞叶命中毒印3秒；后续主火花/水泡/横扫消耗，半径1.4溅射 · 50%原伤',tradeoff:'每目标冷却1.2秒；同一击不能设置并消耗，溅射不再派生'};
    case 'heart-keeper':return {benefit:'连续无伤10杀储存1心瓣，最多3；实际掉血后消耗1瓣恢复4生命',tradeoff:'受伤重置当前连杀；恢复不超过生命上限，仅实际治疗播放心形动画'};
    case 'smokescreen-feather':return {benefit:'冲刺起点留下半径1.6、持续1.5秒烟幕；敌人减速40%并残留0.5秒',tradeoff:'冷却7秒，最多1处；精英减速20%，首领免疫，不伤害或打断攻击'};
    case 'levelup-salute':return {benefit:'确认升级后，恢复战斗时礼炮命中8范围内最多4名可见敌，各70%主武器基础伤害',tradeoff:'最多等待1次，不再派生；无敌人等待3秒后作废，菜单或结束时清除'};
  }
}
export const GIGAPACK_FIELDS = {
  'storm-relay':['window','sameHits','damage','count','radius','cooldown'],
  'void-vessel':['cooldown','radius','damage'],'warp-eye':['every','range','exit'],
  'reaper-decree':['kills','cooldown','range','delay','damage'],
  'rhythm-seal':['every','cooldown','range','degrees','damage'],
  'alchemist-ledger':['coins','experience','cap'],'venom-insignia':['duration','radius','damage','cooldown'],
  'heart-keeper':['kills','cap','heal'],'smokescreen-feather':['duration','radius','slow','eliteSlow','linger','cooldown'],
  'levelup-salute':['count','range','damage','expiry'],
} as const;
