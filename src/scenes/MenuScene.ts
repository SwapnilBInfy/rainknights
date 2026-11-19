import Phaser from 'phaser';
import { CHARACTERS } from '../config/characters';
import { TEX } from '../gfx/spriteDefs';
import { FONT, drawCursor, drawWindow, textStyle } from '../ui/Window';
import { audio } from '../audio/engine';
import { menuHint } from '../input/prompts';
import { onTouchControlsChange } from '../input/touchControls';
import { loadGame, resetGameSave, type SaveData } from '../save/save';

const ANIMATED = ['down', 'side', 'down'] as const;

type Choice = 'continue' | 'new' | 'reset' | 'town';

const LABEL: Record<Choice, string> = {
  continue: 'CONTINUE',
  new: 'NEW GAME',
  reset: 'RESET SAVE',
  town: 'MISTFORD',
};

interface HitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes.toString().padStart(2, '0')}:${remain.toString().padStart(2, '0')}`;
}

function townProgress(save: SaveData): boolean {
  const town = save.town;
  return town.visited || town.coins > 0 || town.ownedArmor.length > 0 || Object.keys(town.bag).length > 0 || Object.keys(town.stash).length > 0;
}

/** Null keeps the original PRESS START title. A run, a record, a mute, or Mistford opens the menu. */
function menuChoices(save: SaveData): Choice[] | null {
  const meta = save.meta;
  const home = townProgress(save);
  const dirty =
    save.run != null ||
    home ||
    save.settings.muted ||
    meta.runs > 0 ||
    meta.wins > 0 ||
    meta.bestTime > 0 ||
    meta.bestLevel > 0 ||
    meta.bestKills > 0;
  if (!dirty) return null;
  const choices: Choice[] = [];
  if (save.run) choices.push('continue', 'new', 'reset');
  else if (home) choices.push('town', 'reset');
  else choices.push('new', 'reset');
  return choices;
}

export class MenuScene extends Phaser.Scene {
  private drops: Phaser.GameObjects.Image[] = [];
  private choices: Choice[] = [];
  private index = 0;
  private confirmIndex = 0;
  private mode: 'start' | 'menu' | 'confirm' = 'start';
  private leaving = false;
  private page: Phaser.GameObjects.Container | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private cursor: Phaser.GameObjects.Graphics | null = null;
  private rowY: number[] = [];
  private boxes: HitBox[] = [];
  private runLevel = '';
  private runClock = '';
  private runRegion = '';
  private best = '';
  private townCoins = '';

  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#181c38');
    this.drops = [];
    this.leaving = false;
    this.index = 0;
    this.confirmIndex = 0;

    const save = loadGame();
    const choices = menuChoices(save);
    this.choices = choices ?? [];
    this.mode = choices ? 'menu' : 'start';
    const run = save.run;
    this.runLevel = run ? String(run.player.level) : '';
    this.runClock = run ? clock(run.elapsedSeconds) : '';
    this.runRegion = run?.regionId ?? '';
    this.best = save.meta.runs > 0 ? clock(save.meta.bestTime) : '';
    this.townCoins = save.town.visited ? String(save.town.coins) : '';

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
    this.add.text(width / 2, 22, 'RAIN', title).setOrigin(0.5, 0).setDepth(5);
    this.add.text(width / 2, 42, 'KNIGHTS', title).setOrigin(0.5, 0).setDepth(5);
    if (!choices) {
      this.add.text(width / 2, 66, 'A STORM SURVIVAL', textStyle('#c8c8e8')).setOrigin(0.5, 0).setDepth(5);
    }

    if (this.best) {
      this.add
        .text(width - 4, 16, `BEST ${this.best}`, { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 })
        .setOrigin(1, 0)
        .setDepth(8);
    }

    for (let i = 0; i < 26; i++) {
      const drop = this.add
        .image(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height), TEX.rain)
        .setAlpha(0.6)
        .setTint(0x88b8f0);
      this.drops.push(drop);
    }

    this.add
      .text(width - 4, 4, 'M: MUTE', { ...textStyle('#c8c8e8'), stroke: '#202030', strokeThickness: 3 })
      .setOrigin(1, 0)
      .setDepth(8);
    audio.playMusic('title');

    const controls = this.add
      .text(width / 2, height - 12, menuHint(false), { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setDepth(8);
    // The optional tutorial. Under PRESS START on a fresh title; in the corner beside a saved game's menu.
    const linkStyle = { ...textStyle('#a8e0ff'), stroke: '#202030', strokeThickness: 3 };
    const link = choices
      ? this.add.text(4, 4, 'T: TUTORIAL', linkStyle).setOrigin(0, 0)
      : this.add.text(width / 2, 134, 'T: TUTORIAL', linkStyle).setOrigin(0.5, 0);
    link.setDepth(8).setInteractive({ useHandCursor: true });
    link.on('pointerover', () => link.setColor('#f8f8f8'));
    link.on('pointerout', () => link.setColor('#a8e0ff'));
    link.on('pointerdown', () => this.startTutorial());
    const detachTouch = onTouchControlsChange((touch) => {
      const hint = menuHint(touch);
      controls.setText(hint);
      link.setText(touch ? 'TAP: TUTORIAL' : 'T: TUTORIAL');
      const app = document.getElementById('app');
      if (app) {
        app.dataset.menuHint = hint;
        app.dataset.tutorialLink = link.text;
      }
    });

    if (!choices) {
      const start = this.add
        .text(width / 2, 121, 'PRESS START', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 })
        .setOrigin(0.5, 0)
        .setDepth(5);
      this.tweens.add({ targets: start, alpha: 0, duration: 500, yoyo: true, repeat: -1, hold: 200 });
      const go = () => this.startNewGame();
      this.input.once('pointerdown', go);
      this.input.keyboard?.once('keydown-SPACE', go);
      this.input.keyboard?.once('keydown-ENTER', go);
      this.input.keyboard?.once('keydown-T', () => this.startTutorial());
    } else {
      this.add.rectangle(0, 0, width, height, 0x080810, 0.55).setOrigin(0, 0).setDepth(4);
      this.showPage();
      // Window, not the scene keyboard: arrow keys are what the pause menu
      // already listens for here, and touch arrows are dispatched the same way.
      window.addEventListener('keydown', this.handleKey, true);
      this.input.on('pointermove', this.onPointerMove);
      this.input.on('pointerdown', this.onPointerDown);
    }
    this.publish();

    this.events.once('shutdown', () => {
      detachTouch();
      window.removeEventListener('keydown', this.handleKey, true);
      const app = document.getElementById('app');
      if (!app) return;
      delete app.dataset.menuHint;
      delete app.dataset.tutorialLink;
      delete app.dataset.titleMenu;
      delete app.dataset.titleChoice;
      delete app.dataset.runLevel;
      delete app.dataset.runClock;
      delete app.dataset.runRegion;
      delete app.dataset.best;
      delete app.dataset.eraseConfirm;
    });
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

  private showPage() {
    this.page?.destroy(true);
    this.labels = [];
    this.boxes = [];
    this.rowY = [];
    this.cursor = null;

    const selectable = this.mode === 'confirm' ? ['NO', 'YES'] : this.choices.map((choice) => LABEL[choice]);
    const header =
      this.mode === 'confirm'
        ? 'Erase save?'
        : this.runLevel
          ? `LV${this.runLevel}  ${this.runClock}`
          : this.townCoins !== ''
            ? `${this.townCoins} DRIPS`
            : '';
    const rowH = 16;
    const lines = (header ? 1 : 0) + selectable.length;
    const winW = 176;
    const winH = 12 + lines * rowH;
    const winX = Math.round((240 - winW) / 2);
    const winY = 64;

    const page = this.add.container(0, 0).setDepth(6);
    page.add(drawWindow(this, winX, winY, winW, winH));
    let y = winY + 8;
    if (header) {
      page.add(this.add.text(winX + 12, y, header, textStyle(this.mode === 'confirm' ? '#383838' : '#3078d8')));
      y += rowH;
    }
    this.cursor = this.add.graphics();
    page.add(this.cursor);
    selectable.forEach((label, index) => {
      const text = this.add.text(winX + 24, y, label, textStyle());
      this.labels.push(text);
      this.rowY.push(y);
      page.add(text);
      this.boxes.push({ x: winX + 6, y: y - 3, w: winW - 12, h: rowH, index });
      y += rowH;
    });
    this.page = page;
    this.paintSelection();
  }

  private paintSelection() {
    const selected = this.mode === 'confirm' ? this.confirmIndex : this.index;
    this.labels.forEach((label, index) => label.setColor(index === selected ? '#c07800' : '#383838'));
    const y = this.rowY[selected];
    if (this.cursor && y !== undefined) {
      this.cursor.clear();
      drawCursor(this.cursor, 240 / 2 - 176 / 2 + 12, y);
    }
    this.publish();
  }

  private publish() {
    const app = document.getElementById('app');
    if (!app) return;
    if (this.runLevel) {
      app.dataset.runLevel = this.runLevel;
      app.dataset.runClock = this.runClock;
      app.dataset.runRegion = this.runRegion;
    }
    if (this.best) app.dataset.best = this.best;
    if (this.mode === 'start') {
      app.dataset.titleMenu = 'start';
      app.dataset.titleChoice = 'start';
      delete app.dataset.eraseConfirm;
      return;
    }
    const first = this.choices[0];
    app.dataset.titleMenu = first === 'continue' ? 'continue' : first === 'town' ? 'town' : 'menu';
    if (this.mode === 'confirm') {
      app.dataset.titleChoice = this.confirmIndex === 0 ? 'no' : 'yes';
      app.dataset.eraseConfirm = 'open';
      return;
    }
    delete app.dataset.eraseConfirm;
    app.dataset.titleChoice = this.choices[this.index] ?? 'new';
  }

  private handleKey = (event: KeyboardEvent) => {
    if (this.leaving || this.mode === 'start') return;
    const key = event.key.toLowerCase();
    if (key === 'arrowup' || key === 'arrowdown' || key === ' ' || key === 'enter') event.preventDefault();
    if (event.repeat && (key === 'enter' || key === ' ' || key === 'z')) return;
    if (this.mode === 'confirm') {
      if (key === 'arrowup' || key === 'w') this.stepConfirm(-1);
      else if (key === 'arrowdown' || key === 's') this.stepConfirm(1);
      else if (key === 'enter' || key === ' ' || key === 'z') this.activateConfirm();
      else if (key === 'escape' || key === 'p') this.cancelConfirm();
      else if (key === '1') this.pickConfirm(0);
      else if (key === '2') this.pickConfirm(1);
      return;
    }
    if (key === 'arrowup' || key === 'w') this.step(-1);
    else if (key === 'arrowdown' || key === 's') this.step(1);
    else if (key === 'enter' || key === ' ' || key === 'z') this.activate();
    else if (key === 't') this.startTutorial();
    else if (key >= '1' && key <= String(this.choices.length)) this.pick(Number(key) - 1);
  };

  private onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (this.leaving || this.mode === 'start') return;
    const hit = this.hit(pointer.x, pointer.y);
    if (hit < 0) return;
    if (this.mode === 'confirm') {
      if (hit === this.confirmIndex) return;
      this.confirmIndex = hit;
    } else if (hit === this.index) return;
    else this.index = hit;
    audio.play('move');
    this.paintSelection();
  };

  private onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.leaving || this.mode === 'start') return;
    const hit = this.hit(pointer.x, pointer.y);
    if (hit < 0) return;
    if (this.mode === 'confirm') {
      this.confirmIndex = hit;
      this.paintSelection();
      this.activateConfirm();
      return;
    }
    this.index = hit;
    this.paintSelection();
    this.activate();
  };

  private hit(x: number, y: number): number {
    const box = this.boxes.find((entry) => x >= entry.x && x <= entry.x + entry.w && y >= entry.y && y <= entry.y + entry.h);
    return box ? box.index : -1;
  }

  private step(delta: number) {
    const next = (this.index + delta + this.choices.length) % this.choices.length;
    if (next === this.index) return;
    this.index = next;
    audio.play('move');
    this.paintSelection();
  }

  private stepConfirm(delta: number) {
    const next = (this.confirmIndex + delta + 2) % 2;
    if (next === this.confirmIndex) return;
    this.confirmIndex = next;
    audio.play('move');
    this.paintSelection();
  }

  private pick(index: number) {
    this.index = index;
    this.paintSelection();
    this.activate();
  }

  private pickConfirm(index: number) {
    this.confirmIndex = index;
    this.paintSelection();
    this.activateConfirm();
  }

  private activate() {
    const choice = this.choices[this.index];
    if (choice === 'reset') {
      audio.play('confirm');
      this.mode = 'confirm';
      this.confirmIndex = 0;
      this.showPage();
      return;
    }
    if (choice === 'continue') this.continueRun();
    else if (choice === 'town') this.enterTown();
    else this.startNewGame();
  }

  private activateConfirm() {
    if (this.confirmIndex === 0) {
      audio.play('confirm');
      this.cancelConfirm();
      return;
    }
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    resetGameSave();
    audio.applyMuted(false);
    this.scene.restart();
  }

  private cancelConfirm() {
    this.mode = 'menu';
    this.showPage();
  }

  private continueRun() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.scene.start('GameScene', { resume: true });
  }

  /** The optional tutorial: the real game with nothing at stake, and nothing written to the save. */
  private startTutorial() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.scene.start('GameScene', {
      tutorial: true,
      characterId: 'rainKnight',
      regionId: 'nyc',
      weatherCondition: 'clear',
      weatherLabel: 'Tutorial',
      weatherTint: 0x8fe0ff,
    });
  }

  private enterTown() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.scene.start('TownScene');
  }

  private startNewGame() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    // A saved run stays put until a new fight actually starts.
    this.scene.start('TownScene');
  }
}
