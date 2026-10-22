import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { Combat } from '../src/combat';
import { PartySystem } from '../src/party';
import { COMBINATION_SOUNDS, SKILL_SOUNDS, synthesizeSound, type Sound } from '../src/sound-design';
const point = { x: 0, z: 0 };
function fixture() {
  const c = new Combat([], 100, () => .5); c.party = new PartySystem(); c.party.reset(['yanrong']); c.fusionEnabled = true; c.reset();
  const e = c.spawn('normal', 2, 0, 0)!; e.hp = 1000; return c;
}

test('seven distinct phase samples are deterministic, bounded and exported as an audition', () => {
  const rate = 22050, mix = new Float32Array(rate * 10.5);
  for (const kind of COMBINATION_SOUNDS) {
    const data = synthesizeSound(kind, rate); expect(data).toEqual(synthesizeSound(kind, rate));
    expect(data.every(v => Number.isFinite(v) && Math.abs(v) <= .7)).toBe(true);
    expect(data[0]).toBe(0); expect(Math.abs(data[data.length - 1])).toBeLessThan(.001);
    expect(data.reduce((n, v) => n + v * v, 0) / data.length).toBeGreaterThan(.0001);
  }
  // Audition order: footprints, collapse, prism, three returning tides and final impact.
  const cues: [Sound, number][] = [['water', .2], ['tide-return', .9], ['spore-ignite', 1.15], ['spore-ignite', 1.4],
    ['vortex-charge', 2.2], ['collapse-impact', 3.8], ['prism-shot', 5], ['prism-reflect', 5.3], ['prism-shot', 5.9], ['prism-reflect', 6.2],
    ['water', 7.1], ['water', 7.5], ['water', 7.9], ['tide-return', 8.3], ['tide-return', 8.7], ['tide-finish', 9.1]];
  for (const [kind, time] of cues) synthesizeSound(kind, rate).forEach((v, i) => { const at = Math.round(time * rate) + i; if (at < mix.length) mix[at] += v; });
  const wav = Buffer.alloc(44 + mix.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(mix.length * 2, 40);
  mix.forEach((v, i) => wav.writeInt16LE(Math.round(Math.tanh(v) * .8 * 32767), 44 + i * 2));
  writeFileSync('artifacts/combination-audio-preview.wav', wav);
});

test('real attack stages emit their own cues and silent callbacks preserve damage and state', () => {
  const c = fixture(); c.waterEvolution.cast('deep-collapse', 1, point); expect(c.soundEvents & SKILL_SOUNDS['vortex-charge']).toBeGreaterThan(0);
  c.soundEvents = 0; c.waterEvolution.update(1.6, {}, 1); expect(c.soundEvents & SKILL_SOUNDS['collapse-impact']).toBeGreaterThan(0);
  c.reset(); c.waterEvolution.cast('frost-prism', 1, point); c.waterEvolution.update(.25, {}, 1);
  expect(c.soundEvents & SKILL_SOUNDS['prism-shot']).toBeGreaterThan(0); c.soundEvents = 0; c.waterEvolution.update(.3, {}, 1);
  expect(c.soundEvents & SKILL_SOUNDS['prism-reflect']).toBeGreaterThan(0);
  c.reset(); c.positionAoe.cast('spore-trail', 5, 1, { x: 2, z: 0 }); c.waterEvolution.cast('undertow-pyre', 1, point);
  c.waterEvolution.update(2.1, {}, 1); expect(c.soundEvents & SKILL_SOUNDS['spore-ignite']).toBeGreaterThan(0);
  expect(c.soundEvents & SKILL_SOUNDS['tide-return']).toBeGreaterThan(0);
  c.reset(); c.waterEvolution.cast('all-tides', 1, point); c.waterEvolution.update(2.7, {}, 1);
  expect(c.soundEvents & SKILL_SOUNDS['tide-finish']).toBeGreaterThan(0);
  for (const kind of ['undertow-pyre', 'deep-collapse', 'frost-prism', 'all-tides'] as const) {
    const audible = fixture(), silent = fixture(); (silent.waterEvolution as any).host.sound = () => {};
    for (const combat of [audible, silent]) {
      combat.positionAoe.cast('spore-trail', 5, 1, { x: 2, z: 0 }); combat.waterEvolution.cast(kind, 1, point);
      for (let i = 0; i < 180; i++) combat.waterEvolution.update(1 / 60, {}, 1);
    }
    expect(audible.waterEvolution.inspect()).toEqual(silent.waterEvolution.inspect());
    expect(audible.enemies.map(e => e.hp)).toEqual(silent.enemies.map(e => e.hp));
    expect(audible.goldEarned).toBe(silent.goldEarned);
  }
});

test('Web Audio routes every new cue, limits spam and stops on mute or pause', async ({ page }) => {
  await page.route('**/combination-audio-harness', route => route.fulfill({ contentType: 'text/html', body: `<html><body><button id="unlock">Enable audio</button><script type="module">
    import {GameAudio} from '/src/audio.ts';import {SKILL_SOUNDS} from '/src/sound-design.ts';
    window.audio=new GameAudio(false,true);window.flags=SKILL_SOUNDS;
    document.getElementById('unlock').onclick=()=>{window.audio.setActive(true);window.audio.unlock()};
  </script></body></html>` }));
  await page.goto('/combination-audio-harness'); await page.locator('#unlock').click();
  test.skip(!await page.evaluate(() => (window as any).audio.inspect().supported), 'Web Audio unavailable');
  await expect.poll(() => page.evaluate(() => (window as any).audio.inspect().state)).toBe('running');
  const result = await page.evaluate(async kinds => {
    const a = (window as any).audio, flags = (window as any).flags;
    for (const kind of kinds) { a.playSkills(flags[kind]); await new Promise(resolve => setTimeout(resolve, 320)); }
    const played = a.inspect();
    const events = kinds.reduce((n, kind) => n | flags[kind], 0);
    for (let i = 0; i < 100; i++) a.playSkills(events);
    const spam = a.inspect(); a.setActive(false); a.playSkills(events); const paused = a.inspect();
    a.configure(false, false); a.setActive(true); a.playSkills(events); const muted = a.inspect(); a.dispose();
    return { played, spam, paused, muted };
  }, [...COMBINATION_SOUNDS]);
  for (const kind of COMBINATION_SOUNDS) expect(result.played.playedSounds[kind]).toBeGreaterThan(0);
  expect(result.spam.voices).toBeLessThanOrEqual(8); expect(result.spam.played - result.played.played).toBeLessThanOrEqual(3);
  expect(result.paused.voices).toBe(0); expect(result.muted.voices).toBe(0);
  expect(result.paused.played).toBe(result.spam.played); expect(result.muted.played).toBe(result.spam.played);
});
