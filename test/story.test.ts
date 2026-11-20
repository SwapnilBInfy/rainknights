import { describe, expect, it } from 'vitest';
import {
  advance,
  clearPending,
  CUTSCENES,
  FAR_CITIES,
  finaleBuff,
  finaleUnlocked,
  flightTargets,
  freshStory,
  interact,
  landed,
  LAST_STAGE,
  objectivesOf,
  hasLantern,
  hatchVisible,
  LANTERN_WARNING,
  quillHere,
  readTablet,
  runEnded,
  runObjective,
  sanitizeStory,
  SHARDS_NEEDED,
  SHARD_NAME,
  SHARD_OF,
  STAGES,
  startStory,
  STORY_VERSION,
  tabletsAvailable,
  TABLET_TEXT,
  TABLETS_NEEDED,
  tabletsRead,
  trackerText,
  type StoryState,
  type Target,
} from '../src/story/story';

const started = () => startStory(freshStory());
const talk = (s: StoryState, t: Target) => interact(s, t).state;

/** Play the story from the start to the given stage, the way a player would. */
function toStage(n: number): StoryState {
  let s = clearPending(started());
  if (n <= 1) return s;
  for (const t of ['pia', 'vane', 'marrow'] as const) s = talk(s, t);
  s = clearPending(s);
  if (n <= 2) return s;
  s = clearPending(talk(talk(talk(runEnded(s, 'nyc', true).state, 'altar'), 'marrow'), 'marrow'));
  if (n <= 3) return s;
  s = runEnded(runEnded(s, 'london', true).state, 'tokyo', true).state;
  s = clearPending(talk(talk(s, 'altar'), 'brent'));
  if (n <= 4) return s;
  s = clearPending(talk(talk(talk(runEnded(s, 'miami', true).state, 'altar'), 'marrow'), 'marrow'));
  if (n <= 5) return s;
  // the Undercroft: three tablets from three cities, the hatch, the Lantern
  for (const city of ['nyc', 'london', 'miami']) s = readTablet(s, city).state;
  s = clearPending(talk(talk(s, 'hatch'), 'pedestal'));
  if (n <= 6) return s;
  throw new Error('no such stage');
}

describe('starting the story', () => {
  it('begins on stage 1 with the prologue waiting, and starting again changes nothing', () => {
    const s = started();
    expect(s.started).toBe(true);
    expect(s.stage).toBe(1);
    expect(s.pending).toBe('prologue');
    expect(startStory(clearPending(s))).toEqual(clearPending(s));
    expect(freshStory().started).toBe(false);
  });

  it('shows nothing, and ignores runs, until it is started', () => {
    const fresh = freshStory();
    expect(trackerText(fresh)).toBe('');
    expect(runEnded(fresh, 'nyc', true)).toEqual({ state: fresh, messages: [] });
    expect(runObjective(fresh, 'nyc')).toBe('');
    expect(flightTargets(fresh)).toEqual([]);
    expect(landed(fresh, 'stormhold')).toBe(fresh);
  });
});

describe('the whole story, start to finish', () => {
  it('plays through six stages in order, with a cutscene queued at each', () => {
    const seen: string[] = [];
    const take = (s: StoryState) => {
      if (s.pending) seen.push(s.pending);
      return clearPending(s);
    };
    let s = take(started());
    expect(s.stage).toBe(1);

    // Stage 1: the stuck vane
    s = talk(s, 'pia');
    s = talk(s, 'vane');
    expect(s.stage).toBe(1);
    s = take(talk(s, 'marrow'));
    expect(s.stage).toBe(2);

    // Stage 2: the gray shard
    s = runEnded(s, 'nyc', true).state;
    expect(s.items).toEqual(['grayShard']);
    s = talk(s, 'altar');
    expect(s.placed).toEqual(['grayShard']);
    expect(s.stage).toBe(2);
    s = take(talk(s, 'marrow'));
    expect(s.stage).toBe(3);

    // Stage 3: the far storms (two of three)
    s = runEnded(s, 'tokyo', true).state;
    s = runEnded(s, 'mumbai', true).state;
    s = talk(s, 'altar');
    expect(s.stage).toBe(3);
    s = take(talk(s, 'brent'));
    expect(s.stage).toBe(4);

    // Stage 4: the amber sun; the fourth shard restores the Stormglass
    s = runEnded(s, 'miami', true).state;
    s = talk(s, 'altar');
    expect(s.placed).toHaveLength(SHARDS_NEEDED);
    s = take(talk(s, 'marrow'));
    expect(s.stage).toBe(5);
    expect(s.complete).toBe(false);

    // Stage 5: the Undercroft (tablets in the tunnels, the hatch, the Lantern)
    expect(tabletsAvailable(s)).toBe(true);
    s = readTablet(s, 'nyc').state;
    s = readTablet(s, 'tokyo').state;
    expect(s.stage).toBe(5);
    s = talk(s, 'hatch');
    expect(s.flags, 'the hatch does not open without three tablets').not.toContain('hatch:open');
    expect(s.stage).toBe(5);
    s = readTablet(s, 'miami').state;
    s = talk(s, 'hatch');
    s = talk(s, 'pedestal');
    expect(hasLantern(s)).toBe(true);
    s = take(s);
    expect(s.stage).toBe(6);

    // Stage 6: the eye of the storm
    expect(finaleUnlocked(s)).toBe(false);
    s = talk(s, 'quill');
    expect(finaleUnlocked(s)).toBe(true);
    s = landed(s, 'stormhold');
    expect(s.complete).toBe(false);
    const end = runEnded(s, 'stormhold', true);
    expect(end.messages).toEqual(['THE REGENT FALLS!']);
    s = take(end.state);
    expect(s.complete).toBe(true);
    expect(s.stage).toBe(LAST_STAGE + 1);
    expect(seen).toEqual(['prologue', 'stage1', 'stage2', 'stage3', 'restored', 'lantern', 'ending']);
    expect(trackerText(s)).toBe('The rain has stopped.');
    expect(flightTargets(s)).toEqual([]);
  });

  it('survives being saved and loaded at every step', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const s = toStage(n);
      expect(sanitizeStory(JSON.parse(JSON.stringify(s)))).toEqual(s);
    }
  });
});

describe('shards and the stages that want them', () => {
  it('a win is only worth a shard in the stage that wants it', () => {
    // stage 1: no shard, whatever city
    const early = runEnded(toStage(1), 'nyc', true);
    expect(early.state.items).toEqual([]);
    // stage 2: New York only
    expect(runEnded(toStage(2), 'london', true).state.items).toEqual([]);
    expect(runEnded(toStage(2), 'nyc', true).state.items).toEqual(['grayShard']);
    // stage 3: the eastern cities, two of them
    const s3 = toStage(3);
    expect(runEnded(s3, 'miami', true).state.items).toEqual([]);
    expect(runEnded(s3, 'nyc', true).state.items).toEqual([]);
    const two = runEnded(runEnded(s3, 'london', true).state, 'tokyo', true).state;
    expect(two.items.sort()).toEqual(['mistShard', 'neonShard']);
    expect(runEnded(two, 'mumbai', true).state.items, 'a third eastern shard is not needed').toHaveLength(2);
    // stage 4: Miami only
    expect(runEnded(toStage(4), 'london', true).state.items).toEqual([]);
    expect(runEnded(toStage(4), 'miami', true).state.items).toEqual(['amberShard']);
  });

  it('a loss gives nothing, and a repeat win does not give the shard twice', () => {
    const s = toStage(2);
    expect(runEnded(s, 'nyc', false)).toEqual({ state: s, messages: [] });
    const once = runEnded(s, 'nyc', true);
    expect(once.messages).toEqual(['GRAY SHARD FOUND!', 'Take it home.']);
    const twice = runEnded(once.state, 'nyc', true);
    expect(twice.state.items).toEqual(['grayShard']);
    expect(twice.messages).toEqual(['Already have it.']);
  });

  it('says so when a win is in the wrong place', () => {
    expect(runEnded(toStage(2), 'miami', true).messages).toEqual(['Not needed yet.']);
  });

  it('every shard has a name and a home city', () => {
    for (const city of ['nyc', 'london', 'tokyo', 'mumbai', 'miami']) expect(SHARD_NAME[SHARD_OF[city]]).toBeTruthy();
    expect(new Set(Object.values(SHARD_OF)).size).toBe(5);
  });
});

describe('the altar', () => {
  it('places every shard you carry, and says how many are restored', () => {
    const s = runEnded(runEnded(toStage(3), 'london', true).state, 'tokyo', true).state;
    const t = interact(s, 'altar');
    expect(t.placed).toHaveLength(2);
    expect(t.state.items).toEqual([]);
    expect(t.state.placed).toHaveLength(3);
    expect(t.pages.flat().join(' ')).toContain('2 shards');
    expect(t.pages.flat().join(' ')).toContain('3 of 4');
  });

  it('is cold and empty with nothing to place, and hums once it has some', () => {
    expect(interact(toStage(2), 'altar').pages[0][0]).toContain('stone altar');
    expect(interact(toStage(3), 'altar').pages.flat().join(' ')).toContain('1 of 4');
  });

  it('restores the Stormglass when the fourth shard goes on', () => {
    const s = runEnded(toStage(4), 'miami', true).state;
    const t = interact(s, 'altar');
    expect(t.state.placed).toHaveLength(4);
    expect(t.pages.flat().join(' ')).toContain('Stormglass is whole');
  });
});

describe('the villagers', () => {
  it('Marrow will not tell his tale until the vane has been examined', () => {
    const s = clearPending(started());
    expect(interact(s, 'marrow').pages.flat().join(' ')).toContain('vane first');
    expect(interact(s, 'marrow').state.flags).not.toContain('marrow:tale');
    expect(interact(talk(s, 'vane'), 'marrow').state.flags).toContain('marrow:tale');
  });

  it('Brent gives three Rain Buns once, in stage 3', () => {
    const s = runEnded(runEnded(toStage(3), 'london', true).state, 'tokyo', true).state;
    const first = interact(talk(s, 'altar'), 'brent');
    expect(first.gift).toEqual({ rainBun: 3 });
    expect(interact(first.state, 'brent').gift).toBeUndefined();
    expect(interact(toStage(2), 'brent').gift).toBeUndefined();
  });

  it('Quill only knows about the Eye in stage 5, and talking to him marks it', () => {
    expect(quillHere(toStage(3))).toBe(false);
    expect(quillHere(toStage(4))).toBe(true);
    expect(interact(toStage(4), 'quill').state.flags).not.toContain('quill:eye');
    expect(interact(toStage(5), 'quill').state.flags, 'not until the Undercroft is done').not.toContain('quill:eye');
    const s5 = toStage(6);
    expect(finaleUnlocked(s5)).toBe(false);
    expect(finaleUnlocked(interact(s5, 'quill').state)).toBe(true);
  });

  it('everyone has something to say at every stage, and once the story is done', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      for (const who of ['pia', 'brent', 'marrow', 'quill', 'vane', 'altar', 'hatch', 'statue', 'plaque', 'pedestal'] as const) {
        const t = interact(toStage(n), who);
        expect(t.pages.length, `${who} at stage ${n}`).toBeGreaterThan(0);
      }
    }
    const done = { ...toStage(6), complete: true, stage: LAST_STAGE + 1 };
    for (const who of ['pia', 'brent', 'marrow', 'quill', 'vane', 'altar', 'hatch', 'statue', 'plaque', 'pedestal'] as const) expect(interact(done, who).pages.length).toBeGreaterThan(0);
  });
});

describe('objectives and the tracker', () => {
  it('every stage has three objectives with text that fits the journal', () => {
    expect(STAGES).toHaveLength(LAST_STAGE);
    for (const stage of STAGES) {
      expect(stage.objectives.length).toBeGreaterThanOrEqual(3);
      expect(stage.title.length).toBeLessThanOrEqual(26);
      expect(CUTSCENES[stage.clear], stage.clear).toBeDefined();
      for (const o of stage.objectives) expect(o.text.length, o.text).toBeLessThanOrEqual(26);
    }
  });

  it('the tracker names the next thing to do, and counts', () => {
    expect(trackerText(clearPending(started()))).toBe('Talk to Pia');
    expect(trackerText(talk(clearPending(started()), 'pia'))).toBe('Examine the weathervane');
    expect(trackerText(toStage(2))).toBe('Win in New York');
    const s = runEnded(toStage(3), 'london', true).state;
    expect(trackerText(s)).toBe('Win in 2 eastern cities 1/2');
    expect(objectivesOf(s).map((o) => o.done)).toEqual([false, false, false]);
    const both = runEnded(s, 'tokyo', true).state;
    expect(trackerText(both)).toBe('Place both shards 0/2');
  });

  it('completing a stage needs every objective, in any order they can be done', () => {
    let s = clearPending(started());
    s = talk(s, 'vane');
    s = talk(s, 'marrow');
    expect(s.stage, 'not yet: Pia has not been spoken to').toBe(1);
    s = talk(s, 'pia');
    expect(s.stage).toBe(2);
  });

  it('advance does nothing for a story that has not started, or one that is complete', () => {
    expect(advance(freshStory())).toEqual(freshStory());
    const done = { ...toStage(6), complete: true, stage: LAST_STAGE + 1 };
    expect(advance(done)).toEqual(done);
  });
});

describe('what the rest of the game is told', () => {
  it('marks the flight targets: the city, then home, then the Eye', () => {
    expect(flightTargets(clearPending(started()))).toEqual(['mistford']); // talk to people
    expect(flightTargets(toStage(2))).toEqual(['nyc']);
    const got = runEnded(toStage(2), 'nyc', true).state;
    expect(flightTargets(got)).toEqual(['mistford']); // a shard to place
    expect(flightTargets(toStage(3)).sort()).toEqual([...FAR_CITIES].sort());
    const oneFar = runEnded(toStage(3), 'london', true).state;
    expect(flightTargets(oneFar).sort()).toEqual(['mistford', 'mumbai', 'tokyo']); // in hand, and two to find
    expect(flightTargets(toStage(4))).toEqual(['miami']);
    // stage 5: the tunnels under any city that has not given a tablet; then home for the hatch and the Lantern
    const s5 = toStage(5);
    expect(flightTargets(s5).sort()).toEqual(['london', 'miami', 'mumbai', 'nyc', 'tokyo']);
    const read = readTablet(s5, 'nyc').state;
    expect(flightTargets(read).sort()).toEqual(['london', 'miami', 'mumbai', 'tokyo']);
    const three = readTablet(readTablet(read, 'tokyo').state, 'miami').state;
    expect(flightTargets(three)).toEqual(['mistford']); // the hatch
    const s6 = toStage(6);
    expect(flightTargets(s6)).toEqual(['mistford']); // Quill is at home
    expect(flightTargets(interact(s6, 'quill').state)).toEqual([FINALE]);
  });

  it('tells a run whether a win here recovers a shard, and what the finale wants', () => {
    expect(runObjective(toStage(2), 'nyc')).toBe('WIN HERE: GRAY SHARD');
    expect(runObjective(toStage(2), 'miami')).toBe('');
    expect(runObjective(toStage(3), 'tokyo')).toBe('WIN HERE: NEON SHARD');
    expect(runObjective(toStage(4), 'miami')).toBe('WIN HERE: AMBER SHARD');
    expect(runObjective(runEnded(toStage(2), 'nyc', true).state, 'nyc')).toBe('');
    expect(runObjective(toStage(6), 'stormhold')).toBe('DEFEAT THE REGENT');
    expect(runObjective(toStage(5), 'nyc')).toBe('FIND A TABLET BELOW');
    expect(runObjective(readTablet(toStage(5), 'nyc').state, 'nyc'), 'this city has given its tablet').toBe('');
  });

  it('landing at the Eye begins the finale, and nowhere else does', () => {
    const s = interact(toStage(6), 'quill').state;
    expect(landed(s, 'nyc')).toBe(s);
    expect(landed(s, 'stormhold').flags).toContain('landed:stormhold');
  });

  it('the Stormglass toughens the knight for the finale: each shard on the altar helps', () => {
    expect(finaleBuff(freshStory())).toEqual({ hp: 0, damage: 0, lantern: false });
    expect(finaleBuff(toStage(3))).toEqual({ hp: 10, damage: 0.06, lantern: false });
    expect(finaleBuff(toStage(6)).hp).toBe(40);
    expect(finaleBuff(toStage(6)).damage).toBeCloseTo(0.24, 9);
    expect(finaleBuff(toStage(6)).lantern, 'the Lantern from the Undercroft').toBe(true);
    expect(finaleBuff(toStage(5)).lantern).toBe(false);
    expect(LANTERN_WARNING).toBeGreaterThan(1);
  });
});

describe('every word fits the screen', () => {
  const tooLong = (line: string) => line.length > 27;
  it('dialogue pages are at most two lines of 27 characters', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const states = [toStage(n), { ...toStage(n), complete: true, stage: LAST_STAGE + 1 }];
      const withExtras = [...states, runEnded(toStage(Math.min(n, 4)), n === 2 ? 'nyc' : 'miami', true).state];
      for (const s of withExtras) {
        for (const who of ['pia', 'brent', 'marrow', 'quill', 'vane', 'altar', 'hatch', 'statue', 'plaque', 'pedestal'] as const) {
          for (const pg of interact(s, who).pages) {
            expect(pg.length, `${who} ${n}`).toBeLessThanOrEqual(2);
            for (const line of pg) expect(tooLong(line), `${who} stage ${n}: "${line}"`).toBe(false);
          }
        }
      }
    }
    // the first-time speeches too
    for (const who of ['pia', 'marrow', 'quill', 'brent'] as const) {
      const s = { ...toStage(who === 'quill' ? 6 : who === 'brent' ? 3 : 1), flags: [] as string[] };
      const t = interact({ ...s, flags: who === 'marrow' ? ['examine:vane'] : [] }, who);
      for (const pg of t.pages) for (const line of pg) expect(tooLong(line), `${who}: "${line}"`).toBe(false);
    }
  });

  it('cutscene pages are at most four lines of 30 characters, and the big title fits on one line', () => {
    for (const c of Object.values(CUTSCENES)) {
      expect(c.title.length, `${c.id}: the title is drawn at 16px, 14 characters across`).toBeLessThanOrEqual(14);
      expect((c.subtitle ?? '').length, c.id).toBeLessThanOrEqual(26);
      expect(c.pages.length).toBeGreaterThan(0);
      for (const pg of c.pages) {
        expect(pg.length).toBeLessThanOrEqual(4);
        for (const line of pg) expect(line.length, `${c.id}: "${line}"`).toBeLessThanOrEqual(30);
      }
    }
  });

  it('game-over messages fit the results box: 18 characters at the 8px font', () => {
    const all: string[] = [];
    for (const [s, region] of [[toStage(2), 'nyc'], [toStage(3), 'tokyo'], [toStage(3), 'london'], [toStage(3), 'mumbai'], [toStage(4), 'miami'], [toStage(2), 'miami']] as const) {
      all.push(...runEnded(s, region, true).messages);
    }
    all.push(...runEnded(runEnded(toStage(2), 'nyc', true).state, 'nyc', true).messages);
    all.push(...runEnded(interact(toStage(5), 'quill').state, 'stormhold', true).messages);
    expect(all.length).toBeGreaterThan(6);
    for (const m of all) expect(m.length, m).toBeLessThanOrEqual(18);
  });
});

describe('reading a saved story back', () => {
  it('turns anything unusable into a fresh story, and drops what it does not know', () => {
    expect(sanitizeStory(null)).toEqual(freshStory());
    expect(sanitizeStory('rain')).toEqual(freshStory());
    expect(sanitizeStory(42)).toEqual(freshStory());
    const dirty = sanitizeStory({
      started: true,
      stage: 99,
      flags: ['talk:pia', 'BAD FLAG!', 7, 'talk:pia'],
      items: ['grayShard', 'bogus'],
      placed: ['amberShard', 3],
      pending: 'nope',
      complete: false,
    });
    expect(dirty.stage).toBe(LAST_STAGE + 1);
    expect(dirty.complete).toBe(true);
    expect(dirty.flags).toEqual(['talk:pia']);
    expect(dirty.items).toEqual(['grayShard']);
    expect(dirty.placed).toEqual(['amberShard']);
    expect(dirty.pending).toBeNull();
    expect(sanitizeStory({ started: true, stage: -3 }).stage).toBe(1);
  });
});

const FINALE = 'stormhold';

describe('the Undercroft: tablets, the hatch and the Lantern', () => {
  it('tablets are only in the tunnels at stage 5, and the hatch only shows once the Stormglass is whole', () => {
    expect(tabletsAvailable(toStage(4))).toBe(false);
    expect(tabletsAvailable(toStage(5))).toBe(true);
    expect(tabletsAvailable(toStage(6))).toBe(false);
    expect(hatchVisible(toStage(4))).toBe(false);
    expect(hatchVisible(toStage(5))).toBe(true);
    expect(hatchVisible(toStage(6))).toBe(true);
    expect(hatchVisible(freshStory())).toBe(false);
    expect(readTablet(toStage(3), 'nyc').counted).toBe(false);
  });

  it('one tablet counts for each city, and the three tell Aurel\'s story in order', () => {
    let s = toStage(5);
    const seen: string[] = [];
    for (const [i, city] of ['nyc', 'tokyo', 'mumbai'].entries()) {
      const r = readTablet(s, city);
      expect(r.counted, city).toBe(true);
      expect(r.pages).toEqual(TABLET_TEXT[i]);
      seen.push(r.pages[0][0]);
      s = r.state;
      expect(tabletsRead(s)).toBe(i + 1);
    }
    expect(new Set(seen).size).toBe(3);
    expect(tabletsRead(s)).toBe(TABLETS_NEEDED);
  });

  it('a second tablet in the same city does not count, and says so', () => {
    const once = readTablet(toStage(5), 'london');
    const again = readTablet(once.state, 'london');
    expect(again.counted).toBe(false);
    expect(again.state).toBe(once.state);
    expect(tabletsRead(again.state)).toBe(1);
    expect(again.pages[0].join(' ')).toContain('read this one already');
  });

  it('the hatch is sealed until three tablets are read, then opens and leads down', () => {
    const two = readTablet(readTablet(toStage(5), 'nyc').state, 'tokyo').state;
    const sealed = interact(two, 'hatch');
    expect(sealed.enter).toBeUndefined();
    expect(sealed.pages.flat().join(' ')).toContain('sealed');
    expect(sealed.pages.flat().join(' ')).toContain('2 of 3');
    const three = readTablet(two, 'miami').state;
    const open = interact(three, 'hatch');
    expect(open.enter).toBe('undercroft');
    expect(open.state.flags).toContain('hatch:open');
    // and from then on it just leads down
    expect(interact(open.state, 'hatch').enter).toBe('undercroft');
    expect(trackerText(open.state)).toBe("Take Aurel's Lantern");
  });

  it('taking the Lantern completes the stage, queues its card, and moves the story on to the finale', () => {
    const opened = interact(readTablet(readTablet(readTablet(toStage(5), 'nyc').state, 'tokyo').state, 'miami').state, 'hatch').state;
    const took = interact(opened, 'pedestal');
    expect(took.took).toBe(true);
    expect(hasLantern(took.state)).toBe(true);
    expect(took.state.stage).toBe(6);
    expect(took.state.pending).toBe('lantern');
    // the pedestal is then empty
    const again = interact(took.state, 'pedestal');
    expect(again.took).toBeUndefined();
    expect(again.state).toBe(took.state);
  });

  it('Marrow, Pia and Quill each have something to say about the tunnels while the tablets are being read', () => {
    const s = toStage(5);
    expect(interact(s, 'marrow').pages.flat().join(' ')).toContain('three tablets');
    expect(interact(s, 'quill').pages.flat().join(' ')).toContain('tablets');
    expect(interact(readTablet(s, 'nyc').state, 'marrow').pages.flat().join(' ')).toContain('1 of 3');
    const three = readTablet(readTablet(readTablet(s, 'nyc').state, 'tokyo').state, 'miami').state;
    expect(interact(three, 'marrow').pages.flat().join(' ')).toContain('hatch');
    // Quill mentions the Lantern in the finale only if you have it
    expect(interact(toStage(6), 'quill').pages.flat().join(' ')).toContain('Lantern');
    const noLantern = { ...toStage(6), flags: toStage(6).flags.filter((f) => f !== 'lantern') };
    expect(interact(noLantern, 'quill').pages.flat().join(' ')).not.toContain('Lantern');
  });

  it('the Lantern slows the Regent\'s lightning: a longer warning', () => {
    expect(LANTERN_WARNING).toBeGreaterThan(1);
    expect(LANTERN_WARNING).toBeLessThan(2);
  });
});

describe('a story saved before the Undercroft stage was added', () => {
  const old = (over: Record<string, unknown>) => ({ started: true, stage: 1, flags: [], items: [], placed: [], pending: null, complete: false, ...over });

  it('keeps stages 1 to 4 as they were, and stamps the new version', () => {
    for (const stage of [1, 2, 3, 4]) {
      const s = sanitizeStory(old({ stage }));
      expect(s.stage).toBe(stage);
      expect(s.version).toBe(STORY_VERSION);
    }
  });

  it('moves the old finale (stage 5) to stage 6, so the player is still at the Eye and not sent back underground', () => {
    const s = sanitizeStory(old({ stage: 5, flags: ['quill:eye'], placed: ['grayShard', 'mistShard', 'neonShard', 'amberShard'] }));
    expect(s.stage).toBe(6);
    expect(s.flags).toContain('quill:eye');
    expect(s.complete).toBe(false);
    expect(trackerText(s)).toBe('Fly to the Eye');
    // the hatch can still be opened for the Lantern, without reading tablets
    expect(interact(s, 'hatch').enter).toBe('undercroft');
  });

  it('keeps a finished story finished', () => {
    const a = sanitizeStory(old({ stage: 6, complete: true }));
    expect(a.complete).toBe(true);
    expect(a.stage).toBe(LAST_STAGE + 1);
    const b = sanitizeStory(old({ stage: 6 })); // (an old save marks completion by the stage alone)
    expect(b.complete).toBe(true);
  });

  it('does not move a story that is already the new layout', () => {
    const fresh = sanitizeStory({ ...toStage(5), version: STORY_VERSION });
    expect(fresh.stage).toBe(5);
    const moved = sanitizeStory({ ...toStage(6), version: STORY_VERSION });
    expect(moved.stage).toBe(6);
    expect(sanitizeStory(JSON.parse(JSON.stringify(moved)))).toEqual(moved);
  });
});
