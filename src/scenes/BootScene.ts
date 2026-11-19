import Phaser from 'phaser';
import { generateAllTextures } from '../gfx/spriteDefs';
import { REGIONS } from '../config/regions';
import { CHARACTERS } from '../config/characters';
import { chibiKey, FACINGS } from '../gfx/chibi';
import { hasDrawnEmblem } from '../gfx/emblems';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // AI-generated region emblems are optional — RegionSelectScene falls back
    // to a plain block if a file is missing. Cities with a drawn emblem have no file.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`Optional generated asset missing, using fallback: ${file.key}`);
    });
    for (const region of REGIONS) {
      if (hasDrawnEmblem(region.id)) continue;
      this.load.image(region.emblemKey, `assets/generated/${region.emblemKey}.png`);
    }
  }

  create() {
    // Phaser does not await create(). The promise keeps BootScene up until
    // every texture exists, yielding between batches so input can be processed.
    void this.boot();
  }

  private async boot() {
    await generateAllTextures(this, () => new Promise((resolve) => setTimeout(resolve, 0)));

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

    this.scene.launch('OverlayScene');
    this.scene.start('MenuScene');
  }
}
