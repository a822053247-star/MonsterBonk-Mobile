import * as THREE from 'three';
import {COLORED_BARRAGES,COLORED_BARRAGE_IDS,COLORED_BARRAGE_LIMITS,type ColoredBarrageId,type ColoredBarrageShot,type ColoredBarrageImpact} from './colored-barrage';
import {instanceOpacity} from './visuals/instance-opacity';

/** Star-rain-sized silhouettes, bounded luminous tails and short local hit glints. */
export class ColoredBarrageView {
  readonly group=new THREE.Group();
  private pose=new THREE.Object3D();
  private color=new THREE.Color();
  private impacts=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.75,depthWrite:false,toneMapped:false}),96);
  private impactAlpha=instanceOpacity(this.impacts,96);
  private motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion=this.motionQuery.matches;
  private motionChanged=(event:MediaQueryListEvent)=>{this.reducedMotion=event.matches;};
  private batches=new Map<ColoredBarrageId,{core:THREE.InstancedMesh;trail:THREE.InstancedMesh}>();
  constructor(){
    this.group.name='ColoredPlayerBarrages';
    this.motionQuery.addEventListener('change',this.motionChanged);
    this.impacts.count=0;this.impacts.frustumCulled=false;this.impacts.renderOrder=6;this.impacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.impacts.setColorAt(0,this.color.set('#ffffff'));this.group.add(this.impacts);
    for(const id of COLORED_BARRAGE_IDS){
      const geometry=id==='leaf-barrage'||id==='rose-barrage'?new THREE.SphereGeometry(1,6,4):new THREE.OctahedronGeometry(1);
      const core=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:new THREE.Color(COLORED_BARRAGES[id].color).lerp(new THREE.Color('#ffffff'),.22),toneMapped:false}),COLORED_BARRAGE_LIMITS.shots);
      const trail=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:COLORED_BARRAGES[id].color,transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),COLORED_BARRAGE_LIMITS.shots);
      core.name=`ColoredBarrage:${id}`;trail.name=`ColoredBarrageTail:${id}`;
      for(const mesh of [core,trail]){mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=6;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);}
      this.batches.set(id,{core,trail});
    }
  }
  render(shots:readonly ColoredBarrageShot[],alpha:number,detail:number,impacts:readonly ColoredBarrageImpact[]=[]){
    this.clear();
    // Keep every real projectile visible; crowding only removes decorative tails.
    const tails=detail>2&&!this.reducedMotion&&shots.reduce((n,s)=>n+Number(s.active),0)<=24;
    for(const shot of shots){
      if(!shot.active)continue;
      const {core,trail}=this.batches.get(shot.id)!,x=THREE.MathUtils.lerp(shot.previousX,shot.x,alpha),z=THREE.MathUtils.lerp(shot.previousZ,shot.z,alpha);
      const angle=Math.atan2(shot.vx,shot.vz),leaf=shot.id==='leaf-barrage',rose=shot.id==='rose-barrage';
      this.pose.position.set(x,.8,z);this.pose.rotation.set(0,angle,0);
      this.pose.scale.set(leaf?.22:rose?.2:.17,leaf?.09:.15,rose?.34:leaf?.5:.52);
      this.pose.updateMatrix();core.setMatrixAt(core.count++,this.pose.matrix);
      if(tails){
        this.pose.position.set(x-Math.sin(angle)*.38,.8,z-Math.cos(angle)*.38);
        this.pose.scale.set(.18,.12,.68);this.pose.updateMatrix();trail.setMatrixAt(trail.count++,this.pose.matrix);
      }
    }
    for(const impact of impacts){
      if(!impact.active)continue;
      const progress=Math.min(1,impact.age/.22),count=this.reducedMotion||detail<=2?1:3;
      for(let i=0;i<count;i++){
        const index=this.impacts.count++,angle=i*Math.PI*2/3+impact.seed;
        const spread=this.reducedMotion?0:.08+progress*.35,size=.09*(1-progress);
        this.pose.position.set(impact.x+Math.cos(angle)*spread,.7+(this.reducedMotion?0:progress*.2),impact.z+Math.sin(angle)*spread);
        this.pose.rotation.set(0,angle,0);this.pose.scale.set(size,size*1.8,size);this.pose.updateMatrix();
        this.impacts.setMatrixAt(index,this.pose.matrix);this.impacts.setColorAt(index,this.color.set(COLORED_BARRAGES[impact.id].color));this.impactAlpha.setX(index,1-progress);
      }
    }
    this.impacts.instanceMatrix.needsUpdate=true;this.impacts.instanceColor!.needsUpdate=true;this.impactAlpha.needsUpdate=true;
    for(const {core,trail} of this.batches.values()){core.instanceMatrix.needsUpdate=true;trail.instanceMatrix.needsUpdate=true;}
  }
  clear(){this.impacts.count=0;for(const {core,trail} of this.batches.values())core.count=trail.count=0;}
  inspect(){return {capacity:COLORED_BARRAGE_LIMITS.shots,hitGlints:this.impacts.count,batches:[...this.batches].map(([id,{core,trail}])=>({id,cores:core.count,trails:trail.count,color:COLORED_BARRAGES[id].color}))};}
  dispose(){
    this.motionQuery.removeEventListener('change',this.motionChanged);
    this.impacts.geometry.dispose();this.impacts.material.dispose();this.impacts.dispose();
    for(const {core,trail} of this.batches.values()){
      core.geometry.dispose();
      for(const mesh of [core,trail]){(mesh.material as THREE.Material).dispose();mesh.dispose();}
    }
    this.group.clear();this.group.removeFromParent();this.batches.clear();
  }
}
