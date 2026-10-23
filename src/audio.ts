import { synthesizeTreasureCue, type TreasureCue } from './treasure-presentation';
import { SKILL_SOUNDS, SKILL_SOUND_PRIORITY, SOUND_RULES, synthesizeSound, isCombinationImpact, type Sound } from './sound-design';
type MusicTrack = 'original' | 'grassland' | 'boss';
const MUSIC_FILES = { grassland: 'bgm-grassland.ogg', boss: 'BossBattle.ogg' } as const;
/** Wave music and synthesized effects share the existing volume/lifecycle controls. */
export class GameAudio {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private effectsGain?: GainNode;
  private loop?: AudioBufferSourceNode;
  private originalLoop?: AudioBuffer;
  private track: MusicTrack = 'original';
  private playingTrack?: MusicTrack;
  private musicStarts = 0;
  private musicBuffers = new Map<MusicTrack, AudioBuffer>();
  private musicLoads = new Map<MusicTrack, Promise<AudioBuffer | undefined>>();
  private failedTracks = new Set<MusicTrack>();
  private requests = new AbortController();
  private buffers = new Map<Sound, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private voiceKinds = new Map<AudioBufferSourceNode, Sound>();
  private harvestKills = 0;
  private harvestUntil = 0;
  private harvestTier = 0;
  private harvestNextPulse = 0;
  private running = false;
  private playbackRevision = 0;
  private disposed = false;
  private unavailable = false;
  private played = 0;
  private treasureBuffers = new Map<string, AudioBuffer>();
  private treasurePlayed = 0;
  private treasureVoices = new Set<AudioBufferSourceNode>();
  private lastSound = new Map<Sound, number>();
  private lastSkill = -Infinity;
  private quietUntil = 0;
  private playedSounds = new Map<Sound, number>();
  constructor(public music: boolean, public sound: boolean) {}
  unlock() {
    if (this.disposed || this.unavailable || (!this.music && !this.sound)) return;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) { this.unavailable = true; return; }
        this.context = new Audio({ latencyHint: 'interactive' });
        this.musicGain = this.context.createGain(); this.musicGain.connect(this.context.destination);
        this.effectsGain = this.context.createGain(); this.effectsGain.gain.value = 0.22;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -18; limiter.knee.value = 12; limiter.ratio.value = 4;
        limiter.attack.value = .003; limiter.release.value = .12;
        this.effectsGain.connect(limiter); limiter.connect(this.context.destination);
        this.createLoop();
      }
      if (this.running && (this.music || this.sound)) void this.context.resume().catch(() => {});
      this.updateGain();
      void this.syncMusic();
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
    this.originalLoop = buffer;
    this.startLoop(buffer, 'original');
  }
  private startLoop(buffer: AudioBuffer, track: MusicTrack) {
    this.loop?.stop(); this.loop?.disconnect();
    this.loop = this.context!.createBufferSource();
    this.loop.buffer = buffer; this.loop.loop = true;
    this.loop.connect(this.musicGain!); this.loop.start();
    this.playingTrack = track; this.musicStarts++;
  }
  setWave(wave?: number) {
    if (wave === 2) this.prepareMusic('grassland');
    if (wave === 5) this.prepareMusic('boss');
    const track: MusicTrack = wave === 6 ? 'boss' : wave && wave >= 3 && wave <= 5 ? 'grassland' : 'original';
    if (track === this.track) return;
    this.track = track;
    this.failedTracks.delete(track);
    void this.syncMusic();
  }
  private prepareMusic(track: 'grassland' | 'boss') {
    const context = this.context;
    if (!context || this.disposed || !this.running || !this.music || this.musicBuffers.has(track) || this.musicLoads.has(track) || this.failedTracks.has(track)) return;
    // Cache only; do not switch the currently playing music during preloading.
    void this.loadMusic(track, context);
  }
  private loadMusic(track: 'grassland' | 'boss', context: AudioContext) {
    const cached = this.musicBuffers.get(track);
    if (cached) return Promise.resolve(cached);
    const pending = this.musicLoads.get(track);
    if (pending) return pending;
    if (this.failedTracks.has(track)) return Promise.resolve(undefined);
    const pendingLoad = (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}assets/music/${MUSIC_FILES[track]}`, { signal: this.requests.signal });
        if (!response.ok) throw new Error(`Music request failed: ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (this.disposed || context !== this.context) return;
        this.musicBuffers.set(track, buffer);
        return buffer;
      } catch {
        // Keep the previous loop available if a file or codec is unavailable.
        if (!this.disposed) this.failedTracks.add(track);
      } finally { this.musicLoads.delete(track); }
    })();
    this.musicLoads.set(track, pendingLoad);
    return pendingLoad;
  }
  private async syncMusic() {
    const context = this.context, track = this.track;
    if (!context || this.disposed || !this.running || !this.music || this.playingTrack === track) return;
    const buffer = track === 'original' ? this.originalLoop : await this.loadMusic(track, context);
    // Loading must not override a newer wave, restart, mute, pause or disposal.
    if (!buffer || this.disposed || context !== this.context || track !== this.track || !this.running || !this.music || this.playingTrack === track) return;
    this.startLoop(buffer, track);
  }
  setActive(active: boolean) {
    this.playbackRevision++;
    this.running = active;
    this.updateGain();
    if (active && (this.music || this.sound) && this.context) void this.context.resume().catch(() => {});
    if (active) void this.syncMusic();
    if (!active || !this.sound) {
      for (const voice of this.voices) voice.stop();
      this.voices.clear(); this.voiceKinds.clear();
      this.harvestKills = this.harvestTier = this.harvestUntil = this.harvestNextPulse = 0;
      if ((!active || !this.music) && this.context) void this.context.suspend().catch(() => {});
    }
  }
  configure(music: boolean, sound: boolean) {
    this.music = music; this.sound = sound;
    this.unlock(); this.setActive(this.running);
  }
  private updateGain() {
    if (this.context && this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
      this.musicGain.gain.setTargetAtTime(this.running && this.music ? 0.24 : 0, this.context.currentTime, 0.05);
    }
    if (this.effectsGain) this.effectsGain.gain.value = this.sound ? 0.22 : 0;
  }
  playSkills(events: number) {
    const now = this.context?.currentTime ?? 0;
    for (const kind of SKILL_SOUND_PRIORITY) {
      if (now - this.lastSkill < .18 && kind !== 'hourglass' && kind !== 'echo' && kind !== 'nova' && !isCombinationImpact(kind)) continue;
      if ((events & SKILL_SOUNDS[kind]) && this.play(kind)) {
        this.lastSkill = now; this.quietUntil = now + .09; return;
      }
    }
  }
  /** Aggregate actual kills over real audio time: 10x simulation never produces 10x overlapping voices. */
  playHarvest(kills: number) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.running || !this.sound || !Number.isFinite(kills) || kills <= 0) return false;
    if (ctx.currentTime > this.harvestUntil) this.harvestKills = this.harvestTier = 0;
    this.harvestKills = Math.min(64, this.harvestKills + Math.floor(kills));
    this.harvestUntil = ctx.currentTime + .65;
    const tier = this.harvestKills >= 20 ? 3 : this.harvestKills >= 8 ? 2 : this.harvestKills >= 3 ? 1 : 0;
    if (!tier || tier <= this.harvestTier && ctx.currentTime < this.harvestNextPulse) return false;
    const kind = tier === 3 ? 'harvest-epic' : tier === 2 ? 'harvest-big' : 'harvest';
    if (!this.play(kind)) return false;
    this.harvestTier = tier; this.harvestNextPulse = ctx.currentTime + (tier === 3 ? .45 : .28);
    this.quietUntil = ctx.currentTime + .1;
    return true;
  }
  play(kind: Sound): boolean {
    const ctx = this.context;
    const background = kind === 'cast' || kind === 'hit' || kind === 'collect';
    const important = isCombinationImpact(kind) || kind === 'nova' || kind === 'harvest' || kind === 'harvest-big' || kind === 'harvest-epic';
    const limit = background ? 4 : important || kind === 'hurt' || kind === 'level' ? 8 : 6;
    if (!ctx || ctx.state !== 'running' || (!this.running && kind !== 'death') || !this.sound) return false;
    if (background && ctx.currentTime < this.quietUntil) return false;
    if (ctx.currentTime - (this.lastSound.get(kind) ?? -Infinity) < SOUND_RULES[kind].interval) return false;
    if (this.voices.size >= limit) {
      const expendable = (important || kind === 'hurt' || kind === 'level') && [...this.voiceKinds].find(([, sound]) => sound === 'hit' || sound === 'cast' || sound === 'collect' || sound === 'harvest');
      if (!expendable) return false;
      expendable[0].stop(); expendable[0].disconnect(); this.voices.delete(expendable[0]); this.voiceKinds.delete(expendable[0]);
    }
    this.lastSound.set(kind, ctx.currentTime);
    let buffer = this.buffers.get(kind);
    if (!buffer) {
      const samples = synthesizeSound(kind, ctx.sampleRate);
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.buffers.set(kind, buffer);
    }
    const revision = this.playbackRevision;
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(this.effectsGain!);
    const count = this.playedSounds.get(kind) ?? 0;
    if (kind === 'cast' || kind === 'hit') source.playbackRate.value = [.97, 1.02, 1, .99][count % 4];
    this.playedSounds.set(kind, count + 1);
    this.voices.add(source); this.voiceKinds.set(source, kind);
    source.onended = () => { this.voices.delete(source); this.voiceKinds.delete(source); source.disconnect(); if(kind==='death'&&!this.running&&revision===this.playbackRevision)void ctx.suspend().catch(()=>{}); }; source.start(); this.played++;
    if (kind === 'nova' || kind === 'collapse-impact' || kind === 'tide-finish' || kind === 'harvest-big' || kind === 'harvest-epic') {
      this.quietUntil = Math.max(this.quietUntil, ctx.currentTime + .12);
      if (this.music && this.musicGain) {
        this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
        this.musicGain.gain.setTargetAtTime(.12, ctx.currentTime, .015);
        this.musicGain.gain.setTargetAtTime(.24, ctx.currentTime + .22, .08);
      }
    }
    return true;
  }
  stopTreasure(){for(const voice of this.treasureVoices){voice.stop();voice.disconnect();this.voices.delete(voice);}this.treasureVoices.clear();}
  /** Let the terminal cue finish after battle/music stop; later lifecycle changes cancel it. */
  playDeath() {
    this.setActive(false);
    const ctx=this.context,revision=this.playbackRevision;
    if(!ctx||!this.sound||this.disposed)return;
    void ctx.resume().then(()=>{
      if(this.disposed||revision!==this.playbackRevision||this.running||!this.sound)return;
      this.lastSound.delete('death');this.play('death');
    }).catch(()=>{});
  }
  playTreasure(cue: TreasureCue, count: number, index = 0) {
    const ctx=this.context;
    if(!ctx||ctx.state!=='running'||!this.running||!this.sound||this.voices.size>=8)return false;
    const key=`${cue}:${count}:${cue==='reveal'?index:0}`;
    let buffer=this.treasureBuffers.get(key);
    if(!buffer){const samples=synthesizeTreasureCue(cue,count,index,ctx.sampleRate);buffer=ctx.createBuffer(1,samples.length,ctx.sampleRate);buffer.copyToChannel(samples,0);this.treasureBuffers.set(key,buffer);}
    const source=ctx.createBufferSource();source.buffer=buffer;source.connect(this.effectsGain!);this.voices.add(source);this.treasureVoices.add(source);
    source.onended=()=>{this.voices.delete(source);this.treasureVoices.delete(source);source.disconnect();};source.start();this.treasurePlayed++;return true;
  }
  inspect() { return { treasurePlayed:this.treasurePlayed, music: this.music, sound: this.sound, active: this.running, state: this.unavailable ? 'unavailable' : this.context?.state ?? 'locked', supported: !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext), voices: this.voices.size, played: this.played,
    track: this.track, playingTrack: this.playingTrack ?? null, looping: this.loop?.loop ?? false, musicStarts: this.musicStarts,
    loadedTracks: [...this.musicBuffers.keys()], failedTracks: [...this.failedTracks], playedSounds: Object.fromEntries(this.playedSounds) }; }
  dispose() { this.disposed = true; this.stopTreasure();this.requests.abort(); this.setActive(false); this.loop?.stop(); this.loop?.disconnect(); this.buffers.clear();this.treasureBuffers.clear(); this.musicBuffers.clear(); this.originalLoop = undefined; if (this.context) void this.context.close().catch(() => {}); }
}
