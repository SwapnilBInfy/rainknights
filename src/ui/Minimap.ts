import Phaser from 'phaser';
import { MINI_CELL, miniPoint, miniSize, minimapPixels } from '../systems/minimap';
import type { Grid } from '../systems/mapGen';

export interface MiniDot {
  x: number;
  y: number;
  color: number;
}

let counter = 0;

/**
 * The map: the whole world, one pixel for every 2x2 tiles, with a blip for the knight and for what is worth finding.
 * It lives in the Bag (N or I, then MAP), drawn at 2x when the Bag opens, not on the battle screen.
 */
export class Minimap {
  private image: Phaser.GameObjects.Image | null = null;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly dots: Phaser.GameObjects.Graphics;
  private key = '';
  private w = 0;
  private h = 0;
  private flooding = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x = 187,
    private readonly y = 16,
    /** Whole-number zoom: the Bag draws the map at 2x. */
    private readonly scale = 1,
    private readonly depth = 139
  ) {
    this.frame = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.dots = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  }

  /** Draw (or redraw) the map's picture. */
  setGrid(grid: Grid, stamp = '') {
    this.flooding = stamp;
    const { w, h } = miniSize(grid);
    this.w = w;
    this.h = h;
    if (this.image) this.image.destroy();
    if (this.key) this.scene.textures.remove(this.key);
    this.key = `minimap_${counter++}`;
    const tex = this.scene.textures.createCanvas(this.key, w, h)!;
    const ctx = tex.getContext();
    const px = minimapPixels(grid);
    const img = ctx.createImageData(w, h);
    px.forEach((c, i) => {
      img.data[i * 4] = (c >> 16) & 255;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    this.image = this.scene.add.image(this.x, this.y, this.key).setOrigin(0, 0).setScale(this.scale).setScrollFactor(0).setDepth(this.depth + 1).setAlpha(0.95);
    const sw = w * this.scale;
    const sh = h * this.scale;
    this.frame.clear().lineStyle(1, 0x14121f, 1).strokeRect(this.x - 0.5, this.y - 0.5, sw + 1, sh + 1).lineStyle(1, 0xe8f0f8, 0.8).strokeRect(this.x - 1.5, this.y - 1.5, sw + 3, sh + 3);
  }

  /** The map's picture is out of date if this stamp (the flood level) has changed. */
  stale(stamp: string): boolean {
    return stamp !== this.flooding;
  }

  update(player: { x: number; y: number }, dots: MiniDot[], blink: boolean) {
    const g = this.dots;
    g.clear();
    if (!this.image) return;
    const k = this.scale;
    for (const d of dots) {
      const p = miniPoint(d.x, d.y);
      g.fillStyle(0x14121f, 1).fillRect(Math.round(this.x + p.x * k) - 1, Math.round(this.y + p.y * k) - 1, 3, 3);
      g.fillStyle(d.color, 1).fillRect(Math.round(this.x + p.x * k) - 1, Math.round(this.y + p.y * k) - 1, 2, 2);
    }
    const me = miniPoint(player.x, player.y);
    g.fillStyle(blink ? 0xffffff : 0xff4a4a, 1).fillRect(Math.round(this.x + me.x * k) - 1, Math.round(this.y + me.y * k) - 1, 3, 3);
  }

  get size(): { w: number; h: number } {
    return { w: this.w, h: this.h };
  }

  get cell(): number {
    return MINI_CELL;
  }

  destroy() {
    this.image?.destroy();
    if (this.key) this.scene.textures.remove(this.key);
    this.frame.destroy();
    this.dots.destroy();
  }
}
