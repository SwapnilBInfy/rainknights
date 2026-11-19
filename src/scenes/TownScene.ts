import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { TEX } from '../gfx/spriteDefs';
import { audio } from '../audio/engine';
import { ListMenu } from '../ui/listMenu';
import { HubChrome } from '../ui/hubChrome';
import { arriveInTown, loadGame, loadStory, writeStory } from '../save/save';
import { clearPending } from '../story/story';
import { CONSUMABLES, bagLabel, townMaxHp } from '../economy/economy';
import { Avatar } from '../town/avatar';
import { mountMap } from '../town/mapView';
import { Speech, clearHub, publishHub } from '../town/speech';
import { TOWN, TOWN_NPCS, TOWN_SIGN, cellCenter, cellOf, padCenter, sameCell, townGrid, type Cell } from '../town/mistford';
import { drawFlightPad } from '../gfx/flight';
import { StoryTown } from '../town/storyTown';
import type { StoryState } from '../story/story';

interface HubBridge {
  x: () => number;
  y: () => number;
  place: () => string;
  frames: () => number;
  wound?: (hp: number) => void;
  keys?: () => { up: boolean; down: boolean; left: boolean; right: boolean };
  /** Put the knight on the middle of a tile (tests). */
  tp?: (col: number, row: number) => void;
  /** Story mode: the state, and which dialogue page is showing (-1 when none). */
  story?: () => StoryState;
  page?: () => number;
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
  private chrome!: HubChrome;
  private frames = 0;
  private padGfx!: Phaser.GameObjects.Graphics;
  private storyTown!: StoryTown;
  private talkables: { x: number; y: number; id: string; lines: readonly string[] }[] = [];

  constructor() {
    super('TownScene');
  }

  create(data: { at?: 'plaza' | 'house' | 'shop' | 'pad' } = {}) {
    this.leaving = false;
    this.interact = '';
    this.frames = 0;
    this.drops = [];
    this.talkables = [];
    const profile = arriveInTown();
    // A cutscene is waiting (the prologue, or a stage was completed): play it, then come back here.
    const waiting = loadStory();
    if (waiting.started && waiting.pending) {
      writeStory(clearPending(waiting));
      this.scene.start('CutsceneScene', { id: waiting.pending, next: { scene: 'TownScene', data } });
      return;
    }
    const spot = data.at === 'house' ? TOWN.houseExit : data.at === 'shop' ? TOWN.shopExit : data.at === 'pad' ? TOWN.padSpawn : TOWN.spawn;
    const at = cellCenter(spot);

    const sunny = waiting.started && waiting.complete;
    this.cameras.main.setBackgroundColor(sunny ? '#5a8fd0' : '#1c2438');
    const map = mountMap(this, townGrid, 11);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.avatar = new Avatar(this, at.x, at.y, profile.characterId);
    this.physics.add.collider(this.avatar, map.layer);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.avatar, true, 0.18, 0.18);

    this.padGfx = this.add.graphics().setDepth(2);
    this.paintDoor(TOWN.houseMat);
    this.paintDoor(TOWN.shopMat);
    this.chrome = new HubChrome(this, 'MISTFORD');

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

    // The story's props and people, if the story has begun
    this.storyTown = new StoryTown(this, this.avatar, this.talkables);
    this.storyTown.mount();

    if (sunny) {
      // The rain has stopped. A warm light over everything.
      this.add.rectangle(0, 0, 240, 160, 0xffd070, 0.24).setOrigin(0, 0).setScrollFactor(0).setDepth(89);
    } else {
      for (let i = 0; i < 16; i++) {
        const drop = this.add.image(Phaser.Math.Between(0, 240), Phaser.Math.Between(0, 160), TEX.rain).setScrollFactor(0).setDepth(90).setAlpha(0.45).setTint(0x88b8f0);
        this.drops.push(drop);
      }
    }

    audio.playMusic('town');
    audio.setAmbience(sunny ? null : 'rain');

    const bridge: HubBridge = {
      x: () => this.avatar.x,
      y: () => this.avatar.y,
      place: () => 'town',
      frames: () => this.frames,
      tp: (col, row) => {
        const at = cellCenter({ col, row });
        this.avatar.setPosition(at.x, at.y);
      },
      story: () => this.storyTown.story,
      page: () => this.speech.page,
    };
    window.__hub = bridge;
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => {
      this.chrome.destroy();
      this.menu.hide();
      this.speech.hide();
      this.storyTown.destroy();
      window.removeEventListener('keydown', this.onKey);
      if (window.__hub === bridge) delete window.__hub;
      clearHub();
    });
    this.publish();
  }

  update(time: number, delta: number) {
    this.frames += 1;
    this.menu.pump(time);
    this.avatar.locked = this.menu.isOpen || this.speech.open || this.storyTown.journalOpen;
    this.storyTown.update(time);
    this.storyTown.setHidden(this.speech.open);
    if (!this.leaving && !this.avatar.locked) this.stepOn();
    this.interact = this.onPad() ? 'pad' : (this.nearestTalk()?.id ?? '');
    const pad = padCenter();
    drawFlightPad(this.padGfx, pad.x, pad.y, 30, time, this.onPad() ? 1 : 0);
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

  /** Standing on the flight pad. */
  private onPad() {
    const here = cellOf(this.avatar.x, this.avatar.y);
    return TOWN.pad.some((cell) => sameCell(cell, here));
  }

  /** Rise off the pad and out over the world map. */
  private takeOff() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.avatar.locked = true;
    this.tweens.add({ targets: this.avatar, y: this.avatar.y - 34, alpha: 0.15, duration: 520, ease: 'Sine.easeIn' });
    this.cameras.main.fadeOut(480, 255, 255, 255);
    this.time.delayedCall(560, () => this.scene.start('FlightScene'));
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

  private bubbleAt(): { x: number; y: number } | null {
    if (this.near(TOWN.houseMat)) return cellCenter(TOWN.houseMat);
    if (this.near(TOWN.shopMat)) return cellCenter(TOWN.shopMat);
    if (this.onPad()) return { x: this.avatar.x, y: this.avatar.y };
    const talk = this.nearestTalk();
    return talk ? { x: talk.x, y: talk.y } : null;
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
    if (event.type !== 'keydown' || this.leaving || this.menu.isOpen) return;
    const key = event.key.toLowerCase();
    if (event.repeat && (key === ' ' || key === 'enter' || key === 'z')) return;
    if (this.storyTown.journalOpen) {
      if (key === 'q' || key === 'escape' || key === ' ' || key === 'enter' || key === 'z' || key === 'j') this.storyTown.closeJournal();
      return;
    }
    if (this.speech.open && (key === ' ' || key === 'enter' || key === 'z' || key === 'escape')) {
      if (!this.speech.advance()) this.afterSpeech();
      return;
    }
    if (key === 'q' && this.storyTown.active) {
      this.storyTown.toggleJournal();
      return;
    }
    if (key === 'i') {
      this.openStatus();
      return;
    }
    if (key === 'escape') {
      this.openTitleAsk();
      return;
    }
    if (key === ' ' || key === 'enter' || key === 'z') {
      if (this.onPad()) {
        this.takeOff();
        return;
      }
      const talk = this.nearestTalk();
      if (talk && this.storyTown.handles(talk.id)) this.speech.showPages(this.storyTown.talk(talk.id).pages);
      else if (talk) this.speech.show(talk.lines);
    }
  };

  /** A conversation is over. If it completed a stage, the story card for it plays now. */
  private afterSpeech() {
    const pending = this.storyTown.takePending();
    if (!pending || this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.time.delayedCall(250, () => this.scene.start('CutsceneScene', { id: pending, next: { scene: 'TownScene', data: { at: 'plaza' } } }));
  }

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
      hint: 'What you are carrying.',
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
    this.chrome.setBubble(this.bubbleAt());
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

