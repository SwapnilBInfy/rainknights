import Phaser from 'phaser';
import { collect } from '../economy/economy';
import { STORY_TEX } from '../gfx/storyProps';
import { loadGame, loadStory, writeProfile, writeStory } from '../save/save';
import {
  clearPending,
  interact,
  objectivesOf,
  quillHere,
  SHARD_COLOUR,
  SHARD_NAME,
  SHARDS_NEEDED,
  stageOf,
  trackerText,
  LAST_STAGE,
  type StoryState,
  type Target,
} from '../story/story';
import { drawWindow, textStyle } from '../ui/Window';
import { cellCenter, type Cell } from './mistford';

/** Where the story's props and people stand in Mistford: the alcove between the house and the market. */
export const STORY_SPOTS: Record<'vane' | 'altar' | 'marrow' | 'quill', Cell> = {
  vane: { col: 8, row: 2 },
  altar: { col: 9, row: 4 },
  marrow: { col: 10, row: 3 },
  quill: { col: 16, row: 12 },
};

export interface TalkableSink {
  push(t: { x: number; y: number; id: string; lines: readonly string[] }): unknown;
}

const IDS: readonly string[] = ['pia', 'brent', 'marrow', 'quill', 'vane', 'altar'];

/**
 * Story mode in Mistford: the weathervane, the altar, Marrow and Quill (when they are there), what everyone says,
 * the objective strip along the bottom and the journal on Q. Nothing here appears until the story is started, so
 * Mistford is exactly as it was for a player who never chose it.
 */
export class StoryTown {
  story: StoryState;
  private arrow: Phaser.GameObjects.Graphics;
  private altarGfx: Phaser.GameObjects.Graphics;
  private tracker: Phaser.GameObjects.Container | null = null;
  private trackerKey = '';
  private journal: Phaser.GameObjects.Container | null = null;
  private quill: Phaser.GameObjects.Image | null = null;
  private hidden = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly avatar: Phaser.Physics.Arcade.Sprite,
    private readonly talkables: TalkableSink
  ) {
    this.story = loadStory();
    this.arrow = scene.add.graphics().setDepth(9);
    this.altarGfx = scene.add.graphics().setDepth(9);
  }

  get active(): boolean {
    return this.story.started;
  }

  get journalOpen(): boolean {
    return this.journal !== null;
  }

  /** Put the props and people in the village. */
  mount() {
    if (!this.story.started) return;
    const solid = (cell: Cell, key: string, w: number, h: number, ox: number, oy: number, depth = 7) => {
      const at = cellCenter(cell);
      const sprite = this.scene.physics.add.staticImage(at.x, at.y, key).setDepth(depth);
      sprite.body.setSize(w, h).setOffset(ox, oy);
      sprite.refreshBody();
      this.scene.physics.add.collider(this.avatar, sprite);
      return { sprite, at };
    };
    const vane = solid(STORY_SPOTS.vane, STORY_TEX.vane, 8, 6, 4, 24);
    this.talkables.push({ x: vane.at.x, y: vane.at.y + 6, id: 'vane', lines: [] });
    const altar = solid(STORY_SPOTS.altar, STORY_TEX.altar, 12, 8, 2, 12);
    this.talkables.push({ x: altar.at.x, y: altar.at.y, id: 'altar', lines: [] });
    const marrow = solid(STORY_SPOTS.marrow, STORY_TEX.marrow, 8, 6, 4, 16, 8);
    this.talkables.push({ x: marrow.at.x, y: marrow.at.y, id: 'marrow', lines: [] });
    this.ensureQuill();
    this.refreshTracker();
  }

  /** Quill arrives once the Stormglass is whole (and may arrive while you are standing here). */
  private ensureQuill() {
    if (this.quill || !quillHere(this.story)) return;
    const at = cellCenter(STORY_SPOTS.quill);
    const sprite = this.scene.physics.add.staticImage(at.x, at.y, STORY_TEX.quill).setDepth(8);
    sprite.body.setSize(8, 6).setOffset(4, 16);
    sprite.refreshBody();
    this.scene.physics.add.collider(this.avatar, sprite);
    this.talkables.push({ x: at.x, y: at.y, id: 'quill', lines: [] });
    this.quill = sprite;
  }

  /** Whether a talkable's words come from the story (Pia and Brent do too, once it has begun). */
  handles(id: string): boolean {
    return this.story.started && IDS.includes(id);
  }

  /** Talk to, or examine, something. Saves what it changes, and says what to show. */
  talk(id: string): { pages: string[][]; placed: boolean } {
    const before = this.story;
    const result = interact(before, id as Target);
    this.story = result.state;
    if (result.gift) {
      let profile = loadGame().town;
      for (const [item, n] of Object.entries(result.gift)) for (let i = 0; i < n; i++) profile = collect(profile, 0, item).profile;
      writeProfile(profile);
    }
    if (this.story !== before) writeStory(this.story);
    this.ensureQuill();
    this.refreshTracker();
    return { pages: result.pages, placed: !!result.placed?.length };
  }

  /** A cutscene waiting to play (a stage was completed), consumed. */
  takePending(): string | null {
    const pending = this.story.pending;
    if (!pending) return null;
    this.story = clearPending(this.story);
    writeStory(this.story);
    return pending;
  }

  // ---- drawing ----

  update(time: number) {
    if (!this.story.started) return;
    const v = cellCenter(STORY_SPOTS.vane);
    const a = this.arrow;
    a.clear();
    // frozen on the sea until the story is done; it trembles once the shards start to wake; free when it is over
    const angle = this.story.complete ? time / 520 : Math.PI + (this.story.stage >= 2 ? Math.sin(time / 90) * 0.07 : 0);
    const cx = v.x;
    const cy = v.y - 10;
    const tx = Math.cos(angle);
    const ty = Math.sin(angle);
    a.lineStyle(2, 0xf0c848, 1).lineBetween(cx - tx * 7, cy - ty * 7, cx + tx * 7, cy + ty * 7);
    a.fillStyle(0xf0c848, 1).fillTriangle(cx + tx * 9, cy + ty * 9, cx + tx * 4 - ty * 3, cy + ty * 4 + tx * 3, cx + tx * 4 + ty * 3, cy + ty * 4 - tx * 3);
    a.fillStyle(0xf0c848, 1).fillTriangle(cx - tx * 7, cy - ty * 7, cx - tx * 9 - ty * 3, cy - ty * 9 + tx * 3, cx - tx * 9 + ty * 3, cy - ty * 9 - tx * 3);

    // the altar's four sockets
    const at = cellCenter(STORY_SPOTS.altar);
    const g = this.altarGfx;
    g.clear();
    const pulse = 0.55 + 0.45 * Math.sin(time / 260);
    for (let i = 0; i < SHARDS_NEEDED; i++) {
      const shard = this.story.placed[i];
      const x = Math.round(at.x - 8 + 3 + i * 3);
      const y = Math.round(at.y - 10 + 9);
      if (shard) {
        g.fillStyle(SHARD_COLOUR[shard], this.story.complete || this.story.placed.length >= SHARDS_NEEDED ? 0.6 + 0.4 * pulse : 1).fillRect(x, y, 2, 2);
        if (this.story.placed.length >= SHARDS_NEEDED) g.fillStyle(0xffffff, 0.25 * pulse).fillRect(x - 1, y - 2, 4, 5);
      } else g.fillStyle(0x3a3f52, 1).fillRect(x, y, 2, 2);
    }
  }

  /** The strip along the bottom: the next thing to do. Hidden while something is talking. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.tracker?.setVisible(!hidden && !this.journal);
  }

  refreshTracker() {
    const text = trackerText(this.story);
    if (text === this.trackerKey) return;
    this.trackerKey = text;
    this.tracker?.destroy();
    this.tracker = null;
    const app = document.getElementById('app');
    if (app) {
      if (text) app.dataset.objective = text;
      else delete app.dataset.objective;
    }
    if (!text) return;
    const label = this.scene.add.text(7, 148, `* ${text}`, { ...textStyle('#ffe9a0'), stroke: '#14121f', strokeThickness: 3 });
    const back = this.scene.add.graphics();
    back.fillStyle(0x14121f, 0.6).fillRect(3, 146, label.width + 8, 12);
    this.tracker = this.scene.add.container(0, 0, [back, label]).setScrollFactor(0).setDepth(150).setVisible(!this.hidden);
  }

  // ---- the journal ----

  toggleJournal() {
    if (this.journal) this.closeJournal();
    else this.openJournal();
  }

  closeJournal() {
    this.journal?.destroy(true);
    this.journal = null;
    this.tracker?.setVisible(!this.hidden);
    const app = document.getElementById('app');
    if (app) delete app.dataset.journal;
  }

  private openJournal() {
    if (!this.story.started) return;
    const s = this.story;
    const stage = stageOf(s);
    const parts: Phaser.GameObjects.GameObject[] = [drawWindow(this.scene, 4, 6, 232, 148)];
    const add = (x: number, y: number, text: string, color = '#383838') => {
      parts.push(this.scene.add.text(x, y, text, textStyle(color)));
    };
    add(12, 12, 'THE LONG RAIN', '#c07800');
    if (s.complete || !stage) {
      add(12, 30, 'STORY COMPLETE', '#28a038');
      add(12, 46, 'The rain has stopped.', '#383838');
      add(12, 58, 'Sir Aurel is at peace.', '#383838');
    } else {
      add(12, 28, `STAGE ${stage.n}/${LAST_STAGE}`, '#686868');
      add(12, 40, stage.title, '#3078d8');
      objectivesOf(s).forEach(({ objective, done }, i) => {
        const p = objective.progress?.(s);
        add(12, 58 + i * 14, `${done ? '[x]' : '[ ]'} ${objective.text}${p ? ` ${p.have}/${p.need}` : ''}`, done ? '#28a038' : '#383838');
      });
    }
    // the shards: carried and on the altar
    const carried = s.items.length;
    add(12, 106, `STORMGLASS ${s.placed.length}/${SHARDS_NEEDED}${carried ? `  +${carried} HELD` : ''}`, '#686868');
    const g = this.scene.add.graphics();
    (['grayShard', 'mistShard', 'neonShard', 'tideShard', 'amberShard'] as const).forEach((id, i) => {
      const x = 14 + i * 44;
      const have = s.placed.includes(id) ? 2 : s.items.includes(id) ? 1 : 0;
      g.fillStyle(0x14121f, 1).fillRect(x - 1, 121, 12, 12);
      g.fillStyle(have ? SHARD_COLOUR[id] : 0x484c5c, have === 1 ? 0.6 : 1).fillRect(x, 122, 10, 10);
      parts.push(this.scene.add.text(x + 14, 123, SHARD_NAME[id].split(' ')[0].slice(0, 3), textStyle(have ? '#383838' : '#a8a8b8')));
    });
    parts.push(g);
    add(12, 140, 'Q: CLOSE', '#686868');
    this.journal = this.scene.add.container(0, 0, parts).setScrollFactor(0).setDepth(190);
    this.tracker?.setVisible(false);
    const app = document.getElementById('app');
    if (app) app.dataset.journal = 'open';
  }

  destroy() {
    this.closeJournal();
    this.tracker?.destroy();
    this.tracker = null;
    this.trackerKey = '';
    const app = document.getElementById('app');
    if (app) delete app.dataset.objective;
  }
}
