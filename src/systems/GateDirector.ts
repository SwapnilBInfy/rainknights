import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { FONT } from '../ui/Window';
import type { Gate } from './zones';

export const GATE_NAME: Record<1 | 2, string> = { 1: 'Midtown', 2: 'Core' };

interface Live {
  gate: Gate;
  open: boolean;
  blocks: Phaser.GameObjects.Rectangle[];
  colliders: Phaser.Physics.Arcade.Collider[];
  label: Phaser.GameObjects.Text;
}

/**
 * The gates between a city's zones. Each is a few tiles of open ground in a ring of rock that is shut (a barred door
 * with its level on a plate) until the knight is of that level; then it opens for good. Enemies cannot get through a
 * shut one either. The knight can ask a gate what it wants by walking up to it.
 */
export class GateDirector {
  private readonly live: Live[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private lastBump = -1e9;
  /** Called when a gate opens in play (not for those already open when the city is entered). */
  onOpened?: (gate: Gate) => void;
  /** Called when the knight walks up to a shut gate. */
  onBump?: (gate: Gate) => void;

  constructor(
    scene: Phaser.Scene,
    gates: readonly Gate[],
    private readonly knight: Phaser.Physics.Arcade.Sprite,
    enemies: Phaser.Physics.Arcade.Group
  ) {
    this.gfx = scene.add.graphics().setDepth(2.4);
    for (const gate of gates) {
      const blocks: Phaser.GameObjects.Rectangle[] = [];
      const colliders: Phaser.Physics.Arcade.Collider[] = [];
      const group = scene.physics.add.staticGroup();
      for (const t of gate.tiles) {
        const block = scene.add.rectangle(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, TILE, TILE, 0xffffff, 0);
        scene.physics.add.existing(block, true);
        group.add(block);
        blocks.push(block);
      }
      colliders.push(scene.physics.add.collider(knight, group), scene.physics.add.collider(enemies, group));
      const label = scene.add
        .text(gate.col * TILE + TILE / 2, gate.row * TILE - 6, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', backgroundColor: '#a02828', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 1)
        .setDepth(2.6);
      this.live.push({ gate, open: false, blocks, colliders, label });
    }
  }

  get gates(): { gate: Gate; open: boolean }[] {
    return this.live.map((l) => ({ gate: l.gate, open: l.open }));
  }

  /** Open whatever the knight's level reaches, and draw the rest shut. `announce` says an opening is news. */
  update(level: number, time: number, announce = true) {
    for (const g of this.live) {
      if (!g.open && level >= g.gate.level) this.open(g, announce);
    }
    this.draw();
    if (!this.onBump) return;
    for (const g of this.live) {
      if (g.open) continue;
      const near = g.gate.tiles.some((t) => Math.hypot(this.knight.x - (t.col * TILE + TILE / 2), this.knight.y - (t.row * TILE + TILE / 2)) < 16);
      if (near && time - this.lastBump > 3500) {
        this.lastBump = time;
        this.onBump(g.gate);
      }
    }
  }

  private open(g: Live, announce: boolean) {
    g.open = true;
    for (const c of g.colliders) c.destroy();
    g.colliders = [];
    for (const b of g.blocks) b.destroy();
    g.blocks = [];
    g.label.setText(`Lv${g.gate.level}`).setBackgroundColor('#28803a');
    if (announce) this.onOpened?.(g.gate);
  }

  private draw() {
    const g = this.gfx;
    g.clear();
    for (const l of this.live) {
      if (!l.label.text) l.label.setText(`Lv${l.gate.level}`);
      for (const t of l.gate.tiles) {
        const x = t.col * TILE;
        const y = t.row * TILE;
        if (l.open) {
          // an open gate: just its posts
          g.fillStyle(0x28803a, 0.35).fillRect(x, y, TILE, TILE);
          continue;
        }
        g.fillStyle(0x3a2a24, 1).fillRect(x, y, TILE, TILE);
        g.fillStyle(0x6a4a3a, 1);
        for (let bar = 2; bar < TILE; bar += 5) g.fillRect(x + bar, y + 1, 2, TILE - 2);
        g.fillStyle(0xc8a050, 1).fillRect(x, y + 6, TILE, 2); // a crossbar
      }
    }
  }

  destroy() {
    for (const l of this.live) {
      for (const c of l.colliders) c.destroy();
      for (const b of l.blocks) b.destroy();
      l.label.destroy();
    }
    this.live.length = 0;
    this.gfx.destroy();
  }
}
