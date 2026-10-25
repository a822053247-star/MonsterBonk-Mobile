import {test,expect} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('worker installs without bulk downloads, reuses content hashes and supports explicit offline play',async({page,context})=>{
  const counts:Record<string,number>={};
  const files:Record<string,string>={'index.html':'<!doctype html><title>Offline fixture</title>','a.txt':'same asset','b.txt':'second asset','c.txt':'last asset'};
  let releaseB!:()=>void;
  const heldB=new Promise<void>(resolve=>{releaseB=resolve;});
  const hashes=Object.fromEntries(Object.entries(files).map(([path,body])=>[path,createHash('sha256').update(body).digest('hex')]));
  const source=readFileSync('scripts/iphone-sw.js','utf8').replace('__VERSION__','test-1')
    .replace('__FILES__',JSON.stringify(Object.keys(files))).replace('__HASHES__',JSON.stringify(hashes));
  const server:Server=createServer((req,res)=>{
    const path=req.url!.split('?')[0].slice(1)||'index.html';
    counts[path]=(counts[path]??0)+1;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type',path==='sw.js'?'application/javascript':path==='index.html'?'text/html':'text/plain');
    if(path==='sw.js')res.end(source);else if(path==='b.txt')void heldB.then(()=>res.end(files[path]));else if(path in files)res.end(files[path]);else{res.statusCode=404;res.end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/`;
  try{
    await page.goto(base);
    await page.evaluate(async()=>{
      await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
    });
    expect(counts['a.txt']??0).toBe(0);expect(counts['b.txt']??0).toBe(0);
    expect(await page.evaluate(async()=>await(await fetch('a.txt')).text())).toBe('same asset');
    await expect.poll(()=>page.evaluate(async key=>!!await(await caches.open('monsterbonk-assets-v2')).match(key),base+'__asset/'+hashes['a.txt'])).toBe(true);
    // A new release can reuse the exact bytes without another request.
    await page.evaluate(async()=>{await caches.delete('monsterbonk-phone-test-1');});
    expect(await page.evaluate(async()=>await(await fetch('a.txt')).text())).toBe('same asset');
    expect(counts['a.txt']).toBe(1);
    await page.evaluate(()=>{
      const w=window as any;w.ready=false;w.pauseCount=0;
      navigator.serviceWorker.addEventListener('message',e=>{
        if(e.data?.type==='offline-paused')w.pauseCount++;
        if(e.data?.type==='offline-ready')w.ready=true;
      });
      navigator.serviceWorker.controller!.postMessage({type:'download-offline'});
    });
    await expect.poll(()=>counts['b.txt']??0).toBe(1);
    await page.evaluate(()=>navigator.serviceWorker.controller!.postMessage({type:'pause-offline'}));
    await page.waitForFunction(()=>(window as any).pauseCount>=1);
    releaseB();
    await page.waitForFunction(()=>(window as any).pauseCount>=2);
    expect(counts['c.txt']??0).toBe(0);
    await page.evaluate(()=>navigator.serviceWorker.controller!.postMessage({type:'download-offline'}));
    await page.waitForFunction(()=>(window as any).ready);
    expect(counts['a.txt']).toBe(1);expect(counts['b.txt']).toBe(1);
    await context.setOffline(true);await page.reload();
    await expect(page).toHaveTitle('Offline fixture');
    expect(await page.evaluate(async()=>await(await fetch('b.txt')).text())).toBe('second asset');
  }finally{releaseB();await context.setOffline(false).catch(()=>{});server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
