import Phaser from 'phaser';
import { UI } from '../gfx/palette';
import { textStyle } from './Window';
import { digitWidth, drawDigits } from './digits';

/**
 * The town readout: a slim HP bar and a drips count in the corners, a place
 * name that fades after you arrive, and a small A bubble on whatever you can
 * use. Nothing else stays on the 240×160 screen.
 */
export class HubChrome {
  private hpGfx: Phaser.GameObjects.Graphics;
  private dripGfx: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Graphics;
  private banner: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, place: string) {
    this.hpGfx = scene.add.graphics().setScrollFactor(0).setDepth(140);
    this.dripGfx = scene.add.graphics().setScrollFactor(0).setDepth(140);
    this.bubble = scene.add.graphics().setDepth(95);
    this.banner = scene.add
      .text(120, 18, place, { ...textStyle('#f8f8f8'), stroke: '#14121f', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(145);
    scene.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: 900,
      duration: 400,
      onComplete: () => this.banner.setVisible(false),
    });
  }

  setStats(hp: number, max: number, coins: number) {
    const g = this.hpGfx;
    g.clear();
    const pct = max > 0 ? Phaser.Math.Clamp(hp / max, 0, 1) : 0;
    const color = pct > 0.5 ? UI.hpGreen : pct > 0.2 ? UI.hpYellow : UI.hpRed;
    g.fillStyle(0x14121f, 0.85);
    g.fillRect(3, 3, 46, 6);
    g.fillStyle(0x303038, 1);
    g.fillRect(4, 4, 44, 4);
    g.fillStyle(color, 1);
    g.fillRect(4, 4, Math.round(44 * pct), 4);

    const d = this.dripGfx;
    d.clear();
    const text = String(Math.max(0, Math.floor(coins)));
    const w = digitWidth(text);
    const x = 236 - w;
    d.fillStyle(0x14121f, 0.85);
    d.fillRect(x - 8, 2, w + 10, 8);
    d.fillStyle(0xf8d040, 1);
    d.fillRect(x - 6, 4, 4, 4);
    d.fillStyle(0xfff6a0, 1);
    d.fillRect(x - 5, 4, 1, 1);
    drawDigits(d, x, 3, text, 0xf8f8f0);
  }

  /** World-space prompt. `null` hides it. */
  setBubble(at: { x: number; y: number } | null) {
    const g = this.bubble;
    g.clear();
    if (!at) return;
    const x = Math.round(at.x) - 4;
    const y = Math.round(at.y) - 26;
    g.fillStyle(0x14121f, 1);
    g.fillRect(x - 1, y - 1, 11, 11);
    g.fillStyle(0xf8f8f8, 1);
    g.fillRect(x, y, 9, 9);
    g.fillStyle(0xc07800, 1);
    // A tiny "A": peak, two sides, a crossbar.
    g.fillRect(x + 4, y + 1, 1, 1);
    g.fillRect(x + 3, y + 2, 1, 4);
    g.fillRect(x + 5, y + 2, 1, 4);
    g.fillRect(x + 4, y + 4, 1, 1);
  }

  destroy() {
    this.hpGfx.destroy();
    this.dripGfx.destroy();
    this.bubble.destroy();
    this.banner.destroy();
  }
}
