import Phaser from 'phaser';
import { CHARACTERS, type CharacterDef } from '../config/characters';
import { chibiKey } from '../gfx/chibi';
import { UI } from '../gfx/palette';
import { drawCursor, drawWindow, textStyle } from '../ui/Window';
import { audio } from '../audio/engine';
import { chooseKnight } from '../economy/economy';
import { grantUnlocks, loadGame, writeProfile } from '../save/save';
import { unlockHint } from '../systems/unlocks';

/** Maps a stat multiplier to 1-5 filled segments (1.0 = 3). */
function segments(mult: number, invert = false): number {
  const effective = invert ? 2 - mult : mult;
  return Math.max(1, Math.min(5, Math.round(((effective - 0.5) / 1.0) * 4) + 1));
}

export class CharacterSelectScene extends Phaser.Scene {
  private selected = 0;
  private chosen = false;
  /** Opened from the house mirror: pick a knight and return home, instead of starting a run. */
  private wardrobe = false;
  /** The knights the player has earned. */
  private have: string[] = [];

  constructor() {
    super('CharacterSelectScene');
  }

  create(data: { wardrobe?: boolean } = {}) {
    this.selected = 0;
    this.chosen = false;
    this.wardrobe = data.wardrobe === true;
    grantUnlocks(); // (a knight earned since the last visit is here now)
    this.have = loadGame().town.unlocked;
    audio.playMusic(this.wardrobe ? 'town' : 'title');
    const { width } = this.scale;
    this.cameras.main.setBackgroundColor('#181c38');

    this.add.text(width / 2, 4, this.wardrobe ? 'THE MIRROR' : 'CHOOSE YOUR KNIGHT', textStyle('#f8f8f8')).setOrigin(0.5, 0);
    if (this.wardrobe) this.add.text(4, 148, 'ESC: BACK', textStyle('#f8f8f8')).setDepth(5);
    drawWindow(this, 4, 16, 132, 140);
    drawWindow(this, 140, 16, 96, 140);

    const cursor = this.add.graphics();
    const names: Phaser.GameObjects.Text[] = [];
    CHARACTERS.forEach((character, i) => {
      const y = 22 + i * 44;
      const open = this.have.includes(character.id);
      const portrait = this.add.image(14, y + 10, chibiKey(character.id, 'down', 'stand')).setOrigin(0, 0);
      if (!open) portrait.setTintFill(0x202030); // a shadow: not met yet
      names.push(this.add.text(33, y + 20, open ? character.name : '???', textStyle()));
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
      else if (k === 'escape' && this.wardrobe && !this.chosen) this.scene.start('HouseScene');
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
    const open = this.have.includes(character.id);
    const sprite = this.add.image(188, 22, chibiKey(character.id, 'down', 'stand')).setOrigin(0.5, 0).setScale(2);
    if (!open) sprite.setTintFill(0x202030);
    const tagline = this.add.text(146, 74, open ? character.tagline : `LOCKED\n${unlockHint(character.id)}`, { ...textStyle(open ? '#686868' : '#c07800'), lineSpacing: 2, wordWrap: { width: 84 } });
    detail.add([sprite, tagline]);
    const app = document.getElementById('app');
    if (app) app.dataset.knightLocked = open ? '' : character.id;
    if (!open) return; // (the numbers are a secret until the knight is earned)

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
    if (!this.have.includes(character.id)) {
      audio.play('move'); // not yet earned
      return;
    }
    this.chosen = true;
    audio.play('confirm');
    if (this.wardrobe) {
      writeProfile(chooseKnight(loadGame().town, character.id));
      this.scene.start('HouseScene');
      return;
    }
    writeProfile(chooseKnight(loadGame().town, character.id));
    this.scene.start('TownScene');
  }
}
