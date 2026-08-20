import Phaser from 'phaser';
import { generateAllTextures } from '../gfx/spriteDefs';
import { REGIONS } from '../config/regions';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // AI-generated region art is optional — scenes fall back to emoji
    // glyphs (see RegionSelectScene) if a given file hasn't been generated.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`Optional generated asset missing, using fallback: ${file.key}`);
    });
    for (const region of REGIONS) {
      this.load.image(region.emblemKey, `assets/generated/${region.emblemKey}.png`);
    }
  }

  create() {
    generateAllTextures(this);
    this.scene.start('MenuScene');
  }
}
