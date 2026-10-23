import {test,expect} from '@playwright/test';

test('reward centers sit on their beam axes for all counts and stage sizes',async({page})=>{
 await page.goto('/');
 const samples=await page.evaluate(async()=>{
  const {createTreasureCanvas}=await import('/src/treasure-canvas.ts');
  const samples=[];
  for(const h of [300,760])for(let n=1;n<=5;n++){
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=h;
   const c=canvas.getContext('2d')!;
   let path:number[][]=[];const beams:number[][][]=[],icons:number[][]=[];
   const begin=c.beginPath.bind(c),move=c.moveTo.bind(c),line=c.lineTo.bind(c),fill=c.fill.bind(c),translate=c.translate.bind(c);
   c.beginPath=()=>{path=[];begin();};
   c.moveTo=(x,y)=>{path.push([x,y]);move(x,y);};
   c.lineTo=(x,y)=>{path.push([x,y]);line(x,y);};
   c.fill=((...args:any[])=>{
    if(path.length===4&&path[1][0]-path[0][0]===60&&path[0][1]===h*.8&&path[1][1]===h*.8&&path[2][1]===0&&path[3][1]===0)beams.push(path.map(p=>[...p]));
    (fill as any)(...args);
   }) as typeof c.fill;
   c.translate=(x,y)=>{if(Math.abs(y-h*.28)<1e-6)icons.push([x,y]);translate(x,y);};
   const draw=createTreasureCanvas(canvas,Array.from({length:n},(_,i)=>'奖励'+i),[],true);
   draw.open();draw(0);draw(8);
   samples.push({n,h,errors:beams.map((beam,i)=>{
    const bottom=(beam[0][0]+beam[1][0])/2,top=(beam[2][0]+beam[3][0])/2;
    const t=icons[i][1]/(h*.8);
    return Math.abs(top+(bottom-top)*t-icons[i][0]);
   }),beams:beams.length,icons:icons.length});
  }
  return samples;
 });
 for(const sample of samples){
  expect(sample.beams).toBe(sample.n);expect(sample.icons).toBe(sample.n);
  for(const error of sample.errors)expect(error,JSON.stringify(sample)).toBeLessThan(.01);
 }
});

test('rolling medallions follow beam axes at their final scale',async({page})=>{
 await page.goto('/');
 const errors=await page.evaluate(async()=>{
  const {createTreasureCanvas}=await import('/src/treasure-canvas.ts');
  const errors:number[]=[];
  for(const h of [300,760])for(let n=1;n<=5;n++){
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=h;
   const ctx=canvas.getContext('2d')!,spacing=Math.min(900*.88/n,n===1?320:260);
   const expectedScale=Math.min(spacing/165,h/510,1.4);
   let last=[0,0];const centers:number[][]=[];
   const translate=ctx.translate.bind(ctx),scale=ctx.scale.bind(ctx);
   ctx.translate=(x,y)=>{last=[x,y];translate(x,y);};
   ctx.scale=(x,y)=>{if(last[1]>0&&last[1]<h*.53&&Math.abs(x-expectedScale)<1e-6&&x===y)centers.push([...last]);scale(x,y);};
   const draw=createTreasureCanvas(canvas,Array.from({length:n},(_,i)=>'奖励'+i),[],true);
   draw.open();draw(0);draw(1.6);
   if(!centers.length)throw new Error('No rolling medallions at final scale');
   for(const [x,y] of centers){
    const offsets=Array.from({length:n},(_,i)=>{
     const target=450+(i-(n-1)/2)*spacing;
     return Math.abs(x-(450+(target-450)*(h*.8-y)/(h*.8-h*.28)));
    });
    errors.push(Math.min(...offsets));
   }
  }
  return errors;
 });
 expect(Math.max(...errors)).toBeLessThan(.01);
});
