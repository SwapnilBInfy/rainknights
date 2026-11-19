import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { TEX } from '../gfx/spriteDefs';
import { audio } from '../audio/engine';
import { drawWindow, textStyle } from '../ui/Window';
import { ListMenu } from '../ui/listMenu';
import { onTouchControlsChange } from '../input/touchControls';
import { arriveInTown, loadGame } from '../save/save';
import { bagLabel, townMaxHp } from '../economy/economy';
import { Avatar } from '../town/avatar';
import { mountMap } from '../town/mapView';
import { Speech, clearHub, publishHub } from '../town/speech';
import { TOWN, TOWN_NPCS, TOWN_SIGN, cellCenter, cellOf, sameCell, townGrid, type Cell } from '../town/mistford';

interface HubBridge {
  x: () => number;
  y: () => number;
  place: () => string;
}

declare global {
  interface Window {
    __hub?: HubBridge;
  }
}

/** Mistford. South is the road to the cities; the doors lead home and to market. */
export class TownScene extends Phaser.Scene {
  private avatar!: Avatar;
  private menu = new ListMenu(this);
  private speech = new Speech(this);
  private leaving = false;
  private interact = '';
  private drops: Phaser.GameObjects.Image[] = [];
  private hudText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private talkables: { x: number; y: number; id: string; lines: readonly string[] }[] = [];

  constructor() {
    super('TownScene');
  }

  create(data: { at?: 'plaza' | 'house' | 'shop' } = {}) {
    this.leaving = false;
    this.interact = '';
    this.drops = [];
    this.talkables = [];
    const profile = arriveInTown();
    const spot = data.at === 'house' ? TOWN.houseExit : data.at === 'shop' ? TOWN.shopExit : TOWN.spawn;
    const at = cellCenter(spot);

    this.cameras.main.setBackgroundColor('#1c2438');
    const map = mountMap(this, townGrid, 11);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.avatar = new Avatar(this, at.x, at.y, profile.characterId);
    this.physics.add.collider(this.avatar, map.layer);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.avatar, true, 0.18, 0.18);

    this.paintDoor(TOWN.houseMat);
    this.paintDoor(TOWN.shopMat);
    this.add.text(cellCenter({ col: 3, row: 3 }).x, cellCenter({ col: 3, row: 3 }).y, 'HOME', label()).setOrigin(0.5).setDepth(4);
    this.add.text(cellCenter({ col: 13, row: 3 }).x, cellCenter({ col: 13, row: 3 }).y, 'MARKET', label()).setOrigin(0.5).setDepth(4);

    for (const npc of TOWN_NPCS) {
      const pos = cellCenter(npc.at);
      const key = npc.shirt === 'blue' ? TEX.villagerBlue : TEX.villagerGreen;
      const sprite = this.physics.add.staticImage(pos.x, pos.y, key).setDepth(8);
      sprite.body.setSize(8, 6).setOffset(4, 16);
      sprite.refreshBody();
      this.physics.add.collider(this.avatar, sprite);
      this.talkables.push({ x: pos.x, y: pos.y, id: npc.id, lines: npc.lines });
    }
    const signAt = cellCenter(TOWN_SIGN.at);
    const sign = this.physics.add.staticImage(signAt.x, signAt.y + 2, TEX.signpost).setDepth(6);
    sign.body.setSize(8, 8).setOffset(4, 6);
    sign.refreshBody();
    this.physics.add.collider(this.avatar, sign);
    this.talkables.push({ x: signAt.x, y: signAt.y, id: 'sign', lines: TOWN_SIGN.lines });

    this.hudText = this.add.text(8, 6, '', { ...textStyle('#383838'), lineSpacing: 3 }).setScrollFactor(0).setDepth(120);
    this.hint = this.add.text(120, 154, '', { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(120);
    drawWindow(this, 2, 2, 104, 42).setScrollFactor(0).setDepth(110);

    for (let i = 0; i < 16; i++) {
      const drop = this.add.image(Phaser.Math.Between(0, 240), Phaser.Math.Between(0, 160), TEX.rain).setScrollFactor(0).setDepth(90).setAlpha(0.45).setTint(0x88b8f0);
      this.drops.push(drop);
    }

    audio.playMusic('town');
    audio.setAmbience('rain');
    const detach = onTouchControlsChange(() => this.paintHint());
    this.paintHint();

    const bridge: HubBridge = {
      x: () => this.avatar.x,
      y: () => this.avatar.y,
      place: () => 'town',
    };
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

  update(_time: number, delta: number) {
    this.avatar.locked = this.menu.isOpen || this.speech.open;
    if (!this.leaving && !this.avatar.locked) this.stepOn();
    this.interact = this.nearestTalk()?.id ?? '';
    for (const drop of this.drops) {
      drop.y += (90 * delta) / 1000;
      drop.x -= (28 * delta) / 1000;
      if (drop.y > 166 || drop.x < -4) {
        drop.y = -4;
        drop.x = Phaser.Math.Between(0, 260);
      }
    }
    this.publish();
  }

  private paintDoor(mat: Cell) {
    const g = this.add.graphics().setDepth(2);
    const x = mat.col * TILE + 3;
    const y = (mat.row - 1) * TILE + 6;
    g.fillStyle(0x5a3018, 1);
    g.fillRect(x, y, 10, 12);
    g.fillStyle(0xf0d080, 1);
    g.fillRect(x + 7, y + 5, 2, 2);
  }

  private stepOn() {
    const here = cellOf(this.avatar.x, this.avatar.y);
    if (this.near(TOWN.houseMat)) return this.go('HouseScene');
    if (this.near(TOWN.shopMat)) return this.go('MarketScene');
    if (TOWN.gates.some((gate) => sameCell(gate, here))) {
      this.leaving = true;
      audio.play('confirm');
      this.scene.start('RegionSelectScene', { characterId: loadGame().town.characterId });
    }
  }

  /** The mat, or standing against the door just shy of its centre. */
  private near(cell: Cell) {
    const here = cellOf(this.avatar.x, this.avatar.y);
    if (sameCell(here, cell)) return true;
    const at = cellCenter(cell);
    return Phaser.Math.Distance.Between(this.avatar.x, this.avatar.y, at.x, at.y) <= 14;
  }

  private go(scene: string) {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.scene.start(scene);
  }

  private nearestTalk() {
    let best: (typeof this.talkables)[number] | null = null;
    let bestDist = 26;
    for (const talk of this.talkables) {
      const dist = Phaser.Math.Distance.Between(this.avatar.x, this.avatar.y, talk.x, talk.y);
      if (dist < bestDist) {
        best = talk;
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
      this.openTitleAsk();
      return;
    }
    if (key === ' ' || key === 'enter' || key === 'z') {
      const talk = this.nearestTalk();
      if (talk) this.speech.show(talk.lines);
    }
  };

  private openTitleAsk() {
    this.avatar.locked = true;
    this.menu.show({
      title: 'Back to title?',
      rows: [
        { id: 'no', label: 'NO' },
        { id: 'yes', label: 'YES' },
      ],
      hint: 'Mistford keeps your drips.',
      onPick: (id) => {
        this.menu.hide();
        if (id === 'yes' && !this.leaving) {
          this.leaving = true;
          audio.play('confirm');
          this.scene.start('MenuScene');
          return;
        }
        audio.play('confirm');
      },
      onClose: () => this.menu.hide(),
    });
  }

  private paintHint() {
    const touch = document.documentElement.dataset.touchControls === '1';
    this.hint.setText(touch ? 'STICK MOVE   A TALK' : 'ARROWS MOVE  SPACE TALK');
  }

  private publish() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.hudText.setText(`MISTFORD\n${profile.coins} DRIPS\nHP ${profile.hp}/${max}`);
    publishHub({
      place: 'town',
      coins: profile.coins,
      hp: profile.hp,
      maxHp: max,
      armor: profile.armorId ?? '',
      bag: bagLabel(profile.bag),
      interact: this.interact,
      shop: this.menu.isOpen ? 'open' : 'closed',
      shopItem: '',
      dialog: this.speech.open ? 'open' : '',
    });
  }
}

function label() {
  return { ...textStyle('#f8f8f8'), stroke: '#202030', strokeThickness: 3 };
}
