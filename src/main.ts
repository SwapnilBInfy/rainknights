import '@fontsource/press-start-2p/400.css';
import Phaser from 'phaser';
import { VIEW } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { RegionSelectScene } from './scenes/RegionSelectScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { OverlayScene } from './scenes/OverlayScene';
import { audio } from './audio/engine';
import { renderSong } from './audio/music';
import { SFX } from './audio/sfx';
import { mountTouchControls } from './input/touchControls';
import { attachPauseOverlay } from './ui/PauseOverlay';
import './ui/controls.css';

/** Largest whole-number zoom that fits the window, like a GBA on a screen. */
function fitZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height)));
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

async function start() {
  setupAudioInput();
  // Scenes create text immediately, so the pixel font must be ready first.
  await document.fonts.load('8px "Press Start 2P"');

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: VIEW.width,
    height: VIEW.height,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0a0a12',
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: fitZoom(),
    },
    scene: [BootScene, MenuScene, CharacterSelectScene, RegionSelectScene, GameScene, GameOverScene, OverlayScene],
  });

  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
  markScenes(game);
  mountTouchControls(game);
  attachPauseOverlay(game);

  if (import.meta.env.DEV) {
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
        return;
      }
    }
  });
}

start();
