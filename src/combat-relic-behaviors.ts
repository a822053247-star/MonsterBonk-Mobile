import type { Combat, CombatEffect, Enemy, Projectile } from './combat';
import { WEAPON } from './combat';
import type { RelicDamageSource, RelicId } from './relics';
import { factoryRelic } from './content/relic-registry';
import type { RelicBehavior } from './content/relics/behavior-relics';

interface Hooks {
  damage(enemy: Enemy, damage: number, source: RelicDamageSource): void;
  visual(x: number,z: number,kind: CombatEffect['kind'],radius: number,preset: string,duration?: number): CombatEffect | undefined;
  reserve(): boolean; covered(x:number,z:number,tx:number,tz:number): boolean;
  move(enemy:Enemy,dx:number,dz:number):void;
  source(damage:number):RelicDamageSource;
}
interface Zone { active:boolean; kind:'mine'|'fire-zone'|'poison-zone'; x:number;z:number;age:number;next:number;duration:number;interval:number;radius:number;damage:number;source?:RelicDamageSource }

/** Small event adapters over Combat's damage, collision, navigation and bounded visual/projectile pools. */
export class CombatRelicBehaviors {
  readonly zones: Zone[] = Array.from({length:5},()=>({active:false,kind:'mine',x:0,z:0,age:0,next:0,duration:0,interval:0,radius:0,damage:0}));
  private hits=0;
  private pullReady=0;
  private fireReady=0;
  constructor(private c:Combat,private hooks:Hooks) {}
  rule<T extends RelicBehavior['handler']>(id:RelicId,handler:T):Extract<RelicBehavior,{handler:T}>|undefined {
    if(!this.c.usesRunBuild||!this.c.runBuild.relics.includes(id))return;
    const b=factoryRelic(id)?.behavior;
    return b?.handler===handler ? b as Extract<RelicBehavior,{handler:T}> : undefined;
  }
  reset(){for(const zone of this.zones)zone.active=false;this.hits=this.pullReady=this.fireReady=0;}
  private derived(source:RelicDamageSource):RelicDamageSource{return {...source,behavior:true,copied:true,generation:source.generation+1};}
  private primary(shot:Projectile){const s=shot.relicSource;return (shot.generation??0)===0&&!shot.returning&&!s?.behavior&&!s?.copied&&(!s||s.kind==='hit');}
  private launch(parent:Projectile,x:number,z:number,dx:number,dz:number,damage:number,preset?:string){
    const shot=this.c.projectiles.find(p=>!p.active&&p!==parent);
    if(!shot||!this.hooks.reserve()||this.c.encounters.dying)return;
    const length=Math.max(.001,Math.hypot(dx,dz)),source=parent.relicSource!;
    Object.assign(shot,{active:true,x,z,previousX:x,previousZ:z,vx:dx/length*WEAPON.speed,vz:dz/length*WEAPON.speed,
      life:WEAPON.lifetime,distance:0,damage,baseDamage:damage,attackId:parent.attackId,attackRules:source.rules,
      relicSource:this.derived(source),generation:1,bornTick:-1,sourceId:parent.sourceId,species:parent.species,
      age:0,burst:false,elemental:parent.attackId==='bubble'||parent.attackId==='leaf',homing:false,
      fusionIds:[],hitIds:[],damageIds:[],ignoreEnemyId:0,pierces:0,bounces:0,scatter:false,hopTargetId:0,
      hopDelay:0,hopElapsed:0,returning:false,outboundSpent:false,vfxPresetId:preset,behaviorRoot:source.rootId});
  }
  projectileHit(shot:Projectile,enemy:Enemy,x:number,z:number){
    if(!this.primary(shot)||this.c.encounters.dying)return;
    const source=shot.relicSource!,root=source.rootDamage??shot.damage;
    const mirror=this.rule('mirror-prism','refract');
    if(mirror&&source.chain&&!source.chain.refracted){
      source.chain.refracted=true;
      const target=this.c.enemies.filter(e=>e.active&&e.spawnTime<=0&&e.id!==enemy.id&&!(shot.hitIds??[]).includes(e.id)
        &&Math.hypot(e.x-x,e.z-z)<=WEAPON.range&&!this.hooks.covered(x,z,e.x,e.z))
        .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)||a.id-b.id)[0];
      if(target){this.launch(shot,x,z,target.x-x,target.z-z,root*mirror.damage,'prism-projectile');
        this.hooks.visual(x,z,'water',.6,'water-impact');}
    }
    const mine=this.rule('hive-fuse','mine');
    if(mine&&++this.hits%mine.every===0)this.zone('mine',x,z,mine.delay,mine.delay,mine.radius,root*mine.damage,mine.cap,source,'mine-warning');
  }
  /** Reuse the outbound leaf slot and damage ledger; returning never creates a new lineage. */
  prepare(shot:Projectile,dt:number){
    const source=shot.relicSource;
    if(shot.behaviorRoot!==source?.rootId){shot.behaviorRoot=source?.rootId;shot.returning=false;shot.outboundSpent=false;}
    const rule=this.rule('returning-crown','return');
    if(rule&&shot.attackId==='leaf'&&this.primary(shot)&&shot.distance>=(shot.flightRange??WEAPON.range)){
      shot.returning=true;shot.outboundSpent=false;shot.damage=(source?.rootDamage??shot.damage)*rule.damage;
      if(source)shot.relicSource=this.derived(source);
      shot.life=Math.max(WEAPON.lifetime,Math.hypot(shot.x-this.c.anchorX,shot.z-this.c.anchorZ)/WEAPON.speed+.2);
      shot.pierces=this.c.enemies.length;shot.bounces=0;shot.scatter=false;shot.hopTargetId=0;
      shot.fusionIds=[];
    }
    if(shot.returning){
      const dx=this.c.anchorX-shot.x,dz=this.c.anchorZ-shot.z,d=Math.hypot(dx,dz);
      if(d<=WEAPON.speed*dt){shot.active=false;return;}
      shot.vx=dx/d*WEAPON.speed;shot.vz=dz/d*WEAPON.speed;
    }
  }
  preserveLeaf(shot:Projectile){
    if(shot.attackId==='leaf'&&!shot.returning&&this.primary(shot)&&this.rule('returning-crown','return')){
      shot.active=true;shot.outboundSpent=true;return true;
    }
    return false;
  }
  areaHit(x:number,z:number,radius:number,source:RelicDamageSource){
    const rule=this.rule('tidal-magnet','pull');
    if(!rule||source.behavior||source.copied||this.c.elapsed<this.pullReady)return;
    this.pullReady=this.c.elapsed+rule.cooldown;
    for(const enemy of this.c.enemies){
      if(!enemy.active||enemy.spawnTime>0||enemy.rank||!['normal','fast','tank'].includes(enemy.kind))continue;
      const dx=x-enemy.x,dz=z-enemy.z,d=Math.hypot(dx,dz);
      if(d>radius+this.c.enemyRadius(enemy)||d<.001||this.hooks.covered(x,z,enemy.x,enemy.z))continue;
      const distance=Math.min(rule.distance,d);this.hooks.move(enemy,dx/d*distance,dz/d*distance);
    }
    this.hooks.visual(x,z,'water',radius,'tidal-ring');
  }
  hit(enemy:Enemy,source:RelicDamageSource){
    if(source.behavior||source.copied||!['hit','explosion'].includes(source.kind))return;
    const rule=this.rule('ember-sigil','fire-zone');
    if(rule&&(source.attackId==='spark'||source.attackId==='flame-sweep')&&this.c.elapsed>=this.fireReady){
      this.fireReady=this.c.elapsed+rule.cooldown;
      this.zone('fire-zone',enemy.x,enemy.z,rule.duration,rule.interval,rule.radius,(source.rootDamage??0)*rule.damage,rule.cap,source,'ember-area');
    }
  }
  private zone(kind:Zone['kind'],x:number,z:number,duration:number,interval:number,radius:number,damage:number,cap:number,source:RelicDamageSource,preset:string){
    if(this.zones.filter(e=>e.active&&e.kind===kind).length>=cap)return;
    const zone=this.zones.find(e=>!e.active);if(!zone)return;
    Object.assign(zone,{active:true,kind,x,z,age:0,next:interval,duration,interval,radius,damage,source:this.derived(source)});
    this.hooks.visual(x,z,kind==='mine'?'burst':'steam',radius,preset,duration);
  }
  update(dt:number){
    for(const zone of this.zones){
      if(!zone.active||this.c.encounters.dying)continue;
      zone.age+=dt;
      while(zone.next<=Math.min(zone.age,zone.duration)+1e-8){
        zone.next+=zone.interval;
        if(zone.kind==='mine')this.hooks.visual(zone.x,zone.z,'burst',zone.radius,'fire-explosion');
        for(const enemy of this.c.enemies){
          if(this.c.encounters.dying)break;
          if(enemy.active&&enemy.spawnTime<=0&&Math.hypot(enemy.x-zone.x,enemy.z-zone.z)<=zone.radius+this.c.enemyRadius(enemy)
            &&!this.hooks.covered(zone.x,zone.z,enemy.x,enemy.z))this.hooks.damage(enemy,zone.damage,zone.source!);
        }
        if(this.c.encounters.dying)break;
      }
      if(zone.age>=zone.duration-1e-8)zone.active=false;
    }
  }
}
