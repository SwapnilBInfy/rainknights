import Phaser from 'phaser';
import { cellCenter, type Cell } from '../town/mistford';

const OUTLINE = '.';

/**
 * Interior props, drawn the same way as the villagers: flat GBA pixels with a
 * one-pixel outline. `.` is empty. Other characters are palette keys.
 */
const PALETTE: Record<string, number> = {
  o: 0x14121f,
  w: 0x8a5a30,
  W: 0xc08040,
  d: 0x5a3018,
  p: 0xf8f8f0,
  s: 0xe8d8c8,
  b: 0x3060c0,
  B: 0x68a0e8,
  g: 0xf8d040,
  m: 0x88d8e8,
  h: 0xf8f8f8,
  a: 0xb8c0d0,
  A: 0x6a7088,
  r: 0xc04040,
  n: 0xe8c090,
  k: 0x303038,
};

const BED = [
  'wwwwwwwwwwwwwwwwww',
  'wppppppppppppppppw',
  'wppppppppppppppppw',
  'wssssssssssssssssw',
  'wwwwwwwwwwwwwwwwww',
  'wbbbbbbbbbbbbbbbbw',
  'wbbbbbbbbbbbbbbbbw',
  'wBBBBBBBBBBBBBBBBw',
  'wbbbbbbbbbbbbbbbbw',
  'wbbbbbbbbbbbbbbbbw',
  'wwwwwwwwwwwwwwwwww',
];

const CHEST = [
  'WWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWW',
  'wwwwwwwwwwwwww',
  'wddddddddddddw',
  'wddddddddddddw',
  'wddddggggddddw',
  'wddddgddgddddw',
  'wddddddddddddw',
  'wwwwwwwwwwwwww',
];

const MIRROR = [
  'oooooooooo',
  'omhmmmmmmmo',
  'ommmhmmmmmo',
  'ommmmhmmmo',
  'ommmmmhmmmo',
  'ommmmmmmhmo',
  'ommmmmmmmmo',
  'oooooooooo',
  '    oo    ',
  '   oooo   ',
];

const RACK = [
  '   oooooo   ',
  '  oaabbaao  ',
  '  oaarrrao  ',
  '  oaabbaao  ',
  '   oooooo   ',
  '     oo     ',
  '    oooo    ',
  '   oo  oo   ',
  '  oo    oo  ',
];

const DOOR = [
  'odddddddddo',
  'odddddddddo',
  'odddddddddo',
  'odddddddddo',
  'odddggggddo',
  'odddddddddo',
  'odddddddddo',
  'odddddddddo',
  'odddddddddo',
  'odddddddddo',
  'ooooooooooo',
];

const MAT = [
  'nnnnnnnnnnnn',
  'nwwwwwwwwwwwn',
  'nnnnnnnnnnnn',
];

const SHELF = [
  'WWWWWWWWWWWW',
  'oWooooooooWo',
  'oWoggoooooWo',
  'oWoWWooooWWo',
  'WWWWWWWWWWWW',
  'oWooooooooWo',
  'oWoBBooooWWo',
  'oWooooooooWo',
  'WWWWWWWWWWWW',
];

const COUNTER = [
  'WWWWWWWWWWWWWW',
  'WnnnnnnnnnnnnW',
  'wwwwwwwwwwwwww',
  'wddddddddddddw',
  'wddddddddddddw',
  'oooooooooooooo',
];

function paint(scene: Phaser.Scene, key: string, rows: string[]) {
  if (scene.textures.exists(key)) return;
  const h = rows.length;
  const w = Math.max(...rows.map((row) => row.length));
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === OUTLINE || ch === ' ') continue;
      const color = PALETTE[ch];
      if (color === undefined) continue;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.refresh();
}

export const FURNITURE = {
  bed: 'furn_bed',
  chest: 'furn_chest',
  mirror: 'furn_mirror',
  rack: 'furn_rack',
  door: 'furn_door',
  mat: 'furn_mat',
  shelf: 'furn_shelf',
  counter: 'furn_counter',
} as const;

export function generateFurnitureTextures(scene: Phaser.Scene) {
  paint(scene, FURNITURE.bed, BED);
  paint(scene, FURNITURE.chest, CHEST);
  paint(scene, FURNITURE.mirror, MIRROR);
  paint(scene, FURNITURE.rack, RACK);
  paint(scene, FURNITURE.door, DOOR);
  paint(scene, FURNITURE.mat, MAT);
  paint(scene, FURNITURE.shelf, SHELF);
  paint(scene, FURNITURE.counter, COUNTER);
}

export function placeProp(scene: Phaser.Scene, key: string, cell: Cell, depth = 4) {
  const at = cellCenter(cell);
  scene.add.image(at.x, at.y, key).setDepth(depth);
}

/** A door in the south wall and the mat you step on to leave. */
export function placeExit(scene: Phaser.Scene, door: Cell) {
  const at = cellCenter(door);
  scene.add.image(at.x, at.y + 8, FURNITURE.door).setDepth(2);
  scene.add.image(at.x, at.y - 1, FURNITURE.mat).setDepth(3);
}
