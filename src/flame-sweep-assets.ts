import * as THREE from 'three';
import type { Combat } from './combat';
import { sampleSweepVisual, type SweepVisualPresetId } from './flame-sweep-visual';

const FIRE_URL = '/assets/pixel/skills/yanrong/fire-effects-sheet.normalized.png';
const PARTICLE_URL = '/assets/particles/kenney-feedback.png';

/** Atlas layers share frame/alpha data without creating per-spark meshes. */
class FlameAtlasBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private frames: THREE.InstancedBufferAttribute;
  private alpha: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private spin = new THREE.Quaternion();
  private axis = new THREE.Vector3(0,0,1);
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  private texture: THREE.Texture;
  private disposed = false;
  loaded = false;
  failed = false;
  constructor(readonly url: string, readonly capacity: number, columns: number, rows: number) {
    const geometry = new THREE.PlaneGeometry(1,1);
    this.frames = new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
    this.frames.setUsage(THREE.DynamicDrawUsage); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('flameFrame',this.frames); geometry.setAttribute('flameAlpha',this.alpha);
    const material = new THREE.MeshBasicMaterial({ transparent:true, depthWrite:false, depthTest:true,
      toneMapped:false, alphaTest:2/255, side:THREE.DoubleSide });
    material.forceSinglePass = true;
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float flameFrame; attribute float flameAlpha; varying float flameOpacity;\n'+shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        flameOpacity = flameAlpha;
        #ifdef USE_MAP
          vMapUv = (vMapUv+vec2(mod(flameFrame,${columns}.0),${rows-1}.0-floor(flameFrame/${columns}.0)))/vec2(${columns}.0,${rows}.0);
        #endif`);
      shader.fragmentShader = 'varying float flameOpacity;\n'+shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.a *= flameOpacity;');
    };
    material.customProgramCacheKey = () => `flame-sweep-assets-${columns}-${rows}`;
    this.mesh = new THREE.InstancedMesh(geometry,material,capacity);
    this.mesh.name = columns===rows ? 'SweepFireAtlas' : 'SweepSmallSparks';
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0,this.color.set('#ffffff')); this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.texture = new THREE.TextureLoader().load(url, texture => {
      if(this.disposed){texture.dispose();return;}
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture; material.needsUpdate = true; this.loaded = true;
    },undefined,()=>{if(!this.disposed)this.failed=true;});
  }
  begin(){this.mesh.count=0;this.mesh.visible=false;}
  put(frame:number,x:number,y:number,z:number,width:number,height:number,alpha:number,color:string,
    orientation:THREE.Quaternion,rotation=0,ground=false){
    if(!this.loaded||this.disposed||alpha<=.005||this.mesh.count>=this.capacity)return;
    const index=this.mesh.count++;
    this.pose.position.set(x,y,z);this.pose.scale.set(width,height,1);
    this.pose.quaternion.copy(ground?this.ground:orientation).multiply(this.spin.setFromAxisAngle(this.axis,rotation));
    this.pose.updateMatrix();this.mesh.setMatrixAt(index,this.pose.matrix);this.mesh.setColorAt(index,this.color.set(color));
    this.frames.setX(index,frame);this.alpha.setX(index,alpha);
  }
  finish(){
    this.mesh.visible=this.mesh.count>0;
    if(!this.mesh.count)return;
    this.mesh.instanceMatrix.needsUpdate=true;this.mesh.instanceColor!.needsUpdate=true;
    this.frames.needsUpdate=this.alpha.needsUpdate=true;
  }
  inspect(){return {loaded:this.loaded,failed:this.failed,count:this.mesh.count,capacity:this.capacity,url:this.url,
    frames:Array.from(this.frames.array.slice(0,this.mesh.count)),alpha:Array.from(this.alpha.array.slice(0,this.mesh.count))};}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.begin();this.loaded=false;
    this.texture.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.dispose();this.mesh.removeFromParent();
  }
}

/** Art follows existing attack ages and hit ledgers; it creates no combat events. */
export class FlameSweepAssets {
  readonly group = new THREE.Group();
  private fire = new FlameAtlasBatch(FIRE_URL,8,4,4);
  private particles = new FlameAtlasBatch(PARTICLE_URL,12,4,2);
  private orientation = new THREE.Quaternion();
  private sample = {visible:false,frame:0,opacity:0,progress:0};
  private disposed = false;
  private sweepSparks = 0;
  private embers = 0;
  private impacts = 0;
  constructor(){this.group.add(this.fire.mesh,this.particles.mesh);}
  setView(camera:THREE.Camera){this.orientation.copy(camera.quaternion);}
  render(combat:Combat,preset:SweepVisualPresetId){
    this.clear();if(this.disposed)return;
    const sweep=combat.melee;
    if(sweep.active){
      const sample=sampleSweepVisual(sweep.age,preset,this.sample);
      if(sample.visible){
        const count=Math.min(5,Math.ceil(sweep.angle*180/Math.PI/60));
        const facing=Math.atan2(sweep.aimZ,sweep.aimX);
        const x=sweep.x,z=sweep.z;
        const spread=.76+.20*Math.min(1,sample.progress*3);
        for(let i=0;i<count;i++){
          const a=facing-sweep.angle/2+sweep.angle*(i+.5+.18*Math.sin(i*2.4))/count;
          const drift=sample.progress*.22,size=.10+.04*Math.sin(i*2.4)**2;
          this.particles.put(1,x+Math.cos(a)*(sweep.radius*spread+drift),.25+sample.progress*.35,
            z+Math.sin(a)*(sweep.radius*spread+drift),size,size,sample.opacity*.5,'#ffbf6c',this.orientation,a);
          if(this.particles.loaded){this.sweepSparks++;this.embers++;}
        }
        this.hitFlashes(combat,sweep.hitIds,sweep.age);
      }
    }
    this.fire.finish();this.particles.finish();
  }
  private hitFlashes(combat:Combat,ids:Int32Array,age:number){
    if(age>.17)return;
    for(let i=0;i<ids.length&&this.impacts<6;i++){
      const enemy=combat.enemies[i];
      if(!ids[i]||enemy.id!==ids[i])continue;
      const t=age/.17;
      this.fire.put(t<.2?8:t<.6?9:10,enemy.x,.65,enemy.z,.7+t*.35,.7+t*.35,(1-t)*.8,'#ffe5b0',this.orientation);
      if(this.fire.loaded)this.impacts++;
    }
  }
  clear(){
    this.fire.begin();this.particles.begin();
    this.sweepSparks=this.embers=this.impacts=0;
  }
  inspect(){return {fire:this.fire.inspect(),particles:this.particles.inspect(),
    sweepSparks:this.sweepSparks,embers:this.embers,impacts:this.impacts};}
  dispose(){if(this.disposed)return;this.disposed=true;this.clear();this.fire.dispose();this.particles.dispose();this.group.removeFromParent();}
}
