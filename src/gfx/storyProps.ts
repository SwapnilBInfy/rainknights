import Phaser from 'phaser';

export const STORY_TEX = {
  vane: 'story_vane',
  altar: 'story_altar',
  marrow: 'story_marrow',
  quill: 'story_quill',
  statue: 'story_statue',
  pedestal: 'story_pedestal',
  pedestalEmpty: 'story_pedestal_empty',
  plaque: 'story_plaque',
} as const;

const OUTLINE = 0x14121f;

function canvasPainter(scene: Phaser.Scene, key: string, w: number, h: number) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const px = (x: number, y: number, c: number) => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, 1, 1);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c);
  };
  const outline = () => {
    const snap = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (snap.data[(y * w + x) * 4 + 3] !== 0) continue;
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && snap.data[(ny * w + nx) * 4 + 3] !== 0) edge = true;
        }
        if (edge) px(x, y, OUTLINE);
      }
    }
    tex.refresh();
  };
  return { rect, px, outline };
}

/**
 * The weathervane's pole and its stone base. The arrow on top is drawn live (it is frozen until the story is
 * done, and then it spins), so it is not in the texture.
 */
export function generateVaneTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const { rect, px, outline } = canvasPainter(scene, key, 16, 32);
  rect(7, 8, 8, 27, 0x8a94b0); // the pole
  rect(7, 8, 7, 27, 0xc0c8e0);
  rect(3, 26, 12, 31, 0x7a7f92); // the base
  rect(3, 26, 12, 27, 0xa8aec0);
  px(7, 6, 0xf0c848); // a gold knob under the arrow
  px(8, 6, 0xf0c848);
  px(7, 7, 0xf0c848);
  px(8, 7, 0xf0c848);
  outline();
}

/** The Stormglass altar: a stone block with a flat top. The five sockets are drawn live from the story. */
export function generateAltarTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const { rect, outline } = canvasPainter(scene, key, 16, 20);
  rect(1, 12, 14, 19, 0x6a6f84); // the plinth
  rect(1, 12, 14, 13, 0x8e94a8);
  rect(2, 7, 13, 11, 0x9aa0b8); // the slab
  rect(2, 7, 13, 8, 0xc0c6d8);
  rect(2, 14, 3, 19, 0x565a6c);
  outline();
}

/** Sir Aurel in stone: a helmeted knight with his sword planted point-down in front of him. */
export function generateStatueTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const { rect, px, outline } = canvasPainter(scene, key, 16, 26);
  const stone = 0x9096aa;
  const light = 0xc0c6d8;
  const dark = 0x666b80;
  rect(3, 22, 12, 25, dark); // plinth
  rect(3, 22, 12, 22, stone);
  rect(5, 8, 10, 21, stone); // body
  rect(5, 8, 6, 21, light);
  rect(3, 9, 4, 14, stone); // arms
  rect(11, 9, 12, 14, stone);
  rect(5, 2, 10, 8, stone); // the helmet
  rect(5, 2, 6, 8, light);
  rect(6, 5, 9, 5, 0x2c2e3c); // the visor slit
  px(7, 1, light);
  px(8, 0, light);
  px(8, 1, light);
  rect(7, 12, 8, 24, 0xd8dce8); // the sword
  px(7, 11, 0xc8a040);
  px(8, 11, 0xc8a040);
  rect(5, 12, 10, 12, 0xc8a040);
  outline();
}

/** The pedestal in the Undercroft, with the Lantern on it (lit) or without. */
export function generatePedestalTexture(scene: Phaser.Scene, key: string, withLantern: boolean) {
  if (scene.textures.exists(key)) return;
  const { rect, px, outline } = canvasPainter(scene, key, 16, 24);
  rect(2, 20, 13, 23, 0x666b80);
  rect(2, 20, 13, 20, 0x9096aa);
  rect(4, 10, 11, 19, 0x7e849a);
  rect(4, 10, 5, 19, 0xa6acc0);
  rect(3, 8, 12, 10, 0x9096aa);
  rect(3, 8, 12, 8, 0xc0c6d8);
  if (withLantern) {
    // the Lantern: a small gold cage round a flame
    rect(6, 1, 9, 7, 0xc8a040);
    rect(7, 2, 8, 6, 0xfff2a0);
    rect(7, 3, 8, 4, 0xffffff);
    rect(5, 0, 10, 0, 0xa07820);
    px(7, -1 + 1, 0xa07820);
  }
  outline();
}

/** A stone plaque on a short post: the first Rain Knights' words. */
export function generatePlaqueTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const { rect, outline } = canvasPainter(scene, key, 14, 18);
  rect(6, 10, 7, 17, 0x666b80);
  rect(1, 1, 12, 10, 0x9aa0b8);
  rect(1, 1, 12, 2, 0xc0c6d8);
  for (let y = 4; y <= 8; y += 2) rect(3, y, 10, y, 0x5a5f74); // lines of carved text
  outline();
}
