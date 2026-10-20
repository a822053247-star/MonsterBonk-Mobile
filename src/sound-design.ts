export const SKILL_SOUNDS = { burst: 1, water: 2, thorn: 4, sweep: 8, shockwave: 16, echo: 32, hourglass: 64 } as const;
export type SkillSound = keyof typeof SKILL_SOUNDS;
export type Sound = 'cast' | 'hit' | 'hurt' | 'collect' | 'dash' | 'jump' | 'level' | SkillSound;
export const SKILL_SOUND_PRIORITY: readonly SkillSound[] = ['hourglass', 'echo', 'shockwave', 'sweep', 'burst', 'water', 'thorn'];
export const SOUND_RULES: Record<Sound, { seconds: number; interval: number; volume: number; from: number; to: number; noise: number }> = {
  cast: { seconds: .055, interval: .13, volume: .12, from: 310, to: 210, noise: .7 },
  hit: { seconds: .065, interval: .11, volume: .18, from: 170, to: 95, noise: .45 },
  burst: { seconds: .26, interval: .24, volume: .48, from: 135, to: 44, noise: .65 },
  water: { seconds: .19, interval: .24, volume: .32, from: 270, to: 520, noise: .2 },
  thorn: { seconds: .14, interval: .24, volume: .28, from: 440, to: 240, noise: .65 },
  sweep: { seconds: .24, interval: .28, volume: .4, from: 220, to: 85, noise: .85 },
  shockwave: { seconds: .34, interval: .4, volume: .48, from: 110, to: 40, noise: .25 },
  echo: { seconds: .28, interval: .32, volume: .28, from: 390, to: 290, noise: .08 },
  hourglass: { seconds: .42, interval: .6, volume: .3, from: 330, to: 660, noise: .03 },
  hurt: { seconds: .18, interval: .12, volume: .45, from: 160, to: 60, noise: .12 },
  collect: { seconds: .085, interval: .18, volume: .16, from: 620, to: 820, noise: 0 },
  dash: { seconds: .14, interval: .15, volume: .32, from: 160, to: 440, noise: .7 },
  jump: { seconds: .17, interval: .15, volume: .3, from: 320, to: 620, noise: .03 },
  level: { seconds: .4, interval: .2, volume: .4, from: 440, to: 880, noise: 0 },
};

/** Cached, bounded samples; local noise never consumes the combat random stream. */
export function synthesizeSound(kind: Sound, rate: number) {
  const rule = SOUND_RULES[kind], data = new Float32Array(Math.ceil(rate * rule.seconds));
  let phase = 0, noise = 0, seed = 7919;
  const smooth = 1 - Math.exp(-2 * Math.PI * (kind === 'burst' ? 700 : kind === 'hit' ? 1000 : 1600) / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, progress = i / data.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise += ((seed / 2147483648 - 1) - noise) * smooth;
    const frequency = rule.from + (rule.to - rule.from) * progress;
    phase += 2 * Math.PI * frequency / rate;
    let tone = Math.sin(phase) * .8 + Math.sin(phase * 2) * .12;
    if (kind === 'water') tone *= .7 + .3 * Math.sin(progress * Math.PI * 5);
    if (kind === 'echo') tone *= .55 + .45 * Math.cos(progress * Math.PI * 4);
    if (kind === 'level' || kind === 'hourglass') tone = (Math.sin(phase) + Math.sin(phase * 1.25) * .4 + Math.sin(phase * 1.5) * .3) / 1.7;
    const envelope = Math.min(1, t / .006) * (1 - progress) ** 2;
    data[i] = (tone * (1 - rule.noise) + noise * rule.noise) * envelope * rule.volume;
  }
  return data;
}
