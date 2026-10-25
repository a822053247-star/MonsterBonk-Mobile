import * as THREE from 'three';
import {ENEMY_TYPES, type Combat, type EnemyKind} from './combat';
import {EnemyCapture, SEAL_SECONDS, SEAL_WINDOW, SEAL_EXCELLENT_WINDOW, SEAL_RESULT_SECONDS, SEAL_RETRY_SECONDS, sealGrade, sealChance} from './enemy-capture';
import {ENEMY_PIXEL_HEIGHTS} from './enemy-pixel-view';
import './capture.css';
import {CAPTURE_READY_SCALE} from './capture-visuals';
import {positionHudNotice} from './hud-notice-position';

export class CaptureHUD {
  readonly root=document.createElement('div');
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
  private notice=document.createElement('div');
  private noticeTime=0;
  private marks=Array.from({length:72},()=>document.createElement('button'));
  private point=new THREE.Vector3();
  constructor(onStart:()=>void,onSeal:()=>void) {
    this.root.className='capture-hud';this.root.hidden=true;
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
    this.notice.className='capture-success-notice';this.notice.hidden=true;
    this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');this.notice.setAttribute('aria-atomic','true');
    this.root.append(this.minigame,this.orb,this.notice);
    for(const mark of this.marks){
      mark.type='button';mark.className='capture-marker';mark.textContent='按E 捕捉';
      mark.hidden=true;mark.onclick=e=>{e.stopPropagation();onStart();};
      this.root.append(mark);
    }
    document.body.append(this.root);
  }
  showSuccess(kind:EnemyKind,saved:boolean) {
    this.noticeTime=3.6;
    this.notice.innerHTML=`<span class="capture-success-emblem" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20"/><path d="m24 8 4.5 11.5L40 24l-11.5 4.5L24 40l-4.5-11.5L8 24l11.5-4.5Z"/><path d="m18 24 4 4 8-9"/></svg></span><span class="capture-success-copy"><small>封印成功</small><strong>已捕捉到幻兽囚坊</strong><span class="capture-success-detail"></span></span>`;
    this.notice.querySelector('.capture-success-detail')!.textContent=`${ENEMY_TYPES[kind].name} · ${saved?'可在囚坊安排劳作':'存档失败，请勿关闭页面'}`;
    this.notice.hidden=false;this.updateNotice();
  }
  step(dt:number) {
    this.noticeTime=Math.max(0,this.noticeTime-dt);
    this.updateNotice();
  }
  clearNotice(){this.noticeTime=0;this.notice.hidden=true;this.notice.replaceChildren();}
  private updateNotice() {
    this.notice.hidden=this.noticeTime<=0;
    const elapsed=3.6-this.noticeTime;
    this.notice.style.setProperty('--notice-visibility',String(Math.max(0,Math.min(1,elapsed/.18,this.noticeTime/.4))));
    if(!this.notice.hidden)positionHudNotice(this.notice,'.altar-trial:not([hidden])');
  }
  render(c:EnemyCapture|undefined,combat:Combat,player:{x:number;z:number},camera:THREE.Camera,playing:boolean) {
    this.root.hidden=!c || !playing;if(!c||!playing)return;
    if(this.noticeTime>0)positionHudNotice(this.notice,'.altar-trial:not([hidden])');
    const p=c.pending,target=c.nearest(combat,player);
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
      this.outcome.textContent=p.retrying ? '准备重试' : p.success ? '捕捉成功 · 即将送入幻兽囚坊' : grade==='miss' ? '重试已用完 · 目标消失' : '封印未成 · 目标消失';
      if(p.success===true){const t=Math.min(1,p.resultTime/SEAL_RESULT_SECONDS);this.orb.style.left=`${50+42*t}%`;this.orb.style.top=`${60-50*t}%`;this.orb.style.transform=`scale(${1-t*.7})`;}
    }
    let i=0;
    for(const e of combat.enemies){
      if(i>=this.marks.length)break;
      if(p || !c.eligible(combat,e))continue;
      this.point.set(e.x,ENEMY_PIXEL_HEIGHTS[e.kind]*CAPTURE_READY_SCALE+.4,e.z).project(camera);
      if(this.point.z<-1||this.point.z>1||Math.abs(this.point.x)>1||Math.abs(this.point.y)>1)continue;
      const mark=this.marks[i++];mark.hidden=false;mark.disabled=e!==target || c.cooldown>0;
      mark.setAttribute('aria-label',`${ENEMY_TYPES[e.kind].name}，${e===target?'按 E 或点击捕捉':'靠近后捕捉'}`);
      mark.classList.toggle('in-range',e===target);mark.style.left=`${(this.point.x+1)*50}%`;mark.style.top=`${(1-this.point.y)*50}%`;
    }
    for(;i<this.marks.length;i++)this.marks[i].hidden=true;
  }
  dispose(){this.root.remove();}
}
