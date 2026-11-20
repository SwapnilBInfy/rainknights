import Phaser from 'phaser';
import { OUTLINE } from '../gfx/palette';
import { stepCharge } from './flightPad';
import type { Poi } from './pois';

/** The things you can find and use in the world, on the surface and underground. */
export type ItemKind = 'entrance' | 'crate' | 'shrine' | 'back' | 'far' | 'tablet';

export interface PoiItem {
  /** Unique within a run and stable across visits, so what has been used is remembered ("s3", "u0:2"). */
  key: string;
  kind: ItemKind;
  x: number;
  y: number;
  /** The surface point of interest this stands for, if it is one. */
  poi?: Poi;
  /** A shrine's power; a tablet's number. */
  power?: string;
  /** Subway stairs or a cave mouth. */
  dress?: 'street' | 'beach';
}

/** How the world reacts when the knight uses something. */
export interface PoiHost {
  trigger(item: PoiItem): void;
}

/** How long (ms) to stand still on the stairs, or at a shrine, to use it. */
export const STAIRS_MS = 650;
export const SHRINE_MS = 1100;
const REACH = { crate: 13, tablet: 14, shrine: 15, stairs: 12 };

export const SHRINE_COLOURS: Record<string, number> = {
  sunbeam: 0xffb020,
  rainbowShield: 0xff5fa2,
  gale: 0xb9f5c0,
  frost: 0xaee9ff,
  staticCharge: 0xfff066,
};

/**
 * Draws and runs the points of interest: crates open when touched, shrines and stairs when stood on for a moment
 * (a ring fills), and a tablet is read when touched. Used crates and shrines are remembered (`used`) and drawn spent.
 */
export class PoiDirector {
  readonly used: Set<string>;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly charge = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: PoiHost,
    readonly items: PoiItem[],
    used: Iterable<string> = []
  ) {
    this.used = new Set(used);
    this.gfx = scene.add.graphics().setDepth(3);
  }

  isUsed(key: string): boolean {
    return this.used.has(key);
  }

  /** How full the ring is for an item (0..1). */
  ring(key: string): number {
    return this.charge.get(key) ?? 0;
  }

  update(time: number, delta: number, player: { x: number; y: number }) {
    const view = this.scene.cameras.main.worldView;
    const g = this.gfx;
    g.clear();
    for (const item of this.items) {
      const d = Math.hypot(item.x - player.x, item.y - player.y);
      const spent = this.used.has(item.key);
      const stairs = item.kind === 'entrance' || item.kind === 'back' || item.kind === 'far';

      if (!spent) {
        if (item.kind === 'crate' || item.kind === 'tablet') {
          if (d <= REACH[item.kind]) {
            this.used.add(item.key);
            this.host.trigger(item);
          }
        } else {
          const ms = stairs ? STAIRS_MS : SHRINE_MS;
          const reach = stairs ? REACH.stairs : REACH.shrine;
          const next = stepCharge(this.charge.get(item.key) ?? 0, d <= reach, delta, ms);
          this.charge.set(item.key, next);
          if (next >= 1) {
            this.charge.set(item.key, 0);
            if (!stairs) this.used.add(item.key);
            this.host.trigger(item);
          }
        }
      }

      if (item.x < view.x - 24 || item.x > view.right + 24 || item.y < view.y - 24 || item.y > view.bottom + 24) continue;
      this.draw(g, item, time, this.used.has(item.key));
      const ring = this.charge.get(item.key) ?? 0;
      if (ring > 0) {
        g.fillStyle(OUTLINE, 0.85).fillRect(item.x - 8, item.y - 20, 16, 4);
        g.fillStyle(0xffffff, 1).fillRect(item.x - 7, item.y - 19, Math.round(14 * ring), 2);
      }
    }
  }

  private draw(g: Phaser.GameObjects.Graphics, item: PoiItem, time: number, spent: boolean) {
    const { x, y } = item;
    const pulse = 0.5 + 0.5 * Math.sin(time / 280 + x);
    switch (item.kind) {
      case 'crate': {
        g.fillStyle(0x000000, 0.25).fillRect(x - 6, y + 4, 13, 3); // its shadow
        g.fillStyle(OUTLINE, 1).fillRect(x - 7, y - 6, 14, 12);
        g.fillStyle(spent ? 0x5a4630 : 0xb8803c, 1).fillRect(x - 6, y - 5, 12, 10);
        g.fillStyle(spent ? 0x3a2c1c : 0x8a5a24, 1).fillRect(x - 6, y - 5, 12, 2); // the lid
        g.fillStyle(spent ? 0x6a6a74 : 0xd8d8e0, 1).fillRect(x - 6, y - 1, 12, 1).fillRect(x - 1, y - 5, 2, 10); // the bands
        if (spent) g.fillStyle(0x101018, 1).fillRect(x - 5, y - 4, 10, 2); // open and empty
        else g.fillStyle(0xffffff, 0.35 + 0.55 * pulse).fillRect(x + 4, y - 9, 1, 3).fillRect(x + 3, y - 8, 3, 1); // a glint
        break;
      }
      case 'shrine': {
        const c = spent ? 0x6a6a7a : SHRINE_COLOURS[item.power ?? 'sunbeam'] ?? 0xffffff;
        g.fillStyle(0x000000, 0.25).fillRect(x - 6, y + 5, 13, 3);
        g.fillStyle(OUTLINE, 1).fillRect(x - 6, y + 1, 12, 7).fillRect(x - 4, y - 9, 8, 11);
        g.fillStyle(0x8a90a8, 1).fillRect(x - 5, y + 2, 10, 5).fillRect(x - 3, y - 8, 6, 10);
        g.fillStyle(0xb8bed0, 1).fillRect(x - 3, y - 8, 2, 10);
        if (!spent) g.fillStyle(c, 0.25 + 0.3 * pulse).fillRect(x - 8, y - 17, 16, 14); // the glow
        g.fillStyle(OUTLINE, 1).fillRect(x - 3, y - 15, 6, 8);
        g.fillStyle(c, 1).fillRect(x - 2, y - 14, 4, 6);
        g.fillStyle(0xffffff, spent ? 0.2 : 0.8).fillRect(x - 2, y - 14, 1, 2);
        break;
      }
      case 'tablet': {
        const c = spent ? 0x6a6a7a : 0xffd84a;
        g.fillStyle(OUTLINE, 1).fillRect(x - 6, y - 10, 12, 18);
        g.fillStyle(0x9aa0b8, 1).fillRect(x - 5, y - 9, 10, 16);
        g.fillStyle(c, spent ? 0.5 : 0.6 + 0.4 * pulse);
        for (const [gx, gy] of [[-3, -6], [0, -6], [-3, -2], [1, -2], [-2, 2]]) g.fillRect(x + gx, y + gy, 2, 2);
        break;
      }
      default: {
        const down = item.kind === 'entrance';
        const cave = item.dress === 'beach' && down;
        if (cave) {
          // a cave mouth: a dark opening in a ring of rock
          g.fillStyle(OUTLINE, 1).fillRect(x - 9, y - 7, 18, 14);
          g.fillStyle(0x5a5e70, 1).fillRect(x - 8, y - 6, 16, 12);
          g.fillStyle(0x07070e, 1).fillRect(x - 6, y - 4, 12, 9).fillRect(x - 4, y - 5, 8, 1);
          g.fillStyle(0x8a90a8, 1).fillRect(x - 8, y - 6, 3, 2).fillRect(x + 5, y - 6, 3, 2);
        } else {
          // stairs: a pit with steps and yellow rails
          g.fillStyle(OUTLINE, 1).fillRect(x - 9, y - 7, 18, 14);
          g.fillStyle(down ? 0x0a0a14 : 0xcfd2dc, 1).fillRect(x - 7, y - 6, 14, 12);
          for (let i = 0; i < 4; i++) g.fillStyle(down ? 0x2c3042 : 0xa6aab8, 1).fillRect(x - 7, y - 5 + i * 3, 14, 1);
          g.fillStyle(0xe8c030, 1).fillRect(x - 8, y - 6, 1, 12).fillRect(x + 7, y - 6, 1, 12);
        }
        // an arrow: down into the dark, or up toward the light (the far stairs glow blue)
        const col = item.kind === 'far' ? 0x58d8ff : item.kind === 'back' ? 0xffe680 : 0x58e0b0;
        const bob = Math.round(pulse * 2);
        g.fillStyle(OUTLINE, 1);
        if (down) g.fillTriangle(x - 4, y - 14 + bob, x + 4, y - 14 + bob, x, y - 7 + bob);
        else g.fillTriangle(x - 4, y - 7 + bob, x + 4, y - 7 + bob, x, y - 14 + bob);
        g.fillStyle(col, 1);
        if (down) g.fillTriangle(x - 3, y - 13 + bob, x + 3, y - 13 + bob, x, y - 8 + bob);
        else g.fillTriangle(x - 3, y - 8 + bob, x + 3, y - 8 + bob, x, y - 13 + bob);
        if (item.kind === 'far') g.lineStyle(1, 0x58d8ff, 0.4 + 0.5 * pulse).strokeRect(x - 11, y - 9, 22, 18);
        break;
      }
    }
  }

  destroy() {
    this.gfx.destroy();
  }
}
