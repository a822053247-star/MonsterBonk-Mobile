import './style.css';
import { Combat } from './combat';
import { PartySystem } from './party';
import { TreasureDialog } from './treasure-dialog';

const style=document.createElement('style');
style.textContent=`
body{margin:0;background:radial-gradient(ellipse at center,#394337,#111d24);min-height:100dvh}
.treasure-preview-controls{position:fixed;z-index:170;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:5px 10px;background:#17182deb;border:1px solid #b39357;border-radius:10px;white-space:nowrap;color:#fff5d9;align-items:center;font:600 14px system-ui}
.treasure-preview-controls button{min-height:44px;min-width:44px;padding:4px 10px;border:1px solid #9b845c;background:#303451;color:#fff5d9;border-radius:6px;font:inherit;cursor:pointer}
.treasure-preview-controls button[aria-pressed=true]{background:#9f3c60;border-color:#ffe38f}
.treasure-dialog{padding-top:76px}
.treasure-dialog-panel{height:min(820px,calc(100dvh - 94px))}
.treasure-preview-hint{position:fixed;inset:50% 0 auto;text-align:center;color:#fff4d5;font:600 18px system-ui}
@media(orientation:portrait){.treasure-preview-hint{z-index:180;background:#17182dee;padding:20px}.treasure-preview-controls{flex-wrap:wrap;justify-content:center;width:90vw}.treasure-preview-controls span{display:none}}
`;
document.head.append(style);
const root=document.getElementById('treasure-preview')!;
const controls=document.createElement('nav');controls.className='treasure-preview-controls';controls.setAttribute('aria-label','宝箱效果预览');
const label=document.createElement('span');label.textContent='奖励数量';controls.append(label);
const combat=new Combat();combat.party=new PartySystem();combat.fusionEnabled=true;combat.automaticSpawning=false;
const dialog=new TreasureDialog(combat,undefined,()=>true,true);
let count=5,frame=0;
const buttons:HTMLButtonElement[]=[];
function show(n:number){
 count=n;cancelAnimationFrame(frame);dialog.reset();combat.reset();combat.encounters.beginWave(2);
 combat.grantTreasure(n,{x:0,z:0});dialog.sync();
 buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i+1===n)));
 const open=()=>{
  const button=dialog.root.querySelector('button')!;
  if(!button.disabled){button.click();frame=0;}
  else frame=requestAnimationFrame(open);
 };
 frame=requestAnimationFrame(open);
}
for(let n=1;n<=5;n++){
 const button=document.createElement('button');button.textContent=`${n}件`;button.onclick=()=>show(n);buttons.push(button);controls.append(button);
}
const replay=document.createElement('button');replay.textContent='重新播放';replay.onclick=()=>show(count);controls.append(replay);
const hint=document.createElement('p');hint.className='treasure-preview-hint';
const updateHint=()=>{hint.textContent='点击上方数量或「重新播放」查看宝箱效果';hint.hidden=!dialog.root.hidden;};
addEventListener('resize',updateHint);root.append(controls,hint);
dialog.root.querySelector('button')!.addEventListener('click',()=>requestAnimationFrame(updateHint));
show(5);updateHint();
addEventListener('pagehide',()=>{cancelAnimationFrame(frame);dialog.dispose();});
