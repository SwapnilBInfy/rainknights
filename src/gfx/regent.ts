import Phaser from 'phaser';

/**
 * The Tempest Regent: Sir Aurel, the first Rain Knight, hooded in storm, a crown of lightning above a face that is
 * only two yellow eyes, one shoulder of old silver armour, and a sword that crackles. 20x24, drawn as a few flat
 * shapes with a one-pixel outline (the enemy is scaled up in the stats).
 */
export function generateRegentTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const w = 20;
  const h = 24;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const px = (x: number, y: number, c: number) => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, 1, 1);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c);
  };
  const cloak = 0x2a2450;
  const cloakMid = 0x453a7a;
  const cloakLight = 0x6a58b0;
  const silver = 0xb8c0d8;
  const bolt = 0xfff8a0;

  // the cloak, wide at the hem
  for (let y = 9; y <= 22; y++) {
    const spread = Math.round(((y - 9) / 13) * 4);
    rect(5 - spread, y, 14 + spread, y, y % 4 === 0 ? cloakMid : cloak);
  }
  for (let x = 1; x <= 18; x += 2) px(x, 22, cloakMid); // a ragged hem
  rect(8, 12, 8, 21, cloakMid); // a fold
  rect(12, 14, 12, 21, cloakLight);
  // the hood and the face in it
  rect(5, 3, 14, 11, cloakMid);
  rect(6, 2, 13, 3, cloakMid);
  rect(5, 3, 6, 10, cloakLight);
  rect(7, 5, 12, 9, 0x0a0818);
  rect(8, 7, 9, 7, 0xfff06a); // the eyes
  rect(11, 7, 12, 7, 0xfff06a);
  // a shoulder of old armour
  rect(3, 9, 7, 11, silver);
  rect(3, 9, 7, 9, 0xe8eef8);
  // the crown of lightning
  for (const [x, y] of [[6, 0], [7, 1], [6, 1], [9, 0], [10, 1], [10, 2], [13, 0], [12, 1], [13, 1]] as const) px(x, y, bolt);
  px(9, 1, bolt);
  // the sword, held out to the side
  rect(17, 8, 17, 19, silver);
  rect(18, 6, 18, 12, bolt);
  rect(16, 14, 18, 14, 0xc07800);
  px(18, 20, 0xc07800);

  // a one-pixel outline round the whole figure
  const snap = ctx.getImageData(0, 0, w, h);
  const outline = 0x14121f;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (snap.data[(y * w + x) * 4 + 3] !== 0) continue;
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
