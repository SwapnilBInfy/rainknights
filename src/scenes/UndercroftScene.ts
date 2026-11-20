import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { bagLabel, townMaxHp } from '../economy/economy';
import { Darkness } from '../gfx/darkness';
import { placeExit } from '../gfx/furniture';
import { STORY_TEX } from '../gfx/storyProps';
import { loadGame, loadStory, writeStory } from '../save/save';
import { clearPending, hasLantern, interact, type StoryState, type Target } from '../story/story';
import { Avatar } from '../town/avatar';
import { mountMap } from '../town/mapView';
import { cellCenter, cellOf, sameCell, UNDERCROFT, undercroftGrid } from '../town/mistford';
import { Speech, clearHub, publishHub } from '../town/speech';
import { HubChrome } from '../ui/hubChrome';

interface Talkable {
  id: Target;
  x: number;
  y: number;
}

/**
 * The Undercroft, beneath the cellar hatch in Mistford: the crypt of the first Rain Knights, dark but for the
 * knight's light and the glow of Aurel's Lantern on its pedestal. His statue, two plaques of the Knights' words, and
 * the Lantern itself (take it, and the stage is done). The stairs up are at the south end.
 */
export class UndercroftScene extends Phaser.Scene {
  private avatar!: Avatar;
  private speech = new Speech(this);
  private chrome!: HubChrome;
  private darkness!: Darkness;
  private pedestal!: Phaser.GameObjects.Image;
  private talkables: Talkable[] = [];
  private interact = '';
  private leaving = false;
  private frames = 0;
  private story!: StoryState;

  constructor() {
    super('UndercroftScene');
  }

  create() {
    this.leaving = false;
    this.interact = '';
    this.frames = 0;
    this.talkables = [];
    this.story = loadStory();
    const profile = loadGame().town;
    const at = cellCenter(UNDERCROFT.spawn);

    this.cameras.main.setBackgroundColor('#05060c');
    const map = mountMap(this, undercroftGrid, 21);
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.avatar = new Avatar(this, at.x, at.y, profile.characterId);
    this.physics.add.collider(this.avatar, map.layer);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.startFollow(this.avatar, true, 0.2, 0.2);

    const solid = (cell: { col: number; row: number }, key: string, w: number, h: number, ox: number, oy: number, id: Target) => {
      const c = cellCenter(cell);
      const sprite = this.physics.add.staticImage(c.x, c.y, key).setDepth(8);
      sprite.body.setSize(w, h).setOffset(ox, oy);
      sprite.refreshBody();
      this.physics.add.collider(this.avatar, sprite);
      this.talkables.push({ id, x: c.x, y: c.y });
      return sprite;
    };
    solid(UNDERCROFT.statue, STORY_TEX.statue, 12, 8, 2, 18, 'statue');
    this.pedestal = solid(UNDERCROFT.pedestal, hasLantern(this.story) ? STORY_TEX.pedestalEmpty : STORY_TEX.pedestal, 12, 8, 2, 14, 'pedestal');
    for (const cell of UNDERCROFT.plaques) solid(cell, STORY_TEX.plaque, 10, 6, 2, 10, 'plaque');
    placeExit(this, UNDERCROFT.exit);
    this.chrome = new HubChrome(this, 'UNDERCROFT');
    this.darkness = new Darkness(this, 0.74);

    audio.playMusic('town');
    audio.setAmbience(null);
    const bridge = {
      x: () => this.avatar.x,
      y: () => this.avatar.y,
      place: () => 'undercroft',
      frames: () => this.frames,
      tp: (col: number, row: number) => {
        const c = cellCenter({ col, row });
        this.avatar.setPosition(c.x, c.y);
      },
      story: () => this.story,
      page: () => this.speech.page,
    };
    window.__hub = bridge;
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', () => {
      this.chrome.destroy();
      this.speech.hide();
      this.darkness.destroy();
      window.removeEventListener('keydown', this.onKey);
      if (window.__hub === bridge) delete window.__hub;
      clearHub();
    });
    this.publish();
  }

  update() {
    this.frames += 1;
    this.avatar.locked = this.speech.open;
    if (!this.leaving && !this.speech.open && sameCell(cellOf(this.avatar.x, this.avatar.y), UNDERCROFT.exit)) {
      this.up();
      return;
    }
    this.interact = this.nearest()?.id ?? (sameCell(cellOf(this.avatar.x, this.avatar.y), UNDERCROFT.exit) ? 'door' : '');
    // dark but for the knight's own light, and the Lantern's glow while it is still on its pedestal
    const cam = this.cameras.main.worldView;
    const lights = [{ x: this.avatar.x - cam.x, y: this.avatar.y - cam.y, r: 74 }];
    const p = cellCenter(UNDERCROFT.pedestal);
    if (!hasLantern(this.story)) lights.push({ x: p.x - cam.x, y: p.y - cam.y, r: 64 });
    const s = cellCenter(UNDERCROFT.statue);
    lights.push({ x: s.x - cam.x, y: s.y - cam.y, r: 30 });
    this.darkness.update(lights);
    this.publish();
  }

  private nearest(): Talkable | null {
    let best: Talkable | null = null;
    let bestDist = 26;
    for (const t of this.talkables) {
      const d = Phaser.Math.Distance.Between(this.avatar.x, this.avatar.y, t.x, t.y);
      if (d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    return best;
  }

  private up() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('confirm');
    this.scene.start('TownScene', { at: 'hatch' });
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.type !== 'keydown' || this.leaving) return;
    const key = event.key.toLowerCase();
    if (event.repeat && (key === ' ' || key === 'enter' || key === 'z')) return;
    if (this.speech.open && (key === ' ' || key === 'enter' || key === 'z' || key === 'escape')) {
      if (!this.speech.advance()) this.afterSpeech();
      return;
    }
    if (key === 'escape') {
      this.up();
      return;
    }
    if (key !== ' ' && key !== 'enter' && key !== 'z') return;
    const t = this.nearest();
    if (!t) return;
    const result = interact(this.story, t.id);
    this.story = result.state;
    writeStory(this.story);
    if (result.took) {
      // the pedestal is empty, and the Lantern is yours
      this.pedestal.setTexture(STORY_TEX.pedestalEmpty);
      this.cameras.main.flash(500, 255, 240, 170, false);
      audio.play('levelUp');
    }
    this.speech.showPages(result.pages);
  };

  /** A conversation is over: if the Lantern completed the stage, its card plays now and then we are back in Mistford. */
  private afterSpeech() {
    const pending = this.story.pending;
    if (!pending || this.leaving) return;
    this.story = clearPending(this.story);
    writeStory(this.story);
    this.leaving = true;
    audio.play('confirm');
    this.time.delayedCall(300, () => this.scene.start('CutsceneScene', { id: pending, next: { scene: 'TownScene', data: { at: 'hatch' } } }));
  }

  private publish() {
    const profile = loadGame().town;
    const max = townMaxHp(profile.characterId, profile.armorId);
    this.chrome.setStats(profile.hp, max, profile.coins);
    const t = this.nearest();
    this.chrome.setBubble(t ? { x: t.x, y: t.y } : null);
    publishHub({
      place: 'undercroft',
      coins: profile.coins,
      hp: profile.hp,
      maxHp: max,
      armor: profile.armorId ?? '',
      bag: bagLabel(profile.bag),
      interact: this.interact,
      shop: 'closed',
      shopItem: '',
      dialog: this.speech.open ? 'open' : '',
    });
  }
}
