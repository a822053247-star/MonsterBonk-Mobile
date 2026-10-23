import {test,expect} from '@playwright/test';
test('E requires proximity, triggers effect and cue once, and ignores repeat/pause',async({page})=>{
 await page.route('**/capture-input-harness',route=>route.fulfill({contentType:'text/html',body:`<div id="app"></div><script type="module">
 import {createUI} from '/src/ui.ts'; import {Game} from '/src/game.ts';
 import {EnemyCapture} from '/src/enemy-capture.ts'; import {StarSealCaptureSystem} from '/src/visuals/star-seal-capture.ts';
 createUI(document.getElementById('app'));const g=window.game=new Game();g.sleep();g.wake=()=>{};
 g.capture=new EnemyCapture(()=>0);g.captureVfx=new StarSealCaptureSystem(g.scene,1);g.scene.add(g.captureAnchor);
 g.combat.clearWave();g.combat.hp=100;g.position.set(0,0,0);g.mode='playing';
 window.enemy=g.combat.spawn('normal',0,4,0);window.enemy.spawnTime=0;window.enemy.hp=1;
 window.cues=[];g.audio.play=kind=>{if(kind.startsWith('capture-'))window.cues.push(kind);return true};
 window.ready=true;
 </script>`}));
 await page.goto('/capture-input-harness');await page.waitForFunction(()=> (window as any).ready);
 await page.keyboard.press('e');
 expect(await page.evaluate(()=> (window as any).cues)).toEqual([]);
 await page.evaluate(()=>{(window as any).enemy.z=2});
 await page.keyboard.press('e');
 expect(await page.evaluate(()=>({cues:(window as any).cues,active:(window as any).game.captureVfx.inspect().active}))).toEqual({cues:['capture-start'],active:1});
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',repeat:true})));
 expect(await page.evaluate(()=> (window as any).cues)).toEqual(['capture-start']);
 await page.evaluate(()=>{const g=(window as any).game;g.captureVfx.clear();g.capture.pending=undefined;g.capture.cooldown=0;g.mode='paused'});
 await page.keyboard.press('e');
 expect(await page.evaluate(()=> (window as any).game.capture.pending??null)).toBeNull();
});
