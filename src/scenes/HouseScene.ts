import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { ListMenu } from '../ui/listMenu';
import { HubChrome } from '../ui/hubChrome';
import { loadGame, writeProfile } from '../save/save';
import { ARMOR, CONSUMABLES, bagLabel, equip, rest, townMaxHp, transfer, useItem, type TownProfile } from '../economy/economy';
import { Avatar } from '../town/avatar';
import { mountMap } from '../town/mapView';
import { Speech, clearHub, publishHub } from '../town/speech';
import { HOUSE, cellCenter, cellOf, houseGrid, sameCell, type Cell } from '../town/mistford';

/** The knight's house: a bed, a chest, a mirror, and a rack for armor. */
export class HouseScene extends Phaser.Scene {
  private avatar!: Avatar;
  private menu = new ListMenu(this);
  private speech = new Speech(this);
  private leaving = false;
  private interact = '';
  private shopItem = '';
  private chrome!: HubChrome;
  private frames = 0;

  constructor() {
    super('HouseScene');
  }

  create() {
    this.leaving = false;
    this.interact = '';
    this.shopItem = '';
    this.frames = 0;
    const profile = loadGame().town;
    const at = cellCenter(HOUSE.spawn);
    this.cameras.main.setBackgroundColor('#2a2018');
    const map = mountMap(this, houseGrid, 3);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.avatar = new Avatar(this, at.x, at.y, profile.characterId);
    this.physics.add.collider(this.avatar, map.layer);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.avatar, true, 0.2, 0.2);

    this.spot(HOUSE.bed, 0x4060c0);
    this.spot(HOUSE.chest, 0xc08040);
    this.spot(HOUSE.mirror, 0x80d0e0);
    this.spot(HOUSE.rack, 0xb0b0c0);
    this.chrome = new HubChrome(this, 'HOME');

    audio.playMusic('town');
    audio.setAmbience('rain');
    const bridge = {
      x: () => this.avatar.x,
      y: () => this.avatar.y,
      place: () => 'house',
      frames: () => this.frames,
      wound: (hp: number) => writeProfile({ ...loadGame().town, hp: Math.max(1, Math.floor(hp)) }),
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
    if (!this.leaving && !this.avatar.locked && sameCell(cellOf(this.avatar.x, this.avatar.y), HOUSE.door)) {
      this.leaving = true;
      audio.play('confirm');
      this.scene.start('TownScene', { at: 'house' });
      return;
    }
    this.interact = this.nearest();
    this.publish();
  }

  private spot(cell: Cell, color: number) {
    const at = cellCenter(cell);
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(0x14121f, 1);
    g.fillRect(at.x - 7, at.y - 7, 14, 12);
    g.fillStyle(color, 1);
    g.fillRect(at.x - 6, at.y - 6, 12, 10);
  }

  private nearest(): string {
    const spots: [string, Cell][] = [
      ['bed', HOUSE.bed],
      ['chest', HOUSE.chest],
      ['mirror', HOUSE.mirror],
      ['rack', HOUSE.rack],
    ];
    let best = '';
    let bestDist = 20;
    for (const [id, cell] of spots) {
      const at = cellCenter(cell);
      const dist = Phaser.Math.Distance.Between(this.avatar.x, this.avatar.y, at.x, at.y);
      if (dist < bestDist) {
        best = id;
        bestDist = dist;
      }
    }
    return best;
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
      this.scene.start('TownScene', { at: 'house' });
      return;
    }
    if (key === 'i') {
      this.openStatus();
      return;
    }
    if (key !== ' ' && key !== 'enter' && key !== 'z') return;
    if (this.interact === 'bed') this.openRest();
    else if (this.interact === 'chest') this.openChest();
    else if (this.interact === 'mirror') {
      this.leaving = true;
      audio.play('confirm');
      this.scene.start('CharacterSelectScene', { wardrobe: true });
    } else if (this.interact === 'rack') this.openRack();
  };

  private openRest() {
    this.avatar.locked = true;
    this.menu.show({
      title: 'Rest and heal?',
      rows: [
        { id: 'yes', label: 'YES' },
        { id: 'no', label: 'NO' },
      ],
      hint: 'The bed mends any storm.',
      onPick: (id) => {
        this.menu.hide();
        if (id === 'yes') {
          writeProfile(rest(loadGame().town));
          audio.play('sunbeam');
          this.speech.show(['You feel rested.', 'HP is full.']);
        }
      },
      onClose: () => this.menu.hide(),
    });
  }

  private openChest() {
    this.avatar.locked = true;
    const profile = loadGame().town;
    this.menu.show({
      title: 'Chest',
      rows: chestRows(profile),
      hint: 'Store or take one.',
      onPick: (id) => {
        if (id === 'leave') {
          this.menu.hide();
          return;
        }
        const [dir, item] = id.split(':') as ['store' | 'take' | 'use', string];
        if (dir === 'use') {
          const used = useItem(loadGame().town, item, false);
          if (!used.ok) {
            this.menu.setHint('HP is full.');
            return;
          }
          writeProfile(used.profile);
          audio.play('sunbeam');
          this.menu.refresh('Chest', chestRows(used.profile), `Healed ${used.healed}.`);
          return;
        }
        const next = transfer(loadGame().town, item, dir);
        if (!next) {
          this.menu.setHint(dir === 'store' ? 'The chest is full.' : 'Your bag is full.');
          return;
        }
        writeProfile(next);
        audio.play('confirm');
        this.menu.refresh('Chest', chestRows(next), 'Store or take one.');
      },
      onClose: () => this.menu.hide(),
    });
  }

  private openRack() {
    const profile = loadGame().town;
    if (profile.ownedArmor.length === 0) {
      this.speech.show(['The rack is empty.', 'Armor is sold at market.']);
      return;
    }
    this.avatar.locked = true;
    const rows = profile.ownedArmor.map((id) => {
      const piece = ARMOR.find((entry) => entry.id === id)!;
      const worn = profile.armorId === id ? '  WORN' : '';
      return { id, label: `${piece.name}${worn}` };
    });
    rows.push({ id: 'off', label: 'TAKE OFF' }, { id: 'leave', label: 'LEAVE' });
    this.menu.show({
      title: 'Armor rack',
      rows,
      hint: profile.armorId ? 'Worn into the cities.' : 'Nothing worn.',
      onPick: (id) => {
        if (id === 'leave') {
          this.menu.hide();
          return;
        }
        const next = equip(loadGame().town, id === 'off' ? null : id);
        writeProfile(next);
        audio.play('confirm');
        this.menu.hide();
        this.speech.show([id === 'off' ? 'You set it down.' : 'You put it on.', 'It will go with you.']);
      },
      onClose: () => this.menu.hide(),
    });
  }

  private openStatus() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    const rows: { id: string; label: string; value?: string }[] = [
      { id: 'hp', label: 'HP', value: String(profile.hp) },
      { id: 'max', label: 'MAX', value: String(max) },
      { id: 'worn', label: profile.armorId ? `WORN ${profile.armorId.toUpperCase()}` : 'NO ARMOR' },
    ];
    for (const item of CONSUMABLES) {
      const n = profile.bag[item.id] ?? 0;
      if (n > 0) rows.push({ id: item.id, label: item.name, value: String(n) });
    }
    rows.push({ id: 'close', label: 'CLOSE' });
    this.menu.show({
      title: 'BAG',
      titleValue: String(profile.coins),
      rows,
      hint: 'Held food. The chest stores more.',
      onPick: (id) => {
        if (id === 'close') this.menu.hide();
      },
      onClose: () => this.menu.hide(),
    });
  }

  private publish() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.chrome.setStats(profile.hp, max, profile.coins);
    const spot = (
      [
        ['bed', HOUSE.bed],
        ['chest', HOUSE.chest],
        ['mirror', HOUSE.mirror],
        ['rack', HOUSE.rack],
      ] as [string, Cell][]
    ).find(([id]) => id === this.interact);
    this.chrome.setBubble(spot ? cellCenter(spot[1]) : null);
    publishHub({
      place: 'house',
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

function chestRows(profile: TownProfile) {
  const rows: { id: string; label: string }[] = [];
  for (const item of CONSUMABLES) {
    const bag = profile.bag[item.id] ?? 0;
    const stash = profile.stash[item.id] ?? 0;
    if (bag > 0) rows.push({ id: `use:${item.id}`, label: `${item.name} x${bag}  USE` });
    if (bag > 0) rows.push({ id: `store:${item.id}`, label: `${item.name} x${bag}  STORE` });
    if (stash > 0) rows.push({ id: `take:${item.id}`, label: `${item.name} x${stash}  TAKE` });
  }
  if (rows.length === 0) rows.push({ id: 'leave', label: 'EMPTY' });
  else rows.push({ id: 'leave', label: 'LEAVE' });
  return rows;
}
