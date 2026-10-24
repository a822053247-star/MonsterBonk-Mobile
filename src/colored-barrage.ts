import type { Enemy } from './combat';
import type { RelicDamageSource } from './relics';

export const COLORED_BARRAGE_IDS=['frost-barrage','leaf-barrage','arc-barrage','rose-barrage'] as const;
export type ColoredBarrageId=typeof COLORED_BARRAGE_IDS[number];
export const COLORED_BARRAGE_LIMITS={casts:4,shots:64,startGap:.6,elite:.7,boss:.4} as const;
export const COLORED_BARRAGE_GUIDANCE={leafReturnSpeed:18,arcConvergeDelay:.18,arcTurnRate:3.2,roseTurnRate:1.8,roseRetargetRange:12} as const;
export const COLORED_BARRAGES={
  'frost-barrage':{title:'霜羽齐射',color:'#78d8ee',interval:5.8,damage:16,counts:[5,6,8],speed:14,duration:1.05,radius:.2,pierces:3,
    benefit:'冰蓝扇射 · 霜寒减速',mechanic:'前方90°扇射，命中施加1.2秒霜寒；普通怪减速35%，精英/首领遵守控制下限，可配合已有水系命中冻结。'},
  'leaf-barrage':{title:'回叶弹幕',color:'#9bd277',interval:6.2,damage:13,counts:[4,6,8],speed:13,duration:1.55,radius:.22,pierces:3,
    benefit:'翠绿回叶 · 往返扫敌',mechanic:'朝四周发射回叶，0.65秒后以18单位/秒加速追随角色返回；同次施放去程、回程各命中同敌一次。'},
  'arc-barrage':{title:'双弧星流',color:'#b5a0e6',interval:6.6,damage:23,counts:[6,8,10],speed:11,duration:1.2,radius:.2,pierces:3,
    benefit:'紫色双弧 · 两翼收束',mechanic:'向瞄准方向两侧发射双弧星弹，先展开0.18秒再朝施放时锁定的位置收束；同次施放同敌只命中一次。'},
  'rose-barrage':{title:'绯星追击',color:'#ef9ebc',interval:5.6,damage:28,counts:[3,4,5],speed:16,duration:1.15,radius:.2,pierces:1,
    benefit:'玫粉追星 · 低血补刀',mechanic:'优先锁定12单位内低血敌人，各弹尽量分配不同目标，缓转追踪；目标离场或已被本轮命中时，可在弹体周围12单位内重新索敌一次，选择未被本轮命中、未被其他追星锁定的目标；同次施放同敌只命中一次。'},
} as const;
export function isColoredBarrage(id:string):id is ColoredBarrageId {return (COLORED_BARRAGE_IDS as readonly string[]).includes(id);}
export function coloredBarrageStats(id:ColoredBarrageId,rank:number) {
  const n=Math.max(0,Math.min(2,Math.floor(rank)-1)),rule=COLORED_BARRAGES[id];
  return {...rule,count:rule.counts[n],damage:Number((rule.damage*(1+.25*n)).toFixed(2))};
}
export function coloredBarrageDescription(id:ColoredBarrageId) {
  const r=COLORED_BARRAGES[id];
  return `每${r.interval}秒发射${r.counts.join('/')}枚，每枚基础${r.damage}伤害，每级伤害+25%基础值。${r.mechanic}每弹每程最多命中${r.pierces}敌，穿透不衰减，弹幕穿越障碍。精英70%、首领40%。最高3级，可同时学习，不占武器槽；享受全局魔力，不受武器攻速、分枝或分裂影响，不触发武器遗物派生。`;
}
interface BarrageHost {
  origin():{x:number;z:number}; aim():number; enemies():readonly Enemy[]; eligible(enemy:Enemy):boolean;
  nextCastId():number; source(damage:number,castId:number):RelicDamageSource;
  damage(enemy:Enemy,damage:number,source:RelicDamageSource):void; chill(enemy:Enemy,seconds:number):void;
  intersection(ax:number,az:number,bx:number,bz:number,enemy:Enemy,radius:number):number;
}
interface ColoredCast {
  active:boolean;id:ColoredBarrageId;castId:number;age:number;damage:number;duration:number;
  source?:RelicDamageSource;outward:Set<number>;inward:Set<number>;
}
export interface ColoredBarrageShot {
  active:boolean;id:ColoredBarrageId;castId:number;age:number;x:number;z:number;previousX:number;previousZ:number;
  vx:number;vz:number;angle:number;turn:number;returning:boolean;hits:number;target?:Enemy;targetId:number;
  focusX:number;focusZ:number;converged:boolean;retargeted:boolean;
}
export interface ColoredBarrageImpact {active:boolean;id:ColoredBarrageId;x:number;z:number;age:number;seed:number}
/** Four independent skills, bounded pools, fixed-step collision and gentle, staggered salvos. */
export class ColoredBarrages {
  readonly impacts:ColoredBarrageImpact[]=Array.from({length:24},()=>({active:false,id:'frost-barrage',x:0,z:0,age:0,seed:0}));
  readonly shots:ColoredBarrageShot[]=Array.from({length:COLORED_BARRAGE_LIMITS.shots},()=>({
    active:false,id:'frost-barrage',castId:0,age:0,x:0,z:0,previousX:0,previousZ:0,vx:0,vz:0,angle:0,turn:0,returning:false,hits:0,targetId:0,
    focusX:0,focusZ:0,converged:false,retargeted:false,
  }));
  private casts:ColoredCast[]=Array.from({length:COLORED_BARRAGE_LIMITS.casts},()=>({
    active:false,id:'frost-barrage',castId:0,age:0,damage:0,duration:0,outward:new Set<number>(),inward:new Set<number>(),
  }));
  private clocks=[0,0,0,0];private learned=[false,false,false,false];private startClock=0;private cursor=0;
  readonly telemetry={casts:0,hits:0,denied:0};
  constructor(private host:BarrageHost) {}
  cast(id:ColoredBarrageId,rank:number,multiplier=1) {
    if(!isColoredBarrage(id)||!Number.isFinite(rank)||rank<1||!Number.isFinite(multiplier)||multiplier<=0)return false;
    const stats=coloredBarrageStats(id,rank),cast=this.casts.find(c=>!c.active);
    const free=this.shots.filter(s=>!s.active);
    if(!cast||free.length<stats.count){this.telemetry.denied++;return false;}
    const origin=this.host.origin(),aim=this.host.aim(),castId=this.host.nextCastId();
    Object.assign(cast,{active:true,id,castId,age:0,damage:stats.damage*multiplier,duration:stats.duration});
    cast.outward.clear();cast.inward.clear();cast.source=this.host.source(cast.damage,castId);
    const targets=id==='rose-barrage'||id==='arc-barrage'?this.host.enemies().filter(e=>this.host.eligible(e)&&Math.hypot(e.x-origin.x,e.z-origin.z)<=12)
      .sort((a,b)=>(id==='rose-barrage'?a.hp-b.hp:0)||Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z)||a.id-b.id):[];
    const focus=targets[0];
    for(let i=0;i<stats.count;i++) {
      const target=id==='rose-barrage'?targets[i%Math.max(1,targets.length)]:undefined;
      const side=i%2===0?-1:1,arm=Math.floor(i/2)/Math.max(1,Math.ceil(stats.count/2)-1);
      const angle=id==='frost-barrage'?aim-Math.PI/4+i/(stats.count-1)*Math.PI/2
        :id==='leaf-barrage'?aim+i/stats.count*Math.PI*2
        :id==='arc-barrage'?aim+side*(.48+arm*.9)
        :target?Math.atan2(target.x-origin.x,target.z-origin.z):aim+(i-(stats.count-1)/2)*.18;
      Object.assign(free[i],{active:true,id,castId,age:0,x:origin.x,z:origin.z,previousX:origin.x,previousZ:origin.z,
        angle,turn:id==='arc-barrage'?side*.55:0,vx:Math.sin(angle)*stats.speed,vz:Math.cos(angle)*stats.speed,
        returning:false,hits:0,target,targetId:target?.id??0,
        focusX:focus?.x??origin.x+Math.sin(aim)*8,focusZ:focus?.z??origin.z+Math.cos(aim)*8,converged:false,retargeted:false});
    }
    this.telemetry.casts++;return true;
  }
  update(dt:number,ranks:Partial<Record<ColoredBarrageId,number>>,multiplier:number,goldenStarting=false) {
    if(!Number.isFinite(dt)||dt<=0)return;
    for(const impact of this.impacts)if(impact.active){impact.age+=dt;if(impact.age>=.22)impact.active=false;}
    this.startClock=Math.max(0,this.startClock-dt);
    for(let i=0;i<COLORED_BARRAGE_IDS.length;i++) {
      if((ranks[COLORED_BARRAGE_IDS[i]]??0)<=0){this.learned[i]=false;continue;}
      if(!this.learned[i]){this.learned[i]=true;this.clocks[i]=(i+1)*COLORED_BARRAGE_LIMITS.startGap;}
      this.clocks[i]-=dt;
    }
    if(this.startClock<=1e-8&&!goldenStarting)for(let n=0;n<COLORED_BARRAGE_IDS.length;n++) {
      const i=(this.cursor+n)%COLORED_BARRAGE_IDS.length,id=COLORED_BARRAGE_IDS[i];
      if(!this.learned[i]||this.clocks[i]>1e-8)continue;
      if(this.cast(id,ranks[id]??0,multiplier)) {
        this.clocks[i]=COLORED_BARRAGES[id].interval;this.startClock=COLORED_BARRAGE_LIMITS.startGap;this.cursor=(i+1)%4;
      }
      break;
    }
    for(const cast of this.casts) {
      if(!cast.active)continue;
      const step=Math.min(dt,cast.duration-cast.age);cast.age+=step;
      for(const shot of this.shots) {
        if(!shot.active||shot.castId!==cast.castId)continue;
        // Subdivide curved paths and the return boundary, including coarse callers.
        let remaining=step;
        while(remaining>1e-8&&shot.active) {
          const slice=Math.min(remaining,1/60,shot.id==='leaf-barrage'&&!shot.returning ? Math.max(0,.65-shot.age) : remaining);
          if(slice<=1e-8){this.beginReturn(shot);continue;}
          this.advance(shot,cast,slice);remaining-=slice;
        }
      }
      if(cast.age>=cast.duration-1e-8||!this.shots.some(s=>s.active&&s.castId===cast.castId)) {
        cast.active=false;cast.source=undefined;cast.outward.clear();cast.inward.clear();
        for(const shot of this.shots)if(shot.castId===cast.castId){shot.active=false;shot.target=undefined;}
      }
    }
  }
  private beginReturn(shot:ColoredBarrageShot){shot.returning=true;shot.hits=0;}
  private turnTowards(shot:ColoredBarrageShot,wanted:number,rate:number,dt:number){
    const delta=Math.atan2(Math.sin(wanted-shot.angle),Math.cos(wanted-shot.angle));
    shot.angle+=Math.max(-rate*dt,Math.min(rate*dt,delta));
  }
  private retargetRose(shot:ColoredBarrageShot,cast:ColoredCast){
    shot.retargeted=true;
    let target:Enemy|undefined,bestDistance=Infinity;
    for(const enemy of this.host.enemies()){
      if(!this.host.eligible(enemy)||cast.outward.has(enemy.id))continue;
      const distance=Math.hypot(enemy.x-shot.x,enemy.z-shot.z);
      if(distance>COLORED_BARRAGE_GUIDANCE.roseRetargetRange)continue;
      if(this.shots.some(other=>other!==shot&&other.active&&other.castId===shot.castId&&other.target===enemy&&other.targetId===enemy.id))continue;
      if(!target||enemy.hp<target.hp||enemy.hp===target.hp&&(distance<bestDistance||distance===bestDistance&&enemy.id<target.id)){
        target=enemy;bestDistance=distance;
      }
    }
    shot.target=target;shot.targetId=target?.id??0;
  }
  private advance(shot:ColoredBarrageShot,cast:ColoredCast,dt:number) {
    const rule=COLORED_BARRAGES[shot.id];
    if(shot.id==='leaf-barrage'&&!shot.returning&&shot.age>=.65-1e-8)this.beginReturn(shot);
    const speed=shot.returning?COLORED_BARRAGE_GUIDANCE.leafReturnSpeed:rule.speed;
    if(shot.returning) {
      const origin=this.host.origin(),dx=origin.x-shot.x,dz=origin.z-shot.z,d=Math.hypot(dx,dz);
      if(d<=speed*dt){
        shot.previousX=shot.x;shot.previousZ=shot.z;shot.x=origin.x;shot.z=origin.z;
        this.collide(shot,cast);shot.active=false;return;
      }
      shot.angle=Math.atan2(dx,dz);
    } else if(shot.id==='rose-barrage') {
      const targetValid=shot.target&&shot.target.id===shot.targetId&&this.host.eligible(shot.target)&&!cast.outward.has(shot.targetId);
      if(!targetValid&&!shot.retargeted)this.retargetRose(shot,cast);
      if(shot.target&&shot.target.id===shot.targetId&&this.host.eligible(shot.target)&&!cast.outward.has(shot.targetId))
        this.turnTowards(shot,Math.atan2(shot.target.x-shot.x,shot.target.z-shot.z),COLORED_BARRAGE_GUIDANCE.roseTurnRate,dt);
    } else if(shot.id==='arc-barrage'&&shot.age>=COLORED_BARRAGE_GUIDANCE.arcConvergeDelay) {
      const dx=shot.focusX-shot.x,dz=shot.focusZ-shot.z;
      if(Math.hypot(dx,dz)<=.6)shot.converged=true;
      if(!shot.converged)this.turnTowards(shot,Math.atan2(dx,dz),COLORED_BARRAGE_GUIDANCE.arcTurnRate,dt);
    } else shot.angle+=shot.turn*dt;
    shot.previousX=shot.x;shot.previousZ=shot.z;
    shot.vx=Math.sin(shot.angle)*speed;shot.vz=Math.cos(shot.angle)*speed;
    shot.x+=shot.vx*dt;shot.z+=shot.vz*dt;shot.age+=dt;
    this.collide(shot,cast);
  }
  private collide(shot:ColoredBarrageShot,cast:ColoredCast) {
    const rule=COLORED_BARRAGES[shot.id],hits=shot.returning?cast.inward:cast.outward;
    while(shot.active&&cast.active&&shot.hits<rule.pierces) {
      let target:Enemy|undefined,first=Infinity;
      for(const enemy of this.host.enemies()) {
        if(!this.host.eligible(enemy)||hits.has(enemy.id))continue;
        const t=this.host.intersection(shot.previousX,shot.previousZ,shot.x,shot.z,enemy,rule.radius);
        if(t<first||t===first&&t!==Infinity&&enemy.id<(target?.id??Infinity)){first=t;target=enemy;}
      }
      if(!target)break;
      hits.add(target.id);shot.hits++;
      const impact=this.impacts.find(e=>!e.active);
      if(impact)Object.assign(impact,{active:true,id:shot.id,x:target.x,z:target.z,age:0,seed:target.id});
      this.host.damage(target,cast.damage*(target.rank==='boss'?COLORED_BARRAGE_LIMITS.boss:target.rank==='elite'?COLORED_BARRAGE_LIMITS.elite:1),cast.source!);
      if(shot.id==='frost-barrage'&&this.host.eligible(target))this.host.chill(target,1.2);
      this.telemetry.hits++;
    }
    // Returning leaves remain visible while traveling home after their hit budget is used.
    if(shot.hits>=rule.pierces&&shot.id!=='leaf-barrage')shot.active=false;
  }
  clear() {
    for(const impact of this.impacts)impact.active=false;
    for(const cast of this.casts){cast.active=false;cast.source=undefined;cast.outward.clear();cast.inward.clear();}
    for(const shot of this.shots){shot.active=false;shot.target=undefined;shot.castId=0;}
  }
  reset(){this.clear();this.clocks.fill(0);this.learned.fill(false);this.startClock=this.cursor=0;this.telemetry.casts=this.telemetry.hits=this.telemetry.denied=0;}
  inspect(){return {...this.telemetry,capacity:COLORED_BARRAGE_LIMITS.shots,activeShots:this.shots.filter(s=>s.active).length,
    clocks:[...this.clocks],castsActive:this.casts.filter(c=>c.active).map(c=>({id:c.id,castId:c.castId,age:c.age,outward:c.outward.size,inward:c.inward.size}))};}
}
