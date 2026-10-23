import {mountPrison} from './prison-scene';
import style from './prison-scene.css?raw';
import {CaptureCollection} from './capture-collection';
import {type EnemyKind} from './combat';
const ALIASES:Record<string,EnemyKind>={'grass-monster':'normal','rock-armor-bug':'tank','runner-bug':'fast'};
export class PrisonView {
 readonly element=document.createElement('section');
 private scene?:ReturnType<typeof mountPrison>;
 private root:ShadowRoot;
 constructor(private collection:CaptureCollection,private cue:()=>void,onClose:()=>void) {
  this.element.className='prison-shell';this.element.hidden=true;this.element.setAttribute('aria-label','幻兽囚坊');
  const back=document.createElement('button');back.className='prison-back';back.textContent='返回主菜单';back.onclick=onClose;
  const world=document.createElement('div');world.className='prison-world';this.root=world.attachShadow({mode:'open'});
  this.element.append(back,world);document.body.append(this.element);
 }
 open(){
  this.element.hidden=false;
  this.root.innerHTML=`<style>${style}</style><main id="game-root"><canvas id="game" tabindex="0" aria-label="幻兽囚坊：点击右上角背包或按M打开怪物背包，点击怪物自动放入囚笼，点击幻兽可放回背包或放生，也可点击挖矿、搬运、种植工位；点击仓库领取物资，委托板交单，建筑标记升级"></canvas><div id="notice" role="status" class="sr-only"></div></main>`;
  this.scene=mountPrison(this.root,{release:asset=>this.collection.release(ALIASES[asset]??asset as EnemyKind),count:asset=>this.collection.data.counts[ALIASES[asset]??asset as EnemyKind]??0,owns:asset=>this.collection.owns(ALIASES[asset]??asset as EnemyKind),image:asset=>`${import.meta.env.BASE_URL}assets/pixel/enemies/${asset}.png`,cue:()=>this.cue()});
  this.root.querySelector('canvas')?.focus();
 }
 close(){this.scene?.dispose();this.scene=undefined;this.element.hidden=true;this.root.replaceChildren();}
 inspect(){return this.scene?.inspect();}
 dispose(){this.close();this.element.remove();}
}
