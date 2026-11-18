import type Phaser from 'phaser';

/**
 * Pixel-perfect shapes for Graphics. Phaser's own circle drawing is smooth,
 * which would break the GBA look, so these fill whole pixel rows instead.
 */

export function fillPixelCircle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha = 1) {
  const x = Math.round(cx);
  const y = Math.round(cy);
  g.fillStyle(color, alpha);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy + 0.25));
    g.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
}

export function ringPixelCircle(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  color: number,
  alpha = 1
) {
  const x = Math.round(cx);
  const y = Math.round(cy);
  const ri = r - thickness;
  g.fillStyle(color, alpha);
  for (let dy = -r; dy <= r; dy++) {
    const outer = Math.floor(Math.sqrt(r * r - dy * dy + 0.25));
    if (Math.abs(dy) >= ri) {
      g.fillRect(x - outer, y + dy, outer * 2 + 1, 1);
      continue;
    }
    const inner = Math.floor(Math.sqrt(ri * ri - dy * dy));
    const w = outer - inner;
    if (w <= 0) continue;
    g.fillRect(x - outer, y + dy, w, 1);
    g.fillRect(x + inner + 1, y + dy, w, 1);
  }
}

export type Cardinal = 'left' | 'right' | 'up' | 'down';

/** A bold pixel chevron pointing in a cardinal direction. */
export function drawChevron(g: Phaser.GameObjects.Graphics, cx: number, cy: number, dir: Cardinal, size: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  for (let i = 0; i <= size; i++) {
    const back = i - size; // 0 at the tip, negative behind it
    for (let t = 0; t < 2; t++) {
      const o = back - t;
      switch (dir) {
        case 'right':
          g.fillRect(cx + o, cy + i - size, 2, 1);
          g.fillRect(cx + o, cy - i + size, 2, 1);
          break;
        case 'left':
          g.fillRect(cx - o - 1, cy + i - size, 2, 1);
          g.fillRect(cx - o - 1, cy - i + size, 2, 1);
          break;
        case 'down':
          g.fillRect(cx + i - size, cy + o, 1, 2);
          g.fillRect(cx - i + size, cy + o, 1, 2);
          break;
        case 'up':
          g.fillRect(cx + i - size, cy - o - 1, 1, 2);
          g.fillRect(cx - i + size, cy - o - 1, 1, 2);
          break;
      }
    }
  }
}
