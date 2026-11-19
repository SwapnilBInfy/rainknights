import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { computeDecor } from '../systems/decorRules';
import type { Grid } from '../systems/mapGen';
import { DECOR_NYC, DECOR_PALETTES } from './palette';

/**
 * The painted detail over the bare tiles (shorelines, curbs, lane markings, building walls and roofs,
 * bridge rails, trees, cars, lamps, umbrellas), rendered once into a texture so it costs nothing per frame.
 * Repainted when the map changes (a flood rising).
 */
export class DecorLayer {
  private rt: Phaser.GameObjects.RenderTexture;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly regionId: string,
    private readonly seed: number,
    cols: number,
    rows: number
  ) {
    this.rt = scene.add.renderTexture(0, 0, cols * TILE, rows * TILE).setOrigin(0, 0).setDepth(0.2);
  }

  /** Paint the decor for this grid; returns how many pieces were drawn. */
  draw(grid: Grid): number {
    const palette = DECOR_PALETTES[this.regionId] ?? DECOR_NYC;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const ops = computeDecor(grid, { regionId: this.regionId, seed: this.seed });
    for (const op of ops) {
      g.fillStyle(palette[op.role], op.a ?? 1);
      g.fillRect(op.x, op.y, op.w, op.h);
    }
    this.rt.clear();
    this.rt.draw(g);
    g.destroy();
    return ops.length;
  }

  destroy() {
    this.rt.destroy();
  }
}
