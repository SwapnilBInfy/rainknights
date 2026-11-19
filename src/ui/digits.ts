import Phaser from 'phaser';

/**
 * 3×5 pixel digits. Press Start 2P's "8" collapses into an S at 8px, so the
 * drips counter (and menu prices) are drawn as pixels instead.
 * An 8 is closed on both sides; an S would be open on alternate sides.
 */
export const DIGIT_GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

const ADVANCE = 4;

export function digitWidth(value: string): number {
  if (!value) return 0;
  return value.length * ADVANCE - 1;
}

/** Draw `value` in 1px blocks. Unknown characters leave a gap. Returns the right edge. */
export function drawDigits(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  value: string,
  color: number
): number {
  let cx = x;
  g.fillStyle(color, 1);
  for (const ch of value) {
    const rows = DIGIT_GLYPHS[ch];
    if (rows) {
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '1') g.fillRect(cx + rx, y + ry, 1, 1);
        }
      });
    }
    cx += ADVANCE;
  }
  return cx - 1;
}
