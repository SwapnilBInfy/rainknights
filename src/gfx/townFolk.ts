import Phaser from 'phaser';

/** A 16×24 neighbour, the same height as a knight, drawn as a few flat shapes. */
export function generateVillagerTexture(scene: Phaser.Scene, key: string, shirt: number, hair: number) {
  if (scene.textures.exists(key)) return;
  const w = 16;
  const h = 24;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const px = (x: number, y: number, c: number) => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, 1, 1);
  };
  const outline = 0x14121f;
  const skin = 0xf0c8a0;
  const skinShade = 0xd0a078;
  const pants = 0x3a3a58;
  // Hair and head.
  for (let y = 2; y <= 8; y++) for (let x = 4; x <= 11; x++) px(x, y, hair);
  for (let y = 5; y <= 9; y++) for (let x = 5; x <= 10; x++) px(x, y, skin);
  px(6, 7, outline);
  px(9, 7, outline);
  px(7, 9, skinShade);
  px(8, 9, skinShade);
  // Shirt.
  for (let y = 10; y <= 16; y++) for (let x = 4; x <= 11; x++) px(x, y, shirt);
  px(6, 12, 0xf8f8f8);
  px(9, 12, 0xf8f8f8);
  // Arms and legs.
  for (let y = 11; y <= 16; y++) {
    px(3, y, skin);
    px(12, y, skin);
  }
  for (let y = 17; y <= 21; y++) {
    px(5, y, pants);
    px(6, y, pants);
    px(9, y, pants);
    px(10, y, pants);
  }
  px(5, 22, outline);
  px(6, 22, outline);
  px(9, 22, outline);
  px(10, 22, outline);
  // Outline, one pixel around the filled body.
  const snap = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (snap.data[i + 3] !== 0) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (snap.data[(ny * w + nx) * 4 + 3] !== 0) edge = true;
      }
      if (edge) px(x, y, outline);
    }
  }
  tex.refresh();
}

/** A wooden signpost, 16×16: it points the way to the flight pad. */
export function generateSignTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, 16, 16)!;
  const ctx = tex.getContext();
  const px = (x: number, y: number, c: number) => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, 1, 1);
  };
  for (let y = 3; y <= 8; y++) for (let x = 1; x <= 12; x++) px(x, y, 0xc08040);
  for (let x = 1; x <= 12; x++) {
    px(x, 3, 0x14121f);
    px(x, 8, 0x14121f);
  }
  for (let y = 3; y <= 8; y++) {
    px(1, y, 0x14121f);
    px(12, y, 0x14121f);
  }
  px(3, 5, 0xf8f0d0);
  px(4, 5, 0xf8f0d0);
  px(6, 5, 0xf8f0d0);
  px(8, 5, 0xf8f0d0);
  px(9, 5, 0xf8f0d0);
  for (let y = 9; y <= 15; y++) {
    px(6, y, 0x8a5a30);
    px(7, y, 0x6a4018);
  }
  tex.refresh();
}
