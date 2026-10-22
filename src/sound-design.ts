export const SKILL_SOUNDS = { burst: 1, water: 2, thorn: 4, sweep: 8, shockwave: 16, echo: 32, hourglass: 64, nova: 128 } as const;
export type SkillSound = keyof typeof SKILL_SOUNDS;
export type Sound = 'cast' | 'hit' | 'hurt' | 'collect' | 'dash' | 'jump' | 'level' | 'harvest' | 'harvest-big' | 'harvest-epic' | SkillSound;
export const SKILL_SOUND_PRIORITY: readonly SkillSound[] = ['nova', 'hourglass', 'echo', 'shockwave', 'sweep', 'burst', 'water', 'thorn'];
export const SOUND_RULES: Record<Sound, { seconds: number; interval: number; volume: number; from: number; to: number; noise: number }> = {
  nova: { seconds: .65, interval: .45, volume: .65, from: 150, to: 42, noise: .5 },
  harvest: { seconds: .19, interval: .16, volume: .4, from: 180, to: 75, noise: .35 },
  'harvest-big': { seconds: .34, interval: .24, volume: .5, from: 145, to: 52, noise: .45 },
  'harvest-epic': { seconds: .52, interval: .35, volume: .6, from: 125, to: 38, noise: .5 },
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
  if (kind === 'nova' || kind === 'harvest' || kind === 'harvest-big' || kind === 'harvest-epic') return synthesizeHarvest(kind, rate);
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

/** One cached voice contains impact, low body, phone-audible harmonics and a short reward sparkle. */
function synthesizeHarvest(kind: 'nova' | 'harvest' | 'harvest-big' | 'harvest-epic', rate: number) {
  const rule = SOUND_RULES[kind], data = new Float32Array(Math.ceil(rate * rule.seconds));
  const tier = kind === 'harvest' ? 0 : kind === 'harvest-big' ? 1 : 2;
  let phase = 0, noise = 0, seed = 977;
  const smooth = 1 - Math.exp(-2 * Math.PI * 1100 / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, progress = i / data.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise += ((seed / 2147483648 - 1) - noise) * smooth;
    phase += 2 * Math.PI * (rule.to + (rule.from - rule.to) * Math.exp(-t * 32)) / rate;
    const attack = Math.min(1, t / .003), tail = (1 - progress) ** 2;
    const body = (Math.sin(phase) * .65 + Math.sin(phase * 2) * .25 + Math.sin(phase * 3) * .12) * Math.exp(-t * 7);
    const crack = noise * (.65 * Math.exp(-t * 65) + .15 * Math.exp(-t * 13));
    let sparkle = 0;
    for (let note = 0; note <= tier; note++) {
      const age = t - .025 - note * .035;
      if (age <= 0) continue;
      const frequency = (kind === 'nova' ? 660 : 784) * [1, 1.25, 1.5][note];
      sparkle += Math.sin(2 * Math.PI * frequency * age) * Math.min(1, age / .004) * Math.exp(-age * 25) * .1;
    }
    data[i] = Math.tanh((body + crack + sparkle) * 1.25) * attack * tail * rule.volume;
  }
  return data;
}
