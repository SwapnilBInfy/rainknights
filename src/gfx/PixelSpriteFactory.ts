import Phaser from 'phaser';
import { OUTLINE } from './palette';

export type BlobShape = 'circle' | 'square' | 'diamond' | 'spiky' | 'drop';

export interface BlobOptions {
  /** grid cell radius (not pixels) */
  radius: number;
  shape?: BlobShape;
  spikes?: number;
  spikeAmp?: number;
  rotation?: number;
  main: number;
  highlight?: number;
  shadow?: number;
  outline?: number;
}

/**
 * Rasterizes a blocky, palette-limited "blob" onto a Graphics object at a
 * given cell-space center. Cells are filled as whole rectangles (no
 * anti-aliasing) to get a chunky, low-res pixel look regardless of final
 * texture size.
 */
function paintBlob(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  pixel: number,
  opts: BlobOptions
) {
  const { radius, shape = 'circle', spikes = 0, spikeAmp = 0, rotation = 0 } = opts;
  const outline = opts.outline ?? OUTLINE;
  const span = Math.ceil(radius) + 1;

  for (let gy = -span; gy <= span; gy++) {
    for (let gx = -span; gx <= span; gx++) {
      const dx = gx + 0.5;
      const dy = gy + 0.5;
      let dist: number;
      let rMax = radius;

      if (shape === 'square') {
        dist = Math.max(Math.abs(dx), Math.abs(dy));
      } else if (shape === 'diamond') {
        dist = Math.abs(dx) + Math.abs(dy);
      } else if (shape === 'drop') {
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dy < 0) rMax = radius * Math.max(0.12, 1 + (dy / radius) * 0.85);
      } else {
        dist = Math.sqrt(dx * dx + dy * dy);
        if (shape === 'spiky' && spikes > 0) {
          const theta = Math.atan2(dy, dx);
          rMax = radius * (1 + spikeAmp * Math.cos(spikes * (theta + rotation)));
        }
      }

      const ratio = dist / rMax;
      let color: number | null = null;

      if (ratio <= 0.78) {
        color = opts.main;
        if (opts.highlight && dx < -rMax * 0.15 && dy < -rMax * 0.15 && ratio < 0.42) {
          color = opts.highlight;
        } else if (opts.shadow && (dx > rMax * 0.25 || dy > rMax * 0.35) && ratio > 0.52) {
          color = opts.shadow;
        }
      } else if (ratio <= 1.0) {
        color = outline;
      }

      if (color !== null) {
        g.fillStyle(color, 1);
        g.fillRect(
          (cx + gx) * pixel,
          (cy + gy) * pixel,
          pixel,
          pixel
        );
      }
    }
  }
}

/** Generates and registers a single-blob texture. */
export function generateBlobTexture(
  scene: Phaser.Scene,
  key: string,
  opts: BlobOptions,
  pixel = 5
) {
  if (scene.textures.exists(key)) return;
  const span = Math.ceil(opts.radius) + 2;
  const size = span * 2;
  const g = scene.add.graphics();
  paintBlob(g, span, span, pixel, opts);
  g.generateTexture(key, size * pixel, size * pixel);
  g.destroy();
}

export interface CompositePart extends BlobOptions {
  offsetX: number;
  offsetY: number;
}

/** Generates a texture composed of several blobs (e.g. head + body). */
export function generateCompositeTexture(
  scene: Phaser.Scene,
  key: string,
  parts: CompositePart[],
  gridSize: number,
  pixel = 5
) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  const cx = gridSize / 2;
  const cy = gridSize / 2;
  for (const part of parts) {
    paintBlob(g, cx + part.offsetX, cy + part.offsetY, pixel, part);
  }
  g.generateTexture(key, gridSize * pixel, gridSize * pixel);
  g.destroy();
}
