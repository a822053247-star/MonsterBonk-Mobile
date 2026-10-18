const {chromium}=require('@playwright/test');const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage();page.on('pageerror',console.error);
 await page.route('**/fox-build',route=>route.fulfill({contentType:'text/html',body:'<script type="module" src="/artifacts/fox-repair.ts"></script>'}));
 await page.goto('http://127.0.0.1:5173/fox-build');await page.waitForFunction(()=>window.foxRepair);
 const result=await page.evaluate(async()=>{const buffer=await window.foxRepair.export();const bytes=new Uint8Array(buffer);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)});
 const path='public/assets/characters/yanrong-repaired.glb';await fs.writeFile(path,Buffer.from(result,'base64'));console.log(path,Buffer.from(result,'base64').length);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
