import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { SKILL_SOUNDS, SOUND_RULES, synthesizeSound, type Sound } from '../src/sound-design';

test('rapid-fire samples have soft energy, smooth endpoints and a bounded preview', () => {
  const rate=22050;
  for (const kind of ['cast','hit'] as const) {
    const data=synthesizeSound(kind,rate);
    const rms=Math.sqrt(data.reduce((n,x)=>n+x*x,0)/data.length);
    expect(rms).toBeLessThan(.08);expect(rms).toBeGreaterThan(.001);
    expect(Math.abs(data[0])).toBe(0);expect(Math.abs(data[data.length-1])).toBeLessThan(.001);
  }
  const mix=new Float32Array(rate*10);
  const add=(kind:Sound,time:number)=>synthesizeSound(kind,rate).forEach((v,i)=>{const at=Math.round(time*rate)+i;if(at<mix.length)mix[at]+=v*.22;});
  for(let t=0;t<2;t+=.15){add('cast',t);add('hit',t+.065);}
  const skills=['burst','water','thorn','sweep','shockwave','echo','hourglass'] as const;
  skills.forEach((kind,i)=>add(kind,2.6+i*.85));
  const wav=Buffer.alloc(44+mix.length*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(mix.length*2,40);
  expect(mix.every(Number.isFinite)).toBe(true);
  mix.forEach((value,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+i*2));
  writeFileSync('artifacts/combat-audio-preview.wav',wav);
});

test('real elemental fusions, sweep and shockwave emit one tick of sound flags', () => {
  for (const [species,skill,flag] of [['yanrong','split-on-hit','burst'],['bubblesalamander','area','water'],['sproutspike','split-on-hit','thorn']] as const) {
    const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.party.reset([species]);c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
    c.grantUpgrade(skill);c.spawn('tank',0,3,0)!.hp=10000;
    let events=0;
    for(let i=0;i<120;i++){c.party.syncLeader({x:0,z:0},0);c.update(1/60,{x:0,z:0});events|=c.soundEvents;}
    expect(events&SKILL_SOUNDS[flag]).toBeGreaterThan(0);
    c.update(0,{x:0,z:0});expect(c.soundEvents).toBe(0);
  }
  const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();
  c.grantUpgrade('flame-sweep-weapon');c.grantUpgrade('shockwave');c.spawn('tank',0,2,0)!.hp=10000;
  let events=0;
  for(let i=0;i<90;i++){c.party.syncLeader({x:0,z:0},0);c.update(1/60,{x:0,z:0});events|=c.soundEvents;}
  expect(events&SKILL_SOUNDS.sweep).toBeGreaterThan(0);expect(events&SKILL_SOUNDS.shockwave).toBeGreaterThan(0);
});

test('dense feedback stays rate limited, prioritizes skills and respects mute/pause', async ({ page }) => {
  await page.route('**/sound-harness',route=>route.fulfill({contentType:'text/html',body:`<button id="start">Start</button><script type="module">
    import {GameAudio} from '/src/audio.ts';window.audio=new GameAudio(true,true);document.querySelector('button').onclick=()=>{audio.setActive(true);audio.unlock();};
  </script>`}));
  await page.goto('/sound-harness');await page.locator('#start').click();
  const supported=await page.evaluate(()=>(window as any).audio.inspect().supported);
  test.skip(!supported,'Web Audio is not available in this browser runtime');
  await expect.poll(()=>page.evaluate(()=>(window as any).audio.inspect().state)).toBe('running');
  const result=await page.evaluate(async()=>{
    const a=(window as any).audio;let peak=0;
    for(let i=0;i<120;i++){
      a.playSkills(127);a.play('hit');a.play('cast');a.play('collect');peak=Math.max(peak,a.inspect().voices);
      await new Promise(resolve=>setTimeout(resolve,8));
    }
    const before=a.inspect();a.configure(true,false);a.play('hurt');a.playSkills(127);
    const muted=a.inspect().played;a.setActive(false);a.play('hit');
    return {before,muted,paused:a.inspect(),peak};
  });
  expect(result.peak).toBeLessThanOrEqual(8);expect(result.before.played).toBeLessThan(35);
  expect(result.before.playedSounds.hourglass).toBeGreaterThan(0);
  expect(result.before.playedSounds.hit??0).toBeLessThanOrEqual(10);
  expect(result.muted).toBe(result.before.played);expect(result.paused.played).toBe(result.before.played);
  expect(result.paused.voices).toBe(0);expect(result.before.musicStarts).toBe(1);
  expect(SOUND_RULES.cast.interval).toBeGreaterThan(.1);
});

test('echo copies and the eighth genuine kill emit their own cues', () => {
  const make=()=>{const c=new Combat([],32,()=>.5);c.party=new PartySystem();c.fusionEnabled=true;c.automaticSpawning=false;c.reset();return c;};
  const echo=make();echo.grantUpgrade('draft-echo-bone-dice');echo.spawn('tank',0,5,0)!.hp=100000;
  let events=0;
  for(let i=0;i<240;i++){echo.party!.syncLeader({x:0,z:0},0);echo.update(1/60,{x:0,z:0});events|=echo.soundEvents;}
  expect(events&SKILL_SOUNDS.echo).toBeGreaterThan(0);
  const c=make();c.grantUpgrade('draft-slaughter-hourglass');c.runBuild.attacks[0].cooldown=100;
  for(let i=0;i<8;i++){
    const e=c.spawn('normal',5,0,0)!;e.hp=1;
    Object.assign(c.projectiles.find(p=>!p.active)!,{active:true,x:5,z:0,previousX:5,previousZ:0,vx:0,vz:0,life:1,damage:100,distance:0,attackId:'spark',bornTick:-1});
    c.update(.001,{x:0,z:0});
  }
  expect(c.kills).toBe(8);expect(c.soundEvents&SKILL_SOUNDS.hourglass).toBeGreaterThan(0);
});
