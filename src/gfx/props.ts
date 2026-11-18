import Phaser from 'phaser';
import { OUTLINE } from './palette';

function rect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

/** A straw-and-sackcloth training dummy on a post: 16 x 24. */
export function generateTrainingDummyTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  const TAN = 0xd8b070;
  const TAN_HI = 0xf0d890;
  const TAN_SH = 0xa07840;
  const WOOD = 0x805030;
  const WOOD_SH = 0x503020;
  const RED = 0xd03028;

  // base plate and post
  rect(g, 3, 21, 10, 3, OUTLINE);
  rect(g, 4, 21, 8, 2, WOOD_SH);
  rect(g, 6, 12, 4, 10, OUTLINE);
  rect(g, 7, 12, 2, 9, WOOD);

  // arms with straw bundles
  rect(g, 0, 9, 16, 4, OUTLINE);
  rect(g, 1, 10, 14, 2, WOOD);
  rect(g, 0, 7, 4, 7, OUTLINE);
  rect(g, 1, 8, 2, 5, TAN);
  rect(g, 12, 7, 4, 7, OUTLINE);
  rect(g, 13, 8, 2, 5, TAN);

  // sack body with a bullseye
  rect(g, 3, 8, 10, 11, OUTLINE);
  rect(g, 4, 9, 8, 9, TAN);
  rect(g, 4, 9, 8, 1, TAN_HI);
  rect(g, 4, 17, 8, 1, TAN_SH);
  rect(g, 6, 11, 4, 4, RED);
  rect(g, 7, 12, 2, 2, 0xffffff);
  rect(g, 4, 15, 8, 1, WOOD); // rope belt

  // head
  rect(g, 4, 0, 8, 9, OUTLINE);
  rect(g, 5, 1, 6, 7, TAN);
  rect(g, 5, 1, 6, 1, TAN_HI);
  rect(g, 6, 3, 1, 1, OUTLINE); // stitched eyes
  rect(g, 9, 3, 1, 1, OUTLINE);
  rect(g, 7, 5, 2, 1, OUTLINE); // stitched mouth
  rect(g, 6, 8, 4, 1, WOOD); // knot at the neck

  g.generateTexture(key, 16, 24);
  g.destroy();
}
