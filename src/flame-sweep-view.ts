import * as THREE from 'three';
import { FLAME_SWEEP } from './flame-sweep';
import type { Combat } from './combat';
import { FlameSweepAssets } from './flame-sweep-assets';
import { DEFAULT_SWEEP_VISUAL, SWEEP_VISUAL_PRESETS, sampleSweepVisual, sweepVisualPreset, type SweepVisualPresetId } from './flame-sweep-visual';

/** One textured sector uses exactly the same angle and origin as its hit test. */
export class FlameSweepView {
  readonly group = new THREE.Group();
  readonly areaGroup = new THREE.Group();
  private assets = new FlameSweepAssets();
  private texture: THREE.Texture;
  private mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private glow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private disposed = false;
  private angle: number = FLAME_SWEEP.angle;
  private radius = 0;
  private frame = 12;
  private presetId: SweepVisualPresetId = DEFAULT_SWEEP_VISUAL;
  private sample = {visible:false,frame:0,opacity:0,progress:0};
  private uniforms = { sweepBrightness:{value:1}, sweepCoreGain:{value:.7} };
  loaded = false;
  failed = false;
  constructor(){
    const material = new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,depthTest:true,
      toneMapped:false,side:THREE.DoubleSide,alphaTest:2/255});
    material.forceSinglePass=true;
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.fragmentShader='uniform float sweepBrightness, sweepCoreGain;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float core = smoothstep(.36,.82,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)));
        diffuseColor.rgb *= sweepBrightness * mix(vec3(1.),sweepCoreGain*vec3(1.,.84,.45),core);
      `);
    };
    material.customProgramCacheKey=()=> 'flame-sector-wave-v1';
    this.mesh=new THREE.Mesh(this.geometry(this.angle),material);this.mesh.name='FlameSectorWave';
    this.glow=new THREE.Mesh(new THREE.RingGeometry(.12,.96,80,2,-this.angle/2,this.angle),
      new THREE.MeshBasicMaterial({color:'#ff791c',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    for(const mesh of [this.mesh,this.glow]){mesh.rotation.x=-Math.PI/2;mesh.frustumCulled=false;mesh.material.forceSinglePass=true;}
    this.mesh.position.y=.04;
    this.group.add(this.glow,this.mesh);this.areaGroup.add(this.assets.group);
    this.setPreset(sweepVisualPreset(typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('sweepVisual')));
    this.clear();
    this.texture=new THREE.TextureLoader().load(FLAME_SWEEP.url,texture=>{
      if(this.disposed){texture.dispose();return;}
      texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
      texture.colorSpace=THREE.SRGBColorSpace;texture.repeat.set(.25,.25);
      material.map=texture;material.needsUpdate=true;this.loaded=true;
    },undefined,()=>{if(!this.disposed)this.failed=true;});
  }
  private geometry(angle:number){
    const geometry=new THREE.RingGeometry(.12,1,96,4,-angle/2,angle),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setXY(i,.5+(uv.getX(i)-.5)*.96,.36+(uv.getY(i)-.5)*.66);
    return geometry;
  }
  setPreset(id:SweepVisualPresetId){
    this.presetId=id;const p=SWEEP_VISUAL_PRESETS[id];
    this.uniforms.sweepBrightness.value=p.brightness;this.uniforms.sweepCoreGain.value=p.coreGain;
  }
  setView(camera:THREE.Camera){this.assets.setView(camera);}
  render(combat:Combat,_player:{x:number;z:number}){
    this.assets.render(combat,this.presetId);
    const sweep=combat.melee,sample=sampleSweepVisual(sweep.age,this.presetId,this.sample);
    if(this.disposed||!sweep.active||!sample.visible){this.group.visible=false;return;}
    if(this.angle!==sweep.angle){
      this.angle=sweep.angle;
      this.mesh.geometry.dispose();this.mesh.geometry=this.geometry(this.angle);
      this.glow.geometry.dispose();this.glow.geometry=new THREE.RingGeometry(.12,.96,80,2,-this.angle/2,this.angle);
    }
    this.radius=sweep.radius;this.frame=FLAME_SWEEP.sourceFrames[sample.frame];
    this.texture.offset.set((this.frame%4)/4,1-(Math.floor(this.frame/4)+1)/4);
    this.group.visible=true;this.group.position.set(sweep.x,.10,sweep.z);
    this.group.rotation.y=-Math.atan2(sweep.aimZ,sweep.aimX);
    const size=sweep.radius*(.82+.18*Math.min(1,sample.progress*3));
    this.group.scale.set(size,1,size);
    this.mesh.visible=this.loaded;this.mesh.material.opacity=sample.opacity;
    this.glow.material.opacity=(this.loaded ? .07 : .22)*sample.opacity;
  }
  clear(){this.group.visible=false;this.assets.clear();}
  inspect(){return {active:this.group.visible,loaded:this.loaded,failed:this.failed,fallback:this.group.visible&&!this.loaded,
    kind:'sector-wave',frame:this.frame,frames:3,sourceFrames:FLAME_SWEEP.sourceFrames,frameSize:[128,128],
    root:this.group.position.toArray(),scale:this.group.scale.x,radius:this.radius,angle:this.angle,
    opacity:this.mesh.material.opacity,preset:this.presetId,config:SWEEP_VISUAL_PRESETS[this.presetId],url:FLAME_SWEEP.url,
    capacity:1,assets:this.assets.inspect()};}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.clear();this.texture.dispose();this.assets.dispose();
    for(const mesh of [this.mesh,this.glow]){mesh.geometry.dispose();mesh.material.dispose();}
    this.group.removeFromParent();this.areaGroup.removeFromParent();
  }
}
