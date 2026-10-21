import type { Combat, Enemy, Projectile } from './combat';
import type { RelicHooks } from './combat-relic-behaviors';
import type { BaseAttackId } from './fusion';
import type { RelicDamageSource, RelicId } from './relics';
import { factoryRelic } from './content/relic-registry';
import type { GigapackBehavior } from './content/relics/gigapack-relics';
import { ATTACKS } from './run-build';
import { GIGAPACK_CLIPS } from './visuals/gigapack-clips';
import { GIGAPACK_BINDINGS } from './visuals/gigapack-presets';
import { WEAPON } from './combat';

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
  constructor(private c:Combat,private hooks:RelicHooks){}
  private rule<T extends GigapackBehavior['handler']>(id:T):Extract<GigapackBehavior,{handler:T}>|undefined{
    if(!this.c.usesRunBuild||!this.c.runBuild.relics.includes(id as RelicId))return;
    const b=factoryRelic(id)?.behavior;
    return b?.handler===id?b as Extract<GigapackBehavior,{handler:T}>:undefined;
  }
  private primary(s:RelicDamageSource){return s.kind==='hit'&&!s.behavior&&!s.copied&&s.generation===0;}
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
  clearTransient(){this.decree=this.smoke=this.salute=undefined;for(const e of this.c.enemies){e.venomUntil=e.venomReady=e.smokeUntil=0;}}
  reset(){this.clearTransient();this.stormHits=[];this.stormReady=this.voidReady=this.rangedCasts=this.casts=this.rhythmReady=this.reaperKills=this.reaperReady=this.coinRemainder=this.coinWave=this.coinAwards=this.heartKills=this.petals=this.smokeReady=0;this.charge=false;}
  incoming(){
    const b=this.rule('void-vessel');if(!b||this.c.elapsed<this.voidReady)return false;
    this.voidReady=this.c.elapsed+b.cooldown;this.charge=true;
    this.fx('void-vessel',this.c.anchorX,this.c.anchorZ);return true;
  }
  hit(enemy:Enemy,s:RelicDamageSource,damage:number){
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
    const heart=this.rule('heart-keeper');
    if(heart&&origin==='player'&&++this.heartKills>=heart.kills){this.heartKills=0;this.petals=Math.min(heart.cap,this.petals+1);}
    const b=this.rule('reaper-decree');
    if(!b||origin!=='player'||!s||s.behavior||s.copied||this.c.encounters.dying)return;
    this.reaperKills=Math.min(b.kills,this.reaperKills+1);
    this.tryDecree();
  }
  private baseDamage(){const a=this.c.runBuild.attacks[0];return a?ATTACKS[a.attackId].damage:0;}
  afterDamage(){
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
  inspect(){return {stormHits:this.stormHits.length,charge:this.charge,rangedCasts:this.rangedCasts,casts:this.casts,reaperKills:this.reaperKills,pendingDecree:!!this.decree,coinAwards:this.coinAwards,coinRemainder:this.coinRemainder,heartKills:this.heartKills,petals:this.petals,smoke:this.smoke,pendingSalute:!!this.salute};}
}
