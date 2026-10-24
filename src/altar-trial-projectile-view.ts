import * as THREE from 'three';

export interface AltarTrialProjectile {
  active:boolean;x:number;z:number;previousX:number;previousZ:number;vx:number;vz:number;age:number;
}

/** Boss-style solid projectiles with camera-facing outlines and bounded short tails. */
export class AltarTrialProjectileView {
  readonly group=new THREE.Group();
  private coreMaterial=new THREE.MeshBasicMaterial({color:'#ffd35c',toneMapped:false,depthTest:false,depthWrite:false});
  private tailMaterial=new THREE.MeshBasicMaterial({color:'#ffd35c',toneMapped:false,transparent:true,opacity:.6,depthTest:false,depthWrite:false});
  private glowMaterial=new THREE.MeshBasicMaterial({color:'#ffd35c',toneMapped:false,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
  private core:THREE.InstancedMesh;
  private outline:THREE.InstancedMesh;
  private glow:THREE.InstancedMesh;
  private glint:THREE.InstancedMesh;
  private tails:THREE.InstancedMesh;
  private pose=new THREE.Object3D();
  private up=new THREE.Vector3();
  private right=new THREE.Vector3();
  private reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  constructor(capacity:number){
    this.core=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,1),this.coreMaterial,capacity);
    this.outline=new THREE.InstancedMesh(new THREE.RingGeometry(.87,1.18,20),new THREE.MeshBasicMaterial({color:'#20182e',side:THREE.DoubleSide,toneMapped:false,depthTest:false,depthWrite:false}),capacity);
    this.glow=new THREE.InstancedMesh(new THREE.RingGeometry(.8,1.1,24),this.glowMaterial,capacity);
    this.glint=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:'#fff9e9',toneMapped:false,depthTest:false,depthWrite:false}),capacity);
    this.tails=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),this.tailMaterial,capacity*2);
    for(const [mesh,order] of [[this.tails,4],[this.glow,5],[this.outline,6],[this.core,8],[this.glint,9]] as const){
      mesh.count=0;mesh.renderOrder=order;mesh.frustumCulled=false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);
    }
  }
  setColor(color:string){
    this.coreMaterial.color.set(color);this.glowMaterial.color.set(color);
    this.tailMaterial.color.set(color).multiplyScalar(.8);
  }
  render(shots:readonly AltarTrialProjectile[],alpha:number,billboard:THREE.Quaternion,detail:number){
    for(const mesh of [this.core,this.outline,this.glow,this.glint,this.tails])mesh.count=0;
    this.up.set(0,1,0).applyQuaternion(billboard);this.right.set(1,0,0).applyQuaternion(billboard);
    const tailCount=detail>2&&!this.reducedMotion.matches?2:0;
    for(const shot of shots){
      if(!shot.active)continue;
      const x=THREE.MathUtils.lerp(shot.previousX,shot.x,alpha),z=THREE.MathUtils.lerp(shot.previousZ,shot.z,alpha);
      this.pose.position.set(x,.7,z);this.pose.quaternion.copy(billboard);
      this.pose.scale.setScalar(.4);this.pose.updateMatrix();this.glow.setMatrixAt(this.glow.count++,this.pose.matrix);
      this.pose.scale.setScalar(.29);this.pose.updateMatrix();this.outline.setMatrixAt(this.outline.count++,this.pose.matrix);
      // A solid, nearly spherical crystal does not flatten under the 45-degree camera.
      this.pose.rotation.set(.35,this.reducedMotion.matches ? .4 : shot.age*.65,.6);
      this.pose.scale.setScalar(.27);this.pose.updateMatrix();this.core.setMatrixAt(this.core.count++,this.pose.matrix);
      this.pose.position.addScaledVector(this.up,.075).addScaledVector(this.right,-.065);
      this.pose.scale.setScalar(.065);this.pose.updateMatrix();this.glint.setMatrixAt(this.glint.count++,this.pose.matrix);
      const speed=Math.max(.01,Math.hypot(shot.vx,shot.vz));
      for(let i=1;i<=tailCount;i++){
        const distance=Math.min(shot.age*speed,i*.23);
        this.pose.position.set(x-shot.vx/speed*distance,.7,z-shot.vz/speed*distance);
        this.pose.scale.setScalar(i===1?.11:.065);this.pose.updateMatrix();this.tails.setMatrixAt(this.tails.count++,this.pose.matrix);
      }
    }
    for(const mesh of [this.core,this.outline,this.glow,this.glint,this.tails])mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){
    for(const mesh of [this.core,this.outline,this.glow,this.glint,this.tails]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
    this.group.clear();this.group.removeFromParent();
  }
}
