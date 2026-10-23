import type {Combat,Enemy} from './combat';

export type BarragePattern='flower'|'spiral'|'molten-spiral'|'crystal-lattice'|'frost-ripple'|'molten-crossfire'|'molten-bloom'|'crystal-cross'|'crystal-prism'|'frost-snowflake'|'frost-drift';
export const BARRAGE_NAMES:Record<BarragePattern,string>={flower:'缺口花环',spiral:'旋转花瓣','molten-spiral':'熔火双旋','crystal-lattice':'交错晶阵','frost-ripple':'霜雪涟漪','molten-crossfire':'四向焰流','molten-bloom':'熔核星爆','crystal-cross':'十字重炮','crystal-prism':'棱镜聚焦','frost-snowflake':'六角飞雪','frost-drift':'错位雪幕'};
type Point={x:number;z:number};
export const BOSS_BARRAGE={capacity:144,normalLimit:96,radius:.22,warning:1.35,life:5,flowerGap:.72,frostGap:.64} as const;
export interface BarrageShot extends Point{active:boolean;previousX:number;previousZ:number;vx:number;vz:number;life:number;age:number;tone:number}
const TAU=Math.PI*2;
const angleDistance=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
/** Fixed-step boss emitter. Straight trajectories and gaps are locked at emission. */
export class BossBarrage{
 readonly shots:BarrageShot[]=Array.from({length:BOSS_BARRAGE.capacity},()=>({active:false,x:0,z:0,previousX:0,previousZ:0,vx:0,vz:0,life:0,age:0,tone:0}));
 running=false;elapsed=0;pattern:BarragePattern='flower';enraged=false;
 damage=12;frequency=1;
 x=0;z=0;heading=0;targetX=0;targetZ=0;private emitted=0;
 get warning(){return this.running && this.elapsed<BOSS_BARRAGE.warning;}
 private get baseInterval(){switch(this.pattern){case 'flower':return .7;case 'molten-spiral':return this.enraged?.14:.18;case 'crystal-lattice':return this.enraged?.8:.85;case 'frost-ripple':case 'frost-drift':return .85;case 'molten-crossfire':case 'crystal-cross':return .5;case 'molten-bloom':return .9;case 'crystal-prism':return .65;case 'frost-snowflake':return .7;default:return this.enraged?.13:.16;}}
 private get interval(){return this.baseInterval/this.frequency;}
 private get batches(){switch(this.pattern){case 'flower':return this.enraged?4:3;case 'molten-spiral':return this.enraged?17:13;case 'crystal-lattice':case 'crystal-prism':return this.enraged?6:4;case 'frost-ripple':return this.enraged?4:3;case 'molten-crossfire':return this.enraged?7:6;case 'crystal-cross':return this.enraged?8:6;case 'molten-bloom':case 'frost-snowflake':case 'frost-drift':return this.enraged?5:4;default:return Math.ceil((this.enraged?3.1:2.6)/this.baseInterval);}}
 get emissionDuration(){return (this.batches-1)*this.interval+.15/this.frequency;}
 get channelCount(){return this.pattern==='flower'?1:this.pattern==='frost-ripple'?2:0;}
 get channelWidth(){return this.pattern==='flower'?BOSS_BARRAGE.flowerGap:this.pattern==='frost-ripple'?BOSS_BARRAGE.frostGap:0;}
 get dodgeHint(){switch(this.pattern){case 'flower':return '跟随逐圈移动的小缺口';case 'frost-ripple':return '选择两侧通道，留意交替偏移';case 'crystal-lattice':return '拉开距离，从错位晶弹间穿行';case 'molten-crossfire':return '避开四束焰流，向斜侧移动';case 'molten-bloom':return '拉开距离，穿过星瓣之间';case 'crystal-cross':return '十字与斜十字交替，及时换位';case 'crystal-prism':return '聚焦位置已锁定，横移离开标记';case 'frost-snowflake':return '避开六条雪枝，从枝间绕行';case 'frost-drift':return '从雪幕间隙穿行，逐排调整位置';default:return '从旋臂间隙绕行，随弹流移动';}}
 get gapAngle(){const batch=Math.min(this.batches-1,Math.floor(Math.max(0,this.elapsed-BOSS_BARRAGE.warning)/this.interval));return this.gapFor(batch);}
 private gapFor(batch:number){return this.heading+(this.pattern==='flower'?batch*.12:this.pattern==='frost-ripple'?(batch%2?.14:-.14):0);}
 start(enemy:Enemy,player:Point,enraged:boolean,pattern:BarragePattern,combat:Combat,scaling:{damage:number;frequency:number}={damage:12,frequency:1}){
  this.clear();this.running=true;this.pattern=pattern;this.enraged=enraged;this.x=enemy.x;this.z=enemy.z;
  this.damage=scaling.damage;this.frequency=scaling.frequency;
  this.targetX=player.x;this.targetZ=player.z;this.heading=Math.atan2(player.x-this.x,player.z-this.z);
  // Only authored channels need an obstacle-aware opening direction.
  if(!this.channelCount)return;
  const toward=Math.atan2(player.x-this.x,player.z-this.z),distance=Math.max(4,Math.hypot(player.x-this.x,player.z-this.z));
  this.heading=toward+(pattern==='flower'?.65:-.65);
  for(const offset of [0,-.2,.2,-.4,.4,-.65]){
   const angle=this.heading+offset,x=this.x+Math.sin(angle)*distance,z=this.z+Math.cos(angle)*distance;
   if(!combat.covered(player.x,player.z,x,z) && combat.hostileWallHit(x,z,x,z,.9)===Infinity){this.heading=angle;break;}
  }
 }
 clear(){this.running=false;this.elapsed=0;this.emitted=0;this.damage=12;this.frequency=1;for(const shot of this.shots)shot.active=false;}
 update(dt:number,combat:Combat,player:Point,previous:Point){
  if(!this.running)return;
  this.elapsed+=dt;
  const t=this.elapsed-BOSS_BARRAGE.warning;
  if(t>=0){
   const interval=this.interval,batches=this.batches;
   while(this.emitted<batches && t+1e-8>=this.emitted*interval){this.emit(this.emitted);this.emitted++;}
  }
  for(const shot of this.shots){
   if(!shot.active)continue;
   shot.previousX=shot.x;shot.previousZ=shot.z;
   const travel=Math.min(dt,shot.life);shot.x+=shot.vx*travel;shot.z+=shot.vz*travel;shot.life-=dt;shot.age+=dt;
   const wall=combat.hostileWallHit(shot.previousX,shot.previousZ,shot.x,shot.z,BOSS_BARRAGE.radius);
   const hit=shot.age<.2?Infinity:combat.hostilePlayerHit(shot.previousX-previous.x,shot.previousZ-previous.z,shot.x-player.x,shot.z-player.z,BOSS_BARRAGE.radius+.62);
   if(hit!==Infinity && hit<wall){combat.hitPlayer(this.damage);shot.active=false;}
   else if(wall!==Infinity || shot.life<=0)shot.active=false;
  }
  if(t>this.emissionDuration && !this.shots.some(shot=>shot.active))this.running=false;
 }
 private emit(batch:number){
  if(this.emitSpecial(batch))return;
  const flower=this.pattern==='flower',molten=this.pattern==='molten-spiral',crystal=this.pattern==='crystal-lattice',frost=this.pattern==='frost-ripple';
  const finisher=molten&&batch===this.batches-1;
  const count=flower?(this.enraged?40:32):molten?(finisher?(this.enraged?18:16):6):crystal?(this.enraged?18:16):frost?(this.enraged?40:36):(this.enraged?5:4);
  const gap=this.gapFor(batch);
  for(let i=0;i<count;i++){
   // Molten emits two turning three-shot streams; crystal offsets alternate rings by half a slot.
   const angle=flower?i*TAU/count+batch*.045:molten&&!finisher?(i%3-1)*.13+Math.floor(i/3)*Math.PI+batch*.26:crystal?i*TAU/count+(batch%2)*Math.PI/count:frost?i*TAU/count+(batch%2)*Math.PI/count:i*TAU/count+batch*.23;
   if(this.channelCount && (angleDistance(angle,gap)<this.channelWidth/2 || (frost&&angleDistance(angle,gap+Math.PI)<this.channelWidth/2)))continue;
   const speed=flower?(this.enraged?3.4:2.9)*(1+.12*Math.cos(angle*6)):molten?(finisher?3.2:3.9)*(this.enraged?1.12:1):crystal?(this.enraged?3.7:3.2)*(1+.07*Math.cos(angle*4)):frost?(this.enraged?2.8:2.35):(this.enraged?4.1:3.5);
   const x=this.x+Math.sin(angle)*1.45,z=this.z+Math.cos(angle)*1.45;
   if(!this.addShot(x,z,angle,speed,molten?(finisher?4:3):crystal?5+batch%2:frost?7+batch%2:flower?batch%2:2))break;
  }
 }
 /** Independent authored layouts; no blanket safety wedge is removed. */
 private emitSpecial(batch:number){
  const p=this.pattern,e=this.enraged;
  if(p==='flower'||p==='spiral'||p==='molten-spiral'||p==='crystal-lattice'||p==='frost-ripple')return false;
  const lanes=p==='molten-crossfire'?(e?4:3):p==='frost-snowflake'?(e?4:3):3;
  const count=p==='molten-crossfire'?4*lanes:p==='molten-bloom'?(e?16:12):p==='crystal-cross'?12:p==='crystal-prism'?18:p==='frost-snowflake'?6*lanes:e?13:11;
  for(let i=0;i<count;i++){
   let angle=0,x=this.x,z=this.z,speed=3,tone=0;
   if(p==='molten-crossfire'){
    angle=this.heading+Math.floor(i/lanes)*Math.PI/2+(i%lanes-(lanes-1)/2)*.10+(batch%2?.18:-.18);speed=e?4:3.5;tone=3;
   }else if(p==='molten-bloom'){
    angle=i*TAU/count+batch*.12;speed=(e?3.4:3)*(1+.22*Math.cos(angle*4));tone=batch%2?3:4;
   }else if(p==='crystal-cross'){
    angle=this.heading+Math.floor(i/3)*Math.PI/2+(i%3-1)*.1+(batch%2)*Math.PI/4;speed=e?4.1:3.6;tone=batch%2?6:5;
   }else if(p==='crystal-prism'){
    const origin=Math.floor(i/3)*TAU/6;
    x+=Math.sin(origin)*2.2;z+=Math.cos(origin)*2.2;
    angle=Math.atan2(this.targetX-x,this.targetZ-z)+(i%3-1)*.12;speed=e?4:3.5;tone=6;
   }else if(p==='frost-snowflake'){
    angle=this.heading+Math.floor(i/lanes)*TAU/6+(i%lanes-(lanes-1)/2)*.085+batch*.10;speed=e?3.1:2.6;tone=batch%2?7:8;
   }else{
    angle=this.heading;const lateral=(i-(count-1)/2)*2.4+(batch%2?.6:-.6);
    x+=Math.cos(angle)*lateral;z-=Math.sin(angle)*lateral;speed=e?3:2.5;tone=batch%2?7:8;
   }
   if(p!=='crystal-prism'&&p!=='frost-drift'){x+=Math.sin(angle)*1.45;z+=Math.cos(angle)*1.45;}
   if(!this.addShot(x,z,angle,speed,tone))break;
  }
  return true;
 }
 private addShot(x:number,z:number,angle:number,speed:number,tone:number){
  const limit=this.enraged?BOSS_BARRAGE.capacity:BOSS_BARRAGE.normalLimit;
  const shot=this.shots.find((s,index)=>index<limit&&!s.active);if(!shot)return false;
  Object.assign(shot,{active:true,x,z,previousX:x,previousZ:z,vx:Math.sin(angle)*speed*this.frequency,vz:Math.cos(angle)*speed*this.frequency,life:BOSS_BARRAGE.life/this.frequency,age:0,tone});return true;
 }
 inspect(){return {pattern:this.pattern,running:this.running,warning:this.warning,time:this.elapsed,damage:this.damage,frequency:this.frequency,channels:this.channelCount,channelWidth:this.channelWidth,shots:this.shots.filter(s=>s.active).length,limit:this.enraged?BOSS_BARRAGE.capacity:BOSS_BARRAGE.normalLimit};}
}
