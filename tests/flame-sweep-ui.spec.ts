import {test,expect} from '@playwright/test';
import {openSweep} from './flame-sweep-harness';

test('level one is a single sector, grows with levels and never overlays an independent ring',async({page,browserName})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await openSweep(page);
  for(const [level,radius,degrees] of [[1,2.8,180],[3,3.6,260],[5,4.4,360]]){
    await page.evaluate(level=>(window as any).arrange(level),level);
    for(const width of [844,568]){
      await page.setViewportSize({width,height:width===844?390:320});
      const result=await page.evaluate(()=>{
        const w=window as any,g=w.game;g.sleep();g.combat.melee.active=true;w.pose(.13);
        const before=JSON.stringify(g.combat.inspect());w.draw();
        return {same:before===JSON.stringify(g.combat.inspect()),view:g.combatView.inspect().melee,combat:g.combat.inspect(),
          meshAngle:g.combatView.flameSweep.mesh.geometry.parameters.thetaLength,
          oldSprite:!!g.scene.getObjectByName('FlameSweepEightFrames')};
      });
      expect(result.same).toBe(true);expect(result.view).toMatchObject({kind:'sector-wave',capacity:1,radius,active:true});
      expect(result.view.angle).toBeCloseTo(degrees*Math.PI/180);expect(result.meshAngle).toBeCloseTo(result.view.angle);
      expect(result.view).not.toHaveProperty('ring');expect(result.combat).not.toHaveProperty('flameRing');expect(result.oldSprite).toBe(false);
      if(browserName==='chromium')await page.screenshot({path:`artifacts/flame-redesign-level-${level}-${width}.png`});
    }
  }
  await page.locator('#pause').click();await expect(page.locator('#build-weapons')).toContainText('4.4 范围 / 360° 火浪');
  expect(errors).toEqual([]);
});

test('reused source frames share a cast origin, freeze and reset without GPU growth',async({page})=>{
  await openSweep(page);
  for(const [age,frame] of [[.01,12],[.04,13],[.13,14]])expect(await page.evaluate(age=>(window as any).pose(age).frame,age)).toBe(frame);
  const result=await page.evaluate(()=>{
    const w=window as any,g=w.game;w.pose(.13);
    const state=JSON.stringify(g.combat.inspect()),memory=JSON.stringify(g.renderer.info.memory),view=g.combatView.flameSweep;
    for(let i=0;i<100;i++)w.draw();
    return {same:state===JSON.stringify(g.combat.inspect()),memory:memory===JSON.stringify(g.renderer.info.memory),root:view.inspect().root,
      cast:[g.combat.melee.x,.1,g.combat.melee.z]};
  });
  expect(result.same).toBe(true);expect(result.memory).toBe(true);expect(result.root).toEqual(result.cast);
  await page.locator('#pause').click();const paused=await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()));
  await page.evaluate(()=>{const g=(window as any).game;for(let i=0;i<120;i++)g.step(1/60)});
  expect(await page.evaluate(()=>JSON.stringify((window as any).game.combat.inspect()))).toBe(paused);
  await page.locator('#restart').click();
  const reset=await page.evaluate(()=>{const w=window as any;w.game.sleep();w.draw();return {active:w.game.combat.melee.active,id:w.game.combat.melee.attackInstanceId,view:w.game.combatView.inspect().melee}});
  expect(reset.active).toBe(false);expect(reset.id).toBe(0);expect(reset.view.assets.fire.count).toBe(0);
});

test('all presets and missing assets preserve the single sector and actual damage',async({page})=>{
  await openSweep(page,true);
  const result=await page.evaluate(()=>{
    const w=window as any,g=w.game,state=JSON.stringify(g.combat.inspect());
    for(const p of ['compact','balanced','punchy']){g.combatView.flameSweep.setPreset(p);w.pose(.13);}
    return {same:state===JSON.stringify(g.combat.inspect()),view:g.combatView.inspect().melee,hits:g.combat.hits};
  });
  expect(result.same).toBe(true);expect(result.hits).toBeGreaterThan(0);
  expect(result.view).toMatchObject({active:true,fallback:true,capacity:1,kind:'sector-wave'});
  expect(result.view.assets.fire.count).toBe(0);expect(result.view.assets.particles.count).toBe(0);
});
