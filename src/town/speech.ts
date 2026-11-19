import Phaser from 'phaser';
import { drawWindow, textStyle } from '../ui/Window';

/** Two-line talk box pinned to the bottom of the 240×160 view. Dialogue can run over several pages. */
export class Speech {
  private root: Phaser.GameObjects.Container | null = null;
  private pages: (readonly string[])[] = [];
  private index = 0;
  open = false;

  constructor(private readonly scene: Phaser.Scene) {}

  /** A single page. */
  show(lines: readonly string[]) {
    this.showPages([lines]);
  }

  /** Several pages, one after another. `advance` turns the page and closes the box after the last. */
  showPages(pages: readonly (readonly string[])[]) {
    this.pages = pages.length > 0 ? [...pages] : [['...']];
    this.index = 0;
    this.render();
  }

  /** Turn to the next page. Returns true while there is still something showing. */
  advance(): boolean {
    if (!this.open) return false;
    if (this.index + 1 < this.pages.length) {
      this.index += 1;
      this.render();
      return true;
    }
    this.hide();
    return false;
  }

  private render() {
    this.root?.destroy(true);
    const win = drawWindow(this.scene, 4, 112, 232, 44).setScrollFactor(0);
    const body = this.scene.add.text(12, 120, this.pages[this.index].slice(0, 2).join('\n'), textStyle()).setScrollFactor(0);
    const parts: Phaser.GameObjects.GameObject[] = [win, body];
    if (this.index + 1 < this.pages.length) {
      // a small triangle: there is more
      const more = this.scene.add.graphics().setScrollFactor(0);
      more.fillStyle(0xc07800, 1).fillRect(224, 145, 7, 1).fillRect(225, 146, 5, 1).fillRect(226, 147, 3, 1).fillRect(227, 148, 1, 1);
      this.scene.tweens.add({ targets: more, alpha: 0.2, duration: 380, yoyo: true, repeat: -1 });
      parts.push(more);
    }
    this.root = this.scene.add.container(0, 0, parts).setScrollFactor(0).setDepth(180);
    this.open = true;
  }

  hide() {
    this.root?.destroy(true);
    this.root = null;
    this.open = false;
    this.pages = [];
    this.index = 0;
  }

  /** The page showing now, for tests. */
  get page(): number {
    return this.open ? this.index : -1;
  }
}

export interface HubState {
  place: string;
  coins: number;
  hp: number;
  maxHp: number;
  armor: string;
  bag: string;
  interact: string;
  shop: string;
  shopItem: string;
  dialog: string;
}

export function publishHub(state: HubState) {
  const app = document.getElementById('app');
  if (!app) return;
  app.dataset.place = state.place;
  app.dataset.coins = String(state.coins);
  app.dataset.hp = String(state.hp);
  app.dataset.maxHp = String(state.maxHp);
  app.dataset.armor = state.armor;
  app.dataset.bag = state.bag;
  app.dataset.interact = state.interact;
  app.dataset.shop = state.shop;
  app.dataset.shopItem = state.shopItem;
  app.dataset.dialog = state.dialog;
}

export function clearHub() {
  const app = document.getElementById('app');
  if (!app) return;
  for (const key of ['place', 'coins', 'hp', 'maxHp', 'armor', 'bag', 'interact', 'shop', 'shopItem', 'dialog']) {
    delete app.dataset[key];
  }
}
