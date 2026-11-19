import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { TEX } from '../gfx/spriteDefs';
import { CUTSCENES, type Cutscene } from '../story/story';
import { FONT, textStyle } from '../ui/Window';

interface CutsceneData {
  id: string;
  /** Where to go when it is over. */
  next?: { scene: string; data?: object };
}

/** Sky colours, top to bottom, for each cutscene: the long rain is dark; the ending is a sunrise. */
const SKIES: Record<string, [number, number]> = {
  prologue: [0x0c1024, 0x20284c],
  stage1: [0x10142c, 0x2c3a5c],
  stage2: [0x121830, 0x34466a],
  stage3: [0x141c38, 0x3c5a80],
  restored: [0x1a1840, 0x8a6ab0],
  ending: [0x2a4a8a, 0xf4b070],
};

const lerp = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

const CHARS_PER_SECOND = 38;

/**
 * A story card: a few lines of text typed out over a sky, one page at a time. Space, Enter, Z or a click finishes the
 * line being typed, then turns the page; after the last page the scene moves on. Used for the prologue, between
 * stages, when the Stormglass is restored, and for the ending.
 */
export class CutsceneScene extends Phaser.Scene {
  private cutscene!: Cutscene;
  private next: CutsceneData['next'];
  private pageIndex = 0;
  private typed = 0;
  private body!: Phaser.GameObjects.Text;
  private more!: Phaser.GameObjects.Text;
  private drops: Phaser.GameObjects.Image[] = [];
  private leaving = false;
  private full = '';

  constructor() {
    super('CutsceneScene');
  }

  create(data: CutsceneData) {
    this.cutscene = CUTSCENES[data.id] ?? CUTSCENES.prologue;
    this.next = data.next ?? { scene: 'TownScene' };
    this.pageIndex = 0;
    this.typed = 0;
    this.leaving = false;
    this.drops = [];

    const [top, bottom] = SKIES[this.cutscene.id] ?? SKIES.prologue;
    const bands = 16;
    for (let i = 0; i < bands; i++) {
      this.add.rectangle(0, (i * 160) / bands, 240, 160 / bands + 1, lerp(top, bottom, i / (bands - 1))).setOrigin(0, 0);
    }
    const ending = this.cutscene.id === 'ending';
    const rainy = !ending && this.cutscene.id !== 'restored';
    if (rainy) {
      for (let i = 0; i < 30; i++) {
        this.drops.push(
          this.add.image(Phaser.Math.Between(0, 240), Phaser.Math.Between(0, 160), TEX.rain).setAlpha(0.5).setTint(0x88b8f0).setDepth(2)
        );
      }
    }
    // the black bar the words sit on
    this.add.rectangle(0, 84, 240, 76, 0x080810, 0.72).setOrigin(0, 0).setDepth(3);

    this.add
      .text(120, 14, this.cutscene.title, { fontFamily: FONT, fontSize: '16px', color: '#ffe9a0', stroke: '#14121f', strokeThickness: 4, align: 'center' })
      .setOrigin(0.5, 0)
      .setDepth(5);
    if (this.cutscene.subtitle) {
      this.add.text(120, 46, this.cutscene.subtitle, { ...textStyle('#a8e0ff'), stroke: '#14121f', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(5);
    }

    this.body = this.add.text(14, 92, '', { ...textStyle('#f8f8f8'), lineSpacing: 6 }).setDepth(6);
    this.more = this.add.text(226, 146, 'v', textStyle('#ffe9a0')).setOrigin(1, 0).setDepth(6).setVisible(false);
    this.tweens.add({ targets: this.more, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });

    audio.setAmbience(rainy ? 'rain' : null);
    audio.playMusic(ending ? 'victory' : this.cutscene.id === 'restored' ? 'town' : 'title');

    this.events.once('shutdown', () => {
      const app = document.getElementById('app');
      if (!app) return;
      delete app.dataset.cutscene;
      delete app.dataset.cutscenePage;
      delete app.dataset.cutsceneTyping;
    });
    this.showPage();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter' || k === 'z') this.press();
    });
    this.input.on('pointerdown', () => this.press());
  }

  private showPage() {
    this.full = this.cutscene.pages[this.pageIndex].join('\n');
    this.typed = 0;
    this.body.setText('');
    this.more.setVisible(false);
    this.publish();
  }

  private get typing(): boolean {
    return this.typed < this.full.length;
  }

  private press() {
    if (this.leaving) return;
    audio.play('move');
    if (this.typing) {
      this.typed = this.full.length;
      this.body.setText(this.full);
      this.more.setVisible(true);
      this.publish();
      return;
    }
    if (this.pageIndex + 1 < this.cutscene.pages.length) {
      this.pageIndex += 1;
      this.showPage();
      return;
    }
    this.finish();
  }

  private finish() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => this.scene.start(this.next!.scene, this.next!.data));
  }

  update(_time: number, delta: number) {
    for (const drop of this.drops) {
      drop.y += (90 * delta) / 1000;
      drop.x -= (28 * delta) / 1000;
      if (drop.y > 166 || drop.x < -4) {
        drop.y = -4;
        drop.x = Phaser.Math.Between(0, 260);
      }
    }
    if (this.typing && !this.leaving) {
      this.typed = Math.min(this.full.length, this.typed + (CHARS_PER_SECOND * delta) / 1000);
      this.body.setText(this.full.slice(0, Math.floor(this.typed)));
      if (!this.typing) {
        this.more.setVisible(true);
        this.publish();
      }
    }
  }

  /** Lets tests follow along: which cutscene, which page, and whether it has finished typing. */
  private publish() {
    const app = document.getElementById('app');
    if (!app) return;
    app.dataset.cutscene = this.cutscene.id;
    app.dataset.cutscenePage = `${this.pageIndex + 1}/${this.cutscene.pages.length}`;
    app.dataset.cutsceneTyping = this.typing ? 'yes' : 'no';
  }
}
