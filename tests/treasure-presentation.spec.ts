import {test,expect} from '@playwright/test';
import {treasurePresentation,synthesizeTreasureCue} from '../src/treasure-presentation';
import {Combat} from '../src/combat';
import {PartySystem} from '../src/party';
import {ENCOUNTER_RULES} from '../src/enemy-challenge';
test('formal treasure HP increases early and late while retaining wave/endless and historical boundaries',()=>{
 const c=new Combat();c.party=new PartySystem();c.fusionEnabled=true;c.reset();
 for(let wave=1;wave<=6;wave++){
  c.clearWave();c.encounters.beginWave(wave);c.endlessCycleIndex=2;
  const e=c.spawn('draft-treasure-runner',0,10,0)!;
  expect(e.hp).toBeCloseTo(65*(wave<=3?1.25:1.6)*ENCOUNTER_RULES.waveHealth[wave-1]*c.endlessEnemyHealthMultiplier);
 }
 const legacy=new Combat();legacy.reset();expect(legacy.spawn('draft-treasure-runner',0,10,0)!.hp).toBe(65);
});
test('five presentation tiers increase duration, particles, rays and bounded audio variants',()=>{
 let duration=0,particles=0;
 for(let n=1;n<=5;n++){
  const p=treasurePresentation(n),total=p.intro+p.opening+p.roll+p.settle+p.finale;
  expect(total).toBeGreaterThan(duration);expect(total).toBeLessThan(6.8);expect(p.particles).toBeGreaterThan(particles);duration=total;particles=p.particles;
  for(const cue of ['open','tick','reveal','finish']as const){const samples=synthesizeTreasureCue(cue,n,n-1,12000);expect(samples.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)).toBe(true);expect(samples.some(x=>Math.abs(x)>.01)).toBe(true);}
 }
});
test('every tier scrolls and reveals exactly once with matching audio cues and final duration',async({page})=>{
 await page.goto('/');
 const results=await page.evaluate(async()=>{
  const {createTreasureCanvas}=await import('/src/treasure-canvas.ts');
  const results=[];
  for(let n=1;n<=5;n++){
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=450;
   const cues:string[]=[],draw=createTreasureCanvas(canvas,Array.from({length:n},(_,i)=>'奖励'+i),[],true,(cue:string)=>cues.push(cue));
   draw(0);draw.open();draw(0);let age=0;
   while(!draw.done()&&age<8){age+=1/30;draw(age);}
   results.push({n,age,inspect:draw.inspect(),open:cues.filter(c=>c==='open').length,ticks:cues.filter(c=>c==='tick').length,reveals:cues.filter(c=>c==='reveal').length,finish:cues.filter(c=>c==='finish').length});
  }return results;
 });
 let previous=0;
 for(const r of results){expect(r.age).toBeGreaterThan(previous);previous=r.age;expect(r.age).toBeLessThan(6.8);expect(r.inspect.stopped).toBe(r.n);expect(r.open).toBe(1);expect(r.reveals).toBe(r.n);expect(r.finish).toBe(1);expect(r.ticks).toBeGreaterThan(2);}
});
test('treasure cues use the game mixer and obey mute, pause, voice limit and reset',async({page})=>{
 await page.route('**/treasure-audio-harness',r=>r.fulfill({contentType:'text/html',body:`<button id="unlock">Play</button><script type="module">import {GameAudio} from '/src/audio.ts';window.audio=new GameAudio(false,true);document.querySelector('button').onclick=()=>{audio.setActive(true);audio.unlock();};</script>`}));
 await page.goto('/treasure-audio-harness');await page.locator('#unlock').click();
 await page.waitForFunction(()=>(window as any).audio.inspect().state==='running');
 const result=await page.evaluate(()=>{
  const a=(window as any).audio;
  for(let i=0;i<20;i++)a.playTreasure('tick',5);
  const limited=a.inspect();a.configure(false,false);const muted=a.playTreasure('open',5);
  a.configure(false,true);a.setActive(false);const paused=a.playTreasure('finish',5);
  a.stopTreasure();const reset=a.inspect();a.dispose();return {limited,muted,paused,reset};
 });
 expect(result.limited.voices).toBeLessThanOrEqual(8);expect(result.limited.treasurePlayed).toBeGreaterThan(0);
 expect(result.muted).toBe(false);expect(result.paused).toBe(false);expect(result.reset.voices).toBe(0);
});
