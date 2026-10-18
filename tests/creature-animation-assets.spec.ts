import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = 'public/assets/pixel/creatures/animation/';
test('direction changes preserve visible character height instead of shrinking the side walk', async ({ page }) => {
  await page.goto('/');
  const heights=await page.evaluate(async()=>{
    const audit=await (await fetch('/assets/pixel/creatures/animation/normalization.json')).json();
    const [width,height]=audit.frameSize, result:number[]=[];
    for(const [name,source]of Object.entries(audit.sources) as [string,any][]) {
      const image=new Image();image.src='/assets/pixel/creatures/animation/'+name+'.normalized.png';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      for(let row=0;row<source.grid[1];row++) {
        let maximum=0;
        for(let col=0;col<4;col++) {
          let top=height,bottom=-1;
          for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(p[((row*height+y)*canvas.width+col*width+x)*4+3]>=24){top=Math.min(top,y);bottom=Math.max(bottom,y);}
          if(bottom>=top)maximum=Math.max(maximum,bottom-top+1);
        }
        result.push(maximum);
      }
    }
    return result;
  });
  expect(Math.max(...heights)/Math.min(...heights), 'visible height per direction: '+heights.join(', ')).toBeLessThanOrEqual(1.06);
});
test('audited silhouettes preserve originals and explicitly reject the clipped front frame', () => {
  const audit=JSON.parse(readFileSync(directory+'normalization.json','utf8'));
  expect(audit.frameSize).toEqual([384,256]);expect(audit.foot).toEqual([192,240]);
  let usable=0;
  for(const [name,source] of Object.entries(audit.sources) as [string,any][]) {
    const original=readFileSync(source.path);expect(createHash('sha256').update(original).digest('hex')).toBe(source.sha256);
    expect(original[25]).toBe(6);const runtime=readFileSync(directory+name+'.normalized.png');
    expect([runtime.readUInt32BE(16),runtime.readUInt32BE(20)]).toEqual([1536,name==='yanrong-animation-sheet'?1024:512]);
    for(const frame of source.frames) {
      expect(frame.pixels).toBeGreaterThan(10000);const [x,y,w,h]=frame.destination;
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(x+w).toBeLessThanOrEqual(384);expect(y+h).toBe(240);
      if(frame.usable) {usable++;expect(frame.touchesSourceEdge).toBe(0);}
      else {expect(name).toBe('yanrong-animation-sheet');expect([frame.row,frame.column]).toEqual([0,3]);expect(frame.touchesSourceEdge).toBe(45);}
    }
  }
  expect(usable).toBe(23);
});

test('decoded runtime frames share a foot line, contain no neighboring character, and visibly differ', async ({ page }) => {
  await page.goto('/');
  const frames=await page.evaluate(async()=>{
    const result:{row:number;col:number;bottom:number;edge:number;visible:number;hash:number}[]=[];
    for(const [name,rows]of [['yanrong-animation-sheet',4],['yanrong-diagonal-walk',2]] as const) {
      const image=new Image();image.src='/assets/pixel/creatures/animation/'+name+'.normalized.png';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      for(let row=0;row<rows;row++)for(let col=0;col<4;col++) {
        let bottom=0,edge=0,visible=0,hash=2166136261;
        for(let y=0;y<256;y++)for(let x=0;x<384;x++) {
          const i=((row*256+y)*canvas.width+col*384+x)*4;
          if(p[i+3]>=24){visible++;bottom=Math.max(bottom,y+1);if(x<4||x>=380||y<4||y>=252)edge++;}
          for(let k=0;k<4;k++)hash=Math.imul(hash^p[i+k],16777619)>>>0;
        }
        result.push({row,col,bottom,edge,visible,hash});
      }
    }
    return result;
  });
  expect(frames).toHaveLength(24);
  for(let i=0;i<frames.length;i++)if(i===3)expect(frames[i].visible).toBe(0);else {expect(frames[i].bottom).toBe(240);expect(frames[i].edge).toBe(0);expect(frames[i].visible).toBeGreaterThan(10000);}
  expect(new Set(frames.filter(f=>f.visible).map(f=>f.hash)).size).toBe(23);
});
