import Phaser from 'phaser';
import { drawWindow, textStyle } from '../ui/Window';

/** Two-line talk box pinned to the bottom of the 240×160 view. */
export class Speech {
  private root: Phaser.GameObjects.Container | null = null;
  open = false;

  constructor(private readonly scene: Phaser.Scene) {}

  show(lines: readonly string[]) {
    this.hide();
    const win = drawWindow(this.scene, 4, 112, 232, 44).setScrollFactor(0);
    const body = this.scene.add.text(12, 120, lines.slice(0, 2).join('\n'), textStyle()).setScrollFactor(0);
    this.root = this.scene.add.container(0, 0, [win, body]).setScrollFactor(0).setDepth(180);
    this.open = true;
  }

  hide() {
    this.root?.destroy(true);
    this.root = null;
    this.open = false;
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
