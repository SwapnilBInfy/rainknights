import Phaser from 'phaser';

export const STORY_TEX = { vane: 'story_vane', altar: 'story_altar', marrow: 'story_marrow', quill: 'story_quill' } as const;

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
