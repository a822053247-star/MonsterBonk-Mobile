import * as THREE from 'three';
import {BOSS_BARRAGE,type BossBarrage} from './boss-barrage';
const COLORS=['#ff91c1','#bfa7ff','#ffdb86','#ff7949','#ffe39a','#75e1ff','#b3a3ff','#b4f4ff','#ecfcff'];

/** Instanced cores, outlines and short tails share geometry across the entire barrage pool. */
export class BossBarrageView{
 readonly group=new THREE.Group();
 private core:THREE.InstancedMesh;
 private outline:THREE.InstancedMesh;
 private tails:THREE.InstancedMesh;
 private warning:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
 private targetMark:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
 private curtainMark:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 private gaps:THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>[];
 private pose=new THREE.Object3D();private color=new THREE.Color();
 constructor(){
  const material=()=>new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
  this.core=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1),material(),BOSS_BARRAGE.capacity);
  this.outline=new THREE.InstancedMesh(new THREE.RingGeometry(.87,1.18,16),new THREE.MeshBasicMaterial({color:'#1b102c',side:THREE.DoubleSide,toneMapped:false}),BOSS_BARRAGE.capacity);
  this.tails=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),material(),BOSS_BARRAGE.capacity*2);
  for(const mesh of [this.core,this.outline,this.tails]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);}
  this.warning=new THREE.Mesh(new THREE.RingGeometry(.96,1,96),new THREE.MeshBasicMaterial({color:'#eea3ff',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
  this.targetMark=new THREE.Mesh(new THREE.RingGeometry(1.3,1.4,48),new THREE.MeshBasicMaterial({color:'#c2a5ff',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
  this.curtainMark=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#b5f4ff',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));
  this.gaps=[BOSS_BARRAGE.flowerGap,BOSS_BARRAGE.frostGap,BOSS_BARRAGE.frostGap].map(width=>new THREE.Mesh(new THREE.CircleGeometry(1,24,-width/2,width),new THREE.MeshBasicMaterial({color:'#8df5d8',transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false})));
  this.group.add(this.warning,this.targetMark,this.curtainMark,...this.gaps);this.clear();
 }
 render(model:BossBarrage,alpha:number,detail:number,billboard:THREE.Quaternion){
  this.clear();this.group.visible=model.running;if(!model.running)return;
  this.warning.visible=model.warning;
  this.warning.material.color.set(model.pattern.startsWith('molten-')?'#ff9552':model.pattern.startsWith('crystal-')?'#8dcaff':model.pattern.startsWith('frost-')?'#d1f6ff':'#eea3ff');
  this.warning.position.set(model.x,.06,model.z);this.warning.rotation.x=-Math.PI/2;
  this.warning.scale.setScalar(2.2+Math.min(1,model.elapsed/BOSS_BARRAGE.warning)*1.4);
  this.targetMark.visible=model.warning&&model.pattern==='crystal-prism';
  this.targetMark.position.set(model.targetX,.08,model.targetZ);this.targetMark.rotation.x=-Math.PI/2;
  this.curtainMark.visible=model.warning&&model.pattern==='frost-drift';
  this.curtainMark.position.set(model.x,.08,model.z);this.curtainMark.rotation.set(-Math.PI/2,0,model.heading);this.curtainMark.scale.set(model.enraged?31.2:26.4,.35,1);
  for(let i=0;i<this.gaps.length;i++){
   const gap=this.gaps[i],flower=i===0;
   gap.visible=model.warning&&(flower?model.channelCount===1:model.channelCount===2);
   gap.position.set(model.x,.04,model.z);gap.rotation.set(-Math.PI/2,0,model.gapAngle+(i===2?Math.PI:0)-Math.PI/2);gap.scale.setScalar(17);
  }
  for(const shot of model.shots){
   if(!shot.active)continue;
   const x=THREE.MathUtils.lerp(shot.previousX,shot.x,alpha),z=THREE.MathUtils.lerp(shot.previousZ,shot.z,alpha);
   const color=COLORS[shot.tone]??COLORS[0];
   this.pose.position.set(x,.7,z);this.pose.quaternion.copy(billboard);this.pose.scale.setScalar(BOSS_BARRAGE.radius*1.18);this.pose.updateMatrix();
   this.outline.setMatrixAt(this.outline.count++,this.pose.matrix);
   this.pose.rotation.set(.35,shot.age*.7,.6);this.pose.scale.set(.19,shot.tone===5||shot.tone===6?.34:shot.tone>=7?.22:.28,.19);this.pose.updateMatrix();
   this.core.setColorAt(this.core.count,this.color.set(color));this.core.setMatrixAt(this.core.count++,this.pose.matrix);
   if(detail>1){
    const speed=Math.max(.01,Math.hypot(shot.vx,shot.vz));
    for(let i=1;i<=2;i++){
     const distance=Math.min(shot.age*speed,i*.24);
     this.pose.position.set(x-shot.vx/speed*distance,.7,z-shot.vz/speed*distance);this.pose.scale.setScalar(i===1?.09:.055);this.pose.updateMatrix();
     this.tails.setColorAt(this.tails.count,this.color.set(color).multiplyScalar(.6));this.tails.setMatrixAt(this.tails.count++,this.pose.matrix);
    }
   }
  }
  for(const mesh of [this.core,this.outline,this.tails]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 clear(){this.group.visible=false;this.core.count=this.outline.count=this.tails.count=0;this.warning.visible=this.targetMark.visible=this.curtainMark.visible=false;for(const gap of this.gaps)gap.visible=false;}
 dispose(){for(const mesh of [this.core,this.outline,this.tails,this.warning,this.targetMark,this.curtainMark,...this.gaps]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.core.dispose();this.outline.dispose();this.tails.dispose();this.group.clear();this.group.removeFromParent();}
}
