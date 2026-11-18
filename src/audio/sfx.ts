import { midiToHz, noiseHit, tone } from './synth';

export type WeaponKind = 'sword' | 'hammer' | 'daggers';

/** One-shot sound effects, all synthesized (no audio files). `t` is the start time. */
export const SFX = {
  move(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.03, freq: 1046, voice: 'square50', vol: 0.09, release: 0.01 });
  },

  confirm(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.05, freq: 784, voice: 'square50', vol: 0.11, release: 0.01 });
    tone(ctx, out, { t: t + 0.055, dur: 0.1, freq: 1175, voice: 'square50', vol: 0.11, release: 0.03 });
  },

  swing(ctx: BaseAudioContext, out: AudioNode, t: number, kind: WeaponKind = 'sword') {
    const p = { sword: [2600, 500, 0.15, 420], hammer: [1300, 180, 0.24, 200], daggers: [3800, 1100, 0.09, 620] }[kind];
    noiseHit(ctx, out, { t, dur: p[2], vol: kind === 'hammer' ? 0.26 : 0.17, filter: 'bandpass', freq: p[0], sweepTo: p[1], q: 1.2, attack: 0.01 });
    tone(ctx, out, { t, dur: p[2], freq: p[3], slideTo: p[3] * 0.35, voice: 'sine', vol: 0.1, release: 0.02 });
  },

  beam(ctx: BaseAudioContext, out: AudioNode, t: number, kind: WeaponKind = 'sword') {
    const p = { sword: [1500, 260, 0.26], hammer: [900, 110, 0.36], daggers: [2100, 480, 0.18] }[kind];
    tone(ctx, out, { t, dur: p[2], freq: p[0], slideTo: p[1], voice: 'saw', vol: 0.09, attack: 0.005, release: 0.05 });
    tone(ctx, out, { t, dur: p[2], freq: p[0] * 1.5, slideTo: p[1] * 1.5, voice: 'square25', vol: 0.05, release: 0.05 });
    noiseHit(ctx, out, { t, dur: p[2], vol: 0.05, filter: 'highpass', freq: 5500, q: 0.4 });
  },

  hit(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.06, vol: 0.16, filter: 'bandpass', freq: 1900, q: 0.9 });
    tone(ctx, out, { t, dur: 0.06, freq: 270, slideTo: 120, voice: 'square25', vol: 0.11, release: 0.01 });
  },

  enemyDie(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.17, freq: 400, slideTo: 70, voice: 'square50', vol: 0.12, release: 0.03 });
    noiseHit(ctx, out, { t, dur: 0.12, vol: 0.08, filter: 'lowpass', freq: 1200, sweepTo: 200 });
  },

  /** `step` (0-6) raises the pitch for quick successive pickups. */
  gem(ctx: BaseAudioContext, out: AudioNode, t: number, step = 0) {
    tone(ctx, out, { t, dur: 0.05, freq: midiToHz(84 + step * 2), voice: 'square50', vol: 0.06, release: 0.03 });
    tone(ctx, out, { t: t + 0.04, dur: 0.06, freq: midiToHz(91 + step * 2), voice: 'square50', vol: 0.05, release: 0.04 });
  },

  hurt(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.3, freq: 340, slideTo: 90, voice: 'square25', vol: 0.16, release: 0.05 });
    noiseHit(ctx, out, { t, dur: 0.12, vol: 0.1, filter: 'lowpass', freq: 2000 });
  },

  levelUp(ctx: BaseAudioContext, out: AudioNode, t: number) {
    [72, 76, 79].forEach((note, i) =>
      tone(ctx, out, { t: t + i * 0.085, dur: 0.08, freq: midiToHz(note), voice: 'square50', vol: 0.12, release: 0.02 })
    );
    tone(ctx, out, { t: t + 0.26, dur: 0.32, freq: midiToHz(84), voice: 'square50', vol: 0.12, release: 0.12 });
    tone(ctx, out, { t: t + 0.26, dur: 0.32, freq: midiToHz(72), voice: 'tri', vol: 0.14, release: 0.12 });
  },

  /** Weather-front rolling in: low rumble. */
  front(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 1.2, vol: 0.28, filter: 'lowpass', freq: 320, sweepTo: 70, attack: 0.15 });
    tone(ctx, out, { t, dur: 1.0, freq: 70, slideTo: 42, voice: 'sine', vol: 0.18, attack: 0.1, release: 0.3 });
  },

  bossAppears(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.45, freq: 110, slideTo: 104, voice: 'saw', vol: 0.12, release: 0.05 });
    tone(ctx, out, { t: t + 0.5, dur: 0.7, freq: 82, slideTo: 60, voice: 'saw', vol: 0.14, release: 0.2 });
    noiseHit(ctx, out, { t: t + 0.5, dur: 1.0, vol: 0.2, filter: 'lowpass', freq: 500, sweepTo: 80, attack: 0.1 });
  },

  shield(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.25, freq: 660, slideTo: 1760, voice: 'sine', vol: 0.09, release: 0.08 });
    tone(ctx, out, { t: t + 0.05, dur: 0.2, freq: 1320, voice: 'square12', vol: 0.03, release: 0.1 });
  },

  sunbeam(ctx: BaseAudioContext, out: AudioNode, t: number) {
    [79, 83, 86].forEach((note, i) =>
      tone(ctx, out, { t: t + i * 0.06, dur: 0.14, freq: midiToHz(note), voice: 'tri', vol: 0.08, release: 0.1 })
    );
  },

  /** Hazard about to land: two quick rising blips (telegraph). */
  warn(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.06, freq: 880, voice: 'square50', vol: 0.09, release: 0.02 });
    tone(ctx, out, { t: t + 0.09, dur: 0.06, freq: 1175, voice: 'square50', vol: 0.09, release: 0.02 });
  },

  /** Lightning lands: a bright crack over a short boom. */
  strike(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.1, vol: 0.3, filter: 'highpass', freq: 2200, q: 0.4 });
    noiseHit(ctx, out, { t: t + 0.02, dur: 0.6, vol: 0.34, filter: 'lowpass', freq: 520, sweepTo: 60, attack: 0.01 });
    tone(ctx, out, { t, dur: 0.25, freq: 120, slideTo: 40, voice: 'sine', vol: 0.2, release: 0.1 });
  },

  /** A shock stuns something: quick electric zip. */
  zap(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.1, freq: 2400, slideTo: 600, voice: 'saw', vol: 0.07, release: 0.02 });
    tone(ctx, out, { t: t + 0.04, dur: 0.06, freq: 1800, slideTo: 900, voice: 'square12', vol: 0.05, release: 0.02 });
  },

  /** One burn tick: a small crackle. */
  burn(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.07, vol: 0.12, filter: 'bandpass', freq: 3200, q: 1.2 });
    noiseHit(ctx, out, { t: t + 0.03, dur: 0.05, vol: 0.08, filter: 'highpass', freq: 5000, q: 0.5 });
  },

  /** Frozen solid: icy falling chime. */
  freeze(ctx: BaseAudioContext, out: AudioNode, t: number) {
    [88, 84, 79, 76].forEach((note, i) =>
      tone(ctx, out, { t: t + i * 0.05, dur: 0.07, freq: midiToHz(note), voice: 'sine', vol: 0.09, release: 0.08 })
    );
  },

  /** Ice shatters: glass crash. */
  shatter(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.22, vol: 0.2, filter: 'highpass', freq: 4500, q: 0.4 });
    [96, 91, 88, 84].forEach((note, i) =>
      tone(ctx, out, { t: t + i * 0.025, dur: 0.05, freq: midiToHz(note), voice: 'square12', vol: 0.06, release: 0.05 })
    );
  },

  /** Fire meets water: a hiss. */
  steam(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.45, vol: 0.14, filter: 'highpass', freq: 3000, sweepTo: 7000, q: 0.5, attack: 0.04 });
  },

  /** A gust arrives: swoosh. */
  gust(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 1.2, vol: 0.2, filter: 'bandpass', freq: 500, sweepTo: 1800, q: 0.8, attack: 0.3 });
  },

  /** Dodge roll: a short whoosh with a low thump. */
  roll(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.17, vol: 0.14, filter: 'bandpass', freq: 900, sweepTo: 2600, q: 0.9, attack: 0.02 });
    tone(ctx, out, { t, dur: 0.12, freq: 300, slideTo: 140, voice: 'sine', vol: 0.09, release: 0.03 });
  },

  /** A hit avoided by rolling: a bright ping. */
  dodge(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.06, freq: 1568, voice: 'square12', vol: 0.07, release: 0.02 });
    tone(ctx, out, { t: t + 0.06, dur: 0.1, freq: 2093, voice: 'square12', vol: 0.07, release: 0.05 });
  },

  /** A ghost cab leans on the horn: a sour two-note honk (the charge is coming). */
  honk(ctx: BaseAudioContext, out: AudioNode, t: number) {
    tone(ctx, out, { t, dur: 0.34, freq: 349, voice: 'square25', vol: 0.09, attack: 0.01, release: 0.06 });
    tone(ctx, out, { t, dur: 0.34, freq: 440, voice: 'square25', vol: 0.08, attack: 0.01, release: 0.06 });
  },

  /** Tyres howl as a cab or bus launches: a falling noise sweep. */
  skid(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.4, vol: 0.16, filter: 'bandpass', freq: 3200, sweepTo: 900, q: 1.4, attack: 0.02 });
    tone(ctx, out, { t, dur: 0.3, freq: 130, slideTo: 90, voice: 'saw', vol: 0.06, release: 0.1 });
  },

  /** Big thunder rolls: a sharp crack then a long rumble. */
  thunder(ctx: BaseAudioContext, out: AudioNode, t: number) {
    noiseHit(ctx, out, { t, dur: 0.14, vol: 0.2, filter: 'highpass', freq: 2500, q: 0.4 });
    noiseHit(ctx, out, { t: t + 0.05, dur: 2.2, vol: 0.34, filter: 'lowpass', freq: 420, sweepTo: 55, attack: 0.08 });
  },
};

export type SfxName = keyof typeof SFX;
