import Phaser from 'phaser';
import { UI } from '../gfx/palette';

export const FONT = '"Press Start 2P", monospace';

/** Standard 8px GBA-style text style. `color` is a CSS string. */
export function textStyle(color = '#383838'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: '8px', color, lineSpacing: 4 };
}

/** Filled rect with its four corner pixels removed — the GBA rounded look. */
function roundedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, w, h - 2);
}

/**
 * Draws a GBA-Pokémon-style text box (white paper, dark border, soft inner
 * ring, 1px drop shadow) at native pixel coordinates.
 */
export function drawWindow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  roundedRect(g, x + 1, y + 1, w, h, 0x000000, 0.3); // shadow
  roundedRect(g, x, y, w, h, UI.border);
  roundedRect(g, x + 1, y + 1, w - 2, h - 2, UI.borderLight);
  roundedRect(g, x + 2, y + 2, w - 4, h - 4, UI.paper);
  return g;
}

/** Small blinking ▶ menu cursor, drawn from pixels so it never depends on font glyphs. */
export function drawCursor(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillStyle(UI.ink, 1);
  g.fillRect(x, y, 1, 7);
  g.fillRect(x + 1, y + 1, 1, 5);
  g.fillRect(x + 2, y + 2, 1, 3);
  g.fillRect(x + 3, y + 3, 1, 1);
}
