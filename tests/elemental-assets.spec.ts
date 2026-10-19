import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clipFrame, FUSION_CLIPS } from '../src/fusion-pixels';

const root='public/assets/pixel/skills/fusions/';
test('source remains byte-identical, curated rectangles exclude icons and overlap zones',()=>{
 const report=JSON.parse(readFileSync(root+'extraction.json','utf8'));
 expect(createHash('sha256').update(readFileSync(root+'water-grass-original.png')).digest('hex')).toBe(report.sourceSHA256);
 expect(report.sourceSize).toEqual([1774,887]);expect(report.alpha).toEqual({zero:764092,faint:319136,visible:490310});
 expect(report.frames).toHaveLength(24);expect(report.rejected).toHaveLength(3);
 for(const frame of report.frames){expect(frame.source[2]).toBeLessThan(1535);expect(frame.pivot).toEqual([128,128]);}
 expect(FUSION_CLIPS['jump-thorn'].impact).toEqual([]);
});
test('all extracted cells and four icons decode with transparent safe margins',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const path='/assets/pixel/skills/fusions/',report=await(await fetch(path+'extraction.json')).json();
  const im=new Image();im.src=path+'effects.normalized.png';await im.decode();
  const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);
  const cells=report.frames.map((f:any)=>{const [x,y,w,h]=f.atlas,data=ctx.getImageData(x,y,w,h).data;let visible=0,edge=0;
   for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(data[(j*w+i)*4+3]){visible++;if(i<16||i>=w-16||j<16||j>=h-16)edge++;}return {visible,edge};});
  const icons=[];for(const name of ['deep-bubble','chain-bubble','thorn-scatter','jump-thorn']){const image=new Image();image.src=path+name+'-icon.png';await image.decode();icons.push([image.width,image.height]);}
  return {cells,icons};
 });
 expect(result.cells).toHaveLength(24);for(const c of result.cells){expect(c.visible).toBeGreaterThan(100);expect(c.edge).toBe(0);}expect(result.icons).toEqual(Array(4).fill([128,128]));
});
test('visual FPS and counts loop only flight; impacts end without changing any combat tuning',()=>{
 expect(clipFrame([0,1],.31,10,true)).toBe(1);expect(clipFrame([2,5,6],.31,10,false)).toBeUndefined();
 expect(clipFrame([],1,12,false)).toBeUndefined();
 for(const clip of Object.values(FUSION_CLIPS)){expect(clipFrame(clip.flight,100,clip.flightFPS,true)).toBeDefined();}
});
