import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

/**
 * Music and effects are synthesized in src/audio. Phaser's own sound manager
 * is optional. This fails if that manager is a no-audio stub, or if the synth
 * stays silent after a real input when the player is not muted.
 *
 * The menu checks listen to the live bus. They do not call individual voices,
 * so a later test renders the current voice table (including the status-effect
 * sounds added after this guard was first written) and the title chiptune.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Status-effect voices from the hazards work. Later combat voices are covered by rendering every key. */
const STATUS_VOICES = ['warn', 'strike', 'zap', 'burn', 'freeze', 'shatter', 'steam', 'gust'] as const;
interface ProbeLevel {
  contexts: number;
  state: string | null;
  peak: number;
  kind: 'absent' | 'webaudio' | 'no-audio';
}

test('synth starts after the first input and mute still persists', async ({ page }) => {
  const errors = collectErrors(page);
  await installAudioProbe(page);

  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');

  const idle = await readProbe(page);
  expect(idle.contexts, 'no AudioContext before the first gesture').toBe(0);
  expect(idle.kind, 'Phaser must not install a NoAudio sound manager').not.toBe('no-audio');

  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readProbe(page)).peak, { timeout: 4_000 }).toBeGreaterThan(0.02);
  const playing = await readProbe(page);
  expect(playing.contexts).toBeGreaterThan(0);
  expect(playing.state, 'synth context should be running after the first input').toBe('running');
  expect(playing.kind, 'Phaser must not fall back to a NoAudio sound manager').not.toBe('no-audio');

  await page.keyboard.press('KeyM');
  await expect.poll(async () => (await readProbe(page)).peak, { timeout: 3_000 }).toBeLessThan(0.01);
  expect(await mutedFlag(page)).toBe(true);

  await page.reload();
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readProbe(page)).peak, { timeout: 3_000 }).toBeLessThan(0.01);
  expect(await mutedFlag(page)).toBe(true);

  await page.keyboard.press('KeyM');
  await expect.poll(async () => (await readProbe(page)).peak, { timeout: 4_000 }).toBeGreaterThan(0.02);
  expect(await mutedFlag(page)).toBe(false);

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a legacy mute flag stays silent without becoming the default', async ({ page }) => {
  const errors = collectErrors(page);
  await installAudioProbe(page, '1');

  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readProbe(page)).state, { timeout: 4_000 }).toBe('running');
  // Title music is audible by now when mute is off. A muted legacy save must still be quiet.
  await page.waitForTimeout(800);
  const level = await readProbe(page);
  expect(level.kind).not.toBe('no-audio');
  expect(level.peak, 'legacy rainknights:muted=1 should stay muted').toBeLessThan(0.01);
  expect(await mutedFlag(page)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('rainknights:muted'))).toBeNull();

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('every current synth voice, including status effects, still makes a sound', async ({ page }) => {
  const sfx = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [path.join(ROOT, 'src/audio/sfx.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'RKSfx',
    platform: 'browser',
  });
  const music = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [path.join(ROOT, 'src/audio/music.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'RKMusic',
    platform: 'browser',
  });
  await page.setContent('<!doctype html><title>sfx</title>');
  await page.addScriptTag({ content: sfx.outputFiles[0].text });
  await page.addScriptTag({ content: music.outputFiles[0].text });

  const rendered = await page.evaluate(async () => {
    const w = window as unknown as {
      RKSfx: { SFX: Record<string, (ctx: BaseAudioContext, out: AudioNode, t: number, arg?: string | number) => void> };
      RKMusic: { renderSong: (key: string, bars: number, sampleRate: number) => Promise<AudioBuffer> };
    };
    const voices: Record<string, number> = {};
    for (const name of Object.keys(w.RKSfx.SFX)) {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const dest = ctx.createGain();
      dest.connect(ctx.destination);
      const fn = w.RKSfx.SFX[name];
      if (name === 'swing' || name === 'beam') fn(ctx, dest, 0.02, 'sword');
      else if (name === 'gem') fn(ctx, dest, 0.02, 3);
      else fn(ctx, dest, 0.02);
      const data = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      voices[name] = peak;
    }
    const song = (await w.RKMusic.renderSong('title', 1, 22050)).getChannelData(0);
    let songPeak = 0;
    for (let i = 0; i < song.length; i++) songPeak = Math.max(songPeak, Math.abs(song[i]));
    return { voices, songPeak };
  });

  for (const name of STATUS_VOICES) {
    expect(rendered.voices, `missing status voice ${name}`).toHaveProperty(name);
    expect(rendered.voices[name], `status voice ${name}`).toBeGreaterThan(0.02);
  }
  for (const [name, peak] of Object.entries(rendered.voices)) {
    expect(peak, name).toBeGreaterThan(0.02);
  }
  expect(rendered.songPeak, 'title chiptune').toBeGreaterThan(0.05);
});

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function mutedFlag(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('rainknights:save');
    if (!raw) return false;
    return JSON.parse(raw).settings.muted === true;
  });
}

async function readProbe(page: Page): Promise<ProbeLevel> {
  return page.evaluate(() => {
    const probe = window as Window & {
      __rkContexts?: AudioContext[];
      __rkAnalyser?: AnalyserNode;
      __rkSoundKind?: 'absent' | 'webaudio' | 'no-audio';
    };
    const analyser = probe.__rkAnalyser;
    let peak = 0;
    if (analyser) {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    }
    const ctx = probe.__rkContexts?.[0];
    return {
      contexts: probe.__rkContexts?.length ?? 0,
      state: ctx ? ctx.state : null,
      peak,
      kind: probe.__rkSoundKind ?? 'absent',
    };
  });
}

async function installAudioProbe(page: Page, legacyMuted?: '0' | '1') {
  await page.addInitScript((legacy: '0' | '1' | null) => {
    if (legacy) localStorage.setItem('rainknights:muted', legacy);

    const Original = window.AudioContext;
    window.AudioContext = function PatchedAudioContext(this: AudioContext, ...args: ConstructorParameters<typeof AudioContext>) {
      const ctx = new Original(...args);
      const contexts = ((window as Window & { __rkContexts?: AudioContext[] }).__rkContexts ??= []);
      contexts.push(ctx);
      if (!(AudioNode.prototype as AudioNode & { __rkTap?: boolean }).__rkTap) {
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (this: AudioNode, target: AudioNode, ...rest: number[]) {
          const result = connect.call(this, target, ...rest);
          if (target === ctx.destination && !(window as Window & { __rkAnalyser?: AnalyserNode }).__rkAnalyser) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            (window as Window & { __rkAnalyser?: AnalyserNode }).__rkAnalyser = analyser;
            try {
              connect.call(this, analyser);
            } catch {
              /* tap is best-effort */
            }
          }
          return result;
        } as AudioNode['connect'];
        (AudioNode.prototype as AudioNode & { __rkTap?: boolean }).__rkTap = true;
      }
      return ctx;
    } as unknown as typeof AudioContext;
    window.AudioContext.prototype = Original.prototype;

    let phaserValue: { Game?: new (...args: unknown[]) => { sound: { context?: AudioContext } | null } } | undefined;
    Object.defineProperty(window, 'Phaser', {
      configurable: true,
      get: () => phaserValue,
      set: (value) => {
        phaserValue = value;
        const OrigGame = value?.Game;
        if (!OrigGame || (OrigGame as { __rkWrapped?: boolean }).__rkWrapped) return;
        const Wrapped = function (this: unknown, ...args: unknown[]) {
          const game = new OrigGame(...args);
          const sound = game.sound;
          const webAudio = !!sound && !!sound.context && typeof sound.context.createGain === 'function';
          (window as Window & { __rkSoundKind?: string }).__rkSoundKind = !sound ? 'absent' : webAudio ? 'webaudio' : 'no-audio';
          return game;
        };
        Wrapped.prototype = OrigGame.prototype;
        (Wrapped as { __rkWrapped?: boolean }).__rkWrapped = true;
        value.Game = Wrapped as unknown as typeof OrigGame;
      },
    });
  }, legacyMuted ?? null);
}
