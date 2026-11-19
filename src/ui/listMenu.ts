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
 * A GBA-style list. Arrows, WASD, the touch stick, and a gamepad d-pad move it.
 * Holding a direction repeats. Space / Enter / A / Start confirm, Esc / B closes,
 * and 1-9 pick a row. The scene calls `pump` every frame; that is the only path.
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
  private listening = false;
  private pendingDir = 0;
  private pendingConfirm = false;
  private pendingClose = false;
  private pendingPick = 0;
  private repeatDir = 0;
  private repeatAt = 0;
  private blockUp = false;
  private blockDown = false;
  private padConfirmWas = false;
  private padBackWas = false;
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
    this.pendingDir = 0;
    this.pendingConfirm = false;
    this.pendingClose = false;
    this.pendingPick = 0;
    this.repeatDir = 0;
    this.repeatAt = 0;
    // A direction still held from walking up to the counter must not spin the list.
    this.blockUp = this.upHeld();
    this.blockDown = this.downHeld();
    this.render(opts.title, opts.rows, opts.hint ?? '');
    this.listen();
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
    this.silence();
    this.pendingDir = 0;
    this.pendingConfirm = false;
    this.pendingClose = false;
    this.pendingPick = 0;
    this.repeatDir = 0;
    this.root?.destroy(true);
    this.root = null;
    this.labels = [];
    this.cursor = null;
    this.hintText = null;
    this.digits = null;
    // A key still held to scroll the list should not walk the knight out of the shop.
    this.scene.input.keyboard?.resetKeys();
  }

  /**
   * One input path for the keyboard, the touch stick, and a gamepad.
   * Call this from the scene update. Taps are remembered from Phaser's keydown
   * (so a press and release in the same frame still counts) and a held direction
   * repeats on a timer, the way a GBA menu does.
   */
  pump(time: number) {
    if (!this.isOpen) return;
    const pad = this.readPad();
    if (pad.confirmEdge) this.pendingConfirm = true;
    if (pad.backEdge) this.pendingClose = true;

    if (this.pendingClose) {
      this.pendingClose = false;
      this.pendingConfirm = false;
      this.pendingDir = 0;
      this.pendingPick = 0;
      this.onClose();
      return;
    }
    if (this.pendingPick) {
      const n = this.pendingPick - 1;
      this.pendingPick = 0;
      this.pendingConfirm = false;
      if (n >= 0 && n < this.rows.length) {
        this.index = n;
        this.paint();
        this.confirm();
      }
      return;
    }

    if (!this.upHeld()) this.blockUp = false;
    if (!this.downHeld()) this.blockDown = false;

    let dir = 0;
    if (this.pendingDir === -1 && !this.blockUp) dir = -1;
    else if (this.pendingDir === 1 && !this.blockDown) dir = 1;
    else if (this.pendingDir === 0) {
      const up = (this.upHeld() && !this.blockUp) || pad.up;
      const down = (this.downHeld() && !this.blockDown) || pad.down;
      if (up && !down) dir = -1;
      else if (down && !up) dir = 1;
    }
    this.pendingDir = 0;

    if (dir === 0) this.repeatDir = 0;
    else if (dir !== this.repeatDir) {
      this.repeatDir = dir;
      this.repeatAt = time + 520;
      this.step(dir);
    } else if (time >= this.repeatAt) {
      this.step(dir);
      this.repeatAt = time + 150;
    }

    // A down-then-confirm that lands in the same frame should buy the row you moved to.
    if (this.isOpen && this.pendingConfirm) {
      this.pendingConfirm = false;
      this.confirm();
    }
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

  private listen() {
    const kb = this.scene.input.keyboard;
    if (!kb || this.listening) return;
    kb.on('keydown', this.onPhaserKey);
    this.listening = true;
  }

  private silence() {
    if (!this.listening) return;
    this.scene.input.keyboard?.off('keydown', this.onPhaserKey);
    this.listening = false;
  }

  private onPhaserKey = (event: KeyboardEvent) => {
    if (!this.isOpen || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') this.pendingDir = -1;
    else if (key === 'arrowdown' || key === 's') this.pendingDir = 1;
    else if (key === 'escape' || key === 'p') this.pendingClose = true;
    else if (key === 'enter' || key === ' ' || key === 'z') this.pendingConfirm = true;
    else if (key >= '1' && key <= '9') this.pendingPick = Number(key);
  };

  private upHeld() {
    const kb = this.scene.input.keyboard;
    if (!kb) return false;
    return !!(kb.addKey('UP').isDown || kb.addKey('W').isDown);
  }

  private downHeld() {
    const kb = this.scene.input.keyboard;
    if (!kb) return false;
    return !!(kb.addKey('DOWN').isDown || kb.addKey('S').isDown);
  }

  private readPad() {
    let up = false;
    let down = false;
    let confirm = false;
    let back = false;
    const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() ?? [] : [];
    for (const pad of pads) {
      if (!pad) continue;
      up = up || !!pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.5;
      down = down || !!pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.5;
      confirm = confirm || !!pad.buttons[0]?.pressed;
      back = back || !!pad.buttons[1]?.pressed;
    }
    const confirmEdge = confirm && !this.padConfirmWas;
    const backEdge = back && !this.padBackWas;
    this.padConfirmWas = confirm;
    this.padBackWas = back;
    return { up, down, confirmEdge, backEdge };
  }

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
