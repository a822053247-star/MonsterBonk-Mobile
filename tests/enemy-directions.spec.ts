import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { enemyFacing, ENEMY_DIRECTION_FRAMES } from '../src/enemy-directions';

const basis={rightX:1,rightZ:0,upX:0,upZ:-Math.SQRT1_2};
test('screen-projected movement selects eight directions, mirrors only left views and holds at rest',()=>{
 const names=['up','up-right','right','down-right','down','down-left','left','up-left']as const;
 const vectors=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
 vectors.forEach(([x,y],i)=>expect(enemyFacing(x,y/Math.SQRT1_2,basis)).toBe(names[i]));
 expect(names.map(n=>ENEMY_DIRECTION_FRAMES[n])).toEqual([[4,0],[3,0],[2,0],[1,0],[0,0],[1,1],[2,1],[3,1]]);
 expect(enemyFacing(0,0,basis,'up-left')).toBe('up-left');expect(enemyFacing(0,0,basis)).toBe('down');
 expect(enemyFacing(Math.cos(.41),Math.sin(.41)/Math.SQRT1_2,basis,'right')).toBe('right');
 const rotated={rightX:0,rightZ:-1,upX:-Math.SQRT1_2,upZ:0};
 expect(enemyFacing(0,-1,rotated)).toBe('right');expect(enemyFacing(-1,0,rotated)).toBe('up');
});
test('supplied images remain unchanged, individual directions match original sheets and feet are audited',()=>{
 const base='public/assets/pixel/enemies/direction/',report=JSON.parse(readFileSync(base+'normalization.json','utf8'));
 for(const [name,info]of Object.entries(report.species)as [string,any][]){
  const folder=base+name+'-directions/';
  for(const [file,hash]of Object.entries(info.sourceSHA256))expect(createHash('sha256').update(readFileSync(folder+file)).digest('hex')).toBe(hash);
  expect(info.matchesSheet).toEqual([true,true,true,true,true]);
  for(const frame of info.frames){expect(frame.offset[1]+frame.size[1]).toBe(240);expect(frame.offset[0]).toBeGreaterThanOrEqual(16);expect(frame.size[0]).toBeLessThanOrEqual(224);}
  const png=readFileSync(folder+'runtime.normalized.png');expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([1280,256]);
 }
 expect(report.species['rock-armor-bug'].frames[4].sizeCorrection).toBeLessThan(1);
});
test('six runtime direction atlases decode with visible silhouettes and transparent safe gutters',async({page})=>{
 await page.goto('/');
 const cells=await page.evaluate(async()=>{
  const results=[];
  for(const name of ['grass-monster','runner-bug','rock-armor-bug','draft-crystal-swarm','draft-spore-bomber','draft-treasure-runner']){
   const im=new Image();im.src='/assets/pixel/enemies/direction/'+name+'-directions/runtime.normalized.png';await im.decode();
   const c=document.createElement('canvas');c.width=1280;c.height=256;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);
   for(let col=0;col<5;col++){const data=ctx.getImageData(col*256,0,256,256).data;let visible=0,edge=0;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]){visible++;if(x<16||x>=240||y<16||y>=240)edge++;}results.push({visible,edge});}
  }return results;
 });
 expect(cells).toHaveLength(30);for(const cell of cells){expect(cell.visible).toBeGreaterThan(3000);expect(cell.edge).toBe(0);}
});
