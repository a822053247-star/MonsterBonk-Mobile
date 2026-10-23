import type { GameAudio } from './audio';
import { treasurePresentation } from './treasure-presentation';
import type { Combat } from './combat';
import type { TreasureReward } from './special-enemies';
import { createTreasureCanvas } from './treasure-canvas';
import { upgradeArt } from './upgrade-art';

/** Screen-space reward presentation. Simulation stays frozen until explicit continuation. */
export class TreasureDialog {
  readonly root = document.createElement('div');
  private canvas = document.createElement('canvas');
  private button = document.createElement('button');
  private heading = document.createElement('h2');
  private current?: TreasureReward;
  private draw?: ReturnType<typeof createTreasureCanvas>;
  private age = 0;
  private rolling = false;
  private arrivalAge = 0;
  private arriving = false;
  private frame = 0;
  private lastTime = 0;
  private seen = new WeakSet<object>();
  constructor(private combat: Combat, private audio?: GameAudio, private canAnimate: () => boolean = () => true) {
    this.root.className = 'treasure-dialog'; this.root.hidden = true;
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','treasure-title');
    const panel=document.createElement('section');panel.className='treasure-dialog-panel';
    this.heading.id='treasure-title';this.heading.textContent='发现宝藏！';
    this.canvas.width=900;this.canvas.height=988;this.canvas.setAttribute('aria-hidden','true');
    this.button.className='treasure-dialog-button';this.button.textContent='开启宝箱';
    panel.append(this.heading,this.canvas,this.button);this.root.append(panel);document.body.append(this.root);
    this.root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab'){e.preventDefault();this.button.focus();}});
    this.button.onclick=()=>{
      if(!this.current||this.arriving)return;
      this.audio?.setActive(true);this.audio?.unlock();
      if(!this.rolling){this.root.classList.add('is-opening');this.rolling=true;this.age=0;this.lastTime=0;this.draw?.open();this.button.disabled=true;this.button.textContent='宝藏揭晓中…';this.frame=requestAnimationFrame(this.tick);}
      else if(this.draw?.done()){this.current.active=false;this.reset();}
    };
  }
  get active(){return !!this.current;}
  suspend(){this.root.hidden=true;this.lastTime=0;}
  sync(){
    if(this.current&&this.canAnimate())this.root.hidden=false;
    if(this.current&&!this.current.active)this.reset();
    if(!this.current&&this.combat.hp>0){
      const event=this.combat.treasureRewards.find(e=>e.active&&!this.seen.has(e.items));
      if(event){
        this.seen.add(event.items);this.current=event;this.root.hidden=false;
        this.root.classList.toggle('first-boss-chest',event.source==='first-boss');
        this.heading.textContent=event.source==='first-boss'?'首战告捷 · 金光宝箱':'发现宝藏！';
        const urls=event.items.map(i=>i.skill?upgradeArt({id:i.skill},this.combat.baseAttack,this.combat.runBuild.attacks.map(a=>a.attackId)).illustrations[0]:undefined);
        this.draw=createTreasureCanvas(this.canvas,event.items.map(i=>i.title),urls,true,(cue,index)=>this.audio?.playTreasure(cue,event.items.length,index));this.draw(0);
        this.resizeCanvas();this.draw(0);
        this.arriving=true;this.arrivalAge=0;this.lastTime=0;this.root.classList.add('is-arriving');this.root.style.setProperty('--treasure-entry','0');this.button.disabled=true;this.button.textContent='宝藏正在显现…';this.frame=requestAnimationFrame(this.tick);
      }
    }
    return this.active;
  }
  private resizeCanvas(){
    const box=this.canvas.getBoundingClientRect();
    if(box.width>0&&box.height>0){const height=Math.round(900*box.height/box.width);if(this.canvas.height!==height){this.canvas.width=900;this.canvas.height=height;this.draw?.redraw();}}
  }
  private tick=(time:number)=>{
    this.frame=0;if(!this.current)return;
    const dt=this.lastTime?Math.min(.25,(time-this.lastTime)/1000):0;this.lastTime=time;
    const animate=!document.hidden&&innerWidth>=innerHeight&&this.canAnimate();
    if(this.arriving){
      if(animate)this.arrivalAge+=dt;
      const progress=Math.min(1,this.arrivalAge/treasurePresentation(this.current.items.length).transition);
      this.root.style.setProperty('--treasure-entry',String(progress*progress*(3-2*progress)));
      if(progress>=1){this.arriving=false;this.root.classList.remove('is-arriving');this.button.disabled=false;this.button.textContent='开启宝箱';this.button.focus();}
      else this.frame=requestAnimationFrame(this.tick);
      return;
    }
    if(animate){this.age+=dt;this.resizeCanvas();this.draw?.(this.age);}
    this.root.style.setProperty('--treasure-gold', String(this.draw?.glow() ?? 0));
    if(this.draw?.done()){
      this.heading.textContent='宝藏已获得';this.button.disabled=false;this.button.textContent='继续战斗';this.button.focus();
    }else this.frame=requestAnimationFrame(this.tick);
  };
  reset(){cancelAnimationFrame(this.frame);this.frame=0;this.current=undefined;this.draw=undefined;this.rolling=false;this.arriving=false;this.arrivalAge=0;this.audio?.stopTreasure();this.age=0;this.root.hidden=true;this.root.classList.remove('is-opening','is-arriving','first-boss-chest');this.root.style.removeProperty('--treasure-entry');this.root.style.removeProperty('--treasure-gold');}
  dispose(){this.reset();this.root.remove();}
}
