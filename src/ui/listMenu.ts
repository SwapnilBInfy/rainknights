import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { drawCursor, drawWindow, textStyle } from './Window';
import { digitWidth, drawDigits } from './digits';

export interface MenuRow {
  id: string;
  label: string;
  /** Right-aligned pixel digits (a price or a count). Not drawn with the font, so 8 stays an 8. */
  value?: string;
}

/**
 * A GBA-style list. Arrows / the d-pad move, Space / Enter / A / Start confirm,
 * Esc closes, and 1-9 pick a row. Touch A is Space and Start is Enter, so the
 * same menu works with the on-screen buttons.
 */
export class ListMenu {
  private root: Phaser.GameObjects.Container | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private cursor: Phaser.GameObjects.Graphics | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private rows: MenuRow[] = [];
  private index = 0;
  private rowY: number[] = [];
  private digits: Phaser.GameObjects.Graphics | null = null;
  private titleValue = '';
  private onPick: (id: string) => void = () => {};
  private onClose: () => void = () => {};
  private onMove: (id: string) => void = () => {};
  isOpen = false;

  constructor(private readonly scene: Phaser.Scene) {}

  show(opts: {
    title: string;
    /** Pixel-drawn number beside the title, typically the drips you are holding. */
    titleValue?: string;
    rows: MenuRow[];
    hint?: string;
    onPick: (id: string) => void;
    onClose: () => void;
    onMove?: (id: string) => void;
  }) {
    this.onPick = opts.onPick;
    this.onClose = opts.onClose;
    this.onMove = opts.onMove ?? (() => {});
    this.titleValue = opts.titleValue ?? '';
    this.index = 0;
    this.isOpen = true;
    // Drop keys that were held to walk up to this counter, or their keyup gets lost and the knight keeps going.
    this.scene.input.keyboard?.resetKeys();
    this.render(opts.title, opts.rows, opts.hint ?? '');
    window.addEventListener('keydown', this.onKey, true);
    this.onMove(this.rows[0]?.id ?? '');
  }

  refresh(title: string, rows: MenuRow[], hint: string, titleValue = this.titleValue) {
    if (!this.isOpen) return;
    this.titleValue = titleValue;
    const keep = this.rows[this.index]?.id;
    this.render(title, rows, hint);
    const next = this.rows.findIndex((row) => row.id === keep);
    this.index = next >= 0 ? next : Math.min(this.index, Math.max(0, this.rows.length - 1));
    this.paint();
  }

  setHint(hint: string) {
    this.hintText?.setText(hint);
  }

  hide() {
    if (!this.isOpen && !this.root) return;
    this.isOpen = false;
    window.removeEventListener('keydown', this.onKey, true);
    this.root?.destroy(true);
    this.root = null;
    this.labels = [];
    this.cursor = null;
    this.hintText = null;
    this.digits = null;
    this.scene.input.keyboard?.resetKeys();
  }

  private render(title: string, rows: MenuRow[], hint: string) {
    this.rows = rows;
    this.root?.destroy(true);
    this.labels = [];
    this.rowY = [];

    const rowH = 13;
    const winW = 216;
    const winH = Math.min(150, 24 + rows.length * rowH + (hint ? 14 : 0));
    const x = Math.round((240 - winW) / 2);
    const y = Math.max(4, Math.round((160 - winH) / 2));

    const root = this.scene.add.container(0, 0).setDepth(200);
    const win = drawWindow(this.scene, x, y, winW, winH).setScrollFactor(0);
    root.add(win);
    root.add(this.scene.add.text(x + 10, y + 6, title, textStyle('#3078d8')).setScrollFactor(0));
    this.digits = this.scene.add.graphics().setScrollFactor(0);
    root.add(this.digits);
    if (this.titleValue) drawDigits(this.digits, x + 10 + title.length * 8 + 6, y + 7, this.titleValue, 0xc07800);

    this.cursor = this.scene.add.graphics().setScrollFactor(0);
    root.add(this.cursor);
    let ry = y + 20;
    for (const row of rows) {
      const text = this.scene.add.text(x + 22, ry, row.label, textStyle()).setScrollFactor(0);
      root.add(text);
      this.labels.push(text);
      this.rowY.push(ry);
      if (row.value) {
        const w = digitWidth(row.value);
        drawDigits(this.digits, x + winW - 12 - w, ry, row.value, 0x383838);
      }
      ry += rowH;
    }
    if (hint) {
      this.hintText = this.scene.add.text(x + 10, y + winH - 16, hint, textStyle('#686868')).setScrollFactor(0);
      root.add(this.hintText);
    } else {
      this.hintText = null;
    }
    this.root = root;
    this.paint();
  }

  private paint() {
    this.labels.forEach((label, i) => label.setColor(i === this.index ? '#c07800' : '#383838'));
    const y = this.rowY[this.index];
    if (this.cursor && y !== undefined) {
      this.cursor.clear();
      drawCursor(this.cursor, 240 / 2 - 216 / 2 + 10, y);
    }
  }

  private onKey = (event: KeyboardEvent) => {
    // Keyup must reach Phaser. Swallowing it left the walk key stuck down, so the knight
    // kept marching into the counter after the menu closed and the town looked frozen.
    // A keyup of Space was also treated as a confirm, so opening the shop bought on release.
    if (!this.isOpen || event.type !== 'keydown') return;
    const key = event.key.toLowerCase();
    if (key === 'arrowup' || key === 'arrowdown' || key === ' ' || key === 'enter') event.preventDefault();
    // Keep the key from also leaving the building. Keyup is not listened for, so Phaser still hears the release.
    event.stopPropagation();
    if (event.repeat && (key === 'enter' || key === ' ' || key === 'z')) return;
    if (key === 'arrowup' || key === 'w') this.step(-1);
    else if (key === 'arrowdown' || key === 's') this.step(1);
    else if (key === 'escape' || key === 'p') this.onClose();
    else if (key === 'enter' || key === ' ' || key === 'z') this.confirm();
    else if (key >= '1' && key <= '9') {
      const n = Number(key) - 1;
      if (n < this.rows.length) {
        this.index = n;
        this.paint();
        this.confirm();
      }
    }
  };

  private step(delta: number) {
    const next = (this.index + delta + this.rows.length) % this.rows.length;
    if (next === this.index) return;
    this.index = next;
    audio.play('move');
    this.paint();
    this.onMove(this.rows[this.index]?.id ?? '');
  }

  private confirm() {
    const id = this.rows[this.index]?.id;
    if (!id) return;
    this.onPick(id);
  }
}
