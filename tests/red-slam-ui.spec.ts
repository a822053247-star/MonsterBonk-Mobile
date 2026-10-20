import { test, expect } from '@playwright/test';
import { RED_BLOB_BASH } from '../src/combat';

test('mobile combat renders only red stationary ring and fast directional lane, never a rock warning',async({page})=>{
  await page.setViewportSize({width:568,height:320});
  await page.route('**/red-slam-harness*',r=>r.fulfill({
    contentType:'text/html; charset=utf-8',
    body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
      import '/src/style.css'; import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
      createUI(document.getElementById('app'));window.game=new Game();
    </script></body></html>`,
  }));
  await page.goto('/red-slam-harness?world=fixed');
  await page.waitForFunction(()=>'game' in window);
  await page.locator('#start-fusion').click();
  const data=await page.evaluate(()=>{
    const g=(window as any).game;g.sleep();
    g.combat.clearWave();g.combat.encounters.beginWave(2);
    const red=g.combat.spawn('normal',g.position.x+1.2,g.position.z,0);
    const fast=g.combat.spawn('fast',g.position.x+5,g.position.z,0);
    const rock=g.combat.spawn('tank',g.position.x-5,g.position.z,0);
    red.intent='windup';red.intentTime=.4;
    fast.intent='windup';fast.intentTime=.4;fast.aimX=-1;fast.aimZ=0;
    rock.intent='chase';rock.intentTime=0;
    g.placeCamera(true);g.combatView.render(1,g.visualTime,g.position);
    const v=g.combatView;
    return {
      circles:v.warnings.count,
      lanes:v.pounceLanes.count,
      arrows:v.pounceArrows.count,
      circleXScale:v.warnings.instanceMatrix.array[0],
    };
  });
  expect(data.circles).toBe(1);
  expect(data.lanes).toBe(1);
  expect(data.arrows).toBe(1);
  expect(data.circleXScale).toBeCloseTo(RED_BLOB_BASH.radius,3);
});
