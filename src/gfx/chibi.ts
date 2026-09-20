import Phaser from 'phaser';

/**
 * Procedural GBA-Pokémon-style overworld knights: 16x24 chibi sprites drawn
 * from layered parts (helm, torso, arms, legs) onto a pixel grid, then given
 * an automatic 1px outline. Every direction/frame is generated from the same
 * code, so the four facings can never disagree the way AI-drawn poses did.
 * "Left" is just "side" flipped by the game, like the real games.
 */

export const CHIBI_W = 16;
export const CHIBI_H = 24;

export type Facing = 'down' | 'up' | 'side';
export type ChibiFrame = 'stand' | 'stepA' | 'stepB' | 'attack';
export const FACINGS: Facing[] = ['down', 'up', 'side'];
export const FRAMES: ChibiFrame[] = ['stand', 'stepA', 'stepB', 'attack'];

type Tones = [dark: number, mid: number, light: number];
export type WeaponType = 'sword' | 'hammer' | 'daggers';

export interface KnightStyle {
  armor: Tones;
  helm: Tones;
  trim: number;
  visor: number;
  weapon: WeaponType;
  /** -1 slim, 0 normal, 1 bulky (wider torso, bigger pauldrons). */
  bulk: -1 | 0 | 1;
  plume?: boolean;
  cape?: boolean;
  scarf?: boolean;
}

export function chibiKey(id: string, facing: Facing, frame: ChibiFrame): string {
  return `knight_${id}_${facing}_${frame}`;
}

const OUTLINE = 0x202030;
const GLINT = 0xf8f8f8;

type Grid = (number | null)[][];

function newGrid(): Grid {
  return Array.from({ length: CHIBI_H }, () => Array<number | null>(CHIBI_W).fill(null));
}

function px(g: Grid, x: number, y: number, c: number) {
  if (x >= 0 && x < CHIBI_W && y >= 0 && y < CHIBI_H) g[y][x] = c;
}

function rect(g: Grid, x: number, y: number, w: number, h: number, c: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(g, xx, yy, c);
}

/** Mid fill with a light top/left edge and dark bottom/right edge. */
function shaded(g: Grid, x: number, y: number, w: number, h: number, [dark, mid, light]: Tones) {
  rect(g, x, y, w, h, mid);
  if (w > 2 && h > 2) {
    rect(g, x, y, w - 1, 1, light);
    rect(g, x, y, 1, h - 1, light);
    rect(g, x, y + h - 1, w, 1, dark);
    rect(g, x + w - 1, y, 1, h, dark);
  } else {
    rect(g, x, y + h - 1, w, 1, dark);
  }
}

function drawHelm(g: Grid, s: KnightStyle, facing: Facing) {
  const t = s.helm;
  if (facing === 'side') {
    if (s.plume) {
      rect(g, 3, 0, 4, 1, s.trim);
      rect(g, 5, 1, 2, 1, s.trim);
    }
    rect(g, 5, 1, 6, 1, t[1]);
    rect(g, 4, 2, 8, 6, t[1]);
    rect(g, 5, 8, 6, 1, t[0]);
    rect(g, 5, 1, 5, 1, t[2]);
    rect(g, 4, 2, 1, 5, t[2]);
    rect(g, 11, 2, 1, 6, t[0]);
    rect(g, 9, 5, 3, 2, s.visor);
    px(g, 10, 5, GLINT);
    return;
  }
  if (s.plume) {
    rect(g, 7, 0, 2, 2, s.trim);
    if (facing === 'up') rect(g, 7, 2, 2, 3, s.trim);
  }
  rect(g, 5, 1, 6, 1, t[2]);
  rect(g, 4, 2, 8, 1, t[1]);
  rect(g, 3, 3, 10, 5, t[1]);
  rect(g, 4, 8, 8, 1, t[0]);
  rect(g, 3, 3, 1, 4, t[2]);
  rect(g, 12, 3, 1, 5, t[0]);
  rect(g, 4, 2, 4, 1, t[2]);
  if (facing === 'down') {
    rect(g, 5, 5, 6, 2, s.visor);
    px(g, 6, 5, GLINT);
    px(g, 9, 5, GLINT);
  } else {
    rect(g, 7, 3, 2, 5, t[2]); // back ridge
  }
}

function legs(g: Grid, s: KnightStyle, facing: Facing, frame: ChibiFrame) {
  const boot = s.armor[0];
  const a = s.armor;
  if (facing === 'side') {
    const [backX, frontX] = [4, 9];
    const stand = frame === 'stand';
    const spread = frame === 'attack';
    const l1 = { x: stand ? 6 : spread ? 4 : frame === 'stepA' ? backX : frontX, bottom: 21 };
    const l2 = { x: stand ? 8 : spread ? 10 : frame === 'stepA' ? frontX : backX, bottom: stand || spread ? 21 : 20 };
    for (const l of [l1, l2]) {
      rect(g, l.x, 16, 2, l.bottom - 15, a[1]);
      rect(g, l.x, l.bottom - 1, 3, 2, boot);
      rect(g, l.x, 16, 1, l.bottom - 17, a[2]);
    }
    return;
  }
  const spread = frame === 'attack' ? 1 : 0;
  const lb = frame === 'stepA' ? 20 : frame === 'stepB' ? 22 : 21;
  const rb = frame === 'stepA' ? 22 : frame === 'stepB' ? 20 : 21;
  const lx = 5 - spread;
  const rx = 9 + spread;
  rect(g, lx, 16, 2, lb - 15, a[1]);
  rect(g, rx, 16, 2, rb - 15, a[1]);
  rect(g, lx, lb - 1, 2, 2, boot);
  rect(g, rx, rb - 1, 2, 2, boot);
  rect(g, lx, 16, 1, lb - 17, a[2]);
  rect(g, rx, 16, 1, rb - 17, a[2]);
}

function body(g: Grid, s: KnightStyle, facing: Facing, frame: ChibiFrame) {
  const a = s.armor;
  const swing = frame === 'stepA' ? 1 : frame === 'stepB' ? -1 : 0;

  if (facing === 'side') {
    if (s.cape) {
      rect(g, 2, 9, 4, 8, s.trim);
      rect(g, 2, 16, 2, 1, s.trim);
      rect(g, 2, 9, 1, 8, OUTLINE);
    }
    shaded(g, 5, 9, 6, 7, a);
    rect(g, 5, 14, 6, 1, s.trim);
    if (s.scarf) rect(g, 4, 9, 7, 1, s.trim);
    // near arm
    const ax = frame === 'attack' ? 9 : 7 + swing;
    const ay = frame === 'attack' ? 10 : 10;
    const aw = frame === 'attack' ? 5 : 2;
    const ah = frame === 'attack' ? 2 : 5;
    shaded(g, ax, ay, aw, ah, a);
    px(g, frame === 'attack' ? ax + aw : ax, frame === 'attack' ? ay : ay + ah, a[2]);
    shaded(g, 6, 8, 4 + (s.bulk === 1 ? 1 : 0), 2, a); // pauldron
    return;
  }

  const tx = 4 - s.bulk;
  const tw = 8 + 2 * s.bulk;
  if (facing === 'up' && s.cape) {
    shaded(g, tx, 9, tw, 9, [s.trim, s.trim, s.trim]);
    rect(g, tx, 9, tw, 1, OUTLINE);
    rect(g, tx + 1, 17, tw - 2, 1, OUTLINE);
  } else {
    shaded(g, tx, 9, tw, 7, a);
    rect(g, tx, 14, tw, 1, s.trim);
    if (facing === 'down') {
      px(g, 7, 11, s.trim);
      px(g, 8, 11, s.trim);
      px(g, 7, 12, s.trim);
      px(g, 8, 12, s.trim);
    }
  }
  if (s.scarf) rect(g, tx, 9, tw, 1, s.trim);

  // arms (swing opposite the legs) and pauldrons
  const lx = tx - 2;
  const rx = tx + tw;
  const raised = frame === 'attack';
  const lTop = raised ? 8 : 10;
  const lHand = raised ? 12 : 15 - swing;
  shaded(g, lx, lTop, 2, lHand - lTop, a);
  px(g, lx, lHand, a[2]);
  px(g, lx + 1, lHand, a[2]);
  const rHand = 15 + swing;
  shaded(g, rx, 10, 2, rHand - 10, a);
  px(g, rx, rHand, a[2]);
  px(g, rx + 1, rHand, a[2]);
  const pw = 3 + (s.bulk === 1 ? 1 : 0);
  shaded(g, lx - (pw - 2), 8 + (s.bulk === 1 ? 0 : 1), pw, 3, a);
  shaded(g, rx, 8 + (s.bulk === 1 ? 0 : 1), pw, 3, a);
}

function addOutline(g: Grid): Grid {
  const out = g.map((row) => row.slice());
  for (let y = 0; y < CHIBI_H; y++) {
    for (let x = 0; x < CHIBI_W; x++) {
      if (g[y][x] !== null) continue;
      const near = (dx: number, dy: number) => g[y + dy]?.[x + dx] != null;
      if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1)) out[y][x] = OUTLINE;
    }
  }
  return out;
}

export function drawKnight(style: KnightStyle, facing: Facing, frame: ChibiFrame): Grid {
  const g = newGrid();
  if (facing === 'up') {
    body(g, style, facing, frame);
    legs(g, style, facing, frame);
    drawHelm(g, style, facing);
  } else {
    legs(g, style, facing, frame);
    body(g, style, facing, frame);
    drawHelm(g, style, facing);
  }
  return addOutline(g);
}

function css(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Registers one canvas texture per facing × frame for a knight. */
export function generateKnightTextures(scene: Phaser.Scene, id: string, style: KnightStyle) {
  for (const facing of FACINGS) {
    for (const frame of FRAMES) {
      const key = chibiKey(id, facing, frame);
      if (scene.textures.exists(key)) continue;
      const grid = drawKnight(style, facing, frame);
      const tex = scene.textures.createCanvas(key, CHIBI_W, CHIBI_H)!;
      const ctx = tex.getContext();
      for (let y = 0; y < CHIBI_H; y++) {
        for (let x = 0; x < CHIBI_W; x++) {
          const c = grid[y][x];
          if (c === null) continue;
          ctx.fillStyle = css(c);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      tex.refresh();
    }
  }
}
