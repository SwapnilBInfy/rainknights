import Phaser from 'phaser';
import { generateAllTextures } from '../gfx/spriteDefs';
import { REGIONS } from '../config/regions';
import { CHARACTERS } from '../config/characters';
import { chibiKey, FACINGS } from '../gfx/chibi';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // AI-generated region emblems are optional — RegionSelectScene falls back
    // to emoji glyphs if a file is missing.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`Optional generated asset missing, using fallback: ${file.key}`);
    });
    for (const region of REGIONS) {
      this.load.image(region.emblemKey, `assets/generated/${region.emblemKey}.png`);
    }
  }

  create() {
    generateAllTextures(this);

    for (const character of CHARACTERS) {
      for (const facing of FACINGS) {
        const animKey = `walk_${character.id}_${facing}`;
        if (this.anims.exists(animKey)) continue;
        const frame = (f: 'stand' | 'stepA' | 'stepB') => ({ key: chibiKey(character.id, facing, f) });
        this.anims.create({
          key: animKey,
          // stand, step, stand, other step — the classic GBA walk cadence.
          frames: [frame('stand'), frame('stepA'), frame('stand'), frame('stepB')],
          frameRate: 8,
          repeat: -1,
        });
      }
    }

    this.scene.start('MenuScene');
  }
}
