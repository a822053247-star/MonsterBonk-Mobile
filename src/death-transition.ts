import * as THREE from 'three';

/** Presentation time only: the finished run and all combat clocks stay frozen. */
export class DeathTransition {
  private overlay=document.createElement('div');
  private elapsed=0;
  private body?:THREE.Object3D;
  private position=new THREE.Vector3();
  private scale=new THREE.Vector3();
  private rotation=new THREE.Quaternion();
  private materials=new Map<THREE.Material,{opacity:number;transparent:boolean;depthWrite:boolean;rotation?:number}>();
  private reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  get active(){return !!this.body&&this.elapsed<1.65;}
  constructor(){this.overlay.className='death-transition';this.overlay.hidden=true;this.overlay.setAttribute('aria-hidden','true');document.body.append(this.overlay);}
  begin(body:THREE.Object3D,extras:THREE.Object3D[]=[]){
    this.reset();this.body=body;this.position.copy(body.position);this.scale.copy(body.scale);this.rotation.copy(body.quaternion);
    for(const root of [body,...extras])root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)&&!(object instanceof THREE.Sprite))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(this.materials.has(material))continue;
        this.materials.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,rotation:material instanceof THREE.SpriteMaterial?material.rotation:undefined});
        material.transparent=true;material.depthWrite=false;material.needsUpdate=true;
      }
    });
    this.overlay.style.opacity='0';this.overlay.hidden=false;
  }
  step(dt:number){
    this.elapsed+=dt;
    const fall=THREE.MathUtils.smoothstep(this.elapsed,.12,.75),fade=THREE.MathUtils.smoothstep(this.elapsed,.65,1.45);
    if(this.body){
      this.body.scale.copy(this.scale).multiply(new THREE.Vector3(1+fall*.06,1-fall*(this.reducedMotion.matches ? .08 : .35),1));
      this.body.position.copy(this.position);this.body.position.y-=fall*.12;
      if(!this.reducedMotion.matches)this.body.quaternion.copy(this.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),fall*.65));
    }
    for(const [material,original] of this.materials){
      material.opacity=original.opacity*(1-fade);
      if(material instanceof THREE.SpriteMaterial&&original.rotation!==undefined&&!this.reducedMotion.matches)material.rotation=original.rotation-fall*.8;
    }
    this.overlay.style.opacity=String(THREE.MathUtils.smoothstep(this.elapsed,.15,1.5)*.8);
    return this.elapsed>=1.65;
  }
  hide(){this.overlay.hidden=true;}
  reset(){
    if(this.body){this.body.position.copy(this.position);this.body.scale.copy(this.scale);this.body.quaternion.copy(this.rotation);}
    for(const [material,original] of this.materials){material.opacity=original.opacity;material.transparent=original.transparent;material.depthWrite=original.depthWrite;if(material instanceof THREE.SpriteMaterial&&original.rotation!==undefined)material.rotation=original.rotation;material.needsUpdate=true;}
    this.materials.clear();this.body=undefined;this.elapsed=0;this.hide();
  }
  dispose(){this.reset();this.overlay.remove();}
}
