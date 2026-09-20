import Phaser from 'phaser';
import { CHARACTERS, type CharacterDef } from '../config/characters';
import { chibiKey } from '../gfx/chibi';
import { UI } from '../gfx/palette';
import { drawCursor, drawWindow, textStyle } from '../ui/Window';
import { audio } from '../audio/engine';

/** Maps a stat multiplier to 1-5 filled segments (1.0 = 3). */
function segments(mult: number, invert = false): number {
  const effective = invert ? 2 - mult : mult;
  return Math.max(1, Math.min(5, Math.round(((effective - 0.5) / 1.0) * 4) + 1));
}

export class CharacterSelectScene extends Phaser.Scene {
  private selected = 0;
  private chosen = false;

  constructor() {
    super('CharacterSelectScene');
  }

  create() {
    this.selected = 0;
    this.chosen = false;
    audio.playMusic('title');
    const { width } = this.scale;
    this.cameras.main.setBackgroundColor('#181c38');

    this.add.text(width / 2, 4, 'CHOOSE YOUR KNIGHT', textStyle('#f8f8f8')).setOrigin(0.5, 0);
    drawWindow(this, 4, 16, 132, 140);
    drawWindow(this, 140, 16, 96, 140);

    const cursor = this.add.graphics();
    const names: Phaser.GameObjects.Text[] = [];
    CHARACTERS.forEach((character, i) => {
      const y = 22 + i * 44;
      this.add.image(14, y + 10, chibiKey(character.id, 'down', 'stand')).setOrigin(0, 0);
      names.push(this.add.text(33, y + 20, character.name, textStyle()));
      const zone = this.add
        .rectangle(8, y, 124, 42, 0xffffff, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i, cursor, names, detail));
      zone.on('pointerdown', () => this.choose(character));
    });

    const detail = this.add.container(0, 0);
    this.select(0, cursor, names, detail);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.select((this.selected + 2) % 3, cursor, names, detail);
      else if (k === 'arrowdown' || k === 's') this.select((this.selected + 1) % 3, cursor, names, detail);
      else if (k === 'enter' || k === ' ' || k === 'z') this.choose(CHARACTERS[this.selected]);
      else if (k >= '1' && k <= '3') this.choose(CHARACTERS[Number(k) - 1]);
    });
  }

  private select(
    index: number,
    cursor: Phaser.GameObjects.Graphics,
    names: Phaser.GameObjects.Text[],
    detail: Phaser.GameObjects.Container
  ) {
    if (index !== this.selected) audio.play('move');
    this.selected = index;
    const character = CHARACTERS[index];
    cursor.clear();
    drawCursor(cursor, 8, 22 + index * 44 + 20);
    names.forEach((n, i) => n.setColor(i === index ? '#c07800' : '#383838'));

    detail.removeAll(true);
    const sprite = this.add.image(188, 22, chibiKey(character.id, 'down', 'stand')).setOrigin(0.5, 0).setScale(2);
    const tagline = this.add.text(146, 74, character.tagline, { ...textStyle('#686868'), lineSpacing: 2, wordWrap: { width: 84 } });
    detail.add([sprite, tagline]);

    const g = this.add.graphics();
    const rows: [string, number][] = [
      ['HP', segments(character.mods.maxHp)],
      ['SPD', segments(character.mods.moveSpeed)],
      ['DMG', segments(character.mods.attackDamage)],
      ['ATK', segments(character.mods.attackCooldown, true)],
    ];
    rows.forEach(([label, n], r) => {
      const y = 114 + r * 10;
      detail.add(this.add.text(146, y, label, textStyle()));
      for (let s = 0; s < 5; s++) {
        g.fillStyle(s < n ? UI.hpGreen : UI.paperShade, 1);
        g.fillRect(180 + s * 9, y + 1, 8, 5);
      }
    });
    detail.add(g);
  }

  private choose(character: CharacterDef) {
    if (this.chosen) return;
    this.chosen = true;
    audio.play('confirm');
    this.scene.start('RegionSelectScene', { characterId: character.id });
  }
}
