import type { Combat } from './combat';
import { ATTACKS } from './run-build';
import type { BaseAttackId } from './fusion';
import type { SkillId } from './progression';
import { upgradeArt, bindUpgradeArt, uiArtUrl } from './upgrade-art';

const escape = (s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class WeaponExchangeDialog {
  readonly root = document.createElement('section');
  private combat?: Combat;
  private from?: BaseAttackId;
  private to?: BaseAttackId;
  private price = 0;
  private coins = 0;
  private confirm?: (from:BaseAttackId,to:BaseAttackId)=>boolean;
  private revision = '';
  constructor(private close:()=>void) {
    this.root.className='modal-screen weapon-exchange-screen';this.root.hidden=true;
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','武器置换');
    document.body.append(this.root);
    this.root.onclick=e=>{
      const button=e.target instanceof Element?e.target.closest<HTMLButtonElement>('button'):null;
      if(!button||button.disabled)return;
      if(button.dataset.exchangeFrom){this.from=button.dataset.exchangeFrom as BaseAttackId;this.to=undefined;this.render();}
      else if(button.dataset.exchangeTo){this.to=button.dataset.exchangeTo as BaseAttackId;this.render();}
      else if(button.dataset.exchangeAction==='cancel')this.close();
      else if(button.dataset.exchangeAction==='confirm'&&this.combat&&this.from&&this.to){
        if(this.snapshot()!==this.revision||!this.confirm?.(this.from,this.to)){
          this.render();const message=this.root.querySelector<HTMLElement>('[data-exchange-preview]')!;
          message.hidden=false;message.textContent='无法置换，请重新选择。';
        }
      }
    };
    this.root.onkeydown=e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();this.close();return;}
      if(e.key==='Tab'){
        const buttons=Array.from(this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[buttons.length-1]?.focus();}
        else if(!e.shiftKey&&document.activeElement===buttons[buttons.length-1]){e.preventDefault();buttons[0]?.focus();}
      }
    };
  }
  private snapshot(){return JSON.stringify([this.combat?.runBuild.attacks.map(a=>[a.attackId,a.pairId,a.level,a.slot]),this.combat?.progression.ranks]);}
  show(combat:Combat,price:number,coins:number,confirm:(from:BaseAttackId,to:BaseAttackId)=>boolean) {
    this.combat=combat;this.from=undefined;this.to=undefined;this.price=price;this.coins=coins;this.confirm=confirm;
    this.revision=this.snapshot();this.root.hidden=false;this.render();
  }
  hide(){this.root.hidden=true;this.combat=undefined;this.confirm=undefined;}
  private render(){
    if(!this.combat)return;
    const build=this.combat.runBuild;
    const preview=this.from&&this.to?this.combat.progression.previewWeaponExchange(this.from,this.to):undefined;
    const candidates=(Object.keys(ATTACKS) as BaseAttackId[]).filter(id=>this.from&&build.canExchange(this.from,id));
    const scrollTop=this.root.querySelector<HTMLElement>('.feature-test-content')?.scrollTop??0;
    const image=(id:BaseAttackId,card:string=`${id}-weapon`,title:string=ATTACKS[id].title)=>`<span class="exchange-weapon-art"><span>${escape(title.slice(0,1))}</span><img data-upgrade-art="exchange-weapon" src="${upgradeArt({id:card as SkillId},id).illustrations[0]}" alt="" draggable="false"/></span>`;
    const warningShort=(warning:string)=>warning.includes('：')?`${warning.split('：')[0]}暂不可用`
      :warning.startsWith('火种')?'火种进化暂停':warning.startsWith('水泡')?'水泡融合暂停':'分裂融合暂停';
    const confirmCopy=this.coins<this.price?`金币不足 · ${this.price}`:this.price?`置换 · ${this.price}金币`:'免费置换';
    this.root.innerHTML=`<div class="feature-test-panel forest-panel exchange-panel">
      <header><div><h2>武器置换</h2><p>最高继承3级 · 保留槽位</p></div><div class="exchange-header-actions"><span class="exchange-wallet" aria-label="${this.coins}金币"><img src="${uiArtUrl('common/coin.png')}" alt=""/>${this.coins}</span><button class="forest-close" data-exchange-action="cancel" aria-label="取消武器置换">×</button></div></header>
      <div class="feature-test-content"><h3><span class="exchange-step">1</span> 换下</h3><div class="exchange-options">${build.attacks.map(a=>`<button data-exchange-from="${a.attackId}" ${a.pairId?'disabled':''} aria-pressed="${a.attackId===this.from}" aria-label="${escape(build.title(a))}，${a.level}级${a.pairId?'，融合不可置换':''}">${image(a.attackId,`${a.pairId??a.attackId}-weapon`,build.title(a))}<span class="exchange-weapon-name">${escape(build.title(a))}</span><small>${a.level}级${a.pairId?' · 融合':''}</small></button>`).join('')}</div>
      <h3><span class="exchange-step">2</span> 换上</h3><div class="exchange-options">${candidates.map(id=>`<button data-exchange-to="${id}" aria-pressed="${id===this.to}">${image(id)}<span class="exchange-weapon-name">${escape(ATTACKS[id].title)}</span></button>`).join('')||`<p class="exchange-empty">${this.from?'暂无可换武器':'先选一把武器'}</p>`}</div>
      <div data-exchange-preview class="exchange-preview" ${preview?'':'hidden'}>${preview?`<strong>${escape(ATTACKS[preview.from].title)} ${preview.oldLevel}级 <span>→</span> ${escape(ATTACKS[preview.to].title)} ${preview.level}级</strong>${this.coins<this.price?'<p class="exchange-warning">金币不足</p>':''}${preview.warnings.length?`<div class="exchange-warnings">${preview.warnings.map(w=>`<span class="exchange-warning">${escape(warningShort(w))}</span>`).join('')}</div><details class="exchange-details"><summary>影响详情</summary>${preview.warnings.map(w=>`<p>${escape(w)}</p>`).join('')}</details>`:''}`:''}</div>
      <p class="forest-footnote">融合不可置换 · 金币与经验不返还</p></div>
      <footer class="exchange-actions"><button data-exchange-action="cancel" class="secondary">取消</button><button data-exchange-action="confirm" class="primary" ${!preview||this.coins<this.price?'disabled':''}>${confirmCopy}</button></footer></div>`;
    bindUpgradeArt(this.root);
    this.root.querySelector<HTMLElement>('.feature-test-content')!.scrollTop=scrollTop;
    const selected=this.root.querySelector<HTMLButtonElement>(this.to?`[data-exchange-to="${this.to}"]`:this.from?`[data-exchange-from="${this.from}"]`:'[data-exchange-action="cancel"]');
    selected?.focus({preventScroll:true});
  }
  dispose(){this.root.remove();}
}
