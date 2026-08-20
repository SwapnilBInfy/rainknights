import Phaser from 'phaser';
import { generateAllTextures } from '../gfx/spriteDefs';
import { REGIONS } from '../config/regions';
import { CHARACTERS } from '../config/characters';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // AI-generated art is optional — scenes fall back to procedural sprites
    // / emoji glyphs (see Player, RegionSelectScene) if a file is missing.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`Optional generated asset missing, using fallback: ${file.key}`);
    });
    for (const region of REGIONS) {
      this.load.image(region.emblemKey, `assets/generated/${region.emblemKey}.png`);
    }
    for (const character of CHARACTERS) {
      this.load.image(character.idleTextureKey, `assets/generated/${character.idleTextureKey}.png`);
      this.load.image(character.strideTextureKey, `assets/generated/${character.strideTextureKey}.png`);
    }
  }

  create() {
    generateAllTextures(this);

    for (const character of CHARACTERS) {
      if (
        this.textures.exists(character.idleTextureKey) &&
        this.textures.exists(character.strideTextureKey) &&
        !this.anims.exists(`walk_${character.id}`)
      ) {
        this.anims.create({
          key: `walk_${character.id}`,
          frames: [{ key: character.idleTextureKey }, { key: character.strideTextureKey }],
          frameRate: 4,
          repeat: -1,
        });
      }
    }

    this.scene.start('MenuScene');
  }
}
