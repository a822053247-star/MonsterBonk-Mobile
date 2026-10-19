import * as THREE from 'three';
import type { Combat } from './combat';
import { ENCOUNTER_RULES } from './enemy-challenge';
import { CrownthornView } from './crownthorn-view';
import { screenFacing, type ScreenBasis } from './creature-animation';

/** Bounded hostile visuals. The animation pose never drives aim, damage or timing. */
export class EncounterView {
  readonly group = new THREE.Group();
  private boss?: CrownthornView;
  private pose = new THREE.Object3D();
  private shots: THREE.InstancedMesh;
  private lane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private cone: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private elite: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private fallback: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  private basis: ScreenBasis = {rightX:1,rightZ:0,upX:0,upZ:-Math.SQRT1_2};
  constructor(private combat: Combat) {
    const ground = (color: string, opacity: number) => new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
    this.shots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#ee8fff',toneMapped:false}),ENCOUNTER_RULES.hostileShots);
    this.shots.count=0; this.shots.frustumCulled=false; this.shots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1,1),ground('#ff904e',.42));
    this.cone = new THREE.Mesh(new THREE.CircleGeometry(1,32,-.7,1.4),ground('#e295ff',.22));
    this.elite = new THREE.Mesh(new THREE.RingGeometry(.92,1,48),ground('#ffc85e',.85));
    this.fallback = new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#bf9a52',wireframe:true}));
    this.group.name='FormalEnemyChallenges'; this.group.add(this.shots,this.lane,this.cone,this.elite,this.fallback);
    this.clear();
  }
  setView(camera: THREE.Camera) { const e=camera.matrixWorld.elements; this.basis={rightX:e[0],rightZ:e[2],upX:e[4],upZ:e[6]}; }
  render(alpha: number) {
    const c=this.combat.encounters;
    this.clear(); this.group.visible=c.enabled;
    if (!c.enabled) return;
    for (const shot of c.shots) if(shot.active) {
      this.pose.position.set(THREE.MathUtils.lerp(shot.previousX,shot.x,alpha),.75,THREE.MathUtils.lerp(shot.previousZ,shot.z,alpha));
      this.pose.scale.setScalar(ENCOUNTER_RULES.shotRadius); this.pose.rotation.set(0,0,0); this.pose.updateMatrix();
      this.shots.setMatrixAt(this.shots.count++,this.pose.matrix);
    }
    this.shots.instanceMatrix.needsUpdate=true;
    if (c.elite?.active && c.elite.spawnTime<=0) {
      this.elite.visible=true; this.elite.rotation.x=-Math.PI/2; this.elite.position.set(c.elite.x,.1,c.elite.z);
      const radius=c.elitePulsing ? ENCOUNTER_RULES.elitePulseRadius+.62 : 1.35;
      this.elite.scale.setScalar(radius); this.elite.material.opacity=c.elitePulsing ? .65+.25*Math.sin(c.eliteTime*16) : .6;
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
      const length=ENCOUNTER_RULES.dashSpeed*ENCOUNTER_RULES.dashDuration;
      this.lane.visible=true; this.lane.position.set(enemy.x+c.aimX*length/2,.12,enemy.z+c.aimZ*length/2);
      this.lane.scale.set((ENCOUNTER_RULES.bossRadius+.62)*2,length,1); this.lane.rotation.set(-Math.PI/2,0,angle);
    }
    if(c.bossState==='spread-windup') {
      this.cone.visible=true; this.cone.position.set(enemy.x,.12,enemy.z); this.cone.rotation.set(-Math.PI/2,0,angle-Math.PI/2);
      this.cone.scale.setScalar(ENCOUNTER_RULES.spreadLife*ENCOUNTER_RULES.spreadSpeed*(c.enraged?1.15:1));
    }
  }
  clear() { this.group.visible=false; this.shots.count=0; this.lane.visible=this.cone.visible=this.elite.visible=this.fallback.visible=false; if(this.boss) this.boss.group.visible=false; }
  inspect() { return {shots:this.shots.count,capacity:ENCOUNTER_RULES.hostileShots,boss:this.boss?.inspect()??null,lane:this.lane.visible,cone:this.cone.visible,elite:this.elite.visible,fallback:this.fallback.visible}; }
  dispose() {
    this.boss?.dispose(); this.boss=undefined;
    for(const mesh of [this.shots,this.lane,this.cone,this.elite,this.fallback]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.shots.dispose(); this.group.clear(); this.group.removeFromParent();
  }
}
