import '@fontsource/press-start-2p/latin-400.css';
import type Phaser from 'phaser';
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
      scenes.GameScene,
      scenes.GameOverScene,
      scenes.OverlayScene,
    ],
  });

  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
  markScenes(game);
  mountTouchControls(game);
  attachPauseOverlay(game);

  if (import.meta.env.DEV) {
    const [{ renderSong }, { SFX }] = await Promise.all([import('./audio/music'), import('./audio/sfx')]);
    (window as unknown as Record<string, unknown>).__game = game;
    (window as unknown as Record<string, unknown>).__audio = { audio, renderSong, SFX };
  }
}

const MARKED_SCENES = new Set(['MenuScene', 'CharacterSelectScene', 'RegionSelectScene', 'GameScene', 'GameOverScene']);

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
