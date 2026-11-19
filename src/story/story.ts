/**
 * Story mode: "The Long Rain". Plain data and rules (no Phaser), so the whole story can be unit-tested.
 *
 * Mistford has been under rain for a hundred days and its weathervane has frozen, pointing at the empty sea.
 * The Stormglass that keeps the world's weather in balance has shattered; its shards fell on five cities. The
 * knight gathers them, places them on the altar in Mistford, and at the end flies to Stormhold, in the Pacific,
 * to face the Tempest Regent: Sir Aurel, the first Rain Knight, who tried to hold all the weather in one storm.
 *
 * The state is a small record of what has happened (flags, shards carried and placed, the stage). Everything that
 * happens in the game is reported to it as an event, and it says what the player should see: what a villager
 * says now, what the next objective is, which stars to mark on the flight map. A stage is complete when all of
 * its objectives are done; completing one queues a cutscene for the next time the knight is in Mistford.
 */

export type NpcId = 'pia' | 'brent' | 'marrow' | 'quill';
export type ObjectId = 'vane' | 'altar';
export type Target = NpcId | ObjectId;
export type ShardId = 'grayShard' | 'mistShard' | 'neonShard' | 'tideShard' | 'amberShard';

/** Which city's boss drops which shard. */
export const SHARD_OF: Record<string, ShardId> = {
  nyc: 'grayShard',
  london: 'mistShard',
  tokyo: 'neonShard',
  mumbai: 'tideShard',
  miami: 'amberShard',
};
export const SHARD_NAME: Record<ShardId, string> = {
  grayShard: 'GRAY SHARD',
  mistShard: 'MIST SHARD',
  neonShard: 'NEON SHARD',
  tideShard: 'TIDE SHARD',
  amberShard: 'AMBER SHARD',
};
/** The colour of each shard, for the altar and the journal. */
export const SHARD_COLOUR: Record<ShardId, number> = {
  grayShard: 0xb8c0d8,
  mistShard: 0x9ad8c0,
  neonShard: 0xff78c8,
  tideShard: 0x58d0e8,
  amberShard: 0xffb84a,
};
export const FAR_CITIES = ['london', 'tokyo', 'mumbai'] as const;
const FAR_SHARDS: ShardId[] = FAR_CITIES.map((c) => SHARD_OF[c]);
/** The Stormglass is whole with the Gray and Amber shards and two of the three far ones. */
export const SHARDS_NEEDED = 4;
/** The finale's region: a storm island in the Pacific, only on the map once Quill has marked it. */
export const FINALE_REGION = 'stormhold';
export const LAST_STAGE = 5;

export interface StoryState {
  started: boolean;
  /** 1 to LAST_STAGE; LAST_STAGE + 1 once the story is complete. */
  stage: number;
  /** Everything that has happened ("talk:pia", "examine:vane", "win:nyc", ...). */
  flags: string[];
  /** Shards the knight is carrying. */
  items: ShardId[];
  /** Shards on the altar. */
  placed: ShardId[];
  /** A cutscene to play the next time the knight is in Mistford. */
  pending: string | null;
  complete: boolean;
}

export function freshStory(): StoryState {
  return { started: false, stage: 1, flags: [], items: [], placed: [], pending: null, complete: false };
}

const has = (s: StoryState, flag: string) => s.flags.includes(flag);
const withFlag = (s: StoryState, flag: string): StoryState => (has(s, flag) ? s : { ...s, flags: [...s.flags, flag] });
const owns = (s: StoryState, shard: ShardId) => s.items.includes(shard) || s.placed.includes(shard);
const farOwned = (s: StoryState) => FAR_SHARDS.filter((x) => owns(s, x)).length;
const farPlaced = (s: StoryState) => FAR_SHARDS.filter((x) => s.placed.includes(x)).length;

// ---- Objectives ------------------------------------------------------------------------------------------

export interface Objective {
  id: string;
  /** At most 26 characters: it has to fit the journal and the tracker. */
  text: string;
  done: (s: StoryState) => boolean;
  /** For counted objectives: how far along. */
  progress?: (s: StoryState) => { have: number; need: number };
}

export interface Stage {
  n: number;
  title: string;
  objectives: Objective[];
  /** The cutscene that plays when it is complete. */
  clear: string;
}

export const STAGES: Stage[] = [
  {
    n: 1,
    title: 'THE STUCK VANE',
    clear: 'stage1',
    objectives: [
      { id: 'pia', text: 'Talk to Pia', done: (s) => has(s, 'talk:pia') },
      { id: 'vane', text: 'Examine the weathervane', done: (s) => has(s, 'examine:vane') },
      { id: 'marrow', text: 'Speak with Marrow', done: (s) => has(s, 'marrow:tale') },
    ],
  },
  {
    n: 2,
    title: 'THE GRAY SHARD',
    clear: 'stage2',
    objectives: [
      { id: 'nyc', text: 'Win in New York', done: (s) => owns(s, 'grayShard') },
      { id: 'place', text: 'Place shard on the altar', done: (s) => s.placed.includes('grayShard') },
      { id: 'marrow', text: 'Speak with Marrow', done: (s) => has(s, 'marrow:s2') },
    ],
  },
  {
    n: 3,
    title: 'THE FAR STORMS',
    clear: 'stage3',
    objectives: [
      {
        id: 'far',
        text: 'Win in 2 eastern cities',
        done: (s) => farOwned(s) >= 2,
        progress: (s) => ({ have: Math.min(2, farOwned(s)), need: 2 }),
      },
      {
        id: 'place',
        text: 'Place both shards',
        done: (s) => farPlaced(s) >= 2,
        progress: (s) => ({ have: Math.min(2, farPlaced(s)), need: 2 }),
      },
      { id: 'brent', text: 'Talk to Brent', done: (s) => has(s, 'brent:s3') },
    ],
  },
  {
    n: 4,
    title: 'THE AMBER SUN',
    clear: 'restored',
    objectives: [
      { id: 'miami', text: 'Win in Miami', done: (s) => owns(s, 'amberShard') },
      { id: 'place', text: 'Place the Amber Shard', done: (s) => s.placed.includes('amberShard') },
      { id: 'marrow', text: 'Speak with Marrow', done: (s) => has(s, 'marrow:s4') },
    ],
  },
  {
    n: 5,
    title: 'THE EYE OF THE STORM',
    clear: 'ending',
    objectives: [
      { id: 'quill', text: 'Talk to Quill by the pad', done: (s) => has(s, 'quill:eye') },
      { id: 'fly', text: 'Fly to the Eye', done: (s) => has(s, 'landed:stormhold') },
      { id: 'regent', text: 'Defeat the Tempest Regent', done: (s) => has(s, 'win:stormhold') },
    ],
  },
];

export const stageOf = (s: StoryState): Stage | null => STAGES.find((st) => st.n === s.stage) ?? null;

/** The objectives of the current stage, each with whether it is done. */
export function objectivesOf(s: StoryState): { objective: Objective; done: boolean }[] {
  const stage = stageOf(s);
  return stage ? stage.objectives.map((objective) => ({ objective, done: objective.done(s) })) : [];
}

/** The first objective still to do (the one the tracker shows), with its counter if it has one. */
export function trackerText(s: StoryState): string {
  if (!s.started) return '';
  if (s.complete) return 'The rain has stopped.';
  const next = objectivesOf(s).find((o) => !o.done);
  if (!next) return '';
  const p = next.objective.progress?.(s);
  return p ? `${next.objective.text} ${p.have}/${p.need}` : next.objective.text;
}

/**
 * If every objective of the current stage is done, move on to the next stage and queue its cutscene.
 * (Stages are completed in Mistford or at the end of a run, never several at once, so one cutscene is enough.)
 */
export function advance(s: StoryState): StoryState {
  let cur = s;
  for (let guard = 0; guard < STAGES.length + 1; guard++) {
    const stage = stageOf(cur);
    if (!cur.started || !stage || !stage.objectives.every((o) => o.done(cur))) return cur;
    cur = { ...cur, stage: cur.stage + 1, pending: stage.clear, complete: stage.n === LAST_STAGE ? true : cur.complete };
  }
  return cur;
}

// ---- Starting, and what the world should show -------------------------------------------------------------

/** Begin the story. Idempotent: an existing story is left as it is. The prologue plays the first time. */
export function startStory(s: StoryState): StoryState {
  if (s.started) return s;
  return { ...s, started: true, pending: 'prologue' };
}

/** The first stage a story needs the courier. */
export const quillHere = (s: StoryState): boolean => s.started && (s.stage >= 4 || s.complete);

/** The Eye is on the flight map once Quill has marked it. */
export const finaleUnlocked = (s: StoryState): boolean => s.started && has(s, 'quill:eye');

/** Region ids to mark on the flight map as "go here", and whether Mistford itself is the destination. */
export function flightTargets(s: StoryState): string[] {
  if (!s.started || s.complete) return [];
  const out: string[] = [];
  const stage = s.stage;
  if (stage === 2 && !owns(s, 'grayShard')) out.push('nyc');
  if (stage === 3 && farOwned(s) < 2) for (const c of FAR_CITIES) if (!owns(s, SHARD_OF[c])) out.push(c);
  if (stage === 4 && !owns(s, 'amberShard')) out.push('miami');
  if (stage === 5 && finaleUnlocked(s) && !has(s, 'win:stormhold')) out.push(FINALE_REGION);
  // Mistford is the destination when the next thing to do is there (talk to someone, place a shard), or when a shard is in hand
  const next = objectivesOf(s).find((o) => !o.done);
  const atHome = !!next && ['pia', 'vane', 'marrow', 'brent', 'quill', 'place'].includes(next.objective.id);
  if (atHome || s.items.length > 0) out.push('mistford');
  return out;
}

/** What the HUD says in a city run: whether winning here recovers a shard. */
export function runObjective(s: StoryState, region: string): string {
  if (!s.started || s.complete) return '';
  if (region === FINALE_REGION) return 'DEFEAT THE REGENT';
  const shard = SHARD_OF[region];
  if (!shard || owns(s, shard)) return '';
  if (s.stage === 2 && region === 'nyc') return `WIN HERE: ${SHARD_NAME[shard]}`;
  if (s.stage === 3 && FAR_CITIES.includes(region as (typeof FAR_CITIES)[number]) && farOwned(s) < 2) return `WIN HERE: ${SHARD_NAME[shard]}`;
  if (s.stage === 4 && region === 'miami') return `WIN HERE: ${SHARD_NAME[shard]}`;
  return '';
}

/** The Stormglass's strength in the finale: each shard on the altar toughens and sharpens the knight. */
export function finaleBuff(s: StoryState): { hp: number; damage: number } {
  const n = Math.min(SHARDS_NEEDED, s.placed.length);
  return { hp: n * 10, damage: n * 0.06 };
}

// ---- Events from the game -------------------------------------------------------------------------------

export interface RunOutcome {
  state: StoryState;
  /** Short lines for the game-over screen. */
  messages: string[];
}

/** A run ended. A win in a city whose shard is wanted recovers it. */
export function runEnded(s: StoryState, region: string, won: boolean): RunOutcome {
  if (!s.started || !won) return { state: s, messages: [] };
  let cur = withFlag(s, `win:${region}`);
  const messages: string[] = [];
  const shard = SHARD_OF[region];
  const wanted =
    (cur.stage === 2 && region === 'nyc') ||
    (cur.stage === 3 && (FAR_CITIES as readonly string[]).includes(region) && farOwned(cur) < 2) ||
    (cur.stage === 4 && region === 'miami');
  if (shard && wanted && !owns(cur, shard)) {
    cur = { ...cur, items: [...cur.items, shard] };
    messages.push(`${SHARD_NAME[shard]} FOUND!`, 'Take it home.');
  } else if (region === FINALE_REGION) {
    messages.push('THE REGENT FALLS!');
  } else if (shard && owns(cur, shard)) {
    messages.push('Already have it.');
  } else if (shard) {
    messages.push('Not needed yet.');
  }
  return { state: advance(cur), messages };
}

/** The knight landed (on the flight map) at a place. Landing at the Eye begins the finale. */
export function landed(s: StoryState, region: string): StoryState {
  if (!s.started || region !== FINALE_REGION) return s;
  return advance(withFlag(s, 'landed:stormhold'));
}

/** The cutscene has been shown. */
export const clearPending = (s: StoryState): StoryState => (s.pending ? { ...s, pending: null } : s);

// ---- Talking and examining ------------------------------------------------------------------------------

export interface Talk {
  state: StoryState;
  /** Pages of the dialogue: two lines each, 26 characters at most. */
  pages: string[][];
  /** Drips-shop goods the knight is given (Brent's gift). */
  gift?: Record<string, number>;
  /** The altar took shards, so the scene can flash it. */
  placed?: ShardId[];
}

const page = (a: string, b = ''): string[] => (b ? [a, b] : [a]);

/** What a villager or object says and does now. The state changes (a flag is set, a shard is placed). */
export function interact(s: StoryState, target: Target): Talk {
  const done = s.complete;
  const stage = s.stage;
  switch (target) {
    case 'pia': {
      const first = !has(s, 'talk:pia');
      const next = advance(withFlag(s, 'talk:pia'));
      if (first) {
        return {
          state: next,
          pages: [
            page('It has rained 100 days.', 'And the sea has gone odd.'),
            page('The weathervane froze and', 'points at the empty sea.'),
            page('Please look at it. It is', 'up by the stone altar.'),
          ],
        };
      }
      const line: Record<number, string[]> = {
        1: page('Did you see the vane?', 'Marrow is by the altar.'),
        2: page('New York? Be careful.', 'The cabs never stop.'),
        3: page('Far cities, far storms.', 'Fly high to cross oceans.'),
        4: page('Miami next. Bring a hat.', 'The sun there bites.'),
        5: page('Quill knows the sky.', 'Ask him by the flight pad.'),
      };
      return { state: next, pages: [done ? page('The sun! I forgot its face.', 'Thank you, Rain Knight.') : line[stage] ?? page('Good luck, knight.')] };
    }
    case 'brent': {
      if (stage === 3 && !has(s, 'brent:s3') && !done) {
        return {
          state: advance(withFlag(s, 'brent:s3')),
          pages: [page('A knight on a long road!', 'Take these Rain Buns.'), page('They heal a good deal.', 'Three, on the house.')],
          gift: { rainBun: 3 },
        };
      }
      const line: Record<number, string[]> = {
        1: page('Drips buy food and armor.', 'The market is to the east.'),
        2: page('Heard of the Stormglass?', 'Rain Buns help in a fight.'),
        3: page('Eat a bun when you are low.', 'They heal a lot.'),
        4: page('The Amber Shard, in Miami?', 'Beaches get crowded.'),
        5: page('Stormhold? My gran said it', 'was a sunny isle, once.'),
      };
      return { state: s, pages: [done ? page('Sunny days, big sales!', 'Come shop, hero.') : line[stage] ?? page('Shop is open.')] };
    }
    case 'marrow': {
      if (done) return { state: s, pages: [page('The rain is gone. Mistford', 'owes you its sunrise.')] };
      if (stage === 1) {
        if (!has(s, 'examine:vane')) return { state: s, pages: [page('Look at the vane first,', 'then come and talk to me.')] };
        return {
          state: advance(withFlag(s, 'marrow:tale')),
          pages: [
            page('Ah, a Rain Knight at last.', 'I am Marrow, keeper here.'),
            page('A hundred days ago the', 'Stormglass broke up high.'),
            page('It held the weathers in', 'balance. Now they run wild.'),
            page('Its shards fell on five', 'cities. Find them, knight.'),
            page('Win in a city and the', 'shard is yours. Go and see.'),
          ],
        };
      }
      if (stage === 2) {
        if (s.placed.includes('grayShard') && !has(s, 'marrow:s2')) {
          return {
            state: advance(withFlag(s, 'marrow:s2')),
            pages: [
              page('The altar glows! One shard', 'is home. The vane moved.'),
              page('The Gray Shard remembers', 'Aurel, the first knight.'),
              page('He sealed the sky once.', 'Then never came down.'),
            ],
          };
        }
        return { state: s, pages: [owns(s, 'grayShard') ? page('Place it on the altar,', 'there, in the north.') : page('Fly to New York. Win a run', 'there for the Gray Shard.')] };
      }
      if (stage === 3) return { state: s, pages: [page(farPlaced(s) >= 2 ? 'Two more home. The glass' : 'Two of London, Tokyo and', farPlaced(s) >= 2 ? 'is nearly whole.' : 'Mumbai hold shards.')] };
      if (stage === 4) {
        if (s.placed.includes('amberShard') && !has(s, 'marrow:s4')) {
          return {
            state: advance(withFlag(s, 'marrow:s4')),
            pages: [
              page('The Stormglass is whole!', 'But hear the wind, knight.'),
              page('The vane spins to the', 'Pacific. A storm waits.'),
              page('Aurel was no villain once.', 'Quill can show you the way.'),
            ],
          };
        }
        return { state: s, pages: [page('The Amber Shard, in Miami,', 'is last. Mind the tornado.')] };
      }
      return { state: s, pages: [page('Quill, by the flight pad,', 'will show you the Eye.')] };
    }
    case 'quill': {
      if (stage === 5 && !has(s, 'quill:eye')) {
        return {
          state: advance(withFlag(s, 'quill:eye')),
          pages: [
            page('The Eye? I flew past it.', 'A black storm out at sea.'),
            page('Stormhold, they call it.', 'I marked it on your map.'),
            page('Climb high to cross it,', 'then come down on its star.'),
          ],
        };
      }
      if (done) return { state: s, pages: [page('Clear skies from here to', 'the edge of the world!')] };
      if (stage === 5) return { state: s, pages: [page('The star in the Pacific.', 'Fly high to cross the sea.')] };
      return { state: s, pages: [page('Quill, courier of the high', 'winds. Busy sky today.')] };
    }
    case 'vane': {
      const first = !has(s, 'examine:vane');
      const next = advance(withFlag(s, 'examine:vane'));
      if (done) return { state: next, pages: [page('The vane spins free, swept', 'by an honest wind.')] };
      if (stage === 1) return { state: next, pages: [page('The weathervane is frozen,', 'its arrow on the empty sea.'), ...(first ? [page('It hums faintly...', 'Marrow will know why.')] : [])] };
      if (stage >= 5) return { state: next, pages: [page('It points at the Pacific:', 'the Eye of the Storm.')] };
      return { state: next, pages: [page('The vane trembles, as if', 'it hears the far storms.')] };
    }
    case 'altar': {
      if (done) return { state: s, pages: [page('The Stormglass shines.', 'The sky is calm at last.')] };
      if (s.items.length === 0) {
        const n = s.placed.length;
        return { state: s, pages: [n === 0 ? page('A stone altar with five', 'sockets. It is cold.') : page(`${n} of ${SHARDS_NEEDED} shards restored.`, 'The altar hums softly.')] };
      }
      const placed = s.items;
      const now: StoryState = { ...s, items: [], placed: [...s.placed, ...s.items] };
      const total = now.placed.length;
      const whole = total >= SHARDS_NEEDED;
      const pages = [
        page(placed.length === 1 ? `You set the ${SHARD_NAME[placed[0]]}` : `You set ${placed.length} shards`, 'in the altar. It glows.'),
        page(whole ? 'The Stormglass is whole!' : `${Math.min(total, SHARDS_NEEDED)} of ${SHARDS_NEEDED} shards restored.`, whole ? 'Speak with Marrow.' : 'The altar hums softly.'),
      ];
      return { state: advance(now), pages, placed };
    }
  }
}

// ---- Cutscenes --------------------------------------------------------------------------------------------

export interface Cutscene {
  id: string;
  /** The big line on the first page. */
  title: string;
  subtitle?: string;
  /** Pages of up to four lines, 26 characters at most. */
  pages: string[][];
}

export const CUTSCENES: Record<string, Cutscene> = {
  prologue: {
    id: 'prologue',
    title: 'THE LONG RAIN',
    pages: [
      ['For a hundred days the', 'rain has not stopped', 'over Mistford.'],
      ['The weathervane has', 'frozen on the plaza,', 'its arrow aimed at the sea.'],
      ['The old tales say that', 'when the sky is in danger,', 'a Rain Knight wakes.'],
    ],
  },
  stage1: {
    id: 'stage1',
    title: 'STAGE 1 CLEAR',
    subtitle: 'THE STUCK VANE',
    pages: [
      ['The Stormglass, which kept', 'the weathers in balance,', 'has broken in the sky.'],
      ['Its shards fell on five', 'far cities. Win a run in', 'New York to recover the first.'],
    ],
  },
  stage2: {
    id: 'stage2',
    title: 'STAGE 2 CLEAR',
    subtitle: 'THE GRAY SHARD',
    pages: [
      ['The first shard glows on', 'the altar. In its light', 'Marrow sees a name: Aurel.'],
      ['More shards wait in the', 'east: London, Tokyo and', 'Mumbai. Two will do.'],
    ],
  },
  stage3: {
    id: 'stage3',
    title: 'STAGE 3 CLEAR',
    subtitle: 'THE FAR STORMS',
    pages: [
      ['Three shards shine at', 'the altar now. The rain on', 'Mistford grows lighter.'],
      ['One remains: the Amber', 'Shard, in the heat of Miami.', 'Beware its tornado.'],
    ],
  },
  restored: {
    id: 'restored',
    title: 'STAGE 4 CLEAR',
    subtitle: 'THE STORMGLASS RESTORED',
    pages: [
      ['The shards join. A beam', 'of light splits the clouds', 'above Mistford.'],
      ['And far away, in the Pacific,', 'a black storm turns to', 'look back at it.'],
    ],
  },
  ending: {
    id: 'ending',
    title: 'STORY COMPLETE',
    subtitle: 'THE EYE OF THE STORM',
    pages: [
      ['With the Stormglass in your', 'hands, the Regent stops.', 'The storm falls silent.'],
      ['"I only wanted it to stop,"', 'says Sir Aurel. "The rain', 'took my village long ago."'],
      ['"Rain is not the enemy."', 'He fades into the clear', 'light of the Eye.'],
      ['Back in Mistford the rain', 'stops. The weathervane turns', 'in an honest wind.'],
      ['THANK YOU FOR PLAYING', 'RAINKNIGHTS'],
    ],
  },
};

// ---- Saving -----------------------------------------------------------------------------------------------

const SHARD_IDS = new Set<string>(Object.keys(SHARD_NAME));
const FLAG_RE = /^[a-z0-9:_]{1,40}$/;

/** Read a story out of untrusted saved data: anything wrong is dropped, and a broken record is a fresh story. */
export function sanitizeStory(value: unknown): StoryState {
  if (typeof value !== 'object' || value === null) return freshStory();
  const v = value as Record<string, unknown>;
  const list = <T extends string>(x: unknown, ok: (s: string) => boolean): T[] =>
    Array.isArray(x) ? ([...new Set(x.filter((e): e is string => typeof e === 'string' && ok(e)))] as T[]) : [];
  const stage = typeof v.stage === 'number' && Number.isInteger(v.stage) ? Math.min(LAST_STAGE + 1, Math.max(1, v.stage)) : 1;
  const complete = v.complete === true || stage > LAST_STAGE;
  const pending = typeof v.pending === 'string' && v.pending in CUTSCENES ? v.pending : null;
  return {
    started: v.started === true,
    stage: complete ? LAST_STAGE + 1 : stage,
    flags: list(v.flags, (f) => FLAG_RE.test(f)).slice(0, 80),
    items: list<ShardId>(v.items, (i) => SHARD_IDS.has(i)),
    placed: list<ShardId>(v.placed, (i) => SHARD_IDS.has(i)),
    pending,
    complete,
  };
}
