import Phaser from 'phaser';
import { OUTLINE } from './palette';

/**
 * Top-down ghost vehicles, drawn pixel by pixel. Both face RIGHT at rotation 0;
 * the enemies rotate them to their heading.
 */

const GHOST = 0x9ff0e0; // spectral teal trail
const GLASS = 0x6ad8f0;
const GLASS_HI = 0xd8fbff;
const TIRE = 0x1c1c26;
const LAMP = 0xfffbc0;
const TAIL = 0xe04038;

function rect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, h);
}

/** Ghost taxi: 26 x 14. A checkered-stripe cab with a lit roof sign and a wispy tail. */
export function generateCabWraithTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  const Y = 0xf8c820;
  const Y_HI = 0xfff080;
  const Y_SH = 0xc09010;

  // wisps trailing off the back
  rect(g, 0, 5, 3, 1, GHOST, 0.5);
  rect(g, 0, 8, 3, 1, GHOST, 0.5);
  rect(g, 1, 6, 2, 2, GHOST, 0.75);

  // wheels peek out past the body
  for (const x of [6, 18]) {
    rect(g, x, 1, 5, 2, TIRE);
    rect(g, x, 11, 5, 2, TIRE);
  }

  // body: outline, fill, shading
  rect(g, 3, 2, 22, 10, OUTLINE);
  rect(g, 4, 3, 20, 8, Y);
  rect(g, 4, 3, 20, 1, Y_HI);
  rect(g, 4, 10, 20, 1, Y_SH);
  rect(g, 22, 4, 2, 6, Y_SH); // hood crease
  // checkered stripe down both flanks
  for (let x = 5; x < 22; x += 2) {
    const dark = ((x - 5) / 2) % 2 === 0;
    rect(g, x, 4, 2, 1, dark ? OUTLINE : 0xffffff);
    rect(g, x, 9, 2, 1, dark ? 0xffffff : OUTLINE);
  }
  // cabin: rear window, roof with a lit TAXI box, windshield
  rect(g, 7, 5, 2, 4, GLASS);
  rect(g, 9, 5, 7, 4, Y_SH);
  rect(g, 10, 6, 5, 2, 0xffffff);
  rect(g, 11, 6, 3, 2, 0xffe860);
  rect(g, 16, 5, 3, 4, GLASS);
  rect(g, 16, 5, 1, 4, GLASS_HI);
  // lamps
  rect(g, 24, 4, 2, 2, LAMP);
  rect(g, 24, 8, 2, 2, LAMP);
  rect(g, 3, 4, 1, 2, TAIL);
  rect(g, 3, 8, 1, 2, TAIL);
  // glowing eyes: it is not an ordinary cab
  rect(g, 17, 6, 1, 1, 0xff4060);
  rect(g, 17, 7, 1, 1, 0xff4060);

  g.generateTexture(key, 26, 14);
  g.destroy();
}

/** Phantom bus: 44 x 18. A long city bus with a row of windows and a haunted green glow. */
export function generatePhantomBusTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  const BODY = 0x3a78c8;
  const BODY_HI = 0x78b0f0;
  const BODY_SH = 0x1c4888;
  const STRIPE = 0xeaf2fa;
  const EYE = 0xa8ff60;

  // spectral smoke off the back
  rect(g, 0, 5, 4, 2, GHOST, 0.45);
  rect(g, 0, 11, 4, 2, GHOST, 0.45);
  rect(g, 1, 7, 3, 4, GHOST, 0.7);

  // wheels
  for (const x of [9, 30]) {
    rect(g, x, 1, 6, 2, TIRE);
    rect(g, x, 15, 6, 2, TIRE);
  }

  // body
  rect(g, 4, 2, 38, 14, OUTLINE);
  rect(g, 5, 3, 36, 12, BODY);
  rect(g, 5, 3, 36, 2, BODY_HI);
  rect(g, 5, 14, 36, 1, BODY_SH);
  rect(g, 40, 4, 1, 10, BODY_SH);

  // a roof stripe and rows of windows along both sides
  rect(g, 6, 8, 33, 2, STRIPE);
  for (let x = 7; x < 33; x += 6) {
    rect(g, x, 5, 5, 3, GLASS);
    rect(g, x, 5, 5, 1, GLASS_HI);
    rect(g, x, 10, 5, 3, GLASS);
    rect(g, x, 12, 5, 1, GLASS_HI);
  }
  // roof vents
  rect(g, 14, 8, 3, 2, BODY_SH);
  rect(g, 25, 8, 3, 2, BODY_SH);

  // cab: windshield, lamps, glowing eyes
  rect(g, 34, 5, 5, 8, GLASS);
  rect(g, 34, 5, 1, 8, GLASS_HI);
  rect(g, 41, 4, 2, 3, LAMP);
  rect(g, 41, 11, 2, 3, LAMP);
  rect(g, 36, 7, 2, 2, EYE);
  rect(g, 36, 10, 2, 2, EYE);
  rect(g, 4, 5, 1, 3, TAIL);
  rect(g, 4, 10, 1, 3, TAIL);

  g.generateTexture(key, 44, 18);
  g.destroy();
}
