import { hat, kick, midiToHz, snare, tone, type Voice } from './synth';

/**
 * Original chiptune songs, defined as chord progressions + style presets. The
 * melody is generated from a seeded RNG that only lands on chord tones (plus
 * the 2nd/6th) so it always fits the harmony, and the same seed always gives
 * the same tune. Bass, arpeggio and drum patterns come from small templates.
 */

type Quality = 'maj' | 'min';
interface Chord {
  /** Semitones above the song's tonic. */
  root: number;
  q: Quality;
}
type BassStyle = 'gentle' | 'root8' | 'funk' | 'drive';
type DrumStyle = 'none' | 'light' | 'basic' | 'funk' | 'boss';

interface SongDef {
  bpm: number;
  /** MIDI note of the tonic in the bass register. */
  tonic: number;
  chords: Chord[];
  bass: BassStyle;
  drums: DrumStyle;
  arp: 'off' | 'eighth' | 'sixteenth';
  leadVoice: Voice;
  leadVol: number;
  /** Fraction of a note's length that actually sounds (1 = legato, 0.5 = staccato). */
  gate: number;
  /** Rhythm templates (in 16ths, each summing to 16) the melody chooses from. */
  rhythms: number[][];
  /** Optional fixed rhythm per bar, overriding random choice. */
  rhythmPerBar?: number[][];
  restChance: number;
  /** -1..1: tendency for the melody to fall (-) or climb (+). */
  bias: number;
  seed: number;
  loop: boolean;
  vibrato?: number;
}

const T = {
  a: [4, 2, 2, 4, 4],
  b: [2, 2, 4, 2, 2, 4],
  c: [3, 3, 2, 3, 3, 2],
  d: [6, 2, 2, 2, 4],
  e: [2, 2, 2, 2, 4, 2, 2],
  f: [8, 4, 4],
  g: [4, 4, 2, 2, 2, 2],
};

const m = (root: number): Chord => ({ root, q: 'min' });
const M = (root: number): Chord => ({ root, q: 'maj' });

export type SongKey = 'title' | 'nyc' | 'miami' | 'boss' | 'victory' | 'gameover';

const DEFS: Record<SongKey, SongDef> = {
  // "Rain on the Route" — A minor, wistful.
  title: {
    bpm: 104, tonic: 45, chords: [m(0), M(8), M(3), M(10), m(0), M(8), M(10), m(0)],
    bass: 'gentle', drums: 'light', arp: 'eighth', leadVoice: 'square25', leadVol: 0.1, gate: 0.85,
    rhythms: [T.a, T.b, T.c, T.f], restChance: 0.08, bias: 0, seed: 11, loop: true, vibrato: 12,
  },
  // "The Gray Storm" — D minor, driving and tense.
  nyc: {
    bpm: 128, tonic: 50, chords: [m(0), M(8), M(3), M(10), m(0), M(8), m(5), M(7)],
    bass: 'root8', drums: 'basic', arp: 'eighth', leadVoice: 'square50', leadVol: 0.085, gate: 0.6,
    rhythms: [T.b, T.e, T.g, T.d], restChance: 0.12, bias: -0.1, seed: 23, loop: true,
  },
  // "The Amber Heat" — G major, sunny and syncopated.
  miami: {
    bpm: 112, tonic: 43, chords: [M(0), m(9), M(5), M(7), M(0), m(9), m(2), M(7)],
    bass: 'funk', drums: 'funk', arp: 'eighth', leadVoice: 'square25', leadVol: 0.095, gate: 0.7,
    rhythms: [T.c, T.b, T.e, T.a], restChance: 0.14, bias: 0.05, seed: 37, loop: true,
  },
  // Tornado boss — E minor, fast.
  boss: {
    bpm: 156, tonic: 40, chords: [m(0), M(8), M(10), M(7), m(0), M(8), m(5), M(7)],
    bass: 'drive', drums: 'boss', arp: 'sixteenth', leadVoice: 'square25', leadVol: 0.1, gate: 0.65,
    rhythms: [T.e, T.b, T.g], restChance: 0.05, bias: -0.05, seed: 41, loop: true,
  },
  // Fanfare (plays once).
  victory: {
    bpm: 120, tonic: 48, chords: [M(0), M(5), M(7), M(0)],
    bass: 'gentle', drums: 'basic', arp: 'off', leadVoice: 'square50', leadVol: 0.12, gate: 0.9,
    rhythms: [T.a], rhythmPerBar: [[4, 4, 4, 4], [4, 4, 8], [4, 2, 2, 8], [16]],
    restChance: 0, bias: 0.6, seed: 5, loop: false,
  },
  // Slow sad sting (plays once).
  gameover: {
    bpm: 70, tonic: 45, chords: [m(0), M(8), M(7), m(0)],
    bass: 'gentle', drums: 'none', arp: 'off', leadVoice: 'tri', leadVol: 0.16, gate: 1,
    rhythms: [T.f], rhythmPerBar: [[8, 8], [8, 8], [8, 8], [16]],
    restChance: 0, bias: -0.5, seed: 9, loop: false, vibrato: 18,
  },
};

interface Note {
  step: number;
  len: number;
  midi: number;
}
export interface BuiltSong {
  def: SongDef;
  bars: number;
  stepSec: number;
  barSec: number;
  lead: Note[][];
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chordTones(c: Chord): number[] {
  return [c.root, c.root + (c.q === 'min' ? 3 : 4), c.root + 7];
}

const built = new Map<SongKey, BuiltSong>();

export function buildSong(key: SongKey): BuiltSong {
  const cached = built.get(key);
  if (cached) return cached;
  const def = DEFS[key];
  const rand = rng(def.seed);
  const bars = def.chords.length;
  const lo = def.tonic + 17;
  const hi = def.tonic + 34;

  // Rhythm choice repeats every 4 bars so the tune has a recognizable theme.
  const rhythmSeq: number[][] = [];
  for (let b = 0; b < bars; b++) {
    rhythmSeq.push(def.rhythmPerBar?.[b] ?? (b >= 4 ? rhythmSeq[b - 4] : def.rhythms[Math.floor(rand() * def.rhythms.length)]));
  }

  let cur = def.tonic + 24;
  const lead: Note[][] = [];
  for (let b = 0; b < bars; b++) {
    const chord = def.chords[b];
    const tones = chordTones(chord);
    const pool: number[] = [];
    const isTone = new Set<number>();
    for (let midi = lo; midi <= hi; midi++) {
      const pc = (((midi - def.tonic - chord.root) % 12) + 12) % 12;
      const third = chord.q === 'min' ? 3 : 4;
      if ([0, 2, third, 7, 9].includes(pc)) {
        pool.push(midi);
        if (tones.some((t) => (((midi - def.tonic - t) % 12) + 12) % 12 === 0)) isTone.add(midi);
      }
    }

    const notes: Note[] = [];
    let step = 0;
    rhythmSeq[b].forEach((len, i) => {
      let idx: number;
      if (i === 0 || i === Math.floor(rhythmSeq[b].length / 2)) {
        // strong beats land on a chord tone near the current pitch
        const candidates = pool.filter((p) => isTone.has(p));
        idx = pool.indexOf(candidates.reduce((best, p) => (Math.abs(p - cur) < Math.abs(best - cur) ? p : best), candidates[0]));
      } else {
        const here = pool.reduce((best, p, j) => (Math.abs(p - cur) < Math.abs(pool[best] - cur) ? j : best), 0);
        const dir = rand() < 0.5 + def.bias / 2 ? 1 : -1;
        idx = here + dir * (rand() < 0.65 ? 1 : 2);
      }
      idx = Math.max(0, Math.min(pool.length - 1, idx));
      cur = pool[idx];
      const rest = i > 0 && rand() < def.restChance;
      if (!rest) notes.push({ step, len, midi: cur });
      step += len;
    });
    lead.push(notes);
  }

  const song: BuiltSong = { def, bars, stepSec: 60 / def.bpm / 4, barSec: (60 / def.bpm) * 4, lead };
  built.set(key, song);
  return song;
}

const DRUMS: Record<DrumStyle, { kick: number[]; snare: number[]; hat: number[]; open?: number[]; ghost?: number[] }> = {
  none: { kick: [], snare: [], hat: [] },
  light: { kick: [0, 10], snare: [8], hat: [4, 12] },
  basic: { kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  funk: { kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12], open: [14], ghost: [7, 15] },
  boss: { kick: [0, 3, 4, 6, 8, 11, 12, 14], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
};

const BASS: Record<BassStyle, { step: number; semis: number; len: number }[]> = {
  gentle: [{ step: 0, semis: 0, len: 7 }, { step: 8, semis: 7, len: 7 }],
  root8: [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, semis: step === 6 || step === 14 ? 12 : 0, len: 1.6 })),
  funk: [
    { step: 0, semis: 0, len: 2 }, { step: 3, semis: 0, len: 1 }, { step: 6, semis: 7, len: 1 }, { step: 8, semis: 0, len: 2 },
    { step: 10, semis: 12, len: 1 }, { step: 11, semis: 0, len: 1 }, { step: 14, semis: 7, len: 2 },
  ],
  drive: [0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({ step, semis: step === 6 || step === 14 ? 12 : 0, len: 1.5 })),
};

/** Schedules one bar of every channel starting at absolute audio time `t0`. */
export function scheduleBar(ctx: BaseAudioContext, out: AudioNode, song: BuiltSong, bar: number, t0: number) {
  const { def, stepSec } = song;
  const b = bar % song.bars;
  const chord = def.chords[b];
  const at = (step: number) => t0 + step * stepSec;

  for (const n of song.lead[b]) {
    tone(ctx, out, {
      t: at(n.step), dur: n.len * stepSec * def.gate, freq: midiToHz(n.midi), voice: def.leadVoice,
      vol: def.leadVol, vibrato: def.vibrato, release: 0.05,
    });
  }

  for (const n of BASS[def.bass]) {
    tone(ctx, out, {
      t: at(n.step), dur: n.len * stepSec * 0.9, freq: midiToHz(def.tonic + chord.root + n.semis), voice: 'tri',
      vol: 0.2, attack: 0.003, release: 0.03,
    });
  }

  if (def.arp !== 'off') {
    const tones = [...chordTones(chord), chordTones(chord)[0] + 12];
    const order = [0, 1, 2, 3, 2, 1];
    const every = def.arp === 'sixteenth' ? 1 : 2;
    for (let s = 0, i = 0; s < 16; s += every, i++) {
      tone(ctx, out, {
        t: at(s), dur: stepSec * every * 0.7, freq: midiToHz(def.tonic + 12 + tones[order[i % order.length]]),
        voice: 'square12', vol: 0.035, attack: 0.002, release: 0.02,
      });
    }
  }

  const d = DRUMS[def.drums];
  d.kick.forEach((s) => kick(ctx, out, at(s), def.drums === 'boss' ? 0.26 : 0.3));
  d.snare.forEach((s) => snare(ctx, out, at(s), 0.13));
  d.ghost?.forEach((s) => snare(ctx, out, at(s), 0.035));
  d.hat.forEach((s) => hat(ctx, out, at(s), s % 4 === 2 || def.drums === 'light' ? 0.05 : 0.03));
  d.open?.forEach((s) => hat(ctx, out, at(s), 0.05, true));
}

/** Realtime looping player with a lookahead scheduler (robust to timer throttling). */
export class MusicPlayer {
  readonly gain: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBarTime = 0;
  private bar = 0;
  private stopped = false;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private song: BuiltSong,
    private onEnd?: () => void
  ) {
    this.gain = ctx.createGain();
    this.gain.connect(dest);
  }

  start(delaySec = 0.08) {
    this.nextBarTime = this.ctx.currentTime + delaySec;
    this.pump();
    this.timer = setInterval(() => this.pump(), 200);
  }

  private pump() {
    if (this.stopped) return;
    while (this.nextBarTime < this.ctx.currentTime + 1.6) {
      if (!this.song.def.loop && this.bar >= this.song.bars) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        const wait = Math.max(0, this.nextBarTime - this.ctx.currentTime) * 1000 + 300;
        setTimeout(() => !this.stopped && this.onEnd?.(), wait);
        return;
      }
      scheduleBar(this.ctx, this.gain, this.song, this.bar, this.nextBarTime);
      this.bar += 1;
      this.nextBarTime += this.song.barSec;
    }
  }

  stop(fadeSec = 0.4) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
    setTimeout(() => this.gain.disconnect(), fadeSec * 1000 + 1700); // let already-scheduled notes finish silently
  }
}

/** Renders a song to an AudioBuffer offline — used by previews and tests. */
export async function renderSong(key: SongKey, bars?: number, sampleRate = 44100): Promise<AudioBuffer> {
  const song = buildSong(key);
  const n = bars ?? song.bars;
  const ctx = new OfflineAudioContext(1, Math.ceil((n * song.barSec + 1) * sampleRate), sampleRate);
  const bus = ctx.createGain();
  bus.gain.value = 0.55;
  bus.connect(ctx.destination);
  for (let i = 0; i < n; i++) scheduleBar(ctx, bus, song, i, i * song.barSec);
  return ctx.startRendering();
}
