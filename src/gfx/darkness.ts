import Phaser from 'phaser';

const LIGHT = 'dark_light';
const W = 240;
const H = 160;

/** A soft round hole of light, for punching through the dark. */
function makeLightTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(LIGHT)) return;
  const tex = scene.textures.createCanvas(LIGHT, 128, 128)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  tex.refresh();
}

export interface Light {
  /** Screen position, in the 240x160 view. */
  x: number;
  y: number;
  /** Radius in pixels. */
  r: number;
}

/**
 * The dark of the tunnels: the whole screen dimmed to near black, with a pool of light round the knight and a smaller
 * glow round stairs and chests, so what is just out of reach is only a hint. One screen-sized texture, redrawn
 * each frame (it is tiny).
 */
export class Darkness {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly brush: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, private readonly level = 0.9) {
    makeLightTexture(scene);
    this.rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setScrollFactor(0).setDepth(85);
    this.brush = scene.make.image({ key: LIGHT, add: false }).setOrigin(0.5, 0.5);
  }

  update(lights: Light[]) {
    this.rt.clear();
    this.rt.fill(0x04050c, this.level);
    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > W + l.r || l.y > H + l.r) continue;
      this.brush.setScale((l.r * 2) / 128);
      this.rt.erase(this.brush, l.x, l.y);
    }
  }

  setVisible(visible: boolean) {
    this.rt.setVisible(visible);
  }

  destroy() {
    this.rt.destroy();
    this.brush.destroy();
  }
}
