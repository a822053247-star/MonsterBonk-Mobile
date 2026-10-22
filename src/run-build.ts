import {WEAPON_PAIR_RECIPES,PAIR_IDS,pairLevel,pairSources,type WeaponPairId} from './weapon-pair-fusion';
import { CREATURES, type SpeciesId } from './party';
import type { BaseAttackId } from './fusion';
import { resolveAttackRules, WEAPON_DAMAGE_PER_LEVEL, type RelicId, type EvolutionId } from './relics';
import type { RelicContext } from './content/content-types';
import { BUILD_BALANCE, slotInterval, weaponProjectileRadius } from './balance';
import { FLAME_SWEEP } from './flame-sweep';
import { bladeStats } from './blade-weapons';
import {weaponCapabilities,inheritWeaponCapabilities,assertFusionPreservesRelics,type WeaponCapabilities} from './content/weapon-traits';

export const MAX_WEAPON_LEVEL = 5;

/** Weapon identity is independent of its caster. Three distinct weapons share a bounded combat pool. */
export const ATTACKS = {
  spark: { kind: 'projectile', title: '火花弹', damage: 18, interval: .44, range: 10.5, color: '#ff9849' },
  bubble: { kind: 'projectile', title: '水泡弹', damage: 16, interval: .58, range: 10.5, color: '#55c9ed' },
  leaf: { kind: 'projectile', title: '飞叶弹', damage: 16, interval: .52, range: 10.5, color: '#70bc52' },
  'flame-sweep': { kind: 'melee_arc', title: '火焰横扫', damage: FLAME_SWEEP.damage, interval: FLAME_SWEEP.interval, range: FLAME_SWEEP.radius, color: '#ff8c35' },
  'thorn-wheel': { kind: 'orbit_blade', title: '环刃荆轮', damage: 14, interval: Math.PI * 2 / bladeStats('thorn-wheel', 1).speed, range: 4, color: '#b6db65' },
  'tidal-blade': { kind: 'return_blade', title: '回旋潮刃', damage: 28, interval: 2.0, range: 8, color: '#72dfff' },
  'thunder-bud': { kind: 'lightning_chain', title: '雷芽连锁', damage: 22, interval: 1.25, range: 9, color: '#ffe26b' },
  'frost-crystal': { kind: 'projectile', title: '霜晶弹', damage: 16, interval: .70, range: 10.5, color: '#9de5ff' },
  'dream-dart': { kind: 'projectile', title: '绯梦弹', damage: 14, interval: .62, range: 10.5, color: '#ff80c7' },
  'resonance-seed': { kind: 'projectile', title: '共鸣花种', damage: 15, interval: .84, range: 11, color: '#f797df' },
} as const;

export interface EquippedAttack {
  attackId: BaseAttackId;
  pairId?: WeaponPairId;
  sources?: readonly BaseAttackId[];
  slot: number;
  level: number;
  cooldown: number;
  cooldownTotal: number;
  shotsFired: number;
}

export class RunBuild {
  private inheritedCapabilities=new Map<BaseAttackId,WeaponCapabilities>();
  capabilities(id:BaseAttackId){
    const inherited=this.inheritedCapabilities.get(id),pair=this.attacks.find(a=>a.attackId===id)?.pairId;
    if(inherited&&pair&&(WEAPON_PAIR_RECIPES[pair].radius>0||(this.skillRanks['split-on-hit']??0)>0))return {...inherited,tags:[...new Set([...inherited.tags,'explosion' as const])]};
    return inherited??weaponCapabilities(id,this.skillRanks);
  }
  get relicContext():RelicContext{return {weapons:[...new Set(this.attacks.flatMap(a=>a.sources??[a.attackId]))],ranks:this.skillRanks,capabilities:this.attacks.map(a=>this.capabilities(a.attackId))};}
  /** Metadata seam only; the future merge engine must declare actual retained event delivery. */
  registerFusionCapabilities(result:BaseAttackId,parents:readonly BaseAttackId[],retainedEvents:readonly string[]){
    const merged=inheritWeaponCapabilities(parents.map(id=>this.capabilities(id)));
    const events=['primary-hit','primary-cast','primary-projectile','explosion','kill','hp-loss','dash','level-choice','coin-earned',...new Set(parents.flatMap(id=>this.capabilities(id).origins).map(id=>`origin:${id}`))];
    const keep=this.attacks.filter(a=>!parents.includes(a.attackId)).map(a=>this.capabilities(a.attackId));
    assertFusionPreservesRelics({relics:this.relics,weapons:parents.map(id=>this.capabilities(id)),events},
      {relics:this.relics,weapons:[...keep,merged],events:retainedEvents});
    this.inheritedCapabilities.set(result,merged);return merged;
  }
  skillRanks: RelicContext['ranks'] = {};
  private equipped: EquippedAttack[] = [];
  private ownedRelics: RelicId[] = [];
  private chosenEvolution?: EvolutionId;
  get relics(): readonly RelicId[] { return this.ownedRelics; }
  get evolution() { return this.chosenEvolution; }
  species: SpeciesId = 'yanrong';
  get attacks(): readonly EquippedAttack[] { return this.equipped; }

  reset(species: SpeciesId) {
    this.inheritedCapabilities.clear();
    this.species = species;
    this.ownedRelics = [];
    this.chosenEvolution = undefined;
    this.equipped = [{ attackId: CREATURES[species].skill, slot: 0, level: 1, cooldown: 0, cooldownTotal: 0, shotsFired: 0 }];
  }

  rules(attackId: BaseAttackId) {
    const attack=this.attacks.find(a=>a.attackId===attackId);
    const ruleBase=attack?.sources?.includes('spark')?'spark':attackId;
    const rules=resolveAttackRules(ruleBase,this.relics,this.attacks.length,attack?.pairId?3:attack?.level??1,this.evolution,this.relicContext);
    rules.projectileRadius = weaponProjectileRadius(attackId, attack?.level ?? 1);
    if(attack?.pairId){
      const recipe=WEAPON_PAIR_RECIPES[attack.pairId];
      rules.pairId=attack.pairId;rules.pairArea=(this.skillRanks.area??0)>0;rules.pairSplit=(this.skillRanks['split-on-hit']??0)>0;rules.pairChain=(this.skillRanks.chain??0)>0;
      if(ruleBase==='spark')rules.areaMultiplier/=1.12;
      rules.damageMultiplier*=recipe.damage*(1+recipe.growth*(attack.level-3))/(ATTACKS[attackId].damage*(1+WEAPON_DAMAGE_PER_LEVEL[ruleBase]*2));
      rules.intervalMultiplier*=recipe.interval/(ATTACKS[attackId].interval*slotInterval(attack.slot));
      rules.pairRadius=Math.min(BUILD_BALANCE.pairRadius,recipe.radius+(attack.pairId==='blazing-thorn'?0:.2*(attack.level-3)));
      rules.slowDuration=recipe.slowDuration*(this.relics.includes('tidal-pearl')?1.4:1);rules.pierceBonus=0;
    }
    return rules;
  }
  title(attack:EquippedAttack){return attack.pairId?WEAPON_PAIR_RECIPES[attack.pairId].title:ATTACKS[attack.attackId].title;}
  hasOrigin(id:BaseAttackId){return this.attacks.some(a=>(a.sources??[a.attackId]).includes(id));}
  consumed(id:BaseAttackId){return this.attacks.some(a=>a.sources?.includes(id));}
  availablePairs(){return PAIR_IDS.filter(id=>pairSources(id).every(source=>this.attacks.some(a=>!a.pairId&&a.attackId===source&&a.level>=3)));}
  fusePair(id:WeaponPairId){
    if(!this.availablePairs().includes(id))return false;
    const parents=this.equipped.filter(a=>pairSources(id).includes(a.attackId)).sort((a,b)=>a.slot-b.slot),first=parents[0],second=parents[1];
    const events=['primary-hit','primary-cast','primary-projectile','explosion','kill','hp-loss','dash','level-choice','coin-earned',...pairSources(id).map(s=>`origin:${s}`)];
    this.registerFusionCapabilities(first.attackId,parents.map(a=>a.attackId),events);
    const fused:EquippedAttack={...first,pairId:id,sources:pairSources(id),level:pairLevel(first.level,second.level),cooldown:Math.max(first.cooldown,second.cooldown),cooldownTotal:Math.max(first.cooldownTotal,second.cooldownTotal),shotsFired:0};
    this.equipped=this.equipped.filter(a=>!parents.includes(a));this.equipped.push(fused);this.equipped.sort((a,b)=>a.slot-b.slot);return true;
  }
  clearPairFusions(){this.equipped=this.equipped.filter(a=>!a.pairId);this.inheritedCapabilities.clear();}

  upgrade(attackId: BaseAttackId) {
    const weapon = this.equipped.find(a => a.attackId === attackId);
    if (!weapon || weapon.level >= MAX_WEAPON_LEVEL) return false;
    weapon.level++; return true;
  }

  addRelic(id: RelicId) {
    if (this.ownedRelics.includes(id)) return false;
    this.ownedRelics.push(id); return true;
  }

  evolve(id: EvolutionId) {
    if (this.chosenEvolution || !this.hasOrigin('spark')) return false;
    this.chosenEvolution = id; return true;
  }

  has(attackId: BaseAttackId) { return this.equipped.some(attack => attack.attackId === attackId); }

  acquire(attackId: BaseAttackId) {
    if (this.has(attackId) || this.consumed(attackId) || this.equipped.length >= 3) return false;
    const slot = [0,1,2].find(slot=>!this.equipped.some(a=>a.slot===slot))!;
    this.equipped.push({ attackId, slot, level: 1, cooldown: slot * .31, cooldownTotal: slot * .31, shotsFired: 0 });
    return true;
  }

}
