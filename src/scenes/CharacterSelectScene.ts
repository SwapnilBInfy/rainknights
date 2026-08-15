import Phaser from 'phaser';
import { CHARACTERS, type CharacterDef } from '../config/characters';

const FONT = 'Courier New, monospace';

function pips(mult: number, invert = false): string {
  const effective = invert ? 2 - mult : mult;
  const raw = Math.round(((effective - 0.5) / 1.0) * 4) + 1;
  const clamped = Math.max(1, Math.min(5, raw));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelectScene');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    this.add
      .text(width / 2, 46, 'CHOOSE YOUR KNIGHT', {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#ffd76b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 74, 'click a knight, or press 1 / 2 / 3', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9a94c0',
      })
      .setOrigin(0.5);

    const panelXs = [width * 0.18, width * 0.5, width * 0.82];
    const panelY = height * 0.58;
    const panelW = 190;
    const panelH = 300;

    CHARACTERS.forEach((character, i) => {
      const px = panelXs[i];
      const border = this.add
        .rectangle(px, panelY, panelW, panelH, 0x14121f, 0.85)
        .setStrokeStyle(2, 0x3a3550);

      this.add
        .image(px, panelY - 95, character.textureKey)
        .setScale(character.displayScale * 2.1);

      this.add
        .text(px, panelY - 15, character.name, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#eef0ff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      this.add
        .text(px, panelY + 8, character.tagline, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#9a94c0',
          align: 'center',
          wordWrap: { width: panelW - 20 },
        })
        .setOrigin(0.5);

      const stats = [
        ['HP', pips(character.mods.maxHp)],
        ['SPD', pips(character.mods.moveSpeed)],
        ['DMG', pips(character.mods.attackDamage)],
        ['ATK SPD', pips(character.mods.attackCooldown, true)],
      ];
      stats.forEach(([label, value], row) => {
        this.add
          .text(px, panelY + 40 + row * 16, `${label.padEnd(8, ' ')}${value}`, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#8fe0ff',
          })
          .setOrigin(0.5);
      });

      const zone = this.add
        .rectangle(px, panelY, panelW, panelH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => border.setStrokeStyle(3, 0xffd76b));
      zone.on('pointerout', () => border.setStrokeStyle(2, 0x3a3550));
      zone.on('pointerdown', () => this.choose(character));

      this.input.keyboard?.once(`keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => this.choose(character));
    });
  }

  private choose(character: CharacterDef) {
    this.input.keyboard?.removeAllListeners();
    this.scene.start('WeatherCheckScene', { characterId: character.id });
  }
}
