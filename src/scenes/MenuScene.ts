import Phaser from 'phaser';
import { CHARACTERS } from '../config/characters';
import { TEX } from '../gfx/spriteDefs';
import { FONT, textStyle } from '../ui/Window';

const ANIMATED = ['down', 'side', 'down'] as const;

export class MenuScene extends Phaser.Scene {
  private drops: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#181c38');

    // Pavement strip to stand on, like a title-screen route.
    const sheet = this.textures.get(TEX.terrainTilesNyc);
    for (let i = 0; i < 2; i++) if (!sheet.has(`t${i}`)) sheet.add(`t${i}`, 0, i * 16, 0, 16, 16);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < Math.ceil(width / 16); x++) {
        this.add.image(x * 16, 112 + y * 16, TEX.terrainTilesNyc, `t${(x + y) % 2}`).setOrigin(0, 0);
      }
    }

    CHARACTERS.forEach((character, i) => {
      const knight = this.add.sprite(72 + i * 48, 104, `knight_${character.id}_${ANIMATED[i]}_stand`);
      knight.play({ key: `walk_${character.id}_${ANIMATED[i]}`, frameRate: 5 });
      if (i === 1) knight.setFlipX(true);
    });

    const title = { fontFamily: FONT, fontSize: '16px', color: '#a8e0ff', stroke: '#202848', strokeThickness: 4 };
    this.add.text(width / 2, 22, 'RAIN', title).setOrigin(0.5, 0);
    this.add.text(width / 2, 42, 'KNIGHTS', title).setOrigin(0.5, 0);
    this.add.text(width / 2, 66, 'A STORM SURVIVAL', textStyle('#c8c8e8')).setOrigin(0.5, 0);

    const start = this.add.text(width / 2, 128, 'PRESS START', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(5);
    this.tweens.add({ targets: start, alpha: 0, duration: 500, yoyo: true, repeat: -1, hold: 200 });
    this.add.text(width / 2, height - 12, 'WASD MOVE  SPACE SWING  J BEAM', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(5);

    for (let i = 0; i < 26; i++) {
      const drop = this.add
        .image(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height), TEX.rain)
        .setAlpha(0.6)
        .setTint(0x88b8f0);
      this.drops.push(drop);
    }

    const go = () => this.scene.start('CharacterSelectScene');
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown-SPACE', go);
    this.input.keyboard?.once('keydown-ENTER', go);
  }

  update(_time: number, delta: number) {
    const { width, height } = this.scale;
    for (const drop of this.drops) {
      drop.y += (110 * delta) / 1000;
      drop.x -= (40 * delta) / 1000;
      if (drop.y > height + 6 || drop.x < -4) {
        drop.y = -6;
        drop.x = Phaser.Math.Between(0, width + 40);
      }
    }
  }
}
