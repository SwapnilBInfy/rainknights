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
 * A corner minimap: the whole map, one pixel for every 2x2 tiles, with a blip for the knight and for what is worth
 * finding. N turns it on and off. Drawn once from the grid (and again if the map changes, as a flood does), with
 * the blips on top each frame.
 */
export class Minimap {
  private image: Phaser.GameObjects.Image | null = null;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly dots: Phaser.GameObjects.Graphics;
  private key = '';
  private on = true;
  private w = 0;
  private h = 0;
  private flooding = '';

  constructor(private readonly scene: Phaser.Scene, private readonly x = 187, private readonly y = 16) {
    this.frame = scene.add.graphics().setScrollFactor(0).setDepth(139);
    this.dots = scene.add.graphics().setScrollFactor(0).setDepth(141);
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
    this.image = this.scene.add.image(this.x, this.y, this.key).setOrigin(0, 0).setScrollFactor(0).setDepth(140).setAlpha(0.82);
    this.frame.clear().lineStyle(1, 0x14121f, 1).strokeRect(this.x - 0.5, this.y - 0.5, w + 1, h + 1).lineStyle(1, 0xe8f0f8, 0.8).strokeRect(this.x - 1.5, this.y - 1.5, w + 3, h + 3);
    this.apply();
  }

  /** The map's picture is out of date if this stamp (the flood level) has changed. */
  stale(stamp: string): boolean {
    return stamp !== this.flooding;
  }

  update(player: { x: number; y: number }, dots: MiniDot[], blink: boolean) {
    const g = this.dots;
    g.clear();
    if (!this.on || !this.image) return;
    for (const d of dots) {
      const p = miniPoint(d.x, d.y);
      g.fillStyle(0x14121f, 1).fillRect(Math.round(this.x + p.x) - 1, Math.round(this.y + p.y) - 1, 3, 3);
      g.fillStyle(d.color, 1).fillRect(Math.round(this.x + p.x) - 1 + 0, Math.round(this.y + p.y) - 1 + 0, 2, 2);
    }
    const me = miniPoint(player.x, player.y);
    if (blink) g.fillStyle(0xffffff, 1).fillRect(Math.round(this.x + me.x) - 1, Math.round(this.y + me.y) - 1, 3, 3);
    else g.fillStyle(0xff4a4a, 1).fillRect(Math.round(this.x + me.x) - 1, Math.round(this.y + me.y) - 1, 3, 3);
  }

  toggle(): boolean {
    this.on = !this.on;
    this.apply();
    return this.on;
  }

  get visible(): boolean {
    return this.on;
  }

  setHidden(hidden: boolean) {
    this.image?.setVisible(this.on && !hidden);
    this.frame.setVisible(this.on && !hidden);
    this.dots.setVisible(this.on && !hidden);
  }

  private apply() {
    this.image?.setVisible(this.on);
    this.frame.setVisible(this.on);
    this.dots.setVisible(this.on);
    const app = document.getElementById('app');
    if (app) app.dataset.minimap = this.on ? 'on' : 'off';
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
    const app = document.getElementById('app');
    if (app) delete app.dataset.minimap;
  }
}
