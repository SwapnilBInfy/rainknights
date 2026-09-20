/**
 * Tiny WebAudio chiptune synth: pulse/triangle/saw voices plus noise-based
 * percussion. Everything takes an explicit context + destination node, so the
 * exact same code plays live and renders offline (for previews/tests).
 */

export type Voice = 'square12' | 'square25' | 'square50' | 'tri' | 'saw' | 'sine';

const pulseWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Band-limited pulse wave with the given duty cycle (0.125 = the classic thin GBA lead). */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let cache = pulseWaves.get(ctx);
  if (!cache) pulseWaves.set(ctx, (cache = new Map()));
  let wave = cache.get(duty);
  if (!wave) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    wave = ctx.createPeriodicWave(real, imag);
    cache.set(duty, wave);
  }
  return wave;
}

export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

export interface ToneOptions {
  t: number;
  dur: number;
  freq: number;
  voice?: Voice;
  vol?: number;
  attack?: number;
  release?: number;
  /** Glide to this frequency over the note (laser zaps, falling blips). */
  slideTo?: number;
  /** Vibrato depth in cents, for long lead notes. */
  vibrato?: number;
}

export function tone(ctx: BaseAudioContext, out: AudioNode, o: ToneOptions) {
  const { t, dur, freq } = o;
  const vol = o.vol ?? 0.2;
  const attack = o.attack ?? 0.004;
  const release = o.release ?? 0.03;
  const voice = o.voice ?? 'square50';

  const osc = ctx.createOscillator();
  if (voice === 'square12') osc.setPeriodicWave(pulseWave(ctx, 0.125));
  else if (voice === 'square25') osc.setPeriodicWave(pulseWave(ctx, 0.25));
  else if (voice === 'square50') osc.setPeriodicWave(pulseWave(ctx, 0.5));
  else osc.type = voice === 'tri' ? 'triangle' : voice === 'saw' ? 'sawtooth' : 'sine';

  osc.frequency.setValueAtTime(freq, t);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur);

  if (o.vibrato && dur > 0.25) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(o.vibrato, t + Math.min(0.2, dur * 0.6));
    lfo.connect(depth).connect(osc.detune);
    lfo.start(t);
    lfo.stop(t + dur + release + 0.05);
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + attack);
  env.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - 0.01));
  env.gain.linearRampToValueAtTime(0, t + dur + release);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + release + 0.05);
}

export interface NoiseOptions {
  t: number;
  dur: number;
  vol?: number;
  filter?: 'lowpass' | 'highpass' | 'bandpass';
  freq?: number;
  q?: number;
  /** Sweep the filter to this frequency over the burst. */
  sweepTo?: number;
  attack?: number;
}

export function noiseHit(ctx: BaseAudioContext, out: AudioNode, o: NoiseOptions) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(o.freq ?? 4000, o.t);
  filter.Q.value = o.q ?? 0.8;
  if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweepTo), o.t + o.dur);
  const env = ctx.createGain();
  const attack = o.attack ?? 0.002;
  env.gain.setValueAtTime(0, o.t);
  env.gain.linearRampToValueAtTime(o.vol ?? 0.2, o.t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  src.connect(filter).connect(env).connect(out);
  src.start(o.t, Math.random() * 1.5);
  src.stop(o.t + o.dur + 0.05);
}

export function kick(ctx: BaseAudioContext, out: AudioNode, t: number, vol = 0.3) {
  tone(ctx, out, { t, dur: 0.12, freq: 150, slideTo: 42, voice: 'sine', vol, attack: 0.001, release: 0.02 });
}

export function snare(ctx: BaseAudioContext, out: AudioNode, t: number, vol = 0.14) {
  noiseHit(ctx, out, { t, dur: 0.13, vol, filter: 'highpass', freq: 1800, q: 0.6 });
  tone(ctx, out, { t, dur: 0.07, freq: 220, slideTo: 130, voice: 'tri', vol: vol * 0.9, attack: 0.001, release: 0.01 });
}

export function hat(ctx: BaseAudioContext, out: AudioNode, t: number, vol = 0.05, open = false) {
  noiseHit(ctx, out, { t, dur: open ? 0.14 : 0.04, vol, filter: 'highpass', freq: 7000, q: 0.5 });
}
