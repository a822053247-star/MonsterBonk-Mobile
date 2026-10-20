import {test,expect} from '@playwright/test';
import {openSweep} from './flame-sweep-harness';

test('sector texture changes real GPU pixels without changing attack state or using tube particles',async({page})=>{
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(m.text()))errors.push(m.text())});
  await openSweep(page);
  const result=await page.evaluate(()=>{
    const w=window as any,g=w.game;w.pose(.13);
    const state=JSON.stringify(g.combat.inspect()),v=g.combatView.flameSweep,gl=g.renderer.getContext();
    const n=gl.drawingBufferWidth*gl.drawingBufferHeight*4,a=new Uint8Array(n),b=new Uint8Array(n);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);
    v.mesh.visible=false;g.renderer.render(g.scene,g.camera);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);
    w.draw();let changed=0;for(let i=0;i<n;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
    return {changed,same:state===JSON.stringify(g.combat.inspect()),view:v.inspect()};
  });
  expect(result.changed).toBeGreaterThan(100);expect(result.same).toBe(true);
  expect(result.view.assets.particles.count).toBeLessThanOrEqual(5);
  expect(result.view.assets.particles.frames.every((frame:number)=>frame===1)).toBe(true);
  expect(result.view.assets.fire.frames.every((frame:number)=>frame>=8&&frame<=10)).toBe(true);
  expect(errors).toEqual([]);
});
