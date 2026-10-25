import * as THREE from 'three';

/** One projected event guide, without adding a creature or affecting combat. */
export class AltarGuide {
  readonly root=document.createElement('div');
  private arrow=document.createElement('span');
  private label=document.createElement('span');
  private projected=new THREE.Vector3();
  constructor(){
    this.root.className='altar-guide';this.root.hidden=true;
    this.arrow.className='altar-guide-arrow';this.arrow.textContent='➜';
    this.arrow.setAttribute('aria-hidden','true');
    this.root.append(this.arrow,this.label);document.getElementById('hud')!.append(this.root);
  }
  render(visible:boolean,target:{x:number;z:number},player:{x:number;z:number},camera:THREE.Camera){
    this.root.hidden=!visible;if(!visible)return;
    // Lead to the stairs on the south side, rather than into the platform wall.
    const z=target.z+5;
    this.projected.set(target.x,.4,z).project(camera);
    const {x,y}=this.projected;
    const edge=Math.abs(x)>.74||Math.abs(y)>.48;
    const scale=edge?1/Math.max(Math.abs(x)/.74,Math.abs(y)/.48):1;
    const px=x*scale,py=px<-.35?THREE.MathUtils.clamp(y*scale,-.03,.12):y*scale;
    const inset=Math.min(130,innerWidth/2);
    this.root.style.left=`${THREE.MathUtils.clamp((px+1)*innerWidth/2,inset,innerWidth-inset)}px`;
    this.root.style.top=`${(1-py)*50}%`;
    this.arrow.hidden=!edge;
    this.arrow.style.transform=`rotate(${-Math.atan2(y*innerHeight,x*innerWidth)}rad)`;
    const distance=Math.round(Math.hypot(target.x-player.x,z-player.z));
    this.label.textContent=distance>4?`元素祭坛 · ${distance}米`:'元素祭坛 · 沿台阶登台';
  }
  hide(){this.root.hidden=true;}
  dispose(){this.root.remove();}
}
