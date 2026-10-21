import * as THREE from 'three';
import type { SporeExplosion } from './special-enemies';
import { SPORE_BOMBER } from './special-enemies';
import { FlameAtlasBatch } from './flame-sweep-assets';

const FIRE_URL = `${import.meta.env.BASE_URL}assets/pixel/skills/yanrong/fire-effects-sheet.normalized.png`;
const SMOKE_URL = `${import.meta.env.BASE_URL}assets/kenney_particle-pack/PNG%20(Transparent)/smoke_08.png`;
const WARNING_URL = `${import.meta.env.BASE_URL}assets/kenney_particle-pack/PNG%20(Transparent)/magic_02.png`;

/** Reuses authored fire frames and smoke. Never advances a clock or deals damage. */
export class SporeExplosionView {
  readonly group = new THREE.Group();
  private fire = new FlameAtlasBatch(FIRE_URL,SPORE_BOMBER.capacity*8,4,4);
  private smoke = new FlameAtlasBatch(SMOKE_URL,SPORE_BOMBER.capacity*3,1,1);
  private orientation = new THREE.Quaternion();
  private up = new THREE.Vector3(0,1,0);
  private anchor = new THREE.Vector3();
  private rings: THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>[] = [];
  private geometry = new THREE.PlaneGeometry(1,1);
  private warningTexture: THREE.Texture;
  private warningLoaded = false;
  private warningFailed = false;
  private warnings = 0;
  private bursts = 0;
  private disposed = false;

  constructor() {
    this.group.name = 'SporeAtlasExplosions';
    this.fire.mesh.name = 'SporeFireBurstAtlas'; this.smoke.mesh.name = 'SporeSmokeAtlas';
    // A different silhouette and palette distinguish enemy danger from a sweep.
    this.warningTexture = new THREE.TextureLoader().load(WARNING_URL,texture=>{
      if(this.disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
      texture.minFilter=texture.magFilter=THREE.LinearFilter;this.warningLoaded=true;
    },undefined,()=>{if(!this.disposed)this.warningFailed=true;});
    for(let i=0;i<SPORE_BOMBER.capacity;i++) {
      const material = new THREE.MeshBasicMaterial({map:this.warningTexture,color:'#ffb9d4',transparent:true,depthWrite:false,depthTest:true,
        alphaTest:2/255,toneMapped:false,side:THREE.DoubleSide});
      material.forceSinglePass = true;
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n diffuseColor.a = min(1.0,diffuseColor.a*3.0); diffuseColor.rgb *= 1.35;');
      };
      material.customProgramCacheKey=()=> 'spore-node-warning-v1';
      const ring = new THREE.Mesh(this.geometry,material); ring.name = 'SporeNodeWarning';
      ring.rotation.x = -Math.PI/2; ring.visible = false; ring.frustumCulled = false;
      ring.scale.setScalar(SPORE_BOMBER.radius*2.6); this.rings.push(ring); this.group.add(ring);
    }
    this.group.add(this.fire.mesh,this.smoke.mesh);
  }
  setView(camera: THREE.Camera) { this.orientation.copy(camera.quaternion); this.up.set(0,1,0).applyQuaternion(camera.quaternion); }
  render(events: readonly SporeExplosion[]) {
    this.clear(); if(this.disposed) return;
    for(let i=0;i<events.length;i++) {
      const event=events[i]; if(!event.active) continue;
      const {x,z}=event;
      if(!event.detonated) {
        this.warnings++;
        const progress=Math.min(1,event.age/SPORE_BOMBER.warning), pulse=.5+.5*Math.sin(progress*Math.PI*8);
        const ring=this.rings[i]; ring.visible=this.warningLoaded; ring.position.set(x,.085,z);
        ring.material.opacity=.65+progress*.25+pulse*.1;
        // The outline stays at the damage radius; the center alone swells.
        this.smoke.put(0,x,.32,z,.7+progress*.25,.55+progress*.2,.3+pulse*.2,'#e69bb8',this.orientation);
      } else {
        this.bursts++;
        const age=Math.max(0,event.age-SPORE_BOMBER.warning), t=Math.min(1,age/SPORE_BOMBER.burst);
        const frame=t<.16?8:t<.38?9:10, fade=Math.min(1,(1-t)*2.5);
        const size=frame===8?2.4:frame===9?4.6:6.1;
        const height=size*.74;
        this.anchor.set(x,.08,z).addScaledVector(this.up,height*.36);
        this.fire.put(frame,this.anchor.x,this.anchor.y,this.anchor.z,size,height,fade,'#ffc2a6',this.orientation);
        for(let j=0;j<6;j++) {
          const angle=j*Math.PI/3+event.sourceEnemyId*.71, distance=SPORE_BOMBER.radius*(.18+t*.8);
          const size=(.42+.16*Math.sin(j*3)**2)*(1-t);
          this.fire.put(11,x+Math.cos(angle)*distance,.2+Math.sin(t*Math.PI)*.6,z+Math.sin(angle)*distance,
            size,size,fade,'#ffb789',this.orientation,angle);
        }
        // A low, short tail lets overlapping chain nodes remain distinguishable.
        if(t>.18) for(let j=0;j<3;j++) {
          const angle=j*Math.PI*2/3+event.sourceEnemyId;
          const size=.8+t*1.1;
          this.smoke.put(0,x+Math.cos(angle)*t*.8,.2+t*.55,z+Math.sin(angle)*t*.8,
            size,size*.65,Math.sin(t*Math.PI)*.28,'#b17d70',this.orientation,angle);
        }
      }
    }
    this.fire.finish(); this.smoke.finish();
  }
  clear() { this.warnings=this.bursts=0; for(const ring of this.rings) ring.visible=false; this.fire.begin(); this.smoke.begin(); }
  inspect() { return {warnings:this.warnings,bursts:this.bursts,warningStyle:'spore-nodes',warning:{loaded:this.warningLoaded,failed:this.warningFailed,url:WARNING_URL},fire:{...this.fire.inspect(),nearest:this.fire.mesh.material.map?.magFilter===THREE.NearestFilter},smoke:this.smoke.inspect()}; }
  dispose() {
    if(this.disposed)return;
    this.clear(); this.disposed=true; this.fire.dispose(); this.smoke.dispose();
    this.warningTexture.dispose();this.warningLoaded=false;
    this.geometry.dispose(); for(const ring of this.rings)ring.material.dispose(); this.group.clear();
  }
}
