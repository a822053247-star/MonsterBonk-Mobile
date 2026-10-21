/** Installation/download never blocks the game or changes its simulation. */
export function registerPhoneApp() {
  const header = document.querySelector('.menu-header');
  if (!header) return;
  const hint = document.createElement('span');
  header.append(hint);
  hint.style.cssText = 'display:block;text-align:right;font-size:11px;letter-spacing:0;line-height:1.5';
  const link = document.createElement('a');
  link.href = `${import.meta.env.BASE_URL}install.html`;
  link.textContent = '安装到 iPhone';
  link.style.cssText = 'color:inherit;margin-left:12px;text-decoration:underline;pointer-events:auto';
  hint.append(link);
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const status = document.createElement('span');
  status.id = 'offline-status'; status.role = 'status';
  status.style.cssText = 'display:block;margin-top:5px';
  status.textContent = '正在准备离线资源，请保持联网…'; hint.append(status);
  let ready = false;
  const completed = () => { ready = true; status.textContent = '离线资源已就绪 · 可添加到主屏幕'; };
  navigator.serviceWorker.addEventListener('message', event => {
    if (!ready && event.data?.type === 'offline-progress') status.textContent = `离线资源 ${event.data.percent}% · 完成前请保持联网`;
  });
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(async registration => {
    if (registration.active) completed();
    const worker = registration.installing ?? registration.waiting;
    if (worker) worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') completed();
      if (worker.state === 'redundant') status.textContent = '离线资源未下载完成，联网时可重试';
    });
    await navigator.serviceWorker.ready;
    if (!registration.installing) completed();
  }).catch(() => { status.textContent = '当前可联网游玩；离线资源准备失败，请稍后重新打开'; });
}
