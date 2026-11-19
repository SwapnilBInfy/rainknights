import Phaser from 'phaser';
import { TEX } from '../gfx/spriteDefs';
import { audio } from '../audio/engine';
import { ListMenu } from '../ui/listMenu';
import { HubChrome } from '../ui/hubChrome';
import { loadGame, writeProfile } from '../save/save';
import { bagLabel, buy, buyFailText, shopRows, townMaxHp } from '../economy/economy';
import { Avatar } from '../town/avatar';
import { mountMap } from '../town/mapView';
import { Speech, clearHub, publishHub } from '../town/speech';
import { MARKET, cellCenter, cellOf, marketGrid, sameCell } from '../town/mistford';

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
      this.leaving = true;
      audio.play('confirm');
      this.scene.start('TownScene', { at: 'shop' });
      return;
    }
    const row = cellOf(this.avatar.x, this.avatar.y).row;
    this.interact = row === MARKET.counterRow || row === MARKET.counterRow + 1 ? 'shop' : '';
    this.publish();
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
        { id: 'close', label: 'CLOSE' },
      ],
      hint: 'Drips, health, armor.',
      onPick: (id) => {
        if (id === 'close') this.menu.hide();
      },
      onClose: () => this.menu.hide(),
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
    } else this.chrome.setBubble(null);
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
