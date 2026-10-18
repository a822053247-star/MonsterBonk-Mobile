import { test, expect } from '@playwright/test';

test('every used tree and rock cutout has one connected body and no isolated white square', async ({ page }) => {
  await page.route('**/world-art-harness', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><script type="module">
    import {createSampleWorld} from '/src/world-sample.ts';
    const world=createSampleWorld();await world.ready;
    const maps=new Set();world.group.traverse(o=>{if(o.name==='像素树'||o.name==='岸边岩石')maps.add(o.material.map.image)});
    window.art=[...maps].map(canvas=>{const {width:w,height:h}=canvas;const p=canvas.getContext('2d').getImageData(0,0,w,h).data;
      const remaining=new Set();let white=0;for(let i=0;i<w*h;i++){if(p[i*4+3]>=24)remaining.add(i);if(p[i*4+3]>=24&&Math.min(p[i*4],p[i*4+1],p[i*4+2])>240)white++}
      const count=remaining.size;let components=0;while(remaining.size){const first=remaining.values().next().value;remaining.delete(first);const queue=[first];components++;
        while(queue.length){const n=queue.pop(),x=n%w,y=Math.floor(n/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,next=ny*w+nx;if(nx>=0&&ny>=0&&nx<w&&ny<h&&remaining.delete(next))queue.push(next)}}}
      return {components,count,white}});world.dispose();
  </script>` }));
  await page.goto('/world-art-harness');
  await page.waitForFunction(() => 'art' in window);
  const art = await page.evaluate(() => (window as any).art);
  expect(art).toHaveLength(4);
  for (const sprite of art) {
    expect(sprite.components).toBe(1);
    expect(sprite.count).toBeGreaterThan(150);
    expect(sprite.white).toBe(0);
  }
});
