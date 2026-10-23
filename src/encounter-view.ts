import { rangedEnemyRule } from './ranged-enemies';
import * as THREE from 'three';
import { COMBAT_LIMITS, type Combat } from './combat';
import { ENCOUNTER_RULES } from './enemy-challenge';
import { CrownthornView } from './crownthorn-view';
import { screenFacing, type ScreenBasis } from './creature-animation';
import { EliteQuakeView } from './elite-quake-view';

/** Bounded hostile visuals. The animation pose never drives aim, damage or timing. */
export class EncounterView {
  readonly group = new THREE.Group();
  private boss?: CrownthornView;
  private pose = new THREE.Object3D();
  private shots: THREE.InstancedMesh;
  private shotColor = new THREE.Color();
  private billboard = new THREE.Quaternion();
  private sporeRims: THREE.InstancedMesh;
  private sporeMarks: THREE.InstancedMesh;
  private muzzleCount = 0;
  private lane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private cone: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private elite: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private quake = new EliteQuakeView();
  private aftershocks = Array.from({ length: 2 }, () => new EliteQuakeView());
  private fallback: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  private basis: ScreenBasis = {rightX:1,rightZ:0,upX:0,upZ:-Math.SQRT1_2};
  constructor(private combat: Combat) {
    const ground = (color: string, opacity: number) => new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
    this.shots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),ENCOUNTER_RULES.hostileShots);
    this.shots.count=0; this.shots.frustumCulled=false; this.shots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sporeRims = new THREE.InstancedMesh(new THREE.RingGeometry(.98,1.22,20), new THREE.MeshBasicMaterial({color:'#ff7841',side:THREE.DoubleSide,toneMapped:false}),ENCOUNTER_RULES.hostileShots);
    this.sporeMarks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1), new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),COMBAT_LIMITS.enemies+ENCOUNTER_RULES.hostileShots*3);
    for (const mesh of [this.sporeRims,this.sporeMarks]) { mesh.count=0; mesh.frustumCulled=false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(mesh); }
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1,1),ground('#ff904e',.42));
    this.cone = new THREE.Mesh(new THREE.CircleGeometry(1,32,-.7,1.4),ground('#e295ff',.22));
    this.elite = new THREE.Mesh(new THREE.RingGeometry(.92,1,48),ground('#ffc85e',.85));
    this.fallback = new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#bf9a52',wireframe:true}));
    this.group.name='FormalEnemyChallenges'; this.group.add(this.shots,this.lane,this.cone,this.elite,this.fallback,this.quake.group);
    for (const quake of this.aftershocks) this.group.add(quake.group);
    this.clear();
  }
  setView(camera: THREE.Camera) { camera.getWorldQuaternion(this.billboard); this.quake.setView(camera); for (const quake of this.aftershocks) quake.setView(camera); const e=camera.matrixWorld.elements; this.basis={rightX:e[0],rightZ:e[2],upX:e[4],upZ:e[6]}; }
  render(alpha: number, detail = 3) {
    const c=this.combat.encounters;
    this.clear(); this.group.visible=c.enabled || c.shots.some(s=>s.active);
    if (!this.group.visible) return;
    for (const shot of c.shots) if(shot.active) {
      this.pose.position.set(THREE.MathUtils.lerp(shot.previousX,shot.x,alpha),.75,THREE.MathUtils.lerp(shot.previousZ,shot.z,alpha));
      this.pose.scale.setScalar(ENCOUNTER_RULES.shotRadius); this.pose.rotation.set(0,0,0); this.pose.updateMatrix();
      this.shots.setColorAt(this.shots.count, this.shotColor.set(shot.style === 'toxic' ? '#c76bff' : shot.style === 'thunder' ? '#ffe344' : shot.style === 'petal' ? '#ff77bc' : shot.style === 'crystal' ? '#62e5ff' : shot.style === 'spore' ? '#8dff32' : '#ee8fff'));
      this.shots.setMatrixAt(this.shots.count++,this.pose.matrix);
      if (shot.style === 'spore' || shot.style === 'crystal' || shot.style === 'petal' || shot.style === 'thunder' || shot.style === 'toxic') {
        this.pose.quaternion.copy(this.billboard); this.pose.updateMatrix();
        this.sporeRims.setMatrixAt(this.sporeRims.count++,this.pose.matrix);
        const speed=Math.max(.001,Math.hypot(shot.vx,shot.vz)), age=Math.max(0,(shot.style==='crystal'?2.5:2)-shot.life);
        const x=this.pose.position.x,z=this.pose.position.z;
        const count=detail<=1?1:3;
        for(let i=1;i<=count;i++) {
          const distance=Math.min(age*speed,i*.19);
          this.mark(x-shot.vx/speed*distance,.75,z-shot.vz/speed*distance,.105*(1-i*.18),shot.style==='toxic'?'#e7bfff':shot.style==='thunder'?'#fff5a8':shot.style==='petal'?'#ffd1e8':shot.style==='crystal'?'#b8f4ff':'#b8ed67');
        }
      }
    }
    this.shots.instanceMatrix.needsUpdate=true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate=true;
    for(const enemy of this.combat.enemies) {
      const ranged=rangedEnemyRule(enemy.kind);
      if(!enemy.active || enemy.spawnTime>0 || !ranged) continue;
      const winding=enemy.intent==='windup';
      const flash=enemy.intentCooldown>ranged.cooldown-.18;
      if(!winding && !flash) continue;
      const progress=winding?Math.max(0,Math.min(1,1-enemy.intentTime/ranged.windup)):1;
      const radius=flash?.24:.08+progress*.12;
      const x=THREE.MathUtils.lerp(enemy.previousX,enemy.x,alpha)+enemy.aimX*.7;
      const z=THREE.MathUtils.lerp(enemy.previousZ,enemy.z,alpha)+enemy.aimZ*.7;
      this.mark(x,.85,z,radius,ranged.style==='toxic'?'#f1ccff':ranged.style==='thunder'?'#fff4a2':ranged.style==='petal'?'#ffe0f1':ranged.style==='crystal'?'#c5f7ff':flash?'#fff3a2':'#e3ff89'); this.muzzleCount++;
    }
    for(const mesh of [this.sporeRims,this.sporeMarks]) { mesh.instanceMatrix.needsUpdate=true; if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true; }
    if (c.elite?.active && c.elite.spawnTime<=0) {
      this.elite.visible=true; this.elite.rotation.x=-Math.PI/2; this.elite.position.set(c.elite.x,.1,c.elite.z);
      this.elite.scale.setScalar(1.35); this.elite.material.opacity=.6;
    }
    const warning = !!c.elite?.active && c.elite.spawnTime<=0 && c.elitePulsing;
    const primary = c.eliteQuakeTargets[0].active ? c.eliteQuakeTargets[0] : c.elite;
    this.quake.render(warning && primary
      ? { x:primary.x, z:primary.z, progress:c.eliteTime/c.eliteWindupDuration } : null, c.eliteQuake, detail);
    for (let i = 0; i < this.aftershocks.length; i++) {
      const target = c.eliteQuakeTargets[i+1];
      this.aftershocks[i].render(warning && target.active
        ? { x:target.x, z:target.z, progress:c.eliteTime/c.eliteWindupDuration } : null, c.eliteQuakeAftershocks[i], detail);
    }
    const enemy=c.boss;
    if (!enemy || c.defeated) return;
    if (!this.boss) { this.boss=new CrownthornView(undefined,4.2); this.group.add(this.boss.group); }
    if (enemy.spawnTime>0) return;
    const moving=c.bossState==='approach' && Math.hypot(enemy.walkX??0,enemy.walkZ??0)>1e-6;
    this.boss.animator.play(c.action ?? (!moving && c.enraged ? 'enraged-idle' : null));
    if (Math.hypot(enemy.walkX??0,enemy.walkZ??0)>1e-6) this.boss.animator.facing=screenFacing(enemy.walkX??0,enemy.walkZ??0,this.basis,this.boss.animator.facing);
    this.boss.animator.moving=moving;
    this.boss.animator.time=c.bossTime;
    this.boss.group.position.set(THREE.MathUtils.lerp(enemy.previousX,enemy.x,alpha),0,THREE.MathUtils.lerp(enemy.previousZ,enemy.z,alpha));
    this.boss.render();
    if (!this.boss.group.visible) { this.fallback.visible=true; this.fallback.position.set(enemy.x,1.5,enemy.z); this.fallback.scale.set(1.4,1.8,1.4); }
    const angle=Math.atan2(c.aimX,c.aimZ);
    if (c.bossState==='dash-windup') {
      const length=ENCOUNTER_RULES.dashSpeed*c.dashDuration;
      this.lane.visible=true; this.lane.position.set(enemy.x+c.aimX*length/2,.12,enemy.z+c.aimZ*length/2);
      this.lane.scale.set((ENCOUNTER_RULES.bossRadius+.62)*2,length,1); this.lane.rotation.set(-Math.PI/2,0,angle);
    }
    if(c.bossState==='spread-windup') {
      this.cone.visible=true; this.cone.position.set(enemy.x,.12,enemy.z); this.cone.rotation.set(-Math.PI/2,0,angle-Math.PI/2);
      this.cone.scale.setScalar(ENCOUNTER_RULES.spreadLife*ENCOUNTER_RULES.spreadSpeed*(c.enraged?1.1:1));
    }
  }
  private mark(x:number,y:number,z:number,radius:number,color:string) {
    if(this.sporeMarks.count>=this.sporeMarks.instanceMatrix.count)return;
    this.pose.position.set(x,y,z); this.pose.quaternion.identity(); this.pose.scale.setScalar(radius); this.pose.updateMatrix();
    this.sporeMarks.setColorAt(this.sporeMarks.count,this.shotColor.set(color));
    this.sporeMarks.setMatrixAt(this.sporeMarks.count++,this.pose.matrix);
  }
  clear() { this.sporeRims.count=this.sporeMarks.count=this.muzzleCount=0; this.quake.clear(); for (const quake of this.aftershocks) quake.clear(); this.group.visible=false; this.shots.count=0; this.lane.visible=this.cone.visible=this.elite.visible=this.fallback.visible=false; if(this.boss) this.boss.group.visible=false; }
  inspect() { return {quake:this.quake.inspect(),aftershocks:this.aftershocks.map(quake=>quake.inspect()),shots:this.shots.count,sporeRims:this.sporeRims.count,sporeMarks:this.sporeMarks.count,muzzles:this.muzzleCount,capacity:ENCOUNTER_RULES.hostileShots,boss:this.boss?.inspect()??null,lane:this.lane.visible,cone:this.cone.visible,elite:this.elite.visible,fallback:this.fallback.visible}; }
  dispose() {
    this.quake.dispose();
    for (const quake of this.aftershocks) quake.dispose();
    this.boss?.dispose(); this.boss=undefined;
    for(const mesh of [this.shots,this.sporeRims,this.sporeMarks,this.lane,this.cone,this.elite,this.fallback]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.shots.dispose(); this.sporeRims.dispose(); this.sporeMarks.dispose(); this.group.clear(); this.group.removeFromParent();
  }
}
