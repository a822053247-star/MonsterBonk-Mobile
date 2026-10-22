import type { BaseAttackId } from './fusion';

/** Independent of the five automatic weapon/skill recipes in fusion.ts. */
export const WEAPON_PAIR_RECIPES = {
  'steam-comet': { title:'蒸汽彗星', sources:['spark','bubble'], damage:50, growth:.16, interval:.64, radius:1.6, splash:.40, slow:.78, slowDuration:.8, burnDuration:0, burnInterval:.4, burnDamage:.1, areaScale:1.2, chainAreaScale:1.25, pierces:0, splitCount:2, splitDamage:.35, splitRadius:0, splitSplash:0, chain:true, visual:'steam-area', effect:'steam', fusionVisual:undefined },
  'blazing-thorn': { title:'焚枝穿刺', sources:['spark','leaf'], damage:46, growth:.16, interval:.60, radius:0, splash:0, slow:1, slowDuration:0, burnDuration:1.2, burnInterval:.4, burnDamage:.08, areaScale:1.2, chainAreaScale:1.25, pierces:2, splitCount:2, splitDamage:.35, splitRadius:1.2, splitSplash:.25, chain:true, visual:'fire-explosion', effect:'burst', fusionVisual:'burst-seed' },
  'bramble-tide': { title:'藤潮囚泡', sources:['bubble','leaf'], damage:44, growth:.17, interval:.64, radius:1.65, splash:.35, slow:.72, slowDuration:1, burnDuration:0, burnInterval:.4, burnDamage:.1, areaScale:1.2, chainAreaScale:1.25, pierces:0, splitCount:3, splitDamage:.35, splitRadius:0, splitSplash:0, chain:false, visual:'water-impact', effect:'water', fusionVisual:'deep-bubble' },
} as const;
export type WeaponPairId=keyof typeof WEAPON_PAIR_RECIPES;
export type PairSkillId='weapon-pair-fusion'|`${WeaponPairId}-weapon`;
export const PAIR_IDS=Object.keys(WEAPON_PAIR_RECIPES) as WeaponPairId[];
export const pairLevel=(a:number,b:number)=>Math.min(5,a+b-3);
export const pairIcon=(id:WeaponPairId)=>`assets/ui/upgrade/illustrations/weapon-pairs/${id}.png`;
export const pairSources=(id:WeaponPairId):readonly BaseAttackId[]=>WEAPON_PAIR_RECIPES[id].sources;

/** Element-specific relic offspring keep their own trigger identity, preventing cross-element kill loops. */
export function sourceHasAttack(source:{attackId:BaseAttackId;kind?:string;rules?:{pairId?:WeaponPairId}},id:BaseAttackId){
  if(source.kind==='testament')return id==='leaf';
  if(source.kind==='bubble-spore')return id==='bubble';
  if (source.attackId === 'thorn-wheel' && id === 'leaf' || source.attackId === 'tidal-blade' && id === 'bubble') return true;
  return source.rules?.pairId?pairSources(source.rules.pairId).includes(id):source.attackId===id;
}
