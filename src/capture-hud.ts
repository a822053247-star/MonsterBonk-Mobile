import * as THREE from 'three';
import {ENEMY_TYPES, type Combat} from './combat';
import {EnemyCapture, SEAL_SECONDS, SEAL_WINDOW, SEAL_EXCELLENT_WINDOW, SEAL_RESULT_SECONDS, SEAL_RETRY_SECONDS, sealGrade, sealChance} from './enemy-capture';
import {ENEMY_PIXEL_HEIGHTS} from './enemy-pixel-view';
import './capture.css';

export class CaptureHUD {
  readonly root=document.createElement('div');
  private start=document.createElement('button');
  private minigame=document.createElement('div');
  private seal:HTMLButtonElement;
  private circle:SVGCircleElement;
  private title:HTMLElement;
  private rates:HTMLElement;
  private beat:HTMLElement;
  private judgment:HTMLElement;
  private outcome:HTMLElement;
  private retries:HTMLElement;
  private countdown:HTMLElement;
  private orb=document.createElement('div');
  private marks=Array.from({length:72},()=>document.createElement('span'));
  private point=new THREE.Vector3();
  constructor(onStart:()=>void,onSeal:()=>void) {
    this.root.className='capture-hud';this.root.hidden=true;
    this.start.className='capture-start';this.start.textContent='[E] 捕捉';this.start.onclick=onStart;
    this.minigame.className='capture-minigame';this.minigame.hidden=true;
    this.minigame.innerHTML=`<section class="seal-panel" aria-label="星印封印小游戏">
      <div class="seal-stage">
        <div class="seal-orbit" aria-hidden="true"></div>
        <button class="capture-seal" aria-label="点击完成封印">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="73" class="seal-guide"/>
            <circle cx="80" cy="80" r="24.4" class="seal-target"/>
            <circle cx="80" cy="80" r="24.4" class="seal-excellent-target"/>
            <circle cx="80" cy="80" r="68" class="seal-moving"/>
          </svg>
          <span class="seal-tap-label">点击<br>封印</span>
          <span class="seal-countdown" role="status" aria-live="polite" aria-atomic="true" hidden></span>
        </button>
        <div class="seal-impact" aria-hidden="true"><i></i><i></i></div>
        <div class="seal-sparks" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--angle:${i*30}deg"></i>`).join('')}</div>
      </div>
      <div class="seal-info">
        <div class="seal-eyebrow">星印封印</div>
        <h2 class="seal-title"></h2>
        <p class="seal-instruction">等待光环收缩<br>重合时点击圆盘</p>
        <div class="seal-rates"></div>
        <div class="seal-retries"></div>
        <div class="seal-beat" role="status" aria-live="polite"></div>
        <div class="seal-judgment" role="status" aria-live="polite"></div>
        <div class="seal-outcome"></div>
      </div>
    </section>`;
    this.seal=this.minigame.querySelector('.capture-seal')!;
    this.circle=this.seal.querySelector('.seal-moving')!;
    const goodRadius=72-68*(SEAL_WINDOW[0]+SEAL_WINDOW[1])/2;
    const excellentRadius=72-68*(SEAL_EXCELLENT_WINDOW[0]+SEAL_EXCELLENT_WINDOW[1])/2;
    this.seal.querySelector('.seal-target')!.setAttribute('r',String(goodRadius));
    this.seal.querySelector('.seal-target')!.setAttribute('stroke-width',String(68*(SEAL_WINDOW[1]-SEAL_WINDOW[0])));
    this.seal.querySelector('.seal-excellent-target')!.setAttribute('r',String(excellentRadius));
    this.seal.querySelector('.seal-excellent-target')!.setAttribute('stroke-width',String(68*(SEAL_EXCELLENT_WINDOW[1]-SEAL_EXCELLENT_WINDOW[0])));
    this.title=this.minigame.querySelector('.seal-title')!;
    this.rates=this.minigame.querySelector('.seal-rates')!;
    this.beat=this.minigame.querySelector('.seal-beat')!;
    this.judgment=this.minigame.querySelector('.seal-judgment')!;
    this.outcome=this.minigame.querySelector('.seal-outcome')!;
    this.retries=this.minigame.querySelector('.seal-retries')!;
    this.countdown=this.minigame.querySelector('.seal-countdown')!;
    // Judge on contact rather than finger release; keyboard activation still uses click.
    this.seal.onpointerdown=e=>{e.preventDefault();e.stopPropagation();if(!this.seal.disabled)onSeal();};
    this.seal.onclick=e=>{if(e.detail===0)onSeal();};
    this.orb.className='capture-orb';
    this.root.append(this.start,this.minigame,this.orb);
    for(const mark of this.marks){mark.className='capture-marker';mark.textContent='按E 捕捉';mark.setAttribute('aria-hidden','true');this.root.append(mark);}
    document.body.append(this.root);
  }
  render(c:EnemyCapture|undefined,combat:Combat,player:{x:number;z:number},camera:THREE.Camera,playing:boolean) {
    this.root.hidden=!c || !playing;if(!c||!playing)return;
    const p=c.pending,target=c.nearest(combat,player);
    this.start.textContent=target ? `[E] 捕捉${ENEMY_TYPES[target.kind].name}` : '[E] 捕捉';
    this.start.hidden=!!p || !target;this.start.disabled=c.cooldown>0;
    this.minigame.hidden=!p;this.orb.hidden=!p || p.success!==true;
    if(p){
      const progress=Math.min(1,p.time/SEAL_SECONDS),settled=p.success!==null;
      const grade=settled ? p.grade??'miss' : sealGrade(progress);
      this.minigame.dataset.grade=grade;
      this.minigame.dataset.result=settled ? (p.success ? 'success' : 'failure') : 'waiting';
      this.minigame.style.setProperty('--burst',String(Math.min(1,p.resultTime/(p.retrying ? SEAL_RETRY_SECONDS : SEAL_RESULT_SECONDS))));
      this.minigame.style.setProperty('--orbit-turn',`${(p.time+p.resultTime)*24}deg`);
      this.circle.setAttribute('r',String(68*(1-progress)+4));
      this.seal.disabled=settled;
      this.countdown.hidden=!p.retrying;
      const countdown=p.retrying ? String(Math.max(1,Math.ceil(SEAL_RETRY_SECONDS-p.resultTime))) : '';
      if(this.countdown.textContent!==countdown)this.countdown.textContent=countdown;
      if(this.title.textContent!==ENEMY_TYPES[p.enemy.kind].name){
        this.title.textContent=ENEMY_TYPES[p.enemy.kind].name;
        const good=Math.round(sealChance(p.enemy.kind,'good')*100),excellent=Math.round(sealChance(p.enemy.kind,'excellent')*100);
        this.rates.innerHTML=`<span class="seal-rate-good"><b>合格</b> ${good}%</span><span class="seal-rate-excellent"><b>优秀</b> ${excellent}%<small>成功率 +20 个百分点</small></span>`;
      }
      this.beat.hidden=settled;
      this.retries.textContent=`不合格可重试 · 剩余 ${p.retriesLeft} 次`;
      this.beat.textContent=grade==='excellent' ? '优秀窗口 · 点击！' : grade==='good' ? '合格窗口 · 点击！' : progress<SEAL_WINDOW[0] ? '等待光环重合…' : '已错过判定窗口';
      this.judgment.hidden=!settled;this.outcome.hidden=!settled;
      this.judgment.textContent=grade==='excellent' ? '优秀' : grade==='good' ? '合格' : '未命中';
      this.outcome.textContent=p.retrying ? '准备重试' : p.success ? '捕捉成功 · 已送入囚坊' : grade==='miss' ? '重试已用完 · 目标消失' : '封印未成 · 目标消失';
      if(p.success===true){const t=Math.min(1,p.resultTime/SEAL_RESULT_SECONDS);this.orb.style.left=`${50+42*t}%`;this.orb.style.top=`${60-50*t}%`;this.orb.style.transform=`scale(${1-t*.7})`;}
    }
    let i=0;
    for(const e of combat.enemies){
      if(i>=this.marks.length)break;
      if(p || !c.eligible(combat,e))continue;
      this.point.set(e.x,ENEMY_PIXEL_HEIGHTS[e.kind]+.4,e.z).project(camera);
      if(this.point.z<-1||this.point.z>1||Math.abs(this.point.x)>1||Math.abs(this.point.y)>1)continue;
      const mark=this.marks[i++];mark.hidden=false;mark.classList.toggle('in-range',e===target);mark.style.left=`${(this.point.x+1)*50}%`;mark.style.top=`${(1-this.point.y)*50}%`;
    }
    for(;i<this.marks.length;i++)this.marks[i].hidden=true;
  }
  dispose(){this.root.remove();}
}
