import { buildSong, MusicPlayer, type SongKey } from './music';
import { noiseBuffer } from './synth';
import { SFX, type SfxName } from './sfx';

const MUTE_KEY = 'rainknights:muted';
const STORMY = ['thunderstorm', 'hurricane', 'tropical_downpour'];

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Game-wide audio: music sequencer, sound effects and weather ambience, all
 * synthesized live with WebAudio. Browsers block audio until a user gesture,
 * so scenes just *request* music; it starts once unlock() has run.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  muted = loadMuted();
  onMuteChange?: (muted: boolean) => void;

  private master!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private rainGain!: GainNode;
  private windGain!: GainNode;

  private current: { key: SongKey; player: MusicPlayer } | null = null;
  private wanted: SongKey | null = null;
  private lastPlayed = new Map<string, number>();
  private gemCombo = 0;
  private lastGemAt = -1;
  private condition: string | null = null;
  private thunderTimer: ReturnType<typeof setTimeout> | null = null;

  /** Creates the context; safe to call repeatedly. Must run inside a user gesture to start audible. */
  unlock() {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => this.onRunning());
    } else {
      this.onRunning();
    }
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.musicFilter).connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.5;
    this.sfxBus.connect(this.master);

    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 1;
    this.ambBus.connect(this.master);

    // Looping noise beds for rain and wind; their levels follow the weather.
    const bed = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambBus);
      src.start();
      return g;
    };
    this.rainGain = bed('bandpass', 4500, 0.35);
    this.windGain = bed('lowpass', 500, 0.7);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private onRunning() {
    if (this.wanted && !this.current) this.startMusic(this.wanted);
    this.applyAmbience();
  }

  private get live(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // --- music ---

  playMusic(key: SongKey) {
    this.wanted = key;
    if (this.current?.key === key) return;
    if (this.live) this.startMusic(key);
  }

  stopMusic(fadeSec = 0.6) {
    this.wanted = null;
    this.current?.player.stop(fadeSec);
    this.current = null;
  }

  private startMusic(key: SongKey) {
    const ctx = this.ctx!;
    this.current?.player.stop(0.5);
    const player = new MusicPlayer(ctx, this.musicBus, buildSong(key), () => {
      if (this.current?.player === player) {
        this.current = null;
        this.wanted = null;
      }
    });
    player.gain.gain.setValueAtTime(0, ctx.currentTime);
    player.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
    player.start();
    this.current = { key, player };
  }

  /** Dulls and lowers the music (e.g. behind the level-up menu). */
  setMuffled(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(on ? 900 : 20000, t, 0.08);
    this.musicBus.gain.setTargetAtTime(on ? 0.45 : 0.8, t, 0.08);
  }

  // --- sound effects ---

  play(name: SfxName, arg?: string | number) {
    if (!this.live || this.muted) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // Rapid-fire sounds (hits, pickups) are throttled so they can't pile up.
    const minGap: Partial<Record<SfxName, number>> = { hit: 0.045, enemyDie: 0.05, gem: 0.03, move: 0.03 };
    const gap = minGap[name] ?? 0;
    if (gap && now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, now);

    if (name === 'gem') {
      this.gemCombo = now - this.lastGemAt < 0.5 ? Math.min(6, this.gemCombo + 1) : 0;
      this.lastGemAt = now;
      SFX.gem(ctx, this.sfxBus, now, this.gemCombo);
      return;
    }
    (SFX[name] as (c: BaseAudioContext, o: AudioNode, t: number, a?: string | number) => void)(ctx, this.sfxBus, now, arg);
  }

  // --- ambience ---

  /** Sets rain/wind/thunder for the current weather condition (null = silence). */
  setAmbience(condition: string | null) {
    this.condition = condition;
    this.applyAmbience();
  }

  private applyAmbience() {
    if (!this.ctx) return;
    const c = this.condition;
    const rain = { rain: 0.05, thunderstorm: 0.075, tropical_downpour: 0.095, hurricane: 0.1, humid: 0.02 }[c ?? ''] ?? 0;
    const wind = { windy: 0.09, cold_front: 0.06, hurricane: 0.1, thunderstorm: 0.03 }[c ?? ''] ?? 0;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain, t, 0.4);
    this.windGain.gain.setTargetAtTime(wind, t, 0.4);

    if (this.thunderTimer) clearTimeout(this.thunderTimer);
    this.thunderTimer = null;
    if (c && STORMY.includes(c)) this.scheduleThunder();
  }

  private scheduleThunder() {
    this.thunderTimer = setTimeout(() => {
      if (this.live && !this.muted && this.condition && STORMY.includes(this.condition)) this.play('thunder');
      this.scheduleThunder();
    }, 8000 + Math.random() * 14000);
  }

  // --- mute ---

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* storage unavailable — mute just won't persist */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    this.onMuteChange?.(this.muted);
  }
}

export const audio = new AudioEngine();
