import { describe, expect, it } from 'vitest';
import {
  LEGACY_MUTE_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  applyMigrations,
  createSaveStore,
  defaultSave,
  parseStored,
  serialize,
  type KeyValueStorage,
  type RunSnapshot,
} from '../src/save/save';
import { freshStory, interact, startStory } from '../src/story/story';

function memory(): KeyValueStorage & { dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (key) => (dump.has(key) ? dump.get(key)! : null),
    setItem: (key, value) => {
      dump.set(key, value);
    },
    removeItem: (key) => {
      dump.delete(key);
    },
  };
}

function sampleRun(): RunSnapshot {
  return {
    characterId: 'rainKnight',
    regionId: 'nyc',
    weatherLabel: 'Clear',
    weatherCondition: 'clear',
    weatherTint: 0x8fe0ff,
    startFrontIndex: 0,
    elapsedSeconds: 12.5,
    bossHp: null,
    pendingLevelUps: 0,
    player: {
      x: 900,
      y: 800,
      hp: 80,
      maxHp: 100,
      baseMoveSpeed: 80,
      attackDamage: 18,
      attackRange: 110,
      attackCooldown: 550,
      magnetRadius: 34,
      pierce: 0,
      xp: 4,
      level: 4,
      xpToNext: 76,
      kills: 6,
      powerups: { sunbeam: 1, rainbowShield: 0, gale: 0, frost: 0, staticCharge: 0 },
      facing: 'side',
      flipX: false,
      aimX: 1,
      aimY: 0,
    },
  };
}

describe('parseStored', () => {
  it('returns a fresh save when nothing is stored', () => {
    const result = parseStored(null, null);
    expect(result.save).toEqual(defaultSave());
    expect(result.writable).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.fromLegacy).toBe(false);
  });

  it('migrates a v0 document through the migration hook', () => {
    const raw = JSON.stringify({
      version: 0,
      muted: true,
      bestTime: 12.5,
      bestLevel: 3,
      bestKills: 4,
      runs: 2,
      wins: 1,
    });
    const migrated = applyMigrations(JSON.parse(raw));
    expect(migrated.status).toBe('ok');
    const result = parseStored(raw, null);
    expect(result.recovered).toBe(false);
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.settings.muted).toBe(true);
    expect(result.save.meta).toEqual({ bestTime: 12.5, bestLevel: 3, bestKills: 4, runs: 2, wins: 1 });
    expect(result.save.run).toBeNull();
    expect(result.save.town.coins).toBe(0);
    expect(result.save.town.fromLegacy).toBe(true);
    expect(result.save.town.visited).toBe(false);
  });

  it('migrates a v1 run into Mistford with an empty purse and the run intact', () => {
    const run = sampleRun();
    run.characterId = 'hailWarden';
    const raw = JSON.stringify({
      version: 1,
      settings: { muted: false },
      meta: { bestTime: 40, bestLevel: 4, bestKills: 6, runs: 1, wins: 0 },
      run,
    });
    const result = parseStored(raw, null);
    expect(result.recovered).toBe(false);
    expect(result.writable).toBe(true);
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.run?.characterId).toBe('hailWarden');
    expect(result.save.run?.player.level).toBe(4);
    expect(result.save.run?.mapSeed).toBeUndefined();
    expect(result.save.town.coins).toBe(0);
    expect(result.save.town.fromLegacy).toBe(true);
    expect(result.save.town.visited).toBe(false);
    expect(result.save.town.characterId).toBe('hailWarden');
    expect(result.save.town.armorId).toBeNull();
    expect(result.save.town.bag).toEqual({});
    expect(result.save.town.hp).toBeGreaterThan(100);
  });

  it('round-trips a v1 run', () => {
    const save = defaultSave();
    save.settings.muted = true;
    save.meta.runs = 1;
    save.run = sampleRun();
    const result = parseStored(JSON.stringify(save), null);
    expect(result.recovered).toBe(false);
    expect(result.save).toEqual(save);
  });

  it('round-trips the map seed, so Continue returns to the same map', () => {
    const save = defaultSave();
    save.run = { ...sampleRun(), mapSeed: 1234567 };
    const result = parseStored(JSON.stringify(save), null);
    expect(result.save.run?.mapSeed).toBe(1234567);
  });

  it('an older run without a map seed still loads, and a junk seed is ignored without losing the run', () => {
    const base = sampleRun();
    for (const seed of [undefined, 'abc', -4, 1.5, 2 ** 40]) {
      const save = defaultSave();
      save.run = { ...base, mapSeed: seed as unknown as number };
      const result = parseStored(JSON.stringify(save), null);
      expect(result.save.run, String(seed)).not.toBeNull();
      expect(result.save.run?.mapSeed, String(seed)).toBeUndefined();
      expect(result.save.run?.player.level).toBe(base.player.level);
    }
  });

  it('drops an invalid run and keeps settings and records', () => {
    const result = parseStored(
      JSON.stringify({
        version: 1,
        settings: { muted: true },
        meta: { bestTime: 5, bestLevel: 2, bestKills: 1, runs: 1, wins: 0 },
        run: { characterId: 'nope' },
      }),
      null
    );
    expect(result.recovered).toBe(false);
    expect(result.writable).toBe(true);
    expect(result.save.settings.muted).toBe(true);
    expect(result.save.meta.bestLevel).toBe(2);
    expect(result.save.run).toBeNull();
  });

  it('replaces corrupt JSON with defaults', () => {
    for (const raw of ['{', 'null', '[]', '"hi"', '   ']) {
      const result = parseStored(raw, null);
      expect(result.recovered).toBe(true);
      expect(result.writable).toBe(true);
      expect(result.save).toEqual(defaultSave());
    }
  });

  it('refuses to claim a newer schema', () => {
    const result = parseStored(JSON.stringify({ version: 99, secret: 'keep', settings: { muted: true } }), null);
    expect(result.writable).toBe(false);
    expect(result.recovered).toBe(false);
    expect(result.save).toEqual(defaultSave());
  });
});

describe('the story in the save', () => {
  it('is absent in a new save, so older saves and new ones look the same until the story starts', () => {
    expect(defaultSave().story).toBeUndefined();
    const parsed = parseStored(serialize(defaultSave()), null);
    expect(parsed.save.story).toBeUndefined();
    expect(parsed.recovered).toBe(false);
  });

  it('round-trips a story in progress', () => {
    const save = defaultSave();
    save.story = interact(startStory(freshStory()), 'pia').state;
    const back = parseStored(serialize(save), null).save;
    expect(back.story).toEqual(save.story);
    expect(back.story?.flags).toContain('talk:pia');
  });

  it('cleans a damaged story without losing the rest of the save', () => {
    const doc = JSON.parse(serialize(defaultSave()));
    doc.meta.runs = 4;
    doc.story = { started: true, stage: 'three', flags: [1, 'talk:pia'], items: ['bogus', 'grayShard'], placed: 5, pending: 'x' };
    const back = parseStored(JSON.stringify(doc), null);
    expect(back.recovered).toBe(false);
    expect(back.save.meta.runs).toBe(4);
    expect(back.save.story?.started).toBe(true);
    expect(back.save.story?.stage).toBe(1);
    expect(back.save.story?.flags).toEqual(['talk:pia']);
    expect(back.save.story?.items).toEqual(['grayShard']);
    expect(back.save.story?.placed).toEqual([]);
  });

  it('is wiped by a reset, like everything else', () => {
    const store = createSaveStore(memory());
    store.update((draft) => {
      draft.story = startStory(freshStory());
    });
    expect(store.load().story?.started).toBe(true);
    store.reset();
    expect(store.load().story).toBeUndefined();
  });
});

describe('createSaveStore', () => {
  it('folds the legacy mute key into the document and removes it', () => {
    const storage = memory();
    storage.setItem(LEGACY_MUTE_KEY, '1');
    const store = createSaveStore(storage);
    expect(store.load().settings.muted).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).settings.muted).toBe(true);
    expect(storage.getItem(LEGACY_MUTE_KEY)).toBeNull();
  });

  it('keeps a newer document byte-for-byte when a write is attempted', () => {
    const storage = memory();
    const original = JSON.stringify({ version: 99, secret: 'keep' });
    storage.setItem(SAVE_KEY, original);
    const store = createSaveStore(storage);
    expect(store.writable).toBe(false);
    expect(store.update((save) => (save.settings.muted = true))).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(original);
  });

  it('survives storage that throws', () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createSaveStore(blocked);
    expect(store.load()).toEqual(defaultSave());
    expect(store.writable).toBe(false);
    expect(store.commit()).toBe(false);
    expect(store.reset()).toBe(false);
    expect(store.load().settings.muted).toBe(false);
  });

  it('keeps the session copy when setItem starts failing', () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error('quota');
    };
    const store = createSaveStore(storage);
    expect(store.update((save) => (save.settings.muted = true))).toBe(false);
    expect(store.load().settings.muted).toBe(true);
    expect(store.writable).toBe(false);
  });

  it('records a finished run, then reset wipes it', () => {
    const storage = memory();
    const store = createSaveStore(storage);
    store.update((save) => {
      save.run = sampleRun();
      save.settings.muted = true;
    });
    store.update((save) => {
      save.meta.runs += 1;
      save.meta.wins += 1;
      save.meta.bestTime = 80;
      save.meta.bestLevel = 5;
      save.meta.bestKills = 12;
      save.run = null;
    });
    expect(store.load().run).toBeNull();
    expect(store.load().meta.wins).toBe(1);
    expect(store.load().settings.muted).toBe(true);

    expect(store.reset()).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(store.load()).toEqual(defaultSave());
    expect(store.update((save) => (save.settings.muted = false))).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  });
});
