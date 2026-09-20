import '@fontsource/press-start-2p/400.css';
import Phaser from 'phaser';
import { VIEW } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { RegionSelectScene } from './scenes/RegionSelectScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

/** Largest whole-number zoom that fits the window, like a GBA on a screen. */
function fitZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height)));
}

async function start() {
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
    scene: [BootScene, MenuScene, CharacterSelectScene, RegionSelectScene, GameScene, GameOverScene],
  });

  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));

  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
  }
}

start();
