import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { Minimap, type MiniDot } from './Minimap';
import { ListMenu, type MenuRow } from './listMenu';
import { drawWindow, textStyle } from './Window';
import { charm, charmSlots, rankLabel, type CharmBox } from '../economy/charms';
import { STAT_BLURBS, STAT_IDS, STAT_NAMES, type Allocation, type StatId } from '../systems/stats';
import type { Grid } from '../systems/mapGen';

type Page = 'top' | 'items' | 'map' | 'stats' | 'charms';

/** What the Bag needs from the game: the knight's things to show, and the ways to change them. */
export interface BagHost {
  /** Consumables the knight carries (the rows list their counts). */
  items(): MenuRow[];
  /** Use one; the answer is a line for the hint, or null if it was used and the Bag should close. */
  useItem(id: string): string | null;
  stats(): { points: number; alloc: Allocation };
  /** Put a point in (dir 1) or take one out (dir -1). */
  spend(id: StatId, dir: number): boolean;
  charms(): { box: CharmBox; level: number };
  toggleCharm(id: string): string | null;
  /** The map picture and the blips on it. */
  map(): { grid: Grid; stamp: string; dots: MiniDot[]; player: { x: number; y: number } };
  onClose(): void;
}

const LEGEND: { color: number; label: string }[] = [
  { color: 0xff4a4a, label: 'YOU' },
  { color: 0xffd84a, label: 'CRATE' },
  { color: 0xc080ff, label: 'SHRINE' },
  { color: 0x58e0d0, label: 'STAIRS' },
  { color: 0x3f8cf0, label: 'PAD' },
  { color: 0xff9ad8, label: 'TABLET' },
];

/**
 * The Bag: ITEMS (what you carry), MAP (the whole world, when you want it), STATS (spend the points levels give) and
 * CHARMS (what you wear). It opens over a paused scene, so its list is driven from the window (see ListMenu).
 * Esc steps back a page, then closes.
 */
export class BagMenu {
  private readonly menu: ListMenu;
  private page: Page = 'top';
  private open = false;
  private mapParts: Phaser.GameObjects.GameObject[] = [];
  private minimap: Minimap | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly host: BagHost) {
    this.menu = new ListMenu(scene);
  }

  get isOpen(): boolean {
    return this.open;
  }

  get current(): Page {
    return this.page;
  }

  show(page: Page = 'top') {
    this.open = true;
    window.addEventListener('keydown', this.onKey, true);
    this.goto(page);
  }

  /** I closes the Bag from any page; on the map (where the list is hidden) the back keys step back. */
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || !this.open) return;
    const k = e.key.toLowerCase();
    if (k === 'i') {
      e.preventDefault();
      this.close();
    } else if (this.page === 'map' && ['escape', 'enter', ' ', 'z', 'n', 'p'].includes(k)) {
      e.preventDefault();
      this.goto('top');
    }
  };

  hide() {
    window.removeEventListener('keydown', this.onKey, true);
    const app = document.getElementById('app');
    if (app) delete app.dataset.bagPage;
    if (!this.open && !this.menu.isOpen) return;
    this.open = false;
    this.clearMap();
    this.menu.hide();
  }

  private close() {
    this.hide();
    this.host.onClose();
  }

  private back() {
    if (this.page === 'top') this.close();
    else this.goto('top');
  }

  private goto(page: Page) {
    const keepIndex = page === 'top' ? this.page : null;
    this.page = page;
    const app = document.getElementById('app');
    if (app) app.dataset.bagPage = page;
    this.clearMap();
    if (page === 'map') return this.showMap();
    if (page === 'top') this.showTop(keepIndex);
    else if (page === 'items') this.showItems();
    else if (page === 'stats') this.showStats();
    else this.showCharms();
  }

  // --- the pages ---

  private showTop(from: Page | null) {
    const { points } = this.host.stats();
    const { box } = this.host.charms();
    const rows: MenuRow[] = [
      { id: 'items', label: 'ITEMS' },
      { id: 'map', label: 'MAP' },
      { id: 'stats', label: 'STATS', value: points > 0 ? String(points) : undefined },
      { id: 'charms', label: 'CHARMS', value: String(box.worn.length) },
      { id: 'close', label: 'CLOSE' },
    ];
    this.menu.show({
      title: 'BAG',
      rows,
      hint: points > 0 ? `${points} points to spend!` : 'Esc to close.',
      onPick: (id) => (id === 'close' ? this.close() : this.goto(id as Page)),
      onClose: () => this.back(),
      driven: true,
      start: from && from !== 'top' ? from : undefined, // a trip back lands on the page you came from
    });
  }

  private showItems() {
    const rows = this.host.items();
    if (rows.length === 0) {
      this.menu.show({
        title: 'ITEMS',
        rows: [{ id: 'back', label: 'BACK' }],
        hint: 'Nothing in the bag.',
        onPick: () => this.goto('top'),
        onClose: () => this.goto('top'),
        driven: true,
      });
      return;
    }
    this.menu.show({
      title: 'ITEMS',
      rows: [...rows, { id: 'back', label: 'BACK' }],
      hint: 'Use one.',
      onPick: (id) => {
        if (id === 'back') return this.goto('top');
        const said = this.host.useItem(id);
        if (said === null) return this.close();
        this.menu.refresh('ITEMS', [...this.host.items(), { id: 'back', label: 'BACK' }], said);
      },
      onClose: () => this.goto('top'),
      driven: true,
    });
  }

  private statRows(): MenuRow[] {
    const { alloc } = this.host.stats();
    return [...STAT_IDS.map((id) => ({ id, label: STAT_NAMES[id], value: String(alloc[id]) })), { id: 'back', label: 'BACK' }];
  }

  private showStats() {
    const { points } = this.host.stats();
    this.menu.show({
      title: 'STATS',
      titleValue: String(points),
      rows: this.statRows(),
      hint: 'Right: +1. Left: -1.',
      onPick: (id) => (id === 'back' ? this.goto('top') : this.spend(id as StatId, 1)),
      onSide: (id, dir) => id !== 'back' && this.spend(id as StatId, dir),
      onMove: (id) => this.menu.setHint(id === 'back' ? 'Right: +1. Left: -1.' : STAT_BLURBS[id as StatId] ?? ''),
      onClose: () => this.goto('top'),
      driven: true,
    });
  }

  private spend(id: StatId, dir: number) {
    if (!this.host.spend(id, dir)) {
      this.menu.setHint(dir > 0 ? 'No points left.' : 'None to take back.');
      return;
    }
    audio.play('confirm');
    this.menu.refresh('STATS', this.statRows(), STAT_BLURBS[id], String(this.host.stats().points));
  }

  private charmRows(): MenuRow[] {
    const { box } = this.host.charms();
    const rows: MenuRow[] = Object.keys(box.owned)
      .filter((id) => charm(id))
      .map((id) => ({ id, label: `${box.worn.includes(id) ? '+' : '-'} ${charm(id)!.name} ${rankLabel(box.owned[id])}` }));
    rows.push({ id: 'back', label: 'BACK' });
    return rows;
  }

  private charmTitle(): string {
    const { box, level } = this.host.charms();
    return `CHARMS ${box.worn.length}/${charmSlots(level)}`;
  }

  private showCharms() {
    const rows = this.charmRows();
    this.menu.show({
      title: this.charmTitle(),
      rows,
      hint: rows.length === 1 ? 'None yet. Buy or find!' : '+ is worn. Enter swaps.',
      onPick: (id) => {
        if (id === 'back') return this.goto('top');
        const said = this.host.toggleCharm(id);
        audio.play(said ? 'move' : 'confirm');
        this.menu.refresh(this.charmTitle(), this.charmRows(), said ?? charm(id)?.blurb ?? '');
      },
      onMove: (id) => this.menu.setHint(charm(id)?.blurb ?? ''),
      onClose: () => this.goto('top'),
      driven: true,
    });
  }

  // --- the map ---

  private showMap() {
    this.menu.hide();
    const { grid, stamp, dots, player } = this.host.map();
    const winW = 216;
    const winH = 124;
    const x = 12;
    const y = 18;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(200);
      this.mapParts.push(o);
      return o;
    };
    add(drawWindow(this.scene, x, y, winW, winH));
    add(this.scene.add.text(x + 10, y + 6, 'MAP', textStyle('#3078d8')));
    this.minimap = new Minimap(this.scene, x + 10, y + 20, 2, 201);
    this.minimap.setGrid(grid, stamp);
    this.minimap.update(player, dots, false);
    LEGEND.forEach((row, i) => {
      const g = add(this.scene.add.graphics());
      g.fillStyle(0x14121f, 1).fillRect(x + 126, y + 21 + i * 11, 5, 5);
      g.fillStyle(row.color, 1).fillRect(x + 127, y + 22 + i * 11, 3, 3);
      add(this.scene.add.text(x + 136, y + 19 + i * 11, row.label, textStyle()));
    });
    add(this.scene.add.text(x + 126, y + winH - 18, 'Esc: back', textStyle('#686868')));
  }

  private clearMap() {
    this.minimap?.destroy();
    this.minimap = null;
    for (const o of this.mapParts) o.destroy();
    this.mapParts = [];
  }
}
