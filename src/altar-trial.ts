import * as THREE from 'three';
import type { Combat } from './combat';
import { WEAPON_CARDS, type SkillDefinition } from './progression';
import { factoryRelic } from './content/relic-registry';
import { ITEM_TEST_ALTAR, ITEM_TEST_SKILLS } from './item-test-mode';
import { PLAYER_FEEDBACK } from './player-feedback';
import { PLAYER_COLLISION_RADIUS } from './arena-boundary';
import { ALTAR_FLOOR, ALTAR_OUTLINE, insideAltarPolygon, crossesAltarGate, resolveAltarWalls } from './altar-layout';
import { upgradeArt } from './upgrade-art';
import { AltarTrialProjectileView, type AltarTrialProjectile } from './altar-trial-projectile-view';

type Point={x:number;z:number};
type Shot=AltarTrialProjectile;
type Row={axis:'x'|'z';gap:number;direction:number;warning:number};
const COLORS:Record<string,string>={'arc-barrage':'#b5a0e6','rose-barrage':'#ef9ebc','leaf-barrage':'#9bd277','frost-barrage':'#72baff','screen-barrage':'#ffd35c'};
const CAPACITY=128, DURATION=30, WARNING=.85, SPACING=.65, CROSSING_TIME=5, GAP=1.65;

/** Shared training and endless reward trial. All timers use simulation seconds; inventory belongs to Combat. */
export class AltarTrial {
  readonly group=new THREE.Group();
  readonly origin:Point={x:ITEM_TEST_ALTAR.x,z:ITEM_TEST_ALTAR.z};
  private preserveCombat=false;
  get hasNotice(){return this.noticeRemaining>0;}
  offer(combat:Combat){this.choose(combat);return !!this.reward;}
  private root=document.createElement('section');
  private label=document.createElement('div');
  private button=document.createElement('button');
  private notice=document.createElement('aside');
  private noticeIcon=document.createElement('img');
  private noticeTitle=document.createElement('strong');
  private noticeCaption=document.createElement('span');
  private noticeRemaining=0;
  private projectiles=new AltarTrialProjectileView(CAPACITY);
  private warningMaterial=new THREE.LineBasicMaterial({color:'#ffcd87',transparent:true,opacity:.7,depthTest:false});
  private warningGeometry=new THREE.BufferGeometry();
  private warning=new THREE.LineSegments(this.warningGeometry,this.warningMaterial);
  private shots:Shot[]=Array.from({length:CAPACITY},()=>({active:false,x:0,z:0,previousX:0,previousZ:0,vx:0,vz:0,age:0}));
  private row?:Row;
  private reward?:SkillDefinition;
  private countdown=0;
  private elapsed=0;
  private nextRow=0;
  private rowIndex=0;
  private stage=-1;
  private protection=0;
  private centerX=0;
  private centerZ=this.origin.z-.6;
  private gapX=0;
  private gapZ=this.origin.z;
  private halfWidth=6.5;
  private halfDepth=4.4;
  private message='';
  completed=false;
  private enteredFromSteps=false;
  active=false;
  color='#ffcd87';
  constructor(private activate:()=>void,private onReward:()=>void=()=>{}){
    this.root.className='altar-trial';this.root.hidden=true;
    this.label.className='altar-trial-label';this.label.setAttribute('role','status');this.label.setAttribute('aria-live','polite');
    this.button.type='button';this.button.onclick=()=>this.activate();
    this.root.append(this.label,this.button);document.body.append(this.root);
    this.notice.className='altar-reward-notice';this.notice.hidden=true;
    this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');this.notice.setAttribute('aria-atomic','true');
    this.noticeIcon.alt='';this.noticeIcon.draggable=false;
    const copy=document.createElement('div');copy.append(this.noticeCaption,this.noticeTitle);
    this.notice.append(this.noticeIcon,copy);document.body.append(this.notice);
    this.warningGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3));
    this.warningGeometry.setDrawRange(0,0);this.warning.frustumCulled=false;
    this.warning.renderOrder=7;this.group.add(this.projectiles.group,this.warning);this.group.visible=false;
  }
  private choose(combat:Combat){
    const p=combat.progression;
    const missing=ITEM_TEST_SKILLS.filter(id=>!(p.ranks[id]>0));
    const pool=p.skills.filter(s=>!p.ranks[s.id]&&p.canGrant(s.id)&&s.id!=='weapon-pair-fusion'
      && !(p.ranks['specialist-badge']&&WEAPON_CARDS[s.id]&&!combat.runBuild.has(WEAPON_CARDS[s.id]!))
      && (factoryRelic(s.id)?.rewards.shop??true)
      &&(missing.length?missing.some(id=>id===s.id):!ITEM_TEST_SKILLS.some(id=>id===s.id)));
    this.reward=pool[Math.floor(Math.random()*pool.length)];
    this.color=COLORS[this.reward?.id??'']??'#ef655c';
    this.projectiles.setColor(this.color);this.warningMaterial.color.set(this.color);
    this.root.style.setProperty('--altar-color',this.color);
  }
  start(combat:Combat,player:Point,viewport:Point&{halfWidth:number;halfDepth:number},preserveCombat=false){
    if(this.active||this.completed||this.noticeRemaining>0||!this.canActivate(player))return false;
    // Re-evaluate at activation: the displayed offer must still be unowned and legal.
    if(!this.reward||combat.progression.ranks[this.reward.id]||!combat.progression.canGrant(this.reward.id))this.choose(combat);
    if(!this.reward){this.message='已拥有所有当前可获得的道具';return false;}
    this.preserveCombat=preserveCombat;
    if(!preserveCombat)combat.clearWave();this.clearShots();this.active=true;this.countdown=3;this.elapsed=0;
    this.nextRow=0;this.rowIndex=0;this.stage=-1;this.protection=0;this.message='';combat.invulnerability=0;
    this.fitViewport({...viewport,x:this.origin.x,z:this.origin.z-.6});
    player.x=this.origin.x;player.z=this.origin.z;this.gapX=player.x;this.gapZ=player.z;
    return true;
  }
  /** Match movement to the painted inner railing and front steps, including their projected height. */
  resolveEntrance(player:Point,previous:Point){
    if(this.active||this.completed)return;
    const from={x:previous.x-this.origin.x,z:previous.z-this.origin.z};
    const to={x:player.x-this.origin.x,z:player.z-this.origin.z};
    const wasInside=insideAltarPolygon(from,ALTAR_OUTLINE);
    resolveAltarWalls(to,from,PLAYER_COLLISION_RADIUS);
    const inside=insideAltarPolygon(to,ALTAR_OUTLINE);
    if(!inside)this.enteredFromSteps=false;
    else if(!wasInside&&crossesAltarGate(from,to))this.enteredFromSteps=true;
    player.x=to.x+this.origin.x;player.z=to.z+this.origin.z;
  }
  isOnAltar(player:Point){
    return !this.completed&&(this.enteredFromSteps||this.active)&&insideAltarPolygon({x:player.x-this.origin.x,z:player.z-this.origin.z},ALTAR_OUTLINE);
  }
  canActivate(player:Point){
    return this.enteredFromSteps&&insideAltarPolygon({x:player.x-this.origin.x,z:player.z-this.origin.z},ALTAR_FLOOR);
  }
  /** Match the fixed camera's complete ground footprint, including resize changes. */
  fitViewport(viewport:Point&{halfWidth:number;halfDepth:number}){
    this.centerX=viewport.x;this.centerZ=viewport.z;
    this.halfWidth=Math.max(2.8,viewport.halfWidth-.1);
    this.halfDepth=Math.max(2.8,viewport.halfDepth-.1);
  }
  private clearShots(){for(const shot of this.shots)shot.active=false;this.row=undefined;}
  private finish(combat:Combat,won:boolean){
    this.active=false;this.completed=true;this.enteredFromSteps=false;this.clearShots();
    this.message='';
    if(won&&this.reward&&combat.grantUpgrade(this.reward.id)){
      this.noticeCaption.textContent=ITEM_TEST_SKILLS.some(id=>id===this.reward!.id)?'获得新技能':'获得新道具';
      this.noticeTitle.textContent=this.reward.title;
      this.noticeIcon.src=upgradeArt(this.reward,combat.baseAttack,combat.runBuild.attacks.map(a=>a.attackId)).illustrations[0];
      this.notice.style.setProperty('--reward-color',this.color);this.notice.style.opacity='1';
      this.noticeRemaining=4;this.notice.hidden=false;this.onReward();
    }else this.message=won?'奖励当前无法领取，请重新挑战':'试炼失败 · 生命耗尽';
    this.reward=undefined;if(!this.preserveCombat)combat.encounters.beginWave(1);
  }
  stepNotice(dt:number){this.noticeRemaining=Math.max(0,this.noticeRemaining-dt);}
  suspend(){this.root.hidden=true;this.notice.hidden=true;}
  clamp(player:Point){
    player.x=THREE.MathUtils.clamp(player.x,this.centerX-this.halfWidth+.62,this.centerX+this.halfWidth-.62);
    player.z=THREE.MathUtils.clamp(player.z,this.centerZ-this.halfDepth+.62,this.centerZ+this.halfDepth-.62);
  }
  step(dt:number,combat:Combat,player:Point,previous:Point){
    if(!this.active)return;
    this.clamp(player);
    combat.invulnerability=Math.max(0,combat.invulnerability-dt);
    combat.hurtFlash=Math.max(0,combat.hurtFlash-dt);
    this.protection=Math.max(0,this.protection-dt);
    if(combat.hp<=0){this.finish(combat,false);return;}
    if(this.countdown>0){this.countdown=Math.max(0,this.countdown-dt);return;}
    this.elapsed+=dt;
    if(this.elapsed>=DURATION){this.finish(combat,true);return;}
    const stage=Math.floor(this.elapsed/10);
    if(stage!==this.stage){this.clearShots();this.stage=stage;this.nextRow=0;}
    this.nextRow-=dt;
    if(this.nextRow<=0&&!this.row){
      const axis=stage===0?'x':stage===1?'z':this.rowIndex%2?'x':'z';
      const limit=(axis==='x'?this.halfWidth:this.halfDepth)-GAP;
      // Adjacent gaps overlap, so a safe route always connects successive rows.
      const origin=axis==='x'?this.centerX:this.centerZ;
      const old=(axis==='x'?this.gapX:this.gapZ)-origin;
      const drift=Math.sin(this.rowIndex*.9+(this.reward?.id==='leaf-barrage'?1:0))*.85;
      const gap=THREE.MathUtils.clamp(old+drift,-limit,limit)+origin;
      if(axis==='x')this.gapX=gap;else this.gapZ=gap;
      this.row={axis,gap,direction:this.rowIndex%2?1:-1,warning:WARNING};
      this.rowIndex++;this.nextRow=1.9;
    }
    if(this.row){
      this.row.warning-=dt;
      if(this.row.warning<=0){this.emit(this.row);this.row=undefined;}
    }
    for(const s of this.shots){
      if(!s.active)continue;
      const x=s.x,z=s.z;s.previousX=x;s.previousZ=z;s.age+=dt;s.x+=s.vx*dt;s.z+=s.vz*dt;
      // Relative swept segment prevents tunnelling by either player or bullet.
      const ax=x-previous.x,az=z-previous.z,dx=s.x-player.x-ax,dz=s.z-player.z-az;
      const t=THREE.MathUtils.clamp(-(ax*dx+az*dz)/(dx*dx+dz*dz||1),0,1);
      if(!this.protection&&Math.hypot(ax+dx*t,az+dz*t)<.77){
        s.active=false;this.protection=1.1;
        // Trial hits always cost exactly ten HP; training immunity and relic mitigation
        // must not turn the advertised penalty into zero or a different amount.
        combat.hp=Math.max(0,combat.hp-10);
        combat.invulnerability=this.protection;combat.hurtFlash=PLAYER_FEEDBACK.hurtDuration;
        if(combat.hp<=0){this.finish(combat,false);break;}
      }
      if(Math.abs(s.x-this.centerX)>this.halfWidth+.8||Math.abs(s.z-this.centerZ)>this.halfDepth+.8)s.active=false;
    }
  }
  private emit(row:Row){
    const across=row.axis==='x'?this.halfWidth:this.halfDepth;
    // Keep several full-screen rows in the existing pool on wide displays.
    const spacing=Math.max(SPACING,2*across/39);
    const speed=2*(row.axis==='x'?this.halfDepth:this.halfWidth)/CROSSING_TIME;
    for(let v=-across;v<=across;v+=spacing){
      const coordinate=v+(row.axis==='z'?this.centerZ:this.centerX);
      if(Math.abs(coordinate-row.gap)<GAP)continue;
      const s=this.shots.find(s=>!s.active);if(!s)break;
      Object.assign(s,{active:true,x:this.centerX+(row.axis==='x'?v:row.direction*this.halfWidth),
        z:row.axis==='x'?this.centerZ+row.direction*this.halfDepth:coordinate,
        vx:row.axis==='x'?0:-row.direction*speed,vz:row.axis==='x'?-row.direction*speed:0,age:0});
      s.previousX=s.x;s.previousZ=s.z;
    }
  }
  render(enabled:boolean,combat:Combat,player:Point,alpha:number,billboard:THREE.Quaternion,detail:number){
    this.root.hidden=!enabled||this.completed;this.group.visible=enabled&&this.active;
    this.notice.hidden=!enabled||this.noticeRemaining<=0;
    this.notice.style.opacity=String(Math.min(1,this.noticeRemaining/.4));if(!enabled)return;
    if(!this.active&&!this.completed&&(!this.reward||combat.progression.ranks[this.reward.id]||!combat.progression.canGrant(this.reward.id)))this.choose(combat);
    const close=this.canActivate(player);
    this.root.classList.toggle('is-active',this.active);
    const text=this.active?'禁止冲刺'
      :this.message;
    this.label.hidden=!text;
    if(this.label.textContent!==text)this.label.textContent=text;
    this.button.hidden=this.active||!this.reward||this.noticeRemaining>0;this.button.disabled=!close;
    this.button.textContent=close?'E 开启躲避试炼':'从下方台阶登上祭坛';
    this.projectiles.render(this.shots,alpha,billboard,detail);
    const points:THREE.Vector3[]=[];
    if(this.row){const r=this.row,axis=r.axis==='x',bound=axis?this.halfWidth:this.halfDepth,origin=axis?this.centerX:this.centerZ;
      const point=(v:number)=>new THREE.Vector3(axis?v:this.centerX+r.direction*this.halfWidth,.16,axis?this.centerZ+r.direction*this.halfDepth:v);
      points.push(point(origin-bound),point(r.gap-GAP),point(r.gap+GAP),point(origin+bound));
    }
    const positions=this.warningGeometry.getAttribute('position') as THREE.BufferAttribute;
    points.forEach((p,i)=>positions.setXYZ(i,p.x,p.y,p.z));positions.needsUpdate=true;
    this.warningGeometry.setDrawRange(0,points.length);this.warning.visible=points.length>0;
  }
  reset(){this.preserveCombat=false;this.completed=false;this.enteredFromSteps=false;this.active=false;this.clearShots();this.reward=undefined;this.message='';this.noticeRemaining=0;this.notice.hidden=true;this.root.hidden=true;this.group.visible=false;}
  dispose(){this.reset();this.root.remove();this.notice.remove();this.group.removeFromParent();this.projectiles.dispose();this.warningMaterial.dispose();this.warningGeometry.dispose();}
}
