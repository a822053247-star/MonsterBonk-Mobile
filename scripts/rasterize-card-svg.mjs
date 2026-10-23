// Build-time rasterization only. The browser decodes embedded SVG artwork faithfully.
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const jobs=JSON.parse(await readFile(process.argv[2],'utf8'));
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage();
 for(const job of jobs){
  const svg=await readFile(job.source,'utf8');
  const data=await page.evaluate(async svg=>{
   const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||512;canvas.height=image.naturalHeight||512;
   canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];
  },svg);
  await writeFile(job.output,Buffer.from(data,'base64'));
 }
}finally{await browser.close();}
