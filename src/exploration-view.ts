import * as THREE from 'three';
import { EXPLORATION_RULES, type ExplorationEvent } from './endless-exploration';

// Pixel bounds on the original 1254x1254 transparent user atlas; two-pixel padding.
const EXPLORATION_ART = {
  chest: {bounds:[24,582,540,975],width:2.6},
  workshop: {bounds:[577,300,1233,981],width:3.8},
} as const;

/** Shared, bounded scene props; visual markers carry no collision or damage. */
export class ExplorationView {
  readonly group = new THREE.Group();
  private chest = new THREE.Group();
  private workshop = new THREE.Group();
  private challengeRange = new THREE.Group();
  private markerRing: THREE.Mesh;
  private disposed = false;
  constructor() {
    const fallbackChest=new THREE.Group(),fallbackWorkshop=new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({color:0x835831,roughness:.9});
    const gold = new THREE.MeshStandardMaterial({color:0xe7c56e,roughness:.6});
    const stone = new THREE.MeshStandardMaterial({color:0x6d878a,roughness:.9});
    const box = new THREE.BoxGeometry(1,1,1);
    const part = (parent:THREE.Group, material:THREE.Material, size:number[], pos:number[]) => {
      const mesh = new THREE.Mesh(box, material); mesh.scale.set(size[0],size[1],size[2]);
      mesh.position.set(pos[0],pos[1],pos[2]); parent.add(mesh);
    };
    part(fallbackChest,wood,[1.6,.85,1.05],[0,.48,0]);
    part(fallbackChest,gold,[1.7,.16,1.12],[0,.97,0]);
    part(fallbackChest,gold,[.24,.5,1.1],[0,.65,0]);
    part(fallbackWorkshop,wood,[1.8,.7,1.1],[0,.38,0]);
    part(fallbackWorkshop,stone,[1.4,.3,.75],[0,.9,0]);
    part(fallbackWorkshop,gold,[.65,.55,.45],[.2,1.2,0]);
    this.chest.add(fallbackChest);this.workshop.add(fallbackWorkshop);
    const artMaterial=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.06,depthWrite:true,toneMapped:false});
    const makeArt=(spec:typeof EXPLORATION_ART[keyof typeof EXPLORATION_ART])=>{
      const [left,top,right,bottom]=spec.bounds;
      const geometry=new THREE.PlaneGeometry(spec.width,spec.width*(bottom-top)/(right-left));
      geometry.translate(0,spec.width*(bottom-top)/(right-left)/2,0);
      const uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setXY(i,(left+uv.getX(i)*(right-left))/1254,(1254-bottom+uv.getY(i)*(bottom-top))/1254);
      uv.needsUpdate=true;
      const mesh=new THREE.Mesh(geometry,artMaterial);mesh.rotation.x=-Math.PI/4;mesh.position.y=.035;mesh.visible=false;
      return mesh;
    };
    const chestArt=makeArt(EXPLORATION_ART.chest),workshopArt=makeArt(EXPLORATION_ART.workshop);
    chestArt.name='封印宝箱像素原图';workshopArt.name='失落工坊像素原图';
    this.chest.add(chestArt);this.workshop.add(workshopArt);
    const atlas=new THREE.TextureLoader().load(import.meta.env.BASE_URL+'assets/scenery/endless-exploration-atlas.png',texture=>{
      if(this.disposed){texture.dispose();return;}
      fallbackChest.visible=fallbackWorkshop.visible=false;chestArt.visible=workshopArt.visible=true;
    },undefined,()=>{
      if(this.disposed)return;
      fallbackChest.visible=fallbackWorkshop.visible=true;chestArt.visible=workshopArt.visible=false;
    });
    atlas.colorSpace=THREE.SRGBColorSpace;atlas.minFilter=atlas.magFilter=THREE.NearestFilter;atlas.generateMipmaps=false;
    artMaterial.map=atlas;artMaterial.needsUpdate=true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.35,1.48,32),new THREE.MeshBasicMaterial({color:0xf0d78b,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));
    this.markerRing=ring;
    ring.rotation.x=-Math.PI/2;ring.position.y=.04;
    const radius=EXPLORATION_RULES.leaveRadius;
    const fill=new THREE.Mesh(new THREE.CircleGeometry(radius,96),new THREE.MeshBasicMaterial({color:0x9bdff1,transparent:true,opacity:.035,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
    const border=new THREE.Mesh(new THREE.RingGeometry(radius-.14,radius,128),new THREE.MeshBasicMaterial({color:0x9bdff1,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
    fill.rotation.x=border.rotation.x=-Math.PI/2;fill.position.y=.025;border.position.y=.03;
    this.challengeRange.name='封印宝箱挑战范围';this.challengeRange.add(fill,border);this.challengeRange.visible=false;
    this.group.add(this.chest,this.workshop,ring,this.challengeRange);this.group.visible=false;
  }
  sync(event?: ExplorationEvent) {
    if(this.disposed)return;
    this.group.visible=!!event&&(event.state==='available'||event.state==='active');
    if (!event) return;
    this.group.position.set(event.x,0,event.z);
    this.chest.visible=event.kind==='sealed-chest';this.workshop.visible=!this.chest.visible;
    const opening=event.kind==='sealed-chest'&&event.state==='active';
    this.challengeRange.visible=opening;this.markerRing.visible=!opening;
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        materials.add(material);
        if('map' in material&&material.map instanceof THREE.Texture)textures.add(material.map);
      }
    });
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
    this.group.removeFromParent();this.group.clear();
  }
}
