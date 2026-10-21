import type { BaseAttackId } from '../fusion';
import type { RelicId } from '../relics';

export const WEAPON_TAGS=['fire','water','grass','projectile','melee','explosion'] as const;
export type WeaponTag=typeof WEAPON_TAGS[number];
export interface WeaponCapabilities { tags:readonly WeaponTag[]; origins:readonly BaseAttackId[] }
const TAGS:Record<BaseAttackId,readonly WeaponTag[]>={spark:['fire','projectile'],bubble:['water','projectile'],leaf:['grass','projectile'],'flame-sweep':['fire','melee']};
export function weaponCapabilities(id:BaseAttackId,ranks:{'split-on-hit'?:number}={}):WeaponCapabilities{
  return {tags:[...TAGS[id],...(id==='spark'&&(ranks['split-on-hit']??0)>0?['explosion' as const]:[])],origins:[id]};
}
/** Future merge adapters must preserve the events as well as the union of element/shape tags. */
export function inheritWeaponCapabilities(parents:readonly WeaponCapabilities[]):WeaponCapabilities{
  return {tags:[...new Set(parents.flatMap(p=>p.tags))],origins:[...new Set(parents.flatMap(p=>p.origins))]};
}
export interface FusionRelicContract { relics:readonly RelicId[]; weapons:readonly WeaponCapabilities[]; events:readonly string[] }
/** Fail closed before replacing weapons: never silently discard paid-for relic or trigger value. */
export function assertFusionPreservesRelics(before:FusionRelicContract,after:FusionRelicContract){
  if(!before.relics.length)return;
  for(const id of before.relics)if(!after.relics.includes(id))throw new Error(`Fusion loses owned relic: ${id}`);
  for(const event of before.events)if(!after.events.includes(event))throw new Error(`Fusion loses relic event: ${event}`);
  for(const weapon of before.weapons){
    if(!after.weapons.some(next=>weapon.origins.every(id=>next.origins.includes(id))&&weapon.tags.every(t=>next.tags.includes(t))))throw new Error('Fusion loses relic weapon lineage/capabilities');
  }
}
