import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { drawWindow, drawCursor, textStyle } from '../ui/Window';
import { audio } from '../audio/engine';

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  apply: (player: Player) => void;
}

const WEAPON_MIN_COOLDOWN = 180;

/** Ignore confirms that arrive with the swing which opened the menu. */
const ARM_MS = 400;

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

interface HitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
}

/**
 * Pokémon-style level-up menu: a boxed list with a ▶ cursor, the highlighted
 * upgrade's description in a bottom text box. Arrows/W-S move, Enter/Space/Z
 * confirm, 1-3 pick directly, or use the mouse.
 *
 * GameScene pauses the whole scene while this is open. Phaser then ignores
 * the scene's keyboard and pointer plugins, so input is read from window.
 * Confirms are ignored for a short beat so a held swing (Space / A) cannot
 * pick an upgrade by accident. Start is consumed by the pause binder and
 * does not confirm.
 */
export class LevelUpSystem {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private onPointer: ((e: PointerEvent) => void) | null = null;
  private armTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  presentChoices(player: Player, level: number, onResume: () => void) {
    this.close();
    const options = pickThree();
    let selected = 0;
    let settled = false;
    let armed = false;

    const dim = this.scene.add.rectangle(0, 0, 240, 160, 0x080810, 0.62).setOrigin(0, 0);
    const titleWin = drawWindow(this.scene, 60, 22, 96, 20);
    const title = this.scene.add.text(68, 28, `LEVEL ${level}!`, textStyle());
    const listWin = drawWindow(this.scene, 60, 44, 176, 20 + options.length * 16);
    const cursor = this.scene.add.graphics();
    const names = options.map((opt, i) => this.scene.add.text(80, 54 + i * 16, opt.name, textStyle()));
    const descWin = drawWindow(this.scene, 4, 118, 232, 38);
    const desc = this.scene.add.text(12, 126, '', { ...textStyle(), wordWrap: { width: 216 } });
    const boxes: HitBox[] = options.map((_, i) => ({ x: 64, y: 50 + i * 16, w: 168, h: 16, index: i }));

    let lastShown = -1;
    const render = () => {
      if (lastShown !== -1 && lastShown !== selected) audio.play('move');
      lastShown = selected;
      cursor.clear();
      drawCursor(cursor, 68, 55 + selected * 16);
      names.forEach((n, i) => n.setColor(i === selected ? '#c07800' : '#383838'));
      desc.setText(options[selected].description);
    };
    const confirm = (i: number) => {
      if (settled || !armed) return;
      settled = true;
      audio.play('confirm');
      options[i].apply(player);
      this.close();
      onResume();
    };
    const move = (delta: number) => {
      if (!armed) return;
      selected = (selected + delta + options.length) % options.length;
      render();
    };

    this.armTimer = window.setTimeout(() => {
      armed = true;
    }, ARM_MS);

    this.onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') {
        e.preventDefault();
        move(-1);
      } else if (k === 'arrowdown' || k === 's') {
        e.preventDefault();
        move(1);
      } else if (k === 'enter' || k === ' ' || k === 'z') {
        e.preventDefault();
        confirm(selected);
      } else if (k >= '1' && k <= String(options.length)) {
        e.preventDefault();
        confirm(Number(k) - 1);
      }
    };
    this.onPointer = (e: PointerEvent) => {
      if (e.target !== this.scene.game.canvas) return;
      const point = this.canvasPoint(e.clientX, e.clientY);
      if (!point) return;
      const hit = boxes.find((box) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h);
      if (!hit) return;
      if (e.type === 'pointermove') {
        if (hit.index === selected) return;
        selected = hit.index;
        render();
        return;
      }
      if (e.type === 'pointerdown') confirm(hit.index);
    };

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('pointermove', this.onPointer);

    const app = document.getElementById('app');
    if (app) app.dataset.levelUp = 'open';

    this.root = this.scene.add
      .container(0, 0, [dim, titleWin, title, listWin, cursor, ...names, descWin, desc])
      .setScrollFactor(0)
      .setDepth(200);
    render();
  }

  close() {
    if (this.armTimer) window.clearTimeout(this.armTimer);
    this.armTimer = 0;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    if (this.onPointer) {
      window.removeEventListener('pointerdown', this.onPointer);
      window.removeEventListener('pointermove', this.onPointer);
    }
    this.onKey = null;
    this.onPointer = null;
    this.root?.destroy();
    this.root = null;
    const app = document.getElementById('app');
    if (app) delete app.dataset.levelUp;
  }

  private canvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 240,
      y: ((clientY - rect.top) / rect.height) * 160,
    };
  }
}
