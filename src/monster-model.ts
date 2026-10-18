import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ORGAN_DEFINITIONS, type OrganId, type OrganSlot, type SocketLayout } from './creature-data';
import { OrganVisuals } from './organ-view';

const MODEL_URL = `${import.meta.env?.BASE_URL ?? './'}assets/characters/yanrong-repaired.glb`;

/** Visual-only adapter for the repaired asset. Animation never drives entity/root motion. */
export class MonsterModel {
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private content = new THREE.Group();
  private sockets = { head: new THREE.Group(), back: new THREE.Group(), tail: new THREE.Group() };
  private organs = new OrganVisuals();
  private asset?: THREE.Group;
  private mixer?: THREE.AnimationMixer;
  private walk?: THREE.AnimationAction;
  private materials: THREE.MeshStandardMaterial[] = [];
  private height = 2.85;
  private restHeight = 1;
  private center = new THREE.Vector3();
  private floor = 0;
  private blend = 0;
  private loaded = false;
  private failure = false;
  private disposed = false;

  constructor(onChange: () => void) {
    this.group.name = 'YanrongGLBView'; this.group.visible = false; this.group.add(this.content);
    for (const [slot, position] of Object.entries({head:[0,2.05,.78],back:[0,1.2,-.25],tail:[.15,.8,-1]})) {
      const socket = this.sockets[slot as OrganSlot];socket.name = `Model:${slot}Socket`;socket.position.fromArray(position);this.group.add(socket);
    }
    const canvas = document.createElement('canvas');canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!, gradient = context.createRadialGradient(32,32,2,32,32,32);
    gradient.addColorStop(0,'rgba(24,52,32,.27)');gradient.addColorStop(.5,'rgba(24,52,32,.13)');gradient.addColorStop(1,'rgba(24,52,32,0)');
    context.fillStyle=gradient;context.fillRect(0,0,64,64);
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(2,2.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,toneMapped:false}));
    this.shadow.name='ModelGroundShadow';this.shadow.rotation.x=-Math.PI/2;this.shadow.position.y=.025;this.shadow.visible=false;
    new GLTFLoader().load(MODEL_URL,gltf=>{
      if (this.disposed) { this.release(gltf.scene);return; }
      try {
        const clip=gltf.animations.find(clip=>clip.name==='WalkInPlace');
        if (!clip) throw Error('Missing repaired gait');
        this.asset=gltf.scene;this.content.add(this.asset);
        this.asset.traverse(o=>{
          if (!(o instanceof THREE.Mesh)) return;
          o.frustumCulled=false;
          for (const material of Array.isArray(o.material)?o.material:[o.material]) {
            if (material instanceof THREE.MeshStandardMaterial) {this.materials.push(material);if(material.map)material.map.anisotropy=2;}
          }
        });
        // Measure the authored bind geometry in asset-local space. Skinned world
        // bounds during async attachment can contain stale parent/bone matrices.
        this.asset.updateWorldMatrix(true,true);
        const inverse=this.asset.matrixWorld.clone().invert(),bounds=new THREE.Box3();
        this.asset.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld)))}});
        this.restHeight=bounds.max.y-bounds.min.y;bounds.getCenter(this.center);this.floor=bounds.min.y;
        if (!Number.isFinite(this.restHeight) || this.restHeight<.01) throw Error('Invalid model bounds');
        this.applySize();this.mixer=new THREE.AnimationMixer(this.asset);this.walk=this.mixer.clipAction(clip);this.walk.play();this.reset();
        this.loaded=true;onChange();
      } catch { if(this.asset){this.release(this.asset);this.asset=undefined;}this.failure=true;onChange(); }
    },undefined,()=>{if(!this.disposed){this.failure=true;onChange();}});
  }

  get ready() { return this.loaded && !this.failure; }
  get failed() { return this.failure; }

  equip(id: OrganId) {
    const visual=this.organs.create(id);if(!visual)return;
    const slot=ORGAN_DEFINITIONS[id].slot;this.unequip(slot);this.sockets[slot].add(visual);
  }
  unequip(slot: OrganSlot) { this.sockets[slot].clear(); }
  configureSockets(layout:SocketLayout) { for(const slot of ['head','back','tail'] as const){this.sockets[slot].position.set(...layout[slot].position);this.sockets[slot].scale.setScalar(layout[slot].scale)} }
  resize(viewportHeight:number,frustumHeight:number,menu:boolean) {
    this.group.rotation.y=menu?-1:0;
    const height=menu?2.65:THREE.MathUtils.clamp(62*frustumHeight/Math.max(1,viewportHeight),2.85,3.15);
    if(height!==this.height){this.height=height;this.applySize();}
  }
  private applySize() {
    const scale=this.height/this.restHeight;this.content.scale.setScalar(scale);
    this.content.position.set(-this.center.x*scale,-this.floor*scale+.008,-this.center.z*scale);
  }
  reset() {
    this.blend=0;this.walk?.setEffectiveWeight(0);this.mixer?.setTime(0);
    this.group.position.set(0,0,0);this.group.rotation.set(0,0,0);this.group.scale.set(1,1,1);
    this.materials.forEach(m=>{m.emissive.set(0);m.emissiveIntensity=0});
  }
  animate(dt:number,moving:number,dashing:boolean,time:number,hurt:number) {
    if(!this.ready)return;
    const stride=moving>.06?Math.min(1,moving):0;
    this.blend=THREE.MathUtils.damp(this.blend,dashing?1:stride,16,dt);
    this.walk!.setEffectiveWeight(this.blend);this.mixer!.update(dt*(dashing?2.6:1+stride*1.1));
    this.group.rotation.x=dashing?.04:0;this.group.position.y=dashing?.065:0;
    this.group.scale.set(dashing?1.025:1,1+Math.sin(time*2.6)*.003-(dashing?.035:0),dashing?1.07:1);
    const flash=hurt>0&&Math.floor(hurt*10)%2===0;
    this.materials.forEach(m=>{m.emissive.set(flash?'#ffd8a0':0);m.emissiveIntensity=flash?.65:0});
  }
  inspect() {return {loaded:this.loaded,failed:this.failure,height:this.height,blend:this.blend,animation:this.walk?.getClip().name,time:this.walk?.time,bones:14};}

  private release(object:THREE.Object3D) {
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
    object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);if(o instanceof THREE.SkinnedMesh)skeletons.add(o.skeleton);
      for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v)})}});
    skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)t.image.close();t.dispose()});object.removeFromParent();
  }
  dispose() {
    this.disposed=true;this.mixer?.stopAllAction();if(this.asset){this.mixer?.uncacheRoot(this.asset);this.release(this.asset);}this.organs.dispose();
    this.shadow.removeFromParent();this.release(this.shadow);this.group.removeFromParent();this.group.clear();
  }
}
