import '@fontsource/press-start-2p/latin-400.css';
import type Phaser from 'phaser';
import type { GameScene } from './scenes/GameScene';
import { VIEW } from './config/constants';
import { audio } from './audio/engine';
import { mountTouchControls } from './input/touchControls';
import { attachPauseOverlay } from './ui/PauseOverlay';
import './ui/controls.css';

/** Largest whole-number zoom that fits the window, like a GBA on a screen. */
function fitZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height)));
}

/** Let the browser paint and take input between the heavy startup chunks. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Browsers only allow audio after a user gesture, so unlock on the first input. */
function setupAudioInput() {
  const unlock = () => {
    audio.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(type, unlock, true);
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, unlock, true);
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.repeat) audio.toggleMute();
  });
}

/**
 * Phaser's frame loop is `callback(); requestAnimationFrame(next)`, so one uncaught error in one frame means the next
 * frame is never scheduled: the game loop is dead and the game is frozen for good (the page itself stays responsive).
 * That turns any rare bug into a permanent freeze, so each step is guarded: the error is reported, that frame is
 * skipped, and the game carries on. Anything that is genuinely broken still shows up in the console.
 */
function guardFrameLoop(PhaserLib: typeof Phaser) {
  const proto = PhaserLib.Game.prototype as unknown as { step: (this: Phaser.Game, time: number, delta: number) => void };
  const original = proto.step;
  let failures = 0;
  proto.step = function guardedStep(this: Phaser.Game, time: number, delta: number) {
    try {
      original.call(this, time, delta);
    } catch (error) {
      failures += 1;
      // The first few in full, then occasionally, so a fault that repeats every frame cannot flood the console.
      if (failures <= 5 || failures % 200 === 0) console.error(`Rainknights: a frame threw (${failures} so far); it was skipped and the game carries on.`, error);
      const app = document.getElementById('app');
      if (app) app.dataset.frameErrors = String(failures);
    }
  };
}

function dismissBootSplash() {
  document.getElementById('boot-splash')?.remove();
}

async function start() {
  setupAudioInput();
  // Scenes create text immediately, so the pixel font must be ready first.
  // Download it in parallel with Phaser instead of blocking the import on it.
  const fontReady = document.fonts.load('8px "Press Start 2P"');

  // Phaser is its own chunk. Evaluating it, then the scenes, as separate
  // turns keeps each main-thread task shorter than one combined startup.
  const phaserMod = await import('phaser');
  await yieldToMain();
  const scenes = await import('./scenes/register');
  await fontReady;
  await yieldToMain();

  const PhaserLib = phaserMod.default;
  guardFrameLoop(PhaserLib);
  const game = new PhaserLib.Game({
    type: PhaserLib.AUTO,
    parent: 'app',
    width: VIEW.width,
    height: VIEW.height,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0a0a12',
    // Music and effects are synthesized by src/audio. Phaser's sound manager
    // would open an AudioContext during boot and block the main thread.
    audio: { noAudio: true },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scale: {
      mode: PhaserLib.Scale.NONE,
      zoom: fitZoom(),
    },
    scene: [
      scenes.BootScene,
      scenes.MenuScene,
      scenes.CharacterSelectScene,
      scenes.RegionSelectScene,
      scenes.TownScene,
      scenes.HouseScene,
      scenes.MarketScene,
      scenes.FlightScene,
      scenes.CutsceneScene,
      scenes.GameScene,
      scenes.GameOverScene,
      scenes.OverlayScene,
    ],
  });

  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
  markScenes(game);
  mountTouchControls(game);
  attachPauseOverlay(game);
  installExitSave(game);

  if (import.meta.env.DEV) {
    const [{ renderSong }, { SFX }] = await Promise.all([import('./audio/music'), import('./audio/sfx')]);
    (window as unknown as Record<string, unknown>).__game = game;
    (window as unknown as Record<string, unknown>).__audio = { audio, renderSong, SFX };
  }
}

const MARKED_SCENES = new Set([
  'MenuScene',
  'CharacterSelectScene',
  'RegionSelectScene',
  'FlightScene',
  'CutsceneScene',
  'TownScene',
  'HouseScene',
  'MarketScene',
  'GameScene',
  'GameOverScene',
]);

/** Checkpoints the live run when the tab is hidden or the page is going away. */
function installExitSave(game: Phaser.Game) {
  const flush = () => {
    const scene = game.scene.getScene('GameScene') as GameScene | undefined;
    if (!scene) return;
    if (scene.sys.isActive() || scene.sys.isPaused()) scene.checkpoint();
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
}

/** Lets tests wait for a scene instead of guessing how long a transition takes. */
function markScenes(game: Phaser.Game) {
  const app = document.getElementById('app');
  if (!app) return;
  // Scene.events is not installed until a scene boots, so listen on the game
  // step and read whichever gameplay scene is actually running. A paused
  // GameScene drops out of the active list; leave the last marker in place.
  game.events.on('poststep', () => {
    for (const scene of game.scene.getScenes(true)) {
      const key = scene.sys.settings.key;
      if (MARKED_SCENES.has(key)) {
        app.dataset.scene = key;
        dismissBootSplash();
        return;
      }
    }
  });
}

start();
