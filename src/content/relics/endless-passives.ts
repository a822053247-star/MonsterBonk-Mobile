import type {RelicDefinition} from '../content-types';

/** Numeric effects only: no update loop or emitted objects. */
export const ENDLESS_PASSIVE_RULES={
 'steady-cannon':{handler:'steady-cannon',damage:1.3,interval:1.2},
 'fleet-contract':{handler:'fleet-contract',movement:1.15,maxHp:.85},
 'far-lens':{handler:'far-lens',range:1.2,interval:1.08},
 'heavy-ammo':{handler:'heavy-ammo',damage:1.5,removeShots:1},
 'last-stand':{handler:'last-stand',threshold:.35,damage:1.3},
 'elite-hunter':{handler:'elite-hunter',damage:1.25,normal:.9},
} as const;
export type EndlessPassiveBehavior=typeof ENDLESS_PASSIVE_RULES[keyof typeof ENDLESS_PASSIVE_RULES];
const pct=(n:number)=>`${Math.round(n*100)}%`;
export function endlessPassiveCopy(b:EndlessPassiveBehavior){
 switch(b.handler){
  case 'steady-cannon':return {benefit:`所有武器伤害 +${pct(b.damage-1)}`,tradeoff:`武器攻击间隔 +${pct(b.interval-1)}`};
  case 'fleet-contract':return {benefit:`移动速度 +${pct(b.movement-1)}`,tradeoff:`最大生命 -${pct(1-b.maxHp)}；获得时仅压低当前生命上限，不额外扣血`};
  case 'far-lens':return {benefit:`武器射程最多 +${pct(b.range-1)}，显示实际封顶后变化`,tradeoff:`有收益的武器攻击间隔最多 +${pct(b.interval-1)}，按实际射程收益折算；已封顶武器不加代价`};
  case 'heavy-ammo':return {benefit:`主投射武器单发伤害 +${pct(b.damage-1)}`,tradeoff:`需分枝魔法≥2级；每轮少${b.removeShots}枚额外主弹，至少1发；不改变派生数量或潮刃伤害`};
  case 'last-stand':return {benefit:`生命≤${pct(b.threshold)}时，武器直接命中伤害 +${pct(b.damage-1)}`,tradeoff:'仅低血量生效；派生伤害、持续伤害和自动范围技能不加成'};
  case 'elite-hunter':return {benefit:`对精英与Boss的武器直接命中伤害 +${pct(b.damage-1)}`,tradeoff:`对普通敌人的武器直击伤害 -${pct(1-b.normal)}；派生与持续伤害不变`};
 }
}
function relic<const Id extends keyof typeof ENDLESS_PASSIVE_RULES>(id:Id,title:string,palette:RelicDefinition['art']['palette']):RelicDefinition<Id>{
 return {id,title,category:'relic',rarity:'rare',modes:['formal'],endlessOnly:true,tags:['projectile','melee'],requirements:id==='heavy-ammo'?{projectile:true,skills:['multishot']}:{},modifiers:[],behavior:ENDLESS_PASSIVE_RULES[id],
  art:{symbol:'orb',palette,png:`assets/ui/upgrade/illustrations/relics/${id}.png`},vfx:{preset:'water-impact',target:'all-weapons'},maxRank:1,rewards:{upgrade:true,shop:true}};
}
export const ENDLESS_PASSIVES=[relic('steady-cannon','专注重炮','fire'),relic('fleet-contract','疾行契约','grass'),relic('far-lens','远距透镜','water'),relic('heavy-ammo','重型弹药','fire'),relic('last-stand','残血决意','fire'),relic('elite-hunter','精英猎手','grass')] as const;
export const ENDLESS_PASSIVE_FIELDS={
 'steady-cannon':['damage','interval'],'fleet-contract':['movement','maxHp'],'far-lens':['range','interval'],'heavy-ammo':['damage','removeShots'],'last-stand':['threshold','damage'],'elite-hunter':['damage','normal'],
} as const;
