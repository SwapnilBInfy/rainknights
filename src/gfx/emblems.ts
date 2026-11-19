import Phaser from 'phaser';
import { mulberry32 } from '../systems/mapGen';
import { OUTLINE } from './palette';

/**
 * Procedural city emblems: a 96x64 badge (a skyline, a landmark and the city's weather) painted from code,
 * the way the terrain tiles are. New York and Miami use hand-generated PNGs; the cities added after them
 * draw theirs here, so adding a city never needs an image file.
 */
export const EMBLEM_W = 96;
export const EMBLEM_H = 64;

/** How far the rounded badge is cut in from the left edge on each row (and, mirrored, from the right). */
const CORNER = [5, 3, 2, 1, 1];
const inset = (y: number): number => (y < CORNER.length ? CORNER[y] : y >= EMBLEM_H - CORNER.length ? CORNER[EMBLEM_H - 1 - y] : 0);

interface Spec {
  /** Four sky bands, top to bottom. */
  sky: [number, number, number, number];
  far: number;
  near: number;
  windows: number[];
  rain: number;
  rainCount: number;
  seed: number;
  /** The scene in the middle; runs after the skyline and before the rain. */
  landmark: (p: Painter) => void;
}

/** Paints pixels inside the badge's rounded outline. */
class Painter {
  constructor(private readonly g: Phaser.GameObjects.Graphics) {}

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    this.g.fillStyle(color, alpha);
    for (let yy = Math.max(0, y); yy < Math.min(EMBLEM_H, y + h); yy++) {
      const lo = Math.max(x, inset(yy));
      const hi = Math.min(x + w, EMBLEM_W - inset(yy));
      if (hi > lo) this.g.fillRect(lo, yy, hi - lo, 1);
    }
  }

  dot(x: number, y: number, color: number) {
    this.rect(Math.round(x), Math.round(y), 1, 1, color);
  }

  /** A filled disc, drawn row by row so its edge stays crisp. */
  disc(cx: number, cy: number, r: number, color: number) {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.round(Math.sqrt(r * r - dy * dy));
      this.rect(cx - half, cy + dy, half * 2 + 1, 1, color);
    }
  }

  /** A filled isoceles triangle with its apex at the top. */
  spire(cx: number, top: number, baseHalf: number, height: number, color: number) {
    for (let i = 0; i < height; i++) {
      const half = Math.round(((i + 1) / height) * baseHalf);
      this.rect(cx - half, top + i, half * 2 + 1, 1, color);
    }
  }
}

function skyline(p: Painter, spec: Spec, rng: () => number) {
  // far layer
  for (let x = 0; x < EMBLEM_W; ) {
    const w = 5 + Math.floor(rng() * 6);
    const h = 10 + Math.floor(rng() * 16);
    p.rect(x, 48 - h, w, h + 4, spec.far);
    x += w + (rng() < 0.4 ? 1 : 0);
  }
  spec.landmark(p);
  // near layer, with lit windows
  for (let x = -2; x < EMBLEM_W; ) {
    const w = 6 + Math.floor(rng() * 7);
    const h = 8 + Math.floor(rng() * 14);
    const top = 52 - h;
    p.rect(x, top, w, h + 4, spec.near);
    for (let wy = top + 2; wy < 50; wy += 3) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if (rng() < 0.3) p.dot(wx, wy, spec.windows[Math.floor(rng() * spec.windows.length)]);
      }
    }
    x += w + 1;
  }
}

function rain(p: Painter, spec: Spec, rng: () => number) {
  for (let i = 0; i < spec.rainCount; i++) {
    const x = Math.floor(rng() * (EMBLEM_W + 8));
    const y = Math.floor(rng() * EMBLEM_H);
    p.dot(x, y, spec.rain);
    p.dot(x - 1, y + 2, spec.rain);
  }
}

/** One thin frame around the rounded badge. */
function frame(p: Painter) {
  for (let y = 0; y < EMBLEM_H; y++) {
    const lo = inset(y);
    p.rect(lo, y, y === 0 || y === EMBLEM_H - 1 ? EMBLEM_W - lo * 2 : 1, 1, OUTLINE);
    if (y !== 0 && y !== EMBLEM_H - 1) p.rect(EMBLEM_W - lo - 1, y, 1, 1, OUTLINE);
  }
}

const LONDON: Spec = {
  sky: [0x1c2438, 0x2c3a52, 0x46607a, 0x7e96a6],
  far: 0x34445a,
  near: 0x1a202e,
  windows: [0xf8dc88, 0xf8dc88, 0xd8a060],
  rain: 0x9ab8cc,
  rainCount: 70,
  seed: 3,
  landmark: (p) => {
    // The river and a bridge across it.
    p.rect(0, 50, EMBLEM_W, 14, 0x2e5260);
    for (let x = 2; x < EMBLEM_W; x += 7) p.rect(x, 54 + (x % 3) * 3, 4, 1, 0x6e9aa8);
    p.rect(0, 44, EMBLEM_W, 3, 0x56565e);
    p.rect(0, 43, EMBLEM_W, 1, 0x8a8a96);
    for (let x = 8; x < EMBLEM_W; x += 20) {
      p.disc(x, 51, 7, 0x24424e);
      p.rect(x - 7, 47, 15, 4, 0x56565e);
      p.disc(x, 52, 5, 0x2e5260);
    }
    // The clock tower.
    p.rect(64, 20, 10, 25, 0x7a6a50);
    p.rect(64, 20, 2, 25, 0x9a8a6c);
    p.rect(72, 20, 2, 25, 0x4a3e2c);
    p.rect(63, 17, 12, 4, 0x5a4c38);
    p.rect(65, 14, 8, 4, 0x7a6a50);
    p.spire(69, 5, 4, 10, 0x2e3a3a);
    p.disc(69, 25, 3, 0xf8f0c0);
    p.rect(69, 23, 1, 3, 0x3a2c20);
    p.rect(69, 25, 2, 1, 0x3a2c20);
    // A double-decker on the bridge.
    p.rect(20, 36, 14, 7, 0xd83028);
    p.rect(20, 36, 14, 1, 0xf86858);
    for (let x = 22; x < 33; x += 3) {
      p.rect(x, 37, 2, 2, 0xf8e8a0);
      p.rect(x, 40, 2, 2, 0xf8e8a0);
    }
    p.disc(23, 43, 1, 0x14121f);
    p.disc(31, 43, 1, 0x14121f);
  },
};

const TOKYO: Spec = {
  sky: [0x1a1038, 0x3a1c5c, 0x6a2c7c, 0xb8458a],
  far: 0x2a2058,
  near: 0x120c2c,
  windows: [0xff78c8, 0x58d8e8, 0xf8e878, 0xff78c8],
  rain: 0xb8a8f8,
  rainCount: 90,
  seed: 7,
  landmark: (p) => {
    // A lattice tower, red and white.
    p.spire(66, 6, 10, 40, 0xe8503c);
    for (let y = 14; y < 46; y += 6) p.rect(66 - Math.round(((y - 6) / 40) * 10) + 2, y, Math.round(((y - 6) / 40) * 20) - 3, 1, 0xf8f0f0);
    p.rect(60, 20, 13, 2, 0xf8f0f0);
    p.rect(65, 2, 1, 5, 0xf8f0f0);
    // A pagoda.
    p.rect(21, 36, 12, 10, 0x4a2438);
    p.rect(18, 35, 18, 2, 0x8a2c48);
    p.rect(23, 28, 8, 8, 0x4a2438);
    p.rect(20, 27, 14, 2, 0x8a2c48);
    p.rect(25, 21, 4, 7, 0x4a2438);
    p.rect(22, 20, 10, 2, 0x8a2c48);
    p.rect(26, 15, 2, 6, 0x8a2c48);
    // Neon signs.
    p.rect(40, 34, 7, 3, 0xff78c8);
    p.rect(41, 35, 5, 1, 0x3a1c5c);
    p.rect(8, 38, 3, 8, 0x58d8e8);
    p.rect(84, 30, 6, 3, 0xf8e878);
    // The typhoon: a lightning bolt out of the clouds.
    const bolt: [number, number][] = [[48, 4], [46, 10], [49, 10], [44, 20], [47, 20], [42, 30]];
    for (let i = 0; i + 1 < bolt.length; i++) {
      const [x0, y0] = bolt[i];
      const [x1, y1] = bolt[i + 1];
      for (let s = 0; s <= 8; s++) p.dot(x0 + ((x1 - x0) * s) / 8, y0 + ((y1 - y0) * s) / 8, 0xfff8b0);
    }
    // A wet street reflecting the neon.
    p.rect(0, 52, EMBLEM_W, 12, 0x1e1440);
    for (let x = 4; x < EMBLEM_W; x += 9) p.rect(x, 54 + (x % 4), 3, 1, x % 2 ? 0xff78c8 : 0x58d8e8);
  },
};

const MUMBAI: Spec = {
  sky: [0x2c3a44, 0x4a5e64, 0x7a8a80, 0xc8a468],
  far: 0xa8582c,
  near: 0x6e3822,
  windows: [0xffe890, 0xffe890, 0x58b8a0],
  rain: 0xc4e4e0,
  rainCount: 130,
  seed: 11,
  landmark: (p) => {
    // The sea in front of everything.
    p.rect(0, 50, EMBLEM_W, 14, 0x2f9a98);
    for (let x = 1; x < EMBLEM_W; x += 6) p.rect(x, 53 + (x % 4) * 2, 4, 1, 0x7ad8c8);
    // The gateway: a big arch with a dome and four turrets.
    const stone = 0xe0b068;
    const shade = 0xa87838;
    p.rect(30, 24, 36, 26, stone);
    p.rect(30, 24, 3, 26, shade);
    p.rect(63, 24, 3, 26, shade);
    p.rect(30, 24, 36, 2, 0xf0cc88);
    p.rect(42, 33, 12, 17, 0x3a2418);
    p.disc(48, 33, 6, 0x3a2418);
    p.rect(44, 40, 8, 10, 0x4e8a98);
    p.disc(48, 17, 6, stone);
    p.rect(42, 17, 12, 8, stone);
    p.rect(42, 17, 2, 8, shade);
    p.rect(47, 8, 2, 4, shade);
    for (const x of [33, 59]) {
      p.rect(x - 2, 18, 5, 7, stone);
      p.disc(x, 18, 2, shade);
    }
    // A palm bent over by the wind.
    for (let i = 0; i < 16; i++) p.rect(10 + Math.round(i * 0.45), 46 - i, 2, 1, 0x5a3a20);
    for (const [dx, dy] of [[-6, 2], [-4, -3], [0, -5], [5, -3], [7, 2], [3, 5]]) {
      for (let s = 0; s <= 6; s++) p.dot(17 + (dx * s) / 6, 30 + (dy * s) / 6, 0x2e9a48);
    }
    // A taxi on the sea wall.
    p.rect(72, 45, 14, 5, 0xf0c830);
    p.rect(74, 43, 8, 3, 0xf0c830);
    p.rect(75, 44, 6, 2, 0x8fd8f0);
    p.disc(75, 50, 1, 0x14121f);
    p.disc(83, 50, 1, 0x14121f);
  },
};

const STORMHOLD: Spec = {
  sky: [0x0a0818, 0x1a1038, 0x3a1c5c, 0x5a2c7c],
  far: 0x241a44,
  near: 0x120c2c,
  windows: [0xfff06a, 0xb070ff],
  rain: 0xb8a8f8,
  rainCount: 110,
  seed: 13,
  landmark: (p) => {
    // The eye of the storm: rings of cloud round a bright pupil.
    p.disc(48, 22, 17, 0x2a1c58);
    p.disc(48, 22, 12, 0x14102c);
    p.disc(48, 22, 5, 0xfff06a);
    p.disc(48, 22, 2, 0xffffff);
    // lightning from the eye
    const bolt: [number, number][] = [[48, 27], [45, 33], [49, 33], [44, 42]];
    for (let i = 0; i + 1 < bolt.length; i++) {
      const [x0, y0] = bolt[i];
      const [x1, y1] = bolt[i + 1];
      for (let k = 0; k <= 8; k++) p.dot(x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8, 0xfff8b0);
    }
    // a spire on the island
    p.spire(48, 38, 4, 12, 0x24204a);
    p.rect(44, 48, 9, 3, 0x1a1630);
    // a dark sea with white caps
    p.rect(0, 52, EMBLEM_W, 12, 0x14183c);
    for (let x = 3; x < EMBLEM_W; x += 8) p.rect(x, 54 + (x % 3) * 3, 4, 1, 0x8a98e8);
  },
};

const EMBLEMS: Record<string, Spec> = { london: LONDON, tokyo: TOKYO, mumbai: MUMBAI, stormhold: STORMHOLD };

/** True for cities whose emblem is drawn here instead of loaded from a PNG. */
export const hasDrawnEmblem = (regionId: string): boolean => regionId in EMBLEMS;

/** Draw a city's emblem into a texture under `key`. Does nothing for cities without a drawn emblem. */
export function generateEmblem(scene: Phaser.Scene, key: string, regionId: string) {
  const spec = EMBLEMS[regionId];
  if (!spec || scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const p = new Painter(g);
  const rng = mulberry32(spec.seed);
  spec.sky.forEach((c, i) => p.rect(0, i * 16, EMBLEM_W, 16, c));
  // soft cloud blobs so the sky is not flat
  for (let i = 0; i < 6; i++) p.rect(Math.floor(rng() * 80), 6 + Math.floor(rng() * 24), 10 + Math.floor(rng() * 14), 3, spec.sky[1], 0.7);
  skyline(p, spec, rng);
  rain(p, spec, rng);
  frame(p);
  g.generateTexture(key, EMBLEM_W, EMBLEM_H);
  g.destroy();
}
