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
      this.load.image(character.attackTextureKey, `assets/generated/${character.attackTextureKey}.png`);
      for (const key of character.walkTextureKeys) {
        this.load.image(key, `assets/generated/${key}.png`);
      }
    }
  }

  create() {
    generateAllTextures(this);

    for (const character of CHARACTERS) {
      const [a, b, c] = character.walkTextureKeys;
      const hasWalkArt = [a, b, c].every((key) => this.textures.exists(key));
      if (hasWalkArt && !this.anims.exists(`walk_${character.id}`)) {
        this.anims.create({
          key: `walk_${character.id}`,
          // B (the centered passing pose) plays twice per cycle for a
          // smoother 4-tick cadence out of only 3 generated frames.
          frames: [{ key: a }, { key: b }, { key: c }, { key: b }],
          frameRate: 6,
          repeat: -1,
        });
      }
    }

    this.scene.start('MenuScene');
  }
}
