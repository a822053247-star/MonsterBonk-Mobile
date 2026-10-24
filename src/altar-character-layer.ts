import * as THREE from 'three';

/** Foreground only while standing on the painted altar; restore normal world occlusion on exit. */
export class AltarCharacterLayer {
  private body?:THREE.Object3D;
  private nodes=new Map<THREE.Object3D,number>();
  private materials=new Map<THREE.Material,{transparent:boolean;depthTest:boolean;depthWrite:boolean}>();
  apply(body?:THREE.Object3D){
    if(body===this.body)return;
    this.reset();this.body=body;
    body?.traverse(object=>{
      if(!(object instanceof THREE.Mesh)&&!(object instanceof THREE.Sprite))return;
      this.nodes.set(object,object.renderOrder);object.renderOrder=4;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(this.materials.has(material))continue;
        this.materials.set(material,{transparent:material.transparent,depthTest:material.depthTest,depthWrite:material.depthWrite});
        material.transparent=true;material.depthTest=false;material.depthWrite=false;material.needsUpdate=true;
      }
    });
  }
  reset(){
    for(const [node,order] of this.nodes)node.renderOrder=order;
    for(const [material,original] of this.materials){Object.assign(material,original);material.needsUpdate=true;}
    this.nodes.clear();this.materials.clear();this.body=undefined;
  }
}
