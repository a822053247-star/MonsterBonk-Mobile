import type { Combat, Enemy, Projectile, CombatEffect, WeaponSnapshot } from './combat';
import type { RelicHooks } from './combat-relic-behaviors';
import type { BaseAttackId } from './fusion';
import type { RelicDamageSource, RelicId } from './relics';
import { factoryRelic } from './content/relic-registry';
import type { GigapackBehavior } from './content/relics/gigapack-relics';
import { ATTACKS } from './run-build';
import { GIGAPACK_CLIPS } from './visuals/gigapack-clips';
import { GIGAPACK_BINDINGS } from './visuals/gigapack-presets';
import { WEAPON, segmentHit } from './combat';
import { SKILLS, SKILL_RULES } from './progression';
const orbitSkill=SKILLS.find(s=>s.id==='orbit')!.effect;
const SATELLITE_SPEED=orbitSkill.type==='spell'?orbitSkill.levels[0].orbitSpeed!:0;

/** Uses Combat's existing damage, occlusion and derived-event budget. No independent attack pool. */
export class CombatGigapackRelics {
  private stormHits:{at:number;weapon:BaseAttackId}[]=[];
  private stormReady=0;
  private voidReady=0;
  private charge=false;
  private rangedCasts=0;
  private casts=0;
  private rhythmReady=0;
  private reaperKills=0;
  private reaperReady=0;
  private decree?:{id:number;ready:number;source:RelicDamageSource};
  private coinRemainder=0;
  private coinWave=0;
  private coinAwards=0;
  private heartKills=0;
  private petals=0;
  private smokeReady=0;
  private smoke?:{x:number;z:number;until:number};
  private salute?:{expires:number};
  private aftershock?:{x:number;z:number;ready:number;damage:number;source:RelicDamageSource};
  private aftershockReady=0;
  private tideHits=0;
  private tideReady=0;
  private lastProjectile=0;
  private chamber=false;
  private chamberReady=0;
  private noLossSince=0;
  private ward=false;
  private wardReady=0;
  private swiftHits:{id:number;at:number}[]=[];
  private swiftUntil=0;
  private swiftReady=0;
  private haloHits=0;
  private haloReady=0;
  private satelliteHits:{id:number;at:number}[]=[];
  private satelliteReady=0;
  private satellite?:{until:number;start:number;damage:number;source:RelicDamageSource;x:number;z:number;hits:Map<number,number>;fx?:CombatEffect};
  private showerReady=0;
  private volleys:{id:number;at:number;pellets:Set<number>;enemies:Set<number>;procced:boolean}[]=[];
  private reprisalUntil=0;
  private reprisalReady=0;
  private magnetKills:number[]=[];
  private magnetReady=0;
  constructor(private c:Combat,private hooks:RelicHooks){}
  private rule<T extends GigapackBehavior['handler']>(id:T):Extract<GigapackBehavior,{handler:T}>|undefined{
    if(!this.c.usesRunBuild||!this.c.runBuild.relics.includes(id as RelicId))return;
    const b=factoryRelic(id)?.behavior;
    return b?.handler===id?b as Extract<GigapackBehavior,{handler:T}>:undefined;
  }
  private primary(s:RelicDamageSource){return s.kind==='hit'&&!s.behavior&&!s.copied&&s.generation===0;}
  private primaryEvent(s:RelicDamageSource){return this.primary(s)&&s.primary!==false&&!s.suppressRelics;}
  private primaryDamage(s:RelicDamageSource){return (s.kind==='hit'||s.kind==='explosion')&&!s.behavior&&!s.copied&&s.generation===0&&s.primary!==false&&!s.suppressRelics;}
  private tags(s:RelicDamageSource){return s.weaponTags??this.c.runBuild.capabilities(s.attackId).tags;}
  private newDerived(s:RelicDamageSource):RelicDamageSource{return {...this.derived(s),primary:false,suppressRelics:true};}
  private derived(s:RelicDamageSource):RelicDamageSource{return {...s,behavior:true,copied:true,generation:s.generation+1};}
  private legal(e:Enemy,x=this.c.anchorX,z=this.c.anchorZ){return e.active&&e.hp>0&&e.spawnTime<=0&&!this.hooks.covered(x,z,e.x,e.z);}
  private visible(e:Enemy){const v=this.c.spawnViewport;return !v||Math.abs(e.x-v.x)<=v.halfWidth&&Math.abs(e.z-v.z)<=v.halfDepth;}
  private targets(x:number,z:number,radius:number,visible=false){return this.c.enemies.filter(e=>this.legal(e,x,z)&&Math.hypot(e.x-x,e.z-z)<=radius&&(!visible||this.visible(e)));}
  private fx(id:string,x:number,z:number,radius=.8,duration?:number){
    const clip=GIGAPACK_CLIPS[GIGAPACK_BINDINGS[id]];
    return this.hooks.visual(x,z,'burst',radius,id,duration??clip.frames.length/clip.fps);
  }
  private pulse(x:number,z:number,radius:number,damage:number,s:RelicDamageSource){
    for(const e of this.targets(x,z,radius)){
      if(this.c.encounters.dying)break;
      this.hooks.damage(e,damage,this.derived(s));
    }
  }
  clearTransient(){this.satellite=undefined;this.volleys=[];this.satelliteHits=[];this.reprisalUntil=0;this.aftershock=undefined;this.decree=this.smoke=this.salute=undefined;for(const e of this.c.enemies){e.venomUntil=e.venomReady=e.smokeUntil=0;}}
  reset(){this.clearTransient();this.haloHits=this.haloReady=this.satelliteReady=this.showerReady=this.reprisalReady=this.magnetReady=0;this.magnetKills=[];this.aftershockReady=this.tideHits=this.tideReady=this.lastProjectile=this.chamberReady=this.noLossSince=this.wardReady=this.swiftUntil=this.swiftReady=0;this.chamber=this.ward=false;this.swiftHits=[];this.stormHits=[];this.stormReady=this.voidReady=this.rangedCasts=this.casts=this.rhythmReady=this.reaperKills=this.reaperReady=this.coinRemainder=this.coinWave=this.coinAwards=this.heartKills=this.petals=this.smokeReady=0;this.charge=false;}
  explosion(x:number,z:number,hits:number,damage:number,s:RelicDamageSource){
    const b=this.rule('resonant-aftershock');
    if(!b||this.c.encounters.dying||s.primary===false||s.behavior||s.copied||s.suppressRelics||s.generation>0||!this.tags(s).includes('fire')||hits<b.targets||this.c.elapsed<this.aftershockReady||s.chain?.aftershock)return;
    if(!this.hooks.reserve())return;
    if(s.chain)s.chain.aftershock=true;this.aftershockReady=this.c.elapsed+b.cooldown;
    this.aftershock={x,z,ready:this.c.elapsed+b.delay,damage:damage*b.damage,source:this.newDerived(s)};
  }
  projectileEmitted(s:RelicDamageSource){if(this.primaryEvent(s))this.lastProjectile=this.c.elapsed;}
  projectileHit(p:Projectile,_e:Enemy,x:number,z:number){
    const s=p.relicSource;if(!s||this.c.encounters.dying||!this.primaryEvent(s)||(p.generation??0)!==0||p.returning)return;
    const b=this.rule('charge-chamber');
    if(b&&this.chamber&&this.c.elapsed>=this.chamberReady){
      this.chamber=false;this.chamberReady=this.c.elapsed+b.cooldown;p.pierces=(p.pierces??0)+b.pierce;p.chargedPierceSource=s.rootId;
      if(this.hooks.reserve()){this.fx('charge-chamber',x,z,b.radius);this.pulse(x,z,b.radius,p.damage*b.damage,this.newDerived(s));}
    }
    const shower=this.rule('prism-shower');
    if(shower&&s.castId!==undefined&&!s.volley?.showerTriggered){
      this.volleys=this.volleys.filter(v=>this.c.elapsed-v.at<=shower.window);
      let volley=this.volleys.find(v=>v.id===s.castId);
      if(!volley){volley={id:s.castId,at:this.c.elapsed,pellets:new Set(),enemies:new Set(),procced:false};this.volleys.push(volley);if(this.volleys.length>this.c.projectiles.length)this.volleys.shift();}
      volley.pellets.add(s.rootId);volley.enemies.add(_e.id);
      if(!volley.procced&&volley.pellets.size>=2&&volley.enemies.size>=2&&this.c.elapsed>=this.showerReady){
        volley.procced=true;if(s.volley)s.volley.showerTriggered=true;this.showerReady=this.c.elapsed+shower.cooldown;
        const targets=this.targets(x,z,WEAPON.range).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)||a.id-b.id);
        for(let i=0;i<shower.count;i++){
          const target=targets[i%Math.max(1,targets.length)];
          const shot=this.hooks.launch(p,x,z,target?target.x-x:Math.cos(i*Math.PI*2/shower.count),target?target.z-z:Math.sin(i*Math.PI*2/shower.count),(s.rootDamage??p.damage)*shower.damage,'prism-shower');
          if(shot){shot.homing=true;shot.relicSource=this.newDerived(s);shot.relicSource.rootDamage=shot.damage;}
        }
        this.fx('prism-shower',x,z);
      }
    }
  }
  weaponCast(attack:WeaponSnapshot){
    const b=this.rule('scarlet-reprisal');
    if(!b||this.c.encounters.dying||this.reprisalUntil<=this.c.elapsed||attack.attackId!==this.c.runBuild.attacks[0]?.attackId)return;
    this.reprisalUntil=0;this.hooks.copy(attack,b.damage);this.fx('scarlet-reprisal',this.c.anchorX,this.c.anchorZ);
  }
  mitigateDamage(damage:number){
    const b=this.rule('azure-ward');if(!b||!this.ward)return damage;
    this.ward=false;this.wardReady=this.c.elapsed+b.cooldown;this.fx('azure-ward',this.c.anchorX,this.c.anchorZ);
    return damage*(1-b.reduction);
  }
  intervalFactor(){return this.rule('swift-weave')&&this.c.elapsed<this.swiftUntil?this.rule('swift-weave')!.interval:1;}
  private advancedHit(e:Enemy,s:RelicDamageSource,damage:number){
    if(!this.primaryDamage(s)||this.c.encounters.dying)return;
    const tide=this.rule('reverse-tide');
    if(tide&&this.tags(s).includes('water')&&++this.tideHits>=tide.every&&this.c.elapsed>=this.tideReady){
      this.tideHits=0;this.tideReady=this.c.elapsed+tide.cooldown;this.fx('reverse-tide',e.x,e.z,tide.radius);
      for(const target of this.targets(e.x,e.z,tide.radius)){
        if(target.rank==='boss')continue;
        const dx=target.x-e.x,dz=target.z-e.z,d=Math.hypot(dx,dz);if(d<.001)continue;
        const push=target.rank==='elite'?tide.eliteDistance:tide.distance;
        this.hooks.move(target,dx/d*push,dz/d*push);
      }
    }
    const swift=this.rule('swift-weave');
    if(swift&&this.c.elapsed>=this.swiftReady){
      this.swiftHits=this.swiftHits.filter(h=>this.c.elapsed-h.at<=swift.window);
      const previous=this.swiftHits.find(h=>h.id===e.id);
      if(previous)previous.at=this.c.elapsed;else this.swiftHits.push({id:e.id,at:this.c.elapsed});
      if(this.swiftHits.length>=swift.count){this.swiftHits=[];this.swiftUntil=this.c.elapsed+swift.duration;this.swiftReady=this.c.elapsed+swift.cooldown;this.fx('swift-weave',this.c.anchorX,this.c.anchorZ);}
    }
    const halo=this.rule('pristine-halo');
    if(halo&&this.c.hp===this.c.maxHp&&++this.haloHits>=halo.every&&this.c.elapsed>=this.haloReady){
      this.haloHits=0;this.haloReady=this.c.elapsed+halo.cooldown;
      if(this.hooks.reserve()){this.fx('pristine-halo',this.c.anchorX,this.c.anchorZ,halo.radius);this.pulse(this.c.anchorX,this.c.anchorZ,halo.radius,damage*halo.damage,this.newDerived(s));}
    }
    const satellite=this.rule('blazing-satellite');
    if(satellite&&this.tags(s).includes('fire')&&this.tags(s).includes('melee')&&!this.satellite&&this.c.elapsed>=this.satelliteReady){
      this.satelliteHits=this.satelliteHits.filter(h=>this.c.elapsed-h.at<=satellite.window);
      const previous=this.satelliteHits.find(h=>h.id===e.id);
      if(previous)previous.at=this.c.elapsed;else this.satelliteHits.push({id:e.id,at:this.c.elapsed});
      if(this.satelliteHits.length>satellite.count)this.satelliteHits.sort((a,b)=>b.at-a.at).length=satellite.count;
      if(this.satelliteHits.length>=satellite.count&&this.hooks.reserve()){
        this.satelliteHits=[];this.satelliteReady=this.c.elapsed+satellite.cooldown;
        const x=this.c.anchorX+satellite.radius,z=this.c.anchorZ;
        this.satellite={until:this.c.elapsed+satellite.duration,start:this.c.elapsed,damage:(s.baseWeaponDamage??ATTACKS['flame-sweep'].damage)*satellite.damage,source:this.newDerived(s),x,z,hits:new Map(),fx:this.fx('blazing-satellite',x,z,.5,satellite.duration)};
      }
    }
  }
  incoming(){
    const b=this.rule('void-vessel');if(!b||this.c.elapsed<this.voidReady)return false;
    this.voidReady=this.c.elapsed+b.cooldown;this.charge=true;
    this.fx('void-vessel',this.c.anchorX,this.c.anchorZ);return true;
  }
  hit(enemy:Enemy,s:RelicDamageSource,damage:number){
    this.advancedHit(enemy,s,damage);
    if(!this.primary(s)||this.c.encounters.dying)return;
    const storm=this.rule('storm-relay');
    if(storm&&this.c.elapsed>=this.stormReady){
      this.stormHits=this.stormHits.filter(h=>this.c.elapsed-h.at<=storm.window+1e-8);
      this.stormHits.push({at:this.c.elapsed,weapon:s.attackId});
      if(new Set(this.stormHits.map(h=>h.weapon)).size>=2||this.stormHits.length>=storm.sameHits){
        this.stormHits=[];this.stormReady=this.c.elapsed+storm.cooldown;
        if(this.hooks.reserve())for(const e of this.targets(enemy.x,enemy.z,storm.radius).filter(e=>e.id!==enemy.id).sort((a,b)=>a.id-b.id).slice(0,storm.count)){
          if(this.c.encounters.dying)break;
          this.fx('storm-relay',e.x,e.z);this.hooks.damage(e,damage*storm.damage,this.derived(s));
        }
      }
    }
    const vessel=this.rule('void-vessel');
    if(vessel&&this.charge){this.charge=false;if(this.hooks.reserve()){
      this.fx('void-vessel',enemy.x,enemy.z,vessel.radius);this.pulse(enemy.x,enemy.z,vessel.radius,damage*vessel.damage,s);
    }}
    const venom=this.rule('venom-insignia');
    if(venom){
      if(s.attackId==='leaf'&&enemy.active){
        enemy.venomUntil=this.c.elapsed+venom.duration;
        const prior=this.c.effects.find(e=>e.active&&e.vfxPresetId==='venom-mark'&&e.enemyId===enemy.id);
        const fx=prior??this.fx('venom-mark',enemy.x,enemy.z,.65,venom.duration);
        if(fx){fx.enemyId=enemy.id;fx.duration=fx.time=venom.duration;}
      }else if(['spark','bubble','flame-sweep'].includes(s.attackId)&&(enemy.venomUntil??0)>this.c.elapsed&&this.c.elapsed>=(enemy.venomReady??0)){
        enemy.venomUntil=0;enemy.venomReady=this.c.elapsed+venom.cooldown;
        for(const e of this.c.effects)if(e.active&&e.vfxPresetId==='venom-mark'&&e.enemyId===enemy.id)e.active=false;
        if(this.hooks.reserve()){this.fx('venom-insignia',enemy.x,enemy.z,venom.radius);this.pulse(enemy.x,enemy.z,venom.radius,damage*venom.damage,s);}
      }
    }
  }
  /** Called once per successful primary volley, never for copies or fan pellets. */
  cast(attackId:BaseAttackId,melee:boolean,damage:number){
    if(this.c.encounters.dying)return;
    const warp=this.rule('warp-eye');
    if(warp&&!melee&&++this.rangedCasts%warp.every===0){
      const shot=this.c.projectiles.find(p=>p.active&&p.attackId===attackId&&p.age===0&&p.relicSource&&this.primary(p.relicSource));
      const target=this.targets(this.c.anchorX,this.c.anchorZ,warp.range).sort((a,b)=>Math.hypot(b.x-this.c.anchorX,b.z-this.c.anchorZ)-Math.hypot(a.x-this.c.anchorX,a.z-this.c.anchorZ)||a.id-b.id)[0];
      if(shot&&target)this.warp(shot,target,warp.exit);
    }
    const rhythm=this.rule('rhythm-seal');
    if(rhythm&&++this.casts%rhythm.every===0&&this.c.elapsed>=this.rhythmReady){
      this.rhythmReady=this.c.elapsed+rhythm.cooldown;
      const nearest=this.targets(this.c.anchorX,this.c.anchorZ,Infinity).sort((a,b)=>Math.hypot(a.x-this.c.anchorX,a.z-this.c.anchorZ)-Math.hypot(b.x-this.c.anchorX,b.z-this.c.anchorZ)||a.id-b.id)[0];
      if(nearest&&this.hooks.reserve()){
        const dx=nearest.x-this.c.anchorX,dz=nearest.z-this.c.anchorZ,d=Math.max(.001,Math.hypot(dx,dz));
        const fx=this.fx('rhythm-seal',this.c.anchorX,this.c.anchorZ,rhythm.range);if(fx){fx.moveX=dx/d;fx.moveZ=dz/d;}
        const source=this.hooks.source(damage);source.attackId=attackId;
        for(const e of this.targets(this.c.anchorX,this.c.anchorZ,rhythm.range)){
          if(this.c.encounters.dying)break;
          const x=e.x-this.c.anchorX,z=e.z-this.c.anchorZ,l=Math.max(.001,Math.hypot(x,z));
          if((x*dx+z*dz)/(l*d)>=Math.cos(rhythm.degrees*Math.PI/360))this.hooks.damage(e,damage*rhythm.damage,this.derived(source));
        }
      }
    }
  }
  private warp(p:Projectile,e:Enemy,exit:number){
    const dx=e.x-this.c.anchorX,dz=e.z-this.c.anchorZ,d=Math.max(.001,Math.hypot(dx,dz));
    const x=e.x-dx/d*exit,z=e.z-dz/d*exit;
    if(this.hooks.covered(x,z,e.x,e.z))return;
    this.fx('warp-eye',p.x,p.z);this.fx('warp-eye',x,z);
    p.x=p.previousX=x;p.z=p.previousZ=z;p.vx=dx/d*WEAPON.speed;p.vz=dz/d*WEAPON.speed;
    p.distance=0;p.life=Math.max(p.life,exit/WEAPON.speed+.12);
  }
  kill(_e:Enemy,s:RelicDamageSource|undefined,origin:'player'|'spore'){
    const magnet=this.rule('starlit-magnet');
    if(magnet&&origin==='player'&&s&&!s.behavior&&!s.copied&&!s.suppressRelics&&this.c.elapsed>=this.magnetReady){
      this.magnetKills=this.magnetKills.filter(t=>this.c.elapsed-t<=magnet.window);this.magnetKills.push(this.c.elapsed);
      if(this.magnetKills.length>=magnet.kills){
        this.magnetKills=[];this.magnetReady=this.c.elapsed+magnet.cooldown;
        const orbs=this.c.orbs.filter(o=>o.active&&Math.hypot(o.x-this.c.anchorX,o.z-this.c.anchorZ)<=magnet.radius)
          .sort((a,b)=>Math.hypot(a.x-this.c.anchorX,a.z-this.c.anchorZ)-Math.hypot(b.x-this.c.anchorX,b.z-this.c.anchorZ)).slice(0,magnet.cap);
        for(const orb of orbs)orb.magnetized=true;
        this.fx('starlit-magnet',this.c.anchorX,this.c.anchorZ,magnet.radius);
      }
    }
    const heart=this.rule('heart-keeper');
    if(heart&&origin==='player'&&++this.heartKills>=heart.kills){this.heartKills=0;this.petals=Math.min(heart.cap,this.petals+1);}
    const b=this.rule('reaper-decree');
    if(!b||origin!=='player'||!s||s.behavior||s.copied||this.c.encounters.dying)return;
    this.reaperKills=Math.min(b.kills,this.reaperKills+1);
    this.tryDecree();
  }
  private baseDamage(){const a=this.c.runBuild.attacks[0];return a?ATTACKS[a.attackId].damage:0;}
  afterDamage(){
    this.noLossSince=this.c.elapsed;
    this.haloHits=0;
    const reprisal=this.rule('scarlet-reprisal');
    if(reprisal&&this.c.elapsed>=this.reprisalReady){this.reprisalReady=this.c.elapsed+reprisal.cooldown;this.reprisalUntil=this.c.elapsed+reprisal.duration;}
    const heart=this.rule('heart-keeper');if(!heart)return;
    this.heartKills=0;
    if(this.petals>0){this.petals--;const previous=this.c.hp;this.c.hp=Math.min(this.c.maxHp,this.c.hp+heart.heal);
      if(this.c.hp>previous)this.fx('heart-keeper',this.c.anchorX,this.c.anchorZ);}
  }
  earnedCoins(amount:number,wave:number){
    const b=this.rule('alchemist-ledger');if(!b||amount<=0||this.c.hp<=0)return;
    if(wave!==this.coinWave){this.coinWave=wave;this.coinAwards=0;}
    this.coinRemainder+=amount;
    const awards=Math.min(b.cap-this.coinAwards,Math.floor(this.coinRemainder/b.coins));
    this.coinRemainder%=b.coins; // Discard awards over cap; spending never enters this event.
    if(awards>0){this.coinAwards+=awards;this.c.progression.gainExperience(awards*b.experience);this.fx('alchemist-ledger',this.c.anchorX,this.c.anchorZ);}
  }
  dash(x:number,z:number){
    const b=this.rule('smokescreen-feather');if(!b||this.c.elapsed<this.smokeReady)return;
    this.smokeReady=this.c.elapsed+b.cooldown;this.smoke={x,z,until:this.c.elapsed+b.duration};
    this.fx('smokescreen-feather',x,z,b.radius,b.duration);
  }
  slowFactor(e:Enemy){const b=this.rule('smokescreen-feather');return b&&(e.smokeUntil??0)>this.c.elapsed?e.rank==='boss'?1:e.rank==='elite'?1-b.eliteSlow:1-b.slow:1;}
  choiceConfirmed(){const b=this.rule('levelup-salute');if(b&&this.c.hp>0&&!this.c.encounters.dying)this.salute={expires:this.c.elapsed+b.expiry};}
  private tryDecree(){
    const b=this.rule('reaper-decree');if(!b||this.decree||this.reaperKills<b.kills||this.c.elapsed<this.reaperReady)return;
    const eligible=this.targets(this.c.anchorX,this.c.anchorZ,b.range,true);
    const normal=eligible.filter(e=>!e.rank).sort((a,b)=>b.hp-a.hp||a.id-b.id)[0];
    const target=normal??eligible.filter(e=>e.rank).sort((a,b)=>b.hp-a.hp||a.id-b.id)[0];
    if(!target||!this.hooks.reserve())return;
    this.reaperKills=0;this.reaperReady=this.c.elapsed+b.cooldown;
    const s=this.derived(this.hooks.source(this.baseDamage()*b.damage));
    if(normal){this.decree={id:target.id,ready:this.c.elapsed+b.delay,source:s};const fx=this.fx('reaper-decree',target.x,target.z,.9,b.delay);if(fx)fx.enemyId=target.id;}
    else {this.fx('reaper-decree',target.x,target.z);this.hooks.damage(target,this.baseDamage()*b.damage,s);}
  }
  update(_dt:number){
    if(this.c.hp<=0||this.c.encounters.dying)return;
    if(this.reprisalUntil<=this.c.elapsed)this.reprisalUntil=0;
    const satellite=this.rule('blazing-satellite');
    if(satellite&&this.satellite){
      const a=this.satellite;
      if(this.c.elapsed>=a.until)this.satellite=undefined;
      else {
        const angle=(this.c.elapsed-a.start)*SATELLITE_SPEED;
        const x=this.c.anchorX+Math.cos(angle)*satellite.radius,z=this.c.anchorZ+Math.sin(angle)*satellite.radius;
        for(const e of this.c.enemies){
          if(this.c.encounters.dying)break;
          if(!this.legal(e,x,z)||this.c.elapsed<(a.hits.get(e.id)??0))continue;
          if(segmentHit(a.x,a.z,x,z,e.x,e.z,this.c.enemyRadius(e)+SKILL_RULES.orbitBallRadius)!==Infinity&&this.hooks.reserve()){
            a.hits.set(e.id,this.c.elapsed+satellite.interval);this.hooks.damage(e,a.damage,a.source);
          }
        }
        a.x=x;a.z=z;
        if(a.fx?.active&&a.fx.vfxPresetId==='blazing-satellite'){a.fx.x=x;a.fx.z=z;}
      }
    }
    const chamber=this.rule('charge-chamber');
    if(chamber&&!this.chamber&&this.c.elapsed>=this.chamberReady&&this.c.elapsed-this.lastProjectile>=chamber.idle){this.chamber=true;this.fx('charge-chamber',this.c.anchorX,this.c.anchorZ);}
    const ward=this.rule('azure-ward');
    if(ward&&!this.ward&&this.c.elapsed>=this.wardReady&&this.c.elapsed-this.noLossSince>=ward.idle){this.ward=true;this.fx('azure-ward',this.c.anchorX,this.c.anchorZ);}
    if(this.aftershock&&this.c.elapsed+1e-8>=this.aftershock.ready){const a=this.aftershock;this.aftershock=undefined;const b=this.rule('resonant-aftershock')!;this.fx('resonant-aftershock',a.x,a.z,b.radius);this.pulse(a.x,a.z,b.radius,a.damage,a.source);}
    const smoke=this.rule('smokescreen-feather');
    if(smoke&&this.smoke){
      if(this.c.elapsed>=this.smoke.until)this.smoke=undefined;
      else for(const e of this.targets(this.smoke.x,this.smoke.z,smoke.radius))if(e.rank!=='boss')e.smokeUntil=this.c.elapsed+smoke.linger;
    }
    const salute=this.rule('levelup-salute');
    if(salute&&this.salute){
      if(this.c.elapsed>=this.salute.expires)this.salute=undefined;
      else {
        const targets=this.targets(this.c.anchorX,this.c.anchorZ,salute.range,true).sort((a,b)=>a.id-b.id).slice(0,salute.count);
        if(targets.length&&this.hooks.reserve()){
          this.salute=undefined;const damage=this.baseDamage()*salute.damage,s=this.derived(this.hooks.source(damage));
          for(const e of targets){if(this.c.encounters.dying)break;this.fx('levelup-salute',e.x,e.z);this.hooks.damage(e,damage,s);}
        }
      }
    }
    if(this.decree&&this.c.elapsed+1e-8>=this.decree.ready){
      const decree=this.decree;this.decree=undefined;
      const e=this.c.enemies.find(e=>e.id===decree.id&&e.active&&e.hp>0&&!e.rank);
      if(e){this.fx('reaper-decree',e.x,e.z);this.hooks.damage(e,e.hp,decree.source);}
    }
    this.tryDecree();
  }
  inspect(){return {haloHits:this.haloHits,satellite:!!this.satellite,showerVolleys:this.volleys.length,reprisalUntil:this.reprisalUntil,magnetKills:this.magnetKills.length,aftershock:!!this.aftershock,chamber:this.chamber,ward:this.ward,swiftUntil:this.swiftUntil,tideHits:this.tideHits,stormHits:this.stormHits.length,charge:this.charge,rangedCasts:this.rangedCasts,casts:this.casts,reaperKills:this.reaperKills,pendingDecree:!!this.decree,coinAwards:this.coinAwards,coinRemainder:this.coinRemainder,heartKills:this.heartKills,petals:this.petals,smoke:this.smoke,pendingSalute:!!this.salute};}
}
