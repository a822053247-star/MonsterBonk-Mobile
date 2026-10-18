import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('supplied PNGs stay byte-identical and normalized atlases match the declared grids', () => {
  const directory = 'public/assets/pixel/skills/yanrong/';
  const report = JSON.parse(readFileSync(directory + 'normalization.json', 'utf8'));
  for (const [name, columns, rows] of [['fire-effects-sheet',4,4],['fire-skill-icons',3,1]] as const) {
    const original = readFileSync(directory + name + '.png'), normalized = readFileSync(directory + name + '.normalized.png');
    expect(createHash('sha256').update(original).digest('hex')).toBe(report[name].sha256);
    expect(original[25]).toBe(6); expect(normalized[25]).toBe(6); // PNG RGBA color type.
    expect([normalized.readUInt32BE(16),normalized.readUInt32BE(20)]).toEqual([columns*128,rows*128]);
    expect(report[name].cells).toHaveLength(columns*rows);
    const [width,height]=report[name].originalSize;
    for(const cell of report[name].cells) {
      expect(cell.source[0]).toBeGreaterThanOrEqual(0); expect(cell.source[1]).toBeGreaterThanOrEqual(0);
      expect(cell.source[2]).toBeLessThanOrEqual(width); expect(cell.source[3]).toBeLessThanOrEqual(height);
    }
  }
});

test('all 19 runtime frames decode with transparent gutters and visible silhouettes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const frames: {visible:number;edge:number}[]=[];
    for(const [name,cols,rows] of [['fire-effects-sheet',4,4],['fire-skill-icons',3,1]] as const) {
      const image=new Image();image.src='/assets/pixel/skills/yanrong/'+name+'.normalized.png';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
        let visible=0,edge=0;
        for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(pixels[((row*128+y)*canvas.width+col*128+x)*4+3]>=24) {visible++;if(x<4||x>=124||y<4||y>=124)edge++;}
        frames.push({visible,edge});
      }
    }
    return frames;
  });
  expect(result).toHaveLength(19);
  for(const frame of result) { expect(frame.visible).toBeGreaterThan(100);expect(frame.edge).toBe(0); }
});
