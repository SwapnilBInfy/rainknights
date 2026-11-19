import Phaser from 'phaser';
import { TEX } from '../gfx/spriteDefs';
import { audio } from '../audio/engine';
import { drawWindow, textStyle } from '../ui/Window';
import { ListMenu } from '../ui/listMenu';
import { onTouchControlsChange } from '../input/touchControls';
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
  private hudText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('MarketScene');
  }

  create() {
    this.leaving = false;
    this.interact = '';
    this.shopItem = '';
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
    this.add.text(120, 28, 'MARKET', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 }).setOrigin(0.5).setDepth(4);

    this.hudText = this.add.text(8, 6, '', { ...textStyle('#383838'), lineSpacing: 3 }).setScrollFactor(0).setDepth(120);
    this.hint = this.add.text(120, 154, '', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(120);
    drawWindow(this, 2, 2, 112, 42).setScrollFactor(0).setDepth(110);

    audio.playMusic('town');
    audio.setAmbience('rain');
    const detach = onTouchControlsChange(() => this.paintHint());
    this.paintHint();
    const bridge = { x: () => this.avatar.x, y: () => this.avatar.y, place: () => 'market' };
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
      this.scene.start('TownScene', { at: 'shop' });
      return;
    }
    if ((key === ' ' || key === 'enter' || key === 'z') && this.interact === 'shop') this.openShop();
  };

  private openShop() {
    this.avatar.locked = true;
    const profile = loadGame().town;
    const rows = shopRows(profile);
    this.shopItem = rows[0]?.id ?? '';
    this.menu.show({
      title: `${profile.coins} DRIPS`,
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
        this.menu.refresh(`${result.profile.coins} DRIPS`, nextRows, `Bought. ${blurb}`);
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

  private paintHint() {
    const touch = document.documentElement.dataset.touchControls === '1';
    const verb = this.interact === 'shop' ? 'SHOP' : 'MOVE';
    this.hint.setText(touch ? `STICK MOVE   A ${verb}` : `ARROWS MOVE  SPACE ${verb}`);
  }

  private publish() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.hudText.setText(`MARKET\n${profile.coins} DRIPS\nHP ${profile.hp}/${max}`);
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
    this.paintHint();
  }
}
