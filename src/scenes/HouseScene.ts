import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { drawWindow, textStyle } from '../ui/Window';
import { ListMenu } from '../ui/listMenu';
import { onTouchControlsChange } from '../input/touchControls';
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
  private hudText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('HouseScene');
  }

  create() {
    this.leaving = false;
    this.interact = '';
    this.shopItem = '';
    const profile = loadGame().town;
    const at = cellCenter(HOUSE.spawn);
    this.cameras.main.setBackgroundColor('#2a2018');
    const map = mountMap(this, houseGrid, 3);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.avatar = new Avatar(this, at.x, at.y, profile.characterId);
    this.physics.add.collider(this.avatar, map.layer);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.avatar, true, 0.2, 0.2);

    this.spot(HOUSE.bed, 0x4060c0, 'BED');
    this.spot(HOUSE.chest, 0xc08040, 'CHEST');
    this.spot(HOUSE.mirror, 0x80d0e0, 'MIRROR');
    this.spot(HOUSE.rack, 0xb0b0c0, 'RACK');

    this.hudText = this.add.text(8, 6, '', { ...textStyle('#383838'), lineSpacing: 3 }).setScrollFactor(0).setDepth(120);
    this.hint = this.add.text(120, 154, '', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(120);
    drawWindow(this, 2, 2, 112, 42).setScrollFactor(0).setDepth(110);

    audio.playMusic('town');
    audio.setAmbience('rain');
    const detach = onTouchControlsChange(() => this.paintHint());
    this.paintHint();
    const bridge = { x: () => this.avatar.x, y: () => this.avatar.y, place: () => 'house' };
    window.__hub = bridge;
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => {
      detach();
      this.menu.hide();
      this.speech.hide();
      window.removeEventListener('keydown', this.onKey);
      if (window.__hub === bridge) delete window.__hub;
      clearHub();
    });
    this.publish();
  }

  update() {
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

  private spot(cell: Cell, color: number, name: string) {
    const at = cellCenter(cell);
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(color, 1);
    g.fillRect(at.x - 6, at.y - 6, 12, 10);
    this.add.text(at.x, at.y - 10, name, { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(4);
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
    if (this.leaving || this.menu.isOpen) return;
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

  private paintHint() {
    const touch = document.documentElement.dataset.touchControls === '1';
    const verb = this.interact === 'bed' ? 'REST' : this.interact === 'chest' ? 'OPEN' : this.interact === 'mirror' ? 'LOOK' : this.interact === 'rack' ? 'ARMOR' : 'MOVE';
    this.hint.setText(touch ? `STICK MOVE   A ${verb}` : `ARROWS MOVE  SPACE ${verb}`);
  }

  private publish() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.hudText.setText(`HOME\n${profile.coins} DRIPS\nHP ${profile.hp}/${max}`);
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
    this.paintHint();
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
