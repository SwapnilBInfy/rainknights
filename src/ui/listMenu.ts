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
  /** Left (-1) or right (+1) on a row: for menus where a row holds a value (the stats screen). */
  private onSide: ((id: string, dir: number) => void) | null = null;
  private pendingSide = 0;
  /** The first visible row, when the list is longer than the window. */
  private top = 0;
  private title = '';
  private hint = '';
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
  /**
   * Driven from the window instead of the scene: for a menu opened over a paused scene (Phaser stops feeding a paused
   * scene its keys and its update, so the usual `pump` would never run). Keys come from the window and a frame loop
   * pumps the menu itself.
   */
  private driven = false;
  private held = new Set<string>();
  private loop = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  private startDriving() {
    if (this.driven) return;
    this.driven = true;
    this.held.clear();
    window.addEventListener('keydown', this.onWindowKey, true);
    window.addEventListener('keyup', this.onWindowKeyUp, true);
    const tick = (now: number) => {
      if (!this.driven) return;
      this.pump(now);
      this.loop = requestAnimationFrame(tick);
    };
    this.loop = requestAnimationFrame(tick);
  }

  private stopDriving() {
    if (!this.driven) return;
    this.driven = false;
    window.removeEventListener('keydown', this.onWindowKey, true);
    window.removeEventListener('keyup', this.onWindowKeyUp, true);
    cancelAnimationFrame(this.loop);
    this.held.clear();
  }

  private onWindowKey = (event: KeyboardEvent) => {
    if (!this.isOpen) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter', 'escape'].includes(key)) event.preventDefault();
    this.held.add(key);
    this.onPhaserKey(event);
  };

  private onWindowKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.key.toLowerCase());
  };

  show(opts: {
    title: string;
    /** Pixel-drawn number beside the title, typically the drips you are holding. */
    titleValue?: string;
    rows: MenuRow[];
    hint?: string;
    onPick: (id: string) => void;
    onClose: () => void;
    onMove?: (id: string) => void;
    onSide?: (id: string, dir: number) => void;
    /** Open over a paused scene: see `driven`. */
    driven?: boolean;
  }) {
    this.onPick = opts.onPick;
    this.onClose = opts.onClose;
    this.onMove = opts.onMove ?? (() => {});
    this.onSide = opts.onSide ?? null;
    this.pendingSide = 0;
    this.top = 0;
    if (opts.driven) this.startDriving();
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
    this.rows = rows;
    const next = rows.findIndex((row) => row.id === keep);
    this.index = next >= 0 ? next : Math.min(this.index, Math.max(0, rows.length - 1));
    this.render(title, rows, hint);
  }

  setHint(hint: string) {
    this.hint = hint;
    this.hintText?.setText(hint);
  }

  hide() {
    if (!this.isOpen && !this.root) return;
    this.isOpen = false;
    this.stopDriving();
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
        this.render(this.title, this.rows, this.hint); // (scrolls the window to the row if it is out of view)
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

    if (this.isOpen && this.pendingSide !== 0) {
      const side = this.pendingSide;
      this.pendingSide = 0;
      const id = this.rows[this.index]?.id;
      if (id && this.onSide) this.onSide(id, side);
    }

    // A down-then-confirm that lands in the same frame should buy the row you moved to.
    if (this.isOpen && this.pendingConfirm) {
      this.pendingConfirm = false;
      this.confirm();
    }
  }

  /** How many rows fit in the window at once; a longer list scrolls. */
  static readonly MAX_ROWS = 8;

  private render(title: string, rows: MenuRow[], hint: string) {
    this.rows = rows;
    this.title = title;
    this.hint = hint;
    this.root?.destroy(true);
    this.labels = [];
    this.rowY = [];
    const maxRows = ListMenu.MAX_ROWS;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, rows.length - maxRows)));
    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + maxRows) this.top = this.index - maxRows + 1;
    const visible = rows.slice(this.top, this.top + maxRows);

    const rowH = 13;
    const winW = 216;
    const winH = Math.min(150, 24 + visible.length * rowH + (hint ? 14 : 0));
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
    for (const row of visible) {
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
    const at = this.index - this.top;
    this.labels.forEach((label, i) => label.setColor(i === at ? '#c07800' : '#383838'));
    const y = this.rowY[at];
    if (this.cursor && y !== undefined) {
      this.cursor.clear();
      drawCursor(this.cursor, 240 / 2 - 216 / 2 + 10, y);
      this.drawArrows();
    }
  }

  /** The "more above / below" arrows, redrawn with the cursor (which clears its graphics). */
  private drawArrows() {
    if (!this.cursor) return;
    const winW = 216;
    const maxRows = ListMenu.MAX_ROWS;
    const visible = Math.min(maxRows, this.rows.length - this.top);
    const winH = Math.min(150, 24 + visible * 13 + (this.hint ? 14 : 0));
    const x = Math.round((240 - winW) / 2);
    const y = Math.max(4, Math.round((160 - winH) / 2));
    this.cursor.fillStyle(0x686868, 1);
    if (this.top > 0) this.cursor.fillTriangle(x + winW - 16, y + 12, x + winW - 8, y + 12, x + winW - 12, y + 7);
    if (this.top + maxRows < this.rows.length) {
      const by = y + winH - (this.hint ? 20 : 8);
      this.cursor.fillTriangle(x + winW - 16, by, x + winW - 8, by, x + winW - 12, by + 5);
    }
  }

  private listen() {
    const kb = this.scene.input.keyboard;
    if (this.driven) return; // the window feeds a driven menu
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
    else if (key === 'arrowleft' || key === 'a') this.pendingSide = -1;
    else if (key === 'arrowright' || key === 'd') this.pendingSide = 1;
    else if (key === 'escape' || key === 'p') this.pendingClose = true;
    else if (key === 'enter' || key === ' ' || key === 'z') this.pendingConfirm = true;
    else if (key >= '1' && key <= '9') this.pendingPick = Number(key);
  };

  private upHeld() {
    const kb = this.scene.input.keyboard;
    if (this.driven) return this.held.has('arrowup') || this.held.has('w');
    if (!kb) return false;
    return !!(kb.addKey('UP').isDown || kb.addKey('W').isDown);
  }

  private downHeld() {
    const kb = this.scene.input.keyboard;
    if (this.driven) return this.held.has('arrowdown') || this.held.has('s');
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
    const before = this.top;
    const maxRows = ListMenu.MAX_ROWS;
    if (this.index < this.top) this.top = this.index;
    else if (this.index >= this.top + maxRows) this.top = this.index - maxRows + 1;
    // wrapping from the last row to the first (or back) shows the other end of the list
    if (this.top !== before) this.render(this.title, this.rows, this.hint);
    else this.paint();
    this.onMove(this.rows[this.index]?.id ?? '');
  }

  private confirm() {
    const id = this.rows[this.index]?.id;
    if (!id) return;
    this.onPick(id);
  }
}
