import * as THREE from 'three';
import { guideBelowRunStatus } from './hud-notice-position';

/** A single projected discovery marker shared by optional world events. */
export class WorldEventGuide {
  readonly root=document.createElement('div');
  private arrow=document.createElement('span');
  private label=document.createElement('span');
  private projected=new THREE.Vector3();
  constructor(private options:{title:string;nearText:string;offsetZ?:number;theme?:string}){
    this.root.className=`altar-guide ${options.theme??''}`;this.root.hidden=true;
    this.arrow.className='altar-guide-arrow';this.arrow.textContent='➜';
    this.arrow.setAttribute('aria-hidden','true');
    this.root.append(this.arrow,this.label);document.getElementById('hud')!.append(this.root);
  }
  render(visible:boolean,target:{x:number;z:number},player:{x:number;z:number},camera:THREE.Camera){
    this.root.hidden=!visible;if(!visible)return;
    const z=target.z+(this.options.offsetZ??0);
    this.projected.set(target.x,.4,z).project(camera);
    const {x,y}=this.projected;
    const edge=Math.abs(x)>.74||Math.abs(y)>.48;
    const scale=edge?1/Math.max(Math.abs(x)/.74,Math.abs(y)/.48):1;
    const px=x*scale,py=px<-.35?THREE.MathUtils.clamp(y*scale,-.03,.12):y*scale;
    const inset=Math.min(130,innerWidth/2);
    const distance=Math.round(Math.hypot(target.x-player.x,z-player.z));
    const text=`${this.options.title} · ${distance>4?distance+'米':this.options.nearText}`;
    if(this.label.textContent!==text)this.label.textContent=text;
    const screenX=THREE.MathUtils.clamp((px+1)*innerWidth/2,inset,innerWidth-inset);
    this.root.style.left=`${screenX}px`;
    this.arrow.hidden=!edge;
    this.arrow.style.transform=`rotate(${-Math.atan2(y*innerHeight,x*innerWidth)}rad)`;
    const bounds=this.root.getBoundingClientRect();
    this.root.style.top=`${guideBelowRunStatus(screenX,(1-py)*innerHeight/2,bounds.width,bounds.height)}px`;
  }
  hide(){this.root.hidden=true;}
  dispose(){this.root.remove();}
}
