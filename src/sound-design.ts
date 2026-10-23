export const SKILL_SOUNDS = { burst: 1, water: 2, thorn: 4, sweep: 8, shockwave: 16, echo: 32, hourglass: 64, nova: 128,
  'vortex-charge': 256, 'collapse-impact': 512, 'spore-ignite': 1024, 'prism-shot': 2048, 'prism-reflect': 4096, 'tide-return': 8192, 'tide-finish': 16384, lightning: 32768, frost: 65536, blossom: 131072 } as const;
export const COMBINATION_SOUNDS = ['vortex-charge', 'collapse-impact', 'spore-ignite', 'prism-shot', 'prism-reflect', 'tide-return', 'tide-finish'] as const;
export type CombinationSound = typeof COMBINATION_SOUNDS[number];
export function isCombinationSound(kind: string): kind is CombinationSound { return (COMBINATION_SOUNDS as readonly string[]).includes(kind); }
export function isCombinationImpact(kind: string) { return kind === 'collapse-impact' || kind === 'spore-ignite' || kind === 'tide-finish'; }
export type SkillSound = keyof typeof SKILL_SOUNDS;
export type Sound = 'capture-start' | 'capture-success' | 'capture-failure' | 'death' | 'cast' | 'hit' | 'hurt' | 'collect' | 'dash' | 'jump' | 'level' | 'harvest' | 'harvest-big' | 'harvest-epic' | SkillSound;
export const SKILL_SOUND_PRIORITY: readonly SkillSound[] = ['nova', 'tide-finish', 'collapse-impact', 'spore-ignite', 'prism-reflect', 'prism-shot', 'tide-return', 'vortex-charge', 'hourglass', 'echo', 'shockwave', 'sweep', 'blossom', 'frost', 'lightning', 'burst', 'water', 'thorn'];
export const SOUND_RULES: Record<Sound, { seconds: number; interval: number; volume: number; from: number; to: number; noise: number }> = {
  'capture-start': { seconds: .7, interval: .5, volume: .36, from: 220, to: 980, noise: .06 },
  'capture-success': { seconds: .55, interval: .5, volume: .42, from: 660, to: 1320, noise: 0 },
  'capture-failure': { seconds: .4, interval: .5, volume: .36, from: 420, to: 130, noise: .12 },
  death: { seconds: .72, interval: .8, volume: .55, from: 280, to: 48, noise: .08 },
  blossom: { seconds: .24, interval: .16, volume: .23, from: 980, to: 1560, noise: .12 },
  lightning: { seconds: .13, interval: .12, volume: .22, from: 1000, to: 140, noise: .72 },
  frost: { seconds: .22, interval: .16, volume: .25, from: 1800, to: 450, noise: .32 },
  'vortex-charge': { seconds: .95, interval: .8, volume: .34, from: 95, to: 340, noise: .36 },
  'collapse-impact': { seconds: .7, interval: .45, volume: .62, from: 190, to: 42, noise: .5 },
  'spore-ignite': { seconds: .36, interval: .2, volume: .46, from: 245, to: 68, noise: .72 },
  'prism-shot': { seconds: .2, interval: .18, volume: .28, from: 1100, to: 620, noise: .08 },
  'prism-reflect': { seconds: .28, interval: .18, volume: .32, from: 1500, to: 860, noise: .05 },
  'tide-return': { seconds: .45, interval: .28, volume: .34, from: 220, to: 620, noise: .48 },
  'tide-finish': { seconds: .75, interval: .5, volume: .6, from: 165, to: 46, noise: .38 },
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
  if (isCombinationSound(kind)) return synthesizeCombination(kind, rate);
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
    if (kind === 'death') tone = (Math.sin(phase) + .35 * Math.sin(phase * 1.19) + .15 * Math.sin(phase * .5)) / 1.5;
    if (kind === 'water') tone *= .7 + .3 * Math.sin(progress * Math.PI * 5);
    if (kind === 'echo') tone *= .55 + .45 * Math.cos(progress * Math.PI * 4);
    if (kind === 'capture-start') tone *= .65 + .35 * Math.sin(progress * Math.PI * 12);
    if (kind === 'capture-failure') tone = (Math.sin(phase) + .3 * Math.sin(phase * 1.06)) / 1.3;
    if (kind === 'capture-success' || kind === 'level' || kind === 'hourglass') tone = (Math.sin(phase) + Math.sin(phase * 1.25) * .4 + Math.sin(phase * 1.5) * .3) / 1.7;
    const envelope = Math.min(1, t / .006) * (1 - progress) ** 2;
    data[i] = (tone * (1 - rule.noise) + noise * rule.noise) * envelope * rule.volume;
  }
  return data;
}

/** One cached mono voice per phase: no per-ray sources, external files or combat RNG. */
function synthesizeCombination(kind: CombinationSound, rate: number) {
  const rule = SOUND_RULES[kind], data = new Float32Array(Math.ceil(rate * rule.seconds));
  const impact = isCombinationImpact(kind), crystal = kind === 'prism-shot' || kind === 'prism-reflect';
  let phase = 0, noise = 0, seed = 20261022;
  const smooth = 1 - Math.exp(-2 * Math.PI * (crystal ? 4200 : 1400) / rate);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, p = i / data.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise += ((seed / 2147483648 - 1) - noise) * smooth;
    const frequency = impact ? rule.to + (rule.from - rule.to) * Math.exp(-t * 30) : rule.from + (rule.to - rule.from) * p;
    phase += 2 * Math.PI * frequency / rate;
    let signal: number;
    if (crystal) {
      const ping = Math.sin(phase) * .65 + Math.sin(phase * 2.41) * .2;
      const bounce = kind === 'prism-reflect' && t > .055 ? Math.sin(2 * Math.PI * 1860 * (t - .055)) * Math.exp(-(t - .055) * 35) * .22 : 0;
      signal = ping * Math.exp(-t * 12) + bounce + noise * rule.noise;
    } else if (impact) {
      const body = (Math.sin(phase) * .65 + Math.sin(phase * 2) * .25 + Math.sin(phase * 3) * .14) * Math.exp(-t * 6);
      const crack = noise * rule.noise * (Math.exp(-t * 55) + .3 * Math.exp(-t * 9));
      const fire = kind === 'spore-ignite' ? noise * Math.max(0, Math.sin(t * 180)) * Math.exp(-t * 11) * .5 : 0;
      const chord = kind === 'tide-finish' ? (Math.sin(t * 2 * Math.PI * 660) + Math.sin(t * 2 * Math.PI * 990) * .5) * Math.exp(-t * 12) * .14 : 0;
      signal = body + crack + fire + chord;
    } else {
      const flutter = .65 + .35 * Math.sin(p * Math.PI * (kind === 'vortex-charge' ? 16 : 7));
      signal = (Math.sin(phase) * .5 + Math.sin(phase * 2) * .18 + noise * rule.noise) * flutter;
    }
    const envelope = Math.min(1, t / (impact ? .003 : crystal ? .004 : .035)) * (1 - p) ** (impact || crystal ? 2 : 1.5);
    data[i] = Math.tanh(signal * 1.3) * rule.volume * envelope;
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
