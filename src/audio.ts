type Sound = 'cast' | 'hit' | 'hurt' | 'collect' | 'dash' | 'jump' | 'level';
/** Original synthesized loop and effects; no downloads or third-party recordings. */
export class GameAudio {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private effectsGain?: GainNode;
  private loop?: AudioBufferSourceNode;
  private buffers = new Map<Sound, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private running = false;
  private disposed = false;
  private unavailable = false;
  private played = 0;
  private lastSound = new Map<Sound, number>();
  constructor(public music: boolean, public sound: boolean) {}
  unlock() {
    if (this.disposed || this.unavailable || (!this.music && !this.sound)) return;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) { this.unavailable = true; return; }
        this.context = new Audio({ latencyHint: 'interactive' });
        this.musicGain = this.context.createGain(); this.musicGain.connect(this.context.destination);
        this.effectsGain = this.context.createGain(); this.effectsGain.gain.value = 0.22; this.effectsGain.connect(this.context.destination);
        this.createLoop();
      }
      if (this.running && (this.music || this.sound)) void this.context.resume().catch(() => {});
      this.updateGain();
    } catch { this.unavailable = true; if (this.context) void this.context.close().catch(() => {}); this.context = undefined; }
  }
  private createLoop() {
    const ctx = this.context!, rate = ctx.sampleRate, beat = 0.4, length = beat * 32;
    const buffer = ctx.createBuffer(1, Math.ceil(rate * length), rate), data = buffer.getChannelData(0);
    const melody = [0, 4, 7, 9, 7, 4, 2, 4, 0, 4, 7, 12, 9, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, -3, 0, 4, 7, 4, 2, 0, -3];
    for (let note = 0; note < 32; note++) {
      const frequency = 261.626 * 2 ** (melody[note] / 12), start = Math.round(note * beat * rate);
      for (let i = 0; i < beat * rate; i++) {
        const t = i / rate, envelope = Math.min(1, t / 0.012) * Math.exp(-t * 9);
        const bass = Math.sin(2 * Math.PI * (note < 16 ? 130.813 : 110) * t) * Math.exp(-t * 6) * 0.12;
        data[start + i] += (Math.sin(2 * Math.PI * frequency * t) + Math.sin(4 * Math.PI * frequency * t) * 0.18) * envelope * 0.22 + bass;
      }
    }
    this.loop = ctx.createBufferSource(); this.loop.buffer = buffer; this.loop.loop = true; this.loop.connect(this.musicGain!); this.loop.start();
  }
  setActive(active: boolean) {
    this.running = active;
    this.updateGain();
    if (active && (this.music || this.sound) && this.context) void this.context.resume().catch(() => {});
    if (!active || (!this.music && !this.sound)) {
      for (const voice of this.voices) voice.stop();
      this.voices.clear();
      if (this.context) void this.context.suspend().catch(() => {});
    }
  }
  configure(music: boolean, sound: boolean) {
    this.music = music; this.sound = sound;
    this.unlock(); this.setActive(this.running);
  }
  private updateGain() {
    if (this.context && this.musicGain) this.musicGain.gain.setTargetAtTime(this.running && this.music ? 0.24 : 0, this.context.currentTime, 0.05);
    if (this.effectsGain) this.effectsGain.gain.value = this.sound ? 0.22 : 0;
  }
  play(kind: Sound) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.running || !this.sound || this.voices.size >= 8) return;
    if (ctx.currentTime - (this.lastSound.get(kind) ?? -1) < 0.065) return;
    this.lastSound.set(kind, ctx.currentTime);
    let buffer = this.buffers.get(kind);
    if (!buffer) {
      const settings: Record<Sound, [number, number, number]> = { cast: [700, 360, 0.1], hit: [220, 90, 0.09], hurt: [160, 60, 0.18], collect: [880, 1450, 0.12], dash: [160, 650, 0.14], jump: [320, 760, 0.17], level: [660, 1320, 0.4] };
      const [start, end, duration] = settings[kind];
      buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0); let phase = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        phase += 2 * Math.PI * (start + (end - start) * t) / ctx.sampleRate;
        data[i] = Math.sin(phase) * Math.min(1, t * 25) * (1 - t) ** 2 * 0.45;
      }
      this.buffers.set(kind, buffer);
    }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this.effectsGain!);
    this.voices.add(source); source.onended = () => { this.voices.delete(source); source.disconnect(); }; source.start(); this.played++;
  }
  inspect() { return { music: this.music, sound: this.sound, active: this.running, state: this.unavailable ? 'unavailable' : this.context?.state ?? 'locked', supported: !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext), voices: this.voices.size, played: this.played }; }
  dispose() { this.disposed = true; this.setActive(false); this.loop?.stop(); this.loop?.disconnect(); this.buffers.clear(); if (this.context) void this.context.close().catch(() => {}); }
}
