import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { drawWindow, drawCursor, textStyle } from '../ui/Window';

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  apply: (player: Player) => void;
}

const WEAPON_MIN_COOLDOWN = 180;

export const UPGRADE_POOL: UpgradeOption[] = [
  {
    id: 'weapon_damage',
    name: 'Storm Bolt+',
    description: 'Auto-attack damage +6',
    apply: (p) => (p.attackDamage += 6),
  },
  {
    id: 'weapon_speed',
    name: 'Squall Rhythm',
    description: 'Attack cooldown -12%',
    apply: (p) => (p.attackCooldown = Math.max(WEAPON_MIN_COOLDOWN, Math.round(p.attackCooldown * 0.88))),
  },
  {
    id: 'weapon_range',
    name: 'Long Gust',
    description: 'Attack range +25',
    apply: (p) => (p.attackRange += 25),
  },
  {
    id: 'weapon_pierce',
    name: 'Piercing Hail',
    description: 'Storm Bolt pierces +1 enemy',
    apply: (p) => (p.pierce += 1),
  },
  {
    id: 'vitality',
    name: 'Vitality',
    description: 'Max HP +20 and full heal',
    apply: (p) => {
      p.maxHp += 20;
      p.hp = p.maxHp;
    },
  },
  {
    id: 'magnet',
    name: 'Lodestone',
    description: 'XP magnet radius +20',
    apply: (p) => (p.magnetRadius += 20),
  },
  {
    id: 'sunbeam',
    name: 'Sunbeam',
    description: 'Periodic heal + burst damage aura',
    apply: (p) => (p.powerups.sunbeam += 1),
  },
  {
    id: 'rainbow_shield',
    name: 'Rainbow Shield',
    description: 'Periodic brief invulnerability',
    apply: (p) => (p.powerups.rainbowShield += 1),
  },
  {
    id: 'gale',
    name: 'Gale Force',
    description: 'Move speed +20%',
    apply: (p) => (p.powerups.gale += 1),
  },
  {
    id: 'frost',
    name: 'Frost Aura',
    description: 'Slows nearby enemies',
    apply: (p) => (p.powerups.frost += 1),
  },
  {
    id: 'static',
    name: 'Static Charge',
    description: 'Attacks chain to a second enemy',
    apply: (p) => (p.powerups.staticCharge += 1),
  },
];

function pickThree(): UpgradeOption[] {
  const pool = [...UPGRADE_POOL];
  const picks: UpgradeOption[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

/**
 * Pokémon-style level-up menu: a boxed list with a ▶ cursor, the highlighted
 * upgrade's description in a bottom text box. Arrows/W-S move, Enter/Space/Z
 * confirm, 1-3 pick directly, or use the mouse.
 */
export class LevelUpSystem {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  presentChoices(player: Player, level: number, onResume: () => void) {
    this.close();
    const options = pickThree();
    let selected = 0;

    const dim = this.scene.add.rectangle(0, 0, 240, 160, 0x000000, 0.4).setOrigin(0, 0);
    const titleWin = drawWindow(this.scene, 60, 22, 96, 20);
    const title = this.scene.add.text(68, 28, `LEVEL ${level}!`, textStyle());
    const listWin = drawWindow(this.scene, 60, 44, 176, 20 + options.length * 16);
    const cursor = this.scene.add.graphics();
    const names = options.map((opt, i) => this.scene.add.text(80, 54 + i * 16, opt.name, textStyle()));
    const descWin = drawWindow(this.scene, 4, 118, 232, 38);
    const desc = this.scene.add.text(12, 126, '', { ...textStyle(), wordWrap: { width: 216 } });

    const zones = options.map((_, i) =>
      this.scene.add
        .rectangle(64, 50 + i * 16, 168, 16, 0xffffff, 0)
        .setOrigin(0, 0)
        .setScrollFactor(0) // hit-testing uses the child's own scroll factor, not the container's
        .setInteractive({ useHandCursor: true })
    );

    const render = () => {
      cursor.clear();
      drawCursor(cursor, 68, 55 + selected * 16);
      names.forEach((n, i) => n.setColor(i === selected ? '#c07800' : '#383838'));
      desc.setText(options[selected].description);
    };
    const confirm = (i: number) => {
      options[i].apply(player);
      this.close();
      onResume();
    };

    zones.forEach((z, i) => {
      z.on('pointerover', () => {
        selected = i;
        render();
      });
      z.on('pointerdown', () => confirm(i));
    });

    // Ignore key-repeat and anything in the first moments, so mashing Space to swing
    // when the menu pops up can't accidentally pick an upgrade.
    const openedAt = this.scene.time.now;
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat || this.scene.time.now - openedAt < 400) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') selected = (selected + options.length - 1) % options.length;
      else if (k === 'arrowdown' || k === 's') selected = (selected + 1) % options.length;
      else if (k === 'enter' || k === ' ' || k === 'z') return confirm(selected);
      else if (k >= '1' && k <= String(options.length)) return confirm(Number(k) - 1);
      else return;
      render();
    };
    this.scene.input.keyboard?.on('keydown', this.keyHandler);

    this.root = this.scene.add
      .container(0, 0, [dim, titleWin, title, listWin, cursor, ...names, descWin, desc, ...zones])
      .setScrollFactor(0)
      .setDepth(200);
    render();
  }

  close() {
    if (this.keyHandler) {
      this.scene.input.keyboard?.off('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.root?.destroy();
    this.root = null;
  }
}
