import Phaser from 'phaser';
import { TEX } from '../gfx/spriteDefs';
import { audio } from '../audio/engine';
import { ListMenu } from '../ui/listMenu';
import { HubChrome } from '../ui/hubChrome';
import { loadGame, writeProfile } from '../save/save';
import { bagLabel, buy, buyFailText, charmShopRows, shopRows, townMaxHp, type ShopRow } from '../economy/economy';
import { charm, charmSlots, rankLabel, toggle as toggleCharm } from '../economy/charms';
import { addPoint, pointsForLevel, pointsSpent, removePoint, STAT_BLURBS, STAT_IDS, STAT_NAMES, type StatId } from '../systems/stats';
import { Avatar } from '../town/avatar';
import { mountMap } from '../town/mapView';
import { Speech, clearHub, publishHub } from '../town/speech';
import { MARKET, MARKET_ROWS, cellCenter, cellOf, cells, marketGrid, sameCell } from '../town/mistford';
import { FURNITURE, placeExit, placeProp } from '../gfx/furniture';

/** The market counter. Space (or A) opens the buy list. */
export class MarketScene extends Phaser.Scene {
  private avatar!: Avatar;
  private menu = new ListMenu(this);
  private speech = new Speech(this);
  private leaving = false;
  private interact = '';
  private shopItem = '';
  private chrome!: HubChrome;
  private frames = 0;

  constructor() {
    super('MarketScene');
  }

  create() {
    this.leaving = false;
    this.interact = '';
    this.shopItem = '';
    this.frames = 0;
    const profile = loadGame().town;
    const at = cellCenter(MARKET.spawn);
    this.cameras.main.setBackgroundColor('#2a2018');
    const map = mountMap(this, marketGrid, 5);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.avatar = new Avatar(this, at.x, at.y, profile.characterId);
    this.physics.add.collider(this.avatar, map.layer);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.avatar, true, 0.2, 0.2);

    const keeper = cellCenter(MARKET.keeper);
    this.add.image(keeper.x, keeper.y, TEX.villagerBlue).setDepth(8);
    for (const cell of cells(MARKET_ROWS, 'K')) placeProp(this, FURNITURE.counter, cell, 2);
    for (const col of [2, 6, 11]) placeProp(this, FURNITURE.shelf, { col, row: 1 }, 2);
    placeExit(this, MARKET.door);
    this.chrome = new HubChrome(this, 'MARKET');

    audio.playMusic('town');
    audio.setAmbience('rain');
    const bridge = {
      x: () => this.avatar.x,
      y: () => this.avatar.y,
      place: () => 'market',
      frames: () => this.frames,
      keys: () => this.heldKeys(),
    };
    window.__hub = bridge;
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => {
      this.chrome.destroy();
      this.menu.hide();
      this.speech.hide();
      window.removeEventListener('keydown', this.onKey);
      if (window.__hub === bridge) delete window.__hub;
      clearHub();
    });
    this.publish();
  }

  update(time: number) {
    this.frames += 1;
    this.menu.pump(time);
    this.avatar.locked = this.menu.isOpen || this.speech.open;
    if (!this.leaving && !this.avatar.locked && sameCell(cellOf(this.avatar.x, this.avatar.y), MARKET.door)) {
      this.leaveMarket();
      return;
    }
    const row = cellOf(this.avatar.x, this.avatar.y).row;
    const doorAt = cellCenter(MARKET.door);
    const nearDoor = Phaser.Math.Distance.Between(this.avatar.x, this.avatar.y, doorAt.x, doorAt.y) <= 22;
    this.interact = nearDoor ? 'door' : row === MARKET.counterRow || row === MARKET.counterRow + 1 ? 'shop' : '';
    this.publish();
  }

  private leaveMarket() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.scene.start('TownScene', { at: 'shop' });
  }

  private heldKeys() {
    const keys = this.input.keyboard?.keys ?? [];
    const down = (code: number) => !!keys[code]?.isDown;
    return { up: down(38), down: down(40), left: down(37), right: down(39) };
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.type !== 'keydown' || this.leaving || this.menu.isOpen) return;
    const key = event.key.toLowerCase();
    if (event.repeat && (key === ' ' || key === 'enter' || key === 'z')) return;
    if (this.speech.open && (key === ' ' || key === 'enter' || key === 'z' || key === 'escape')) {
      this.speech.hide();
      return;
    }
    if (key === 'escape') {
      this.leaving = true;
      this.scene.start('TownScene', { at: 'shop' });
      return;
    }
    if (key === 'i') this.openStatus();
    else if ((key === ' ' || key === 'enter' || key === 'z') && this.interact === 'door') this.leaveMarket();
    else if ((key === ' ' || key === 'enter' || key === 'z') && this.interact === 'shop') this.openShop();
  };

  private openStatus() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.menu.show({
      title: 'BAG',
      titleValue: String(profile.coins),
      rows: [
        { id: 'hp', label: 'HP', value: String(profile.hp) },
        { id: 'max', label: 'MAX', value: String(max) },
        { id: 'worn', label: profile.armorId ? `WORN ${profile.armorId.toUpperCase()}` : 'NO ARMOR' },
        { id: 'lv', label: 'LEVEL', value: String(profile.hero.level) },
        { id: 'stats', label: 'STATS', value: this.points() > 0 ? String(this.points()) : undefined },
        { id: 'charms', label: 'CHARMS' },
        { id: 'close', label: 'CLOSE' },
      ],
      hint: 'Drips, health, armor.',
      onPick: (id) => {
        if (id === 'close') this.menu.hide();
        else if (id === 'charms') this.openCharms();
        else if (id === 'stats') this.openStats();
      },
      onClose: () => this.menu.hide(),
    });
  }

  /** Stat points the knight has earned and not yet spent (the level lasts now, so they can be spent at home). */
  private points(): number {
    const hero = loadGame().town.hero;
    return Math.max(0, pointsForLevel(hero.level) - pointsSpent(hero.alloc));
  }

  private statRows() {
    const alloc = loadGame().town.hero.alloc;
    return [...STAT_IDS.map((id) => ({ id, label: STAT_NAMES[id], value: String(alloc[id]) })), { id: 'back', label: 'BACK' }];
  }

  private spend(id: StatId, dir: number) {
    const profile = loadGame().town;
    const state = { points: this.points(), alloc: profile.hero.alloc };
    const next = dir > 0 ? addPoint(state, id) : removePoint(state, id);
    if (!next) {
      this.menu.setHint(dir > 0 ? 'No points left.' : 'None to take back.');
      return;
    }
    writeProfile({ ...profile, hero: { ...profile.hero, alloc: next.alloc } });
    audio.play('confirm');
    this.menu.refresh('STATS', this.statRows(), STAT_BLURBS[id], String(this.points()));
  }

  private openStats() {
    this.menu.show({
      title: 'STATS',
      titleValue: String(this.points()),
      rows: this.statRows(),
      hint: 'Right: +1. Left: -1.',
      onMove: (id) => this.menu.setHint(id === 'back' ? 'Right: +1. Left: -1.' : STAT_BLURBS[id as StatId] ?? ''),
      onPick: (id) => (id === 'back' ? this.openStatus() : this.spend(id as StatId, 1)),
      onSide: (id, dir) => id !== 'back' && this.spend(id as StatId, dir),
      onClose: () => this.openStatus(),
    });
  }

  /** Charms the knight owns, to wear or take off (as many slots as their level allows). */
  private charmRows() {
    const profile = loadGame().town;
    const rows = Object.keys(profile.charms)
      .filter((id) => charm(id))
      .map((id) => ({ id, label: `${profile.worn.includes(id) ? '+' : '-'} ${charm(id)!.name} ${rankLabel(profile.charms[id])}` }));
    rows.push({ id: 'back', label: 'BACK' });
    return rows;
  }

  private charmsTitle() {
    return `CHARMS ${loadGame().town.worn.length}/${charmSlots(loadGame().town.hero.level)}`;
  }

  private openCharms() {
    const rows = this.charmRows();
    this.menu.show({
      title: this.charmsTitle(),
      rows,
      hint: rows.length === 1 ? 'None yet. Buy or find!' : '+ is worn. Enter swaps.',
      onMove: (id) => this.menu.setHint(charm(id)?.blurb ?? ''),
      onPick: (id) => {
        if (id === 'back') return this.openStatus();
        const profile = loadGame().town;
        const next = toggleCharm({ owned: profile.charms, worn: profile.worn }, id, charmSlots(profile.hero.level));
        if (!next) {
          this.menu.setHint('No free slot.');
          return;
        }
        writeProfile({ ...profile, charms: next.owned, worn: next.worn });
        audio.play('confirm');
        this.menu.refresh(this.charmsTitle(), this.charmRows(), charm(id)?.blurb ?? '');
        this.publish();
      },
      onClose: () => this.openStatus(),
    });
  }

  /** The charm counter: every charm, its next rank and price. */
  private openCharmShop() {
    const profile = loadGame().town;
    const rows: ShopRow[] = charmShopRows(profile);
    this.menu.show({
      title: 'CHARMS',
      titleValue: String(profile.coins),
      rows,
      hint: rows[0]?.blurb ?? '',
      onMove: (id) => {
        const row = charmShopRows(loadGame().town).find((entry) => entry.id === id);
        if (row) this.menu.setHint(row.blurb);
      },
      onPick: (id) => {
        if (id === 'leave') return this.openShop();
        const result = buy(loadGame().town, id);
        if (!result.ok) {
          this.menu.setHint(buyFailText(result.reason));
          audio.play('move');
          return;
        }
        writeProfile(result.profile);
        audio.play('confirm');
        const next = charmShopRows(result.profile);
        this.menu.refresh('CHARMS', next, `Bought. ${next.find((entry) => entry.id === id)?.blurb ?? ''}`, String(result.profile.coins));
        this.publish();
      },
      onClose: () => this.openShop(),
    });
  }

  private openShop() {
    this.avatar.locked = true;
    const profile = loadGame().town;
    const rows = shopRows(profile);
    this.shopItem = rows[0]?.id ?? '';
    this.menu.show({
      title: 'DRIPS',
      titleValue: String(profile.coins),
      rows,
      hint: rows[0]?.blurb ?? '',
      onMove: (id) => {
        this.shopItem = id;
        const row = shopRows(loadGame().town).find((entry) => entry.id === id);
        if (row) this.menu.setHint(row.blurb);
        this.publish();
      },
      onPick: (id) => {
        if (id === 'leave') {
          this.menu.hide();
          this.shopItem = '';
          this.publish();
          return;
        }
        if (id === 'charms') return this.openCharmShop();
        const result = buy(loadGame().town, id);
        if (!result.ok) {
          this.menu.setHint(buyFailText(result.reason));
          audio.play('move');
          return;
        }
        writeProfile(result.profile);
        audio.play('confirm');
        const nextRows = shopRows(result.profile);
        const blurb = nextRows.find((entry) => entry.id === id)?.blurb ?? 'Bought.';
        this.menu.refresh('DRIPS', nextRows, `Bought. ${blurb}`, String(result.profile.coins));
        this.publish();
      },
      onClose: () => {
        this.menu.hide();
        this.shopItem = '';
        this.publish();
      },
    });
    this.publish();
  }

  private publish() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.chrome.setStats(profile.hp, max, profile.coins);
    if (this.interact === 'shop') {
      const at = cellCenter({ col: Math.round(this.avatar.x / 16), row: MARKET.counterRow - 1 });
      this.chrome.setBubble({ x: at.x, y: at.y });
    } else if (this.interact === 'door') this.chrome.setBubble(cellCenter(MARKET.door));
    else this.chrome.setBubble(null);
    publishHub({
      place: 'market',
      coins: profile.coins,
      hp: profile.hp,
      maxHp: max,
      armor: profile.armorId ?? '',
      bag: bagLabel(profile.bag),
      interact: this.interact,
      shop: this.menu.isOpen ? 'open' : 'closed',
      shopItem: this.shopItem,
      dialog: this.speech.open ? 'open' : '',
    });
  }
}
