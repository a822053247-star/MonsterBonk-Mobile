/** Cache used resources; the full offline download is optional and pauses in battle. */
export function registerPhoneApp() {
  const header=document.querySelector('.menu-header');if(!header)return;
  const hint=document.createElement('span');header.append(hint);
  hint.style.cssText='display:block;text-align:right;font-size:11px;letter-spacing:0;line-height:1.5';
  const link=document.createElement('a');link.href=`${import.meta.env.BASE_URL}install.html`;
  link.textContent='安装到 iPhone';link.style.cssText='color:inherit;text-decoration:underline;pointer-events:auto';hint.append(link);
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  const button=document.createElement('button');button.id='download-offline';button.type='button';
  button.textContent='下载离线资源';button.style.cssText='margin-left:12px;color:inherit;font:inherit;background:none;border:1px solid #b9d18b66;border-radius:5px;padding:3px 7px;pointer-events:auto';
  const status=document.createElement('span');status.id='offline-status';status.role='status';
  status.style.cssText='display:block;margin-top:5px';status.textContent='联网即玩 · 离线资源按需下载';hint.append(button,status);
  let worker:ServiceWorker|null=null,requested=false,ready=false;
  const inBattle=()=>!!document.getElementById('menu')?.hidden;
  const sync=()=>{
    if(!worker||!requested||ready)return;
    worker.postMessage({type:inBattle()?'pause-offline':'download-offline'});
    if(inBattle())status.textContent='离线下载已暂停 · 优先加载战斗素材';
  };
  const menu=document.getElementById('menu');
  if(menu)new MutationObserver(sync).observe(menu,{attributes:true,attributeFilter:['hidden']});
  button.addEventListener('click',()=>{requested=true;button.disabled=true;status.textContent='正在准备离线资源…';sync();});
  navigator.serviceWorker.addEventListener('message',event=>{
    switch(event.data?.type){
      case 'offline-ready':ready=true;requested=false;button.hidden=true;status.textContent='离线资源已就绪 · 可添加到主屏幕';break;
      case 'offline-progress':if(!inBattle())status.textContent=`离线资源 ${event.data.percent}% · 进入战斗后暂停下载`;break;
      case 'offline-paused':status.textContent='离线下载已暂停 · 返回菜单后继续';break;
      case 'offline-error':requested=false;button.disabled=false;status.textContent='下载中断，可重试；已下载资源会保留';break;
    }
  });
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{updateViaCache:'none'}).then(async registration=>{
    const active=await navigator.serviceWorker.ready;worker=active.active;
    worker?.postMessage({type:'offline-status'});sync();
    const pendingUpdate=()=>{if(registration.waiting){worker=null;button.disabled=true;status.textContent='新版已准备 · 关闭旧游戏页面后更新';}};
    pendingUpdate();registration.installing?.addEventListener('statechange',pendingUpdate);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      worker=navigator.serviceWorker.controller;ready=false;button.disabled=requested;
      worker?.postMessage({type:'offline-status'});sync();
    });
  }).catch(()=>{button.disabled=true;status.textContent='可联网游玩；当前无法准备离线资源';});
}
