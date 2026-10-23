import * as THREE from 'three';
import {type Combat} from './combat';
import {EnemyCapture, SEAL_SECONDS, SEAL_WINDOW} from './enemy-capture';
import {ENEMY_PIXEL_HEIGHTS} from './enemy-pixel-view';
import './capture.css';
export class CaptureHUD {
  readonly root=document.createElement('div');
  private status=document.createElement('div');
  private start=document.createElement('button');
  private seal=document.createElement('button');
  private circle:SVGCircleElement;
  private orb=document.createElement('div');
  private marks=Array.from({length:72},()=>document.createElement('span'));
  private point=new THREE.Vector3();
  constructor(onStart:()=>void,onSeal:()=>void) {
    this.root.className='capture-hud';this.root.hidden=true;
    this.status.className='capture-status';this.status.setAttribute('role','status');
    this.start.className='capture-start';this.start.textContent='[E] 捕捉';this.start.onclick=onStart;
    this.seal.className='capture-seal';this.seal.setAttribute('aria-label','点击完成封印');
    this.seal.innerHTML='<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="25" class="seal-target"/><circle cx="80" cy="80" r="68" class="seal-moving"/></svg><span>点击封印</span>';
    this.seal.onclick=onSeal;this.circle=this.seal.querySelector('.seal-moving')!;
    this.orb.className='capture-orb';
    this.root.append(this.status,this.start,this.seal,this.orb);
    for(const mark of this.marks){mark.className='capture-marker';mark.textContent='◇';mark.setAttribute('aria-hidden','true');this.root.append(mark);}
    document.body.append(this.root);
  }
  render(c:EnemyCapture|undefined,combat:Combat,player:{x:number;z:number},camera:THREE.Camera,playing:boolean) {
    this.root.hidden=!c || !playing; if(!c||!playing)return;
    this.status.textContent=`封印符 ${c.chances} / 本局最多3次 · 已捕获 ${Object.values(c.caught).reduce((a,b)=>a+b,0)} · ${c.message}`;
    const p=c.pending;
    this.start.hidden=!!p || !c.nearest(combat,player) || c.chances<=0;
    this.start.disabled=c.cooldown>0;
    this.seal.hidden=!p || p.success!==null;
    this.orb.hidden=!p || p.success!==true;
    if(p){
      const progress=Math.min(1,p.time/SEAL_SECONDS);
      this.circle.setAttribute('r',String(68*(1-progress)+4));
      this.seal.classList.toggle('in-window',progress>=SEAL_WINDOW[0] && progress<=SEAL_WINDOW[1]);
      if(p.success===true){const t=Math.min(1,p.resultTime/.7);this.orb.style.left=`${50+42*t}%`;this.orb.style.top=`${60-50*t}%`;this.orb.style.transform=`scale(${1-t*.7})`;}
    }
    let i=0;
    for(const e of combat.enemies){
      if(i>=this.marks.length)break;
      if(!c.eligible(combat,e))continue;
      this.point.set(e.x,ENEMY_PIXEL_HEIGHTS[e.kind]+.4,e.z).project(camera);
      if(this.point.z<-1||this.point.z>1||Math.abs(this.point.x)>1||Math.abs(this.point.y)>1)continue;
      const mark=this.marks[i++];mark.hidden=false;mark.style.left=`${(this.point.x+1)*50}%`;mark.style.top=`${(1-this.point.y)*50}%`;
    }
    for(;i<this.marks.length;i++)this.marks[i].hidden=true;
  }
  dispose(){this.root.remove();}
}
