import * as THREE from 'three';
import { COMBAT_LIMITS, type Combat } from './combat';
import { GRASS_BLOB } from './grass-blob';
import { FirePixelView } from './fire-pixel-view';
import { FUSION_ASSET_ROOT, FUSION_CLIPS } from './fusion-pixels';

/** Bounded enemy-only warning and existing thorn-atlas bursts, separate from friendly impact culling. */
export class GrassBlobView {
  readonly group=new THREE.Group();
  private pose=new THREE.Object3D();
  private rim=new THREE.InstancedMesh(new THREE.RingGeometry(.94,1,40),new THREE.MeshBasicMaterial({color:'#b7d948',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}),COMBAT_LIMITS.enemies);
  private fill=new THREE.InstancedMesh(new THREE.CircleGeometry(1,40),new THREE.MeshBasicMaterial({color:'#d7f575',transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}),COMBAT_LIMITS.enemies);
  private fallback=new THREE.InstancedMesh(new THREE.ConeGeometry(.12,.65,4),new THREE.MeshBasicMaterial({color:'#acd95a'}),COMBAT_LIMITS.enemies*6);
  private thorns?:FirePixelView;
  private camera?:THREE.Camera;
  private warnings=0;
  private bursts=0;
  constructor() {
    for(const mesh of [this.rim,this.fill,this.fallback]) {
      mesh.frustumCulled=false; mesh.count=0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(mesh);
    }
    this.group.name='GrassBlobRootAndThorns';
  }
  setView(camera:THREE.Camera) { this.camera=camera; this.thorns?.setView(camera); }
  private ring(mesh:THREE.InstancedMesh,x:number,z:number,radius:number,y:number) {
    this.pose.position.set(x,y,z); this.pose.rotation.set(-Math.PI/2,0,0); this.pose.scale.set(radius,radius,1); this.pose.updateMatrix();
    mesh.setMatrixAt(mesh.count++,this.pose.matrix);
  }
  render(combat:Combat) {
    this.clear();
    if(!combat.encounters.enabled || combat.hp<=0 || combat.encounters.dying) return;
    for(const enemy of combat.enemies) {
      if(!enemy.active || enemy.rank || enemy.kind!=='normal' || enemy.spawnTime>0 || enemy.stagger>0) continue;
      const x=enemy.grassAttackX ?? enemy.x,z=enemy.grassAttackZ ?? enemy.z;
      if(enemy.intent==='windup') {
        this.warnings++;
        this.ring(this.rim,x,z,GRASS_BLOB.radius,.055);
        this.ring(this.fill,x,z,GRASS_BLOB.radius*Math.max(.05,1-enemy.intentTime/GRASS_BLOB.windup),.045);
      }
      const age=enemy.intent==='pounce' ? GRASS_BLOB.active-enemy.intentTime
        : enemy.intent==='recover' ? GRASS_BLOB.active+GRASS_BLOB.recovery-enemy.intentTime : Infinity;
      // Full recovery starts only after a genuine attack; an interruption starts at .6s and has no burst tail.
      if(age<0 || age>=.4 || (enemy.intent!=='pounce' && enemy.intent!=='recover')) continue;
      this.bursts++;
      const frame=FUSION_CLIPS['thorn-scatter'].impact[Math.min(5,Math.floor(age/.4*6))];
      for(let i=0;i<6;i++) {
        const angle=i/6*Math.PI*2, radius=GRASS_BLOB.radius*.72;
        const tx=x+Math.sin(angle)*radius,tz=z+Math.cos(angle)*radius;
        if(this.thorns?.loaded) this.thorns.put(2,frame,tx,.5,tz,.95);
        else {
          this.pose.position.set(tx,.35,tz); this.pose.rotation.set(0,angle,0); this.pose.scale.setScalar(Math.sin(Math.PI*Math.min(1,age/.4))*.8+.2); this.pose.updateMatrix();
          this.fallback.setMatrixAt(this.fallback.count++,this.pose.matrix);
        }
      }
    }
    for(const mesh of [this.rim,this.fill,this.fallback])mesh.instanceMatrix.needsUpdate=true;
    this.thorns?.finish();
  }
  enable(camera?:THREE.Camera) {
    if(!this.thorns) { this.thorns=new FirePixelView(FUSION_ASSET_ROOT+'effects.normalized.png',8,4,'EnemyGrassThorns'); this.group.add(this.thorns.mesh); }
    if(camera ?? this.camera)this.setView((camera ?? this.camera)!);
  }
  clear() { this.warnings=this.bursts=0; this.rim.count=this.fill.count=this.fallback.count=0; this.thorns?.begin(); }
  inspect() {return {warnings:this.warnings,bursts:this.bursts,radius:GRASS_BLOB.radius,thorns:this.thorns?.inspect(),fallback:this.fallback.count};}
  dispose() {
    this.thorns?.dispose();
    for(const mesh of [this.rim,this.fill,this.fallback]){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}
    this.group.clear();
  }
}
