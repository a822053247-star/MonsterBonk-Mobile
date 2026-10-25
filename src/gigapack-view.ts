import * as THREE from 'three';
import { FlameAtlasBatch } from './flame-sweep-assets';
import { COMBAT_LIMITS, type Combat, type CombatEffect } from './combat';
import { GIGAPACK_CLIPS, type GigapackClipId } from './visuals/gigapack-clips';
import { GIGAPACK_BINDINGS } from './visuals/gigapack-presets';

/** Lazy, bounded batches reuse the existing atlas renderer with metadata-derived UV rectangles. */
export class GigapackView{
  readonly group=new THREE.Group();
  private batches=new Map<GigapackClipId,FlameAtlasBatch>();
  private orientation=new THREE.Quaternion();
  private right=new THREE.Vector3();
  private up=new THREE.Vector3();
  setView(camera:THREE.Camera){this.orientation.copy(camera.quaternion);this.right.set(1,0,0).applyQuaternion(this.orientation);this.up.set(0,1,0).applyQuaternion(this.orientation);}
  private batch(id:GigapackClipId){
    let batch=this.batches.get(id);
    if(!batch){const clip=GIGAPACK_CLIPS[id];batch=new FlameAtlasBatch(`${import.meta.env.BASE_URL}${clip.url}`,COMBAT_LIMITS.effects,1,1,clip);batch.mesh.name=`Gigapack-${id}`;this.batches.set(id,batch);this.group.add(batch.mesh);}
    return batch;
  }
  preload(ids:readonly string[]){for(const id of ids){const clip=GIGAPACK_BINDINGS[id];if(clip)this.batch(clip);}}
  render(c:Combat,effects:readonly CombatEffect[]){
    this.clear();
    if(!c.usesRunBuild||c.hp<=0)return;
    // Warm only equipped relics so a first short-lived proc is not lost to texture loading.
    for(const relic of c.runBuild.relics){const clip=GIGAPACK_BINDINGS[relic];if(clip)this.batch(clip);if(relic==='venom-insignia')this.batch(GIGAPACK_BINDINGS['venom-mark']);}
    for(const e of effects){
      const id=e.vfxPresetId&&GIGAPACK_BINDINGS[e.vfxPresetId];if(!id||!e.active)continue;
      const clip=GIGAPACK_CLIPS[id];
      const batch=this.batch(id);
      const age=e.duration-e.time, looping=e.vfxPresetId==='venom-mark'||e.vfxPresetId==='smokescreen-feather'||e.vfxPresetId==='blazing-satellite';
      const frame=looping?Math.floor(age*clip.fps)%clip.frames.length:Math.min(clip.frames.length-1,Math.floor(age*clip.fps));
      const enemy=e.enemyId===undefined?undefined:c.enemies.find(t=>t.active&&t.id===e.enemyId);
      if(e.vfxPresetId==='venom-mark'&&(!enemy||(enemy.venomUntil??0)<=c.elapsed))continue;
      const raised=['storm-relay','levelup-salute','heart-keeper','reaper-decree'].includes(e.vfxPresetId!);
      let size=Math.max(raised?2.6:e.vfxPresetId==='warp-eye'?2.8:1.5,(e.radius??.8)*2);
      if(e.vfxPresetId==='starlit-magnet')size=Math.min(size,3.1);
      const rotation=e.vfxPresetId==='rhythm-seal'?Math.atan2(this.up.x*(e.moveX??0)+this.up.z*(e.moveZ??0),this.right.x*(e.moveX??0)+this.right.z*(e.moveZ??0)):0;
      batch.put(frame,enemy?.x??e.x,raised?1.9:1.2,enemy?.z??e.z,size,size,1,'#ffffff',this.orientation,rotation);
    }
    for(const p of c.projectiles){
      if(!p.active||p.vfxPresetId!=='prism-shower')continue;
      const id=GIGAPACK_BINDINGS['prism-shower'],clip=GIGAPACK_CLIPS[id];
      this.batch(id).put(Math.floor((p.age??0)*clip.fps)%clip.frames.length,p.x,1.2,p.z,.85,.85,1,'#ffffff',this.orientation);
    }
    for(const b of this.batches.values())b.finish();
  }
  clear(){for(const b of this.batches.values())b.begin();}
  handlesProjectile(id?:string){return id==='prism-shower'&&!!this.batches.get(GIGAPACK_BINDINGS[id])?.loaded;}
  inspect(){return [...this.batches.entries()].map(([id,b])=>({id,...b.inspect()}));}
  dispose(){for(const b of this.batches.values())b.dispose();this.batches.clear();this.group.removeFromParent();}
}
