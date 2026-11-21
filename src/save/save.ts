import { CHARACTERS, getCharacter } from '../config/characters';
import { WEATHER_FRONTS, WORLD } from '../config/constants';
import { REGIONS } from '../config/regions';
import { freshStory, sanitizeStory, type StoryState } from '../story/story';
import { sanitizeCharms } from '../economy/charms';
import { sanitizeHero } from '../systems/hero';
import { newlyEarned, sanitizeUnlocked, type UnlockContext } from '../systems/unlocks';
import { freshAllocation, pointsForLevel, pointsSpent, sanitizeAllocation, type Allocation } from '../systems/stats';
import {
  ARMOR,
  BAG_CAP,
  CONSUMABLES,
  MAX_DRIPS,
  STASH_CAP,
  freshProfile,
  grantArrival,
  townMaxHp,
  type TownProfile,
} from '../economy/economy';

/**
 * Versioned browser save (`localStorage` key `rainknights:save`).
 *
 * v1 stores settings (mute), finished-run records, and at most one
 * in-progress run. v2 adds the Mistford profile: drips, bag, stash,
 * armor, and town HP. Live enemies, projectiles, and gems are not stored.
 * `migrations` upgrades older documents one version at a time before
 * the result is checked against the current shape.
 */
export const SAVE_VERSION = 2;
export const SAVE_KEY = 'rainknights:save';
/** Pre-save mute flag. Folded into the document on first load, then removed. */
export const LEGACY_MUTE_KEY = 'rainknights:muted';

const CHARACTER_IDS = new Set(CHARACTERS.map((character) => character.id));
const REGION_IDS = new Set(REGIONS.map((region) => region.id));
const FACINGS = ['down', 'up', 'side'] as const;

export interface SaveSettings {
  muted: boolean;
}

export interface SaveMeta {
  /** Best survival time, in seconds. Finished runs only. */
  bestTime: number;
  bestLevel: number;
  bestKills: number;
  /** Victories and defeats. Abandoned runs are not counted. */
  runs: number;
  wins: number;
}

export interface PowerupSnapshot {
  sunbeam: number;
  rainbowShield: number;
  gale: number;
  frost: number;
  staticCharge: number;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  baseMoveSpeed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  magnetRadius: number;
  pierce: number;
  xp: number;
  level: number;
  xpToNext: number;
  kills: number;
  powerups: PowerupSnapshot;
  /** Stat points spent so far; unspent points are what the level earned less this. Absent in older saves. */
  statAlloc?: Allocation;
  /** Powers from shrines (the charms' powers are added on top). Absent in older saves, where `powerups` is all there was. */
  bonusPowers?: PowerupSnapshot;
  facing: (typeof FACINGS)[number];
  flipX: boolean;
  aimX: number;
  aimY: number;
}

export interface RunSnapshot {
  characterId: string;
  regionId: string;
  weatherLabel: string;
  weatherCondition: string;
  weatherTint: number;
  /** City weather front the run started on. The clock restores the live front. */
  startFrontIndex: number;
  elapsedSeconds: number;
  /** Remaining tornado HP, or null when the boss is not on the field. */
  bossHp: number | null;
  /** Level-up menus still owed, including one that was open at the checkpoint. */
  pendingLevelUps: number;
  /** Seed of the world map, so Continue returns to the same map. Absent in older saves. */
  mapSeed?: number;
  /** Crates and shrines already used on this map ("s3" on the surface, "u0:2" in a tunnel), so Continue and a trip underground do not refill them. */
  usedPois?: string[];
  player: PlayerSnapshot;
}

export interface SaveData {
  version: 2;
  settings: SaveSettings;
  meta: SaveMeta;
  run: RunSnapshot | null;
  /** Mistford: coins, bag, armor, and the HP you walk home with. */
  town: TownProfile;
  /** Story mode. Absent until the story is first started (older saves have none). */
  story?: StoryState;
}

export type { TownProfile };

export interface ParseResult {
  save: SaveData;
  /** False for a newer (or otherwise unreadable-but-preserved) document. */
  writable: boolean;
  /** The stored text was unusable and replaced with defaults in memory. */
  recovered: boolean;
  /** No document yet; the legacy mute key supplied the setting. */
  fromLegacy: boolean;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Migration {
  from: number;
  migrate: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Steps a stored document from its version up to `SAVE_VERSION`.
 * Add a step here when the schema changes; do not rewrite old saves in place.
 */
export const migrations: Migration[] = [
  { from: 0, migrate: migrateV0 },
  { from: 1, migrate: migrateV1 },
];

export function defaultSave(): SaveData {
  return {
    version: 2,
    settings: { muted: false },
    meta: { bestTime: 0, bestLevel: 0, bestKills: 0, runs: 0, wins: 0 },
    run: null,
    town: freshProfile(),
  };
}

export function serialize(save: SaveData): string {
  return JSON.stringify(save);
}

/**
 * Parse a stored document. `legacyMuted` is the pre-save `rainknights:muted`
 * flag, used only when no document exists.
 */
export function parseStored(raw: string | null, legacyMuted: boolean | null): ParseResult {
  if (raw === null || raw === '') {
    const save = defaultSave();
    if (legacyMuted !== null) save.settings.muted = legacyMuted;
    return { save, writable: true, recovered: false, fromLegacy: legacyMuted !== null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { save: defaultSave(), writable: true, recovered: true, fromLegacy: false };
  }

  const migrated = applyMigrations(parsed);
  if (migrated.status === 'future') {
    return { save: defaultSave(), writable: false, recovered: false, fromLegacy: false };
  }
  if (migrated.status !== 'ok' || !isRecord(migrated.doc)) {
    return { save: defaultSave(), writable: true, recovered: true, fromLegacy: false };
  }

  const save = normalizeSave(migrated.doc);
  if (!save) return { save: defaultSave(), writable: true, recovered: true, fromLegacy: false };
  return { save, writable: true, recovered: false, fromLegacy: false };
}

export function applyMigrations(input: unknown): { status: 'ok' | 'future' | 'invalid'; doc: unknown } {
  if (!isRecord(input)) return { status: 'invalid', doc: input };
  let doc: Record<string, unknown> = input;
  for (let guard = 0; guard < 8; guard++) {
    const version = doc.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      return { status: 'invalid', doc };
    }
    if (version === SAVE_VERSION) return { status: 'ok', doc };
    if (version > SAVE_VERSION) return { status: 'future', doc };
    const step = migrations.find((migration) => migration.from === version);
    if (!step) return { status: 'invalid', doc };
    const next = step.migrate(doc);
    if (!isRecord(next)) return { status: 'invalid', doc: next };
    doc = next;
  }
  return { status: 'invalid', doc };
}

export interface SaveStore {
  load(): SaveData;
  commit(): boolean;
  update(mutate: (save: SaveData) => void): boolean;
  reset(): boolean;
  readonly writable: boolean;
}

export function createSaveStore(storage: KeyValueStorage | null): SaveStore {
  let save = defaultSave();
  let writable = storage !== null;
  let loaded = false;

  function load(): SaveData {
    if (loaded) return save;
    loaded = true;
    if (!storage) {
      writable = false;
      save = defaultSave();
      return save;
    }

    let raw: string | null;
    let legacy: boolean | null;
    try {
      raw = storage.getItem(SAVE_KEY);
      legacy = readLegacy(storage);
    } catch {
      writable = false;
      save = defaultSave();
      return save;
    }

    const result = parseStored(raw, legacy);
    save = result.save;
    writable = result.writable;
    if (result.fromLegacy && writable) commit();
    else if (raw !== null && legacy !== null && writable) {
      try {
        storage.removeItem(LEGACY_MUTE_KEY);
      } catch {
        /* removed on the next successful commit */
      }
    }
    return save;
  }

  function commit(): boolean {
    if (!loaded) load();
    if (!writable || !storage) return false;
    try {
      storage.setItem(SAVE_KEY, serialize(save));
      storage.removeItem(LEGACY_MUTE_KEY);
      return true;
    } catch {
      writable = false;
      return false;
    }
  }

  function update(mutate: (draft: SaveData) => void): boolean {
    load();
    mutate(save);
    return commit();
  }

  function reset(): boolean {
    save = defaultSave();
    loaded = true;
    if (!storage) {
      writable = false;
      return false;
    }
    writable = true;
    try {
      storage.removeItem(SAVE_KEY);
      storage.removeItem(LEGACY_MUTE_KEY);
      return true;
    } catch {
      writable = false;
      return false;
    }
  }

  return {
    load,
    commit,
    update,
    reset,
    get writable() {
      load();
      return writable;
    },
  };
}

export const gameSave = createSaveStore(detectBrowserStorage());

export function loadGame(): SaveData {
  return gameSave.load();
}

/** The story, or a story that has not started. */
export function loadStory(): StoryState {
  return gameSave.load().story ?? freshStory();
}

export function writeStory(story: StoryState): boolean {
  return gameSave.update((save) => {
    save.story = story;
  });
}

export function writeMuted(muted: boolean): boolean {
  return gameSave.update((save) => {
    save.settings.muted = muted;
  });
}

export function saveRun(run: RunSnapshot): boolean {
  return gameSave.update((save) => {
    save.run = run;
  });
}

export function clearRun(): boolean {
  return gameSave.update((save) => {
    save.run = null;
  });
}

export function recordRunResult(result: { won: boolean; time: number; kills: number; level: number }, townHp?: number): boolean {
  return gameSave.update((save) => {
    save.meta.runs += 1;
    if (result.won) save.meta.wins += 1;
    save.meta.bestTime = Math.max(save.meta.bestTime, result.time);
    save.meta.bestLevel = Math.max(save.meta.bestLevel, result.level);
    save.meta.bestKills = Math.max(save.meta.bestKills, result.kills);
    save.run = null;
    if (townHp !== undefined) {
      const max = townMaxHp(save.town.characterId, save.town.armorId);
      save.town.hp = Math.max(1, Math.min(max, Math.round(townHp)));
    }
  });
}

/** First time the knight steps into Mistford. New games find a jar of drips; old saves do not. */
export function arriveInTown(): TownProfile {
  const current = gameSave.load().town;
  const next = grantArrival(current);
  if (next !== current) gameSave.update((save) => {
    save.town = next;
  });
  return gameSave.load().town;
}

/** Hand over any knight the player has now earned. Returns their names, for a "new knight!" message. */
export function grantUnlocks(): string[] {
  const save = gameSave.load();
  const story = save.story;
  const ctx: UnlockContext = {
    wins: save.meta.wins,
    level: save.town.hero.level,
    storyStarted: !!story?.started,
    storyStage: story?.stage ?? 0,
    storyComplete: !!story?.complete,
  };
  const fresh = newlyEarned(save.town.unlocked, ctx);
  if (fresh.length === 0) return [];
  gameSave.update((s) => {
    s.town = { ...s.town, unlocked: [...s.town.unlocked, ...fresh] };
  });
  return fresh.map((id) => getCharacter(id).name);
}

export function writeProfile(profile: TownProfile): boolean {
  return gameSave.update((save) => {
    save.town = profile;
  });
}

export function resetGameSave(): boolean {
  return gameSave.reset();
}

function detectBrowserStorage(): KeyValueStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = 'rainknights:probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function readLegacy(storage: KeyValueStorage): boolean | null {
  const value = storage.getItem(LEGACY_MUTE_KEY);
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

/** v0 was an unreleased flat shape (`{ version: 0, muted, bestTime, ... }`). */
function migrateV0(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    settings: { muted: doc.muted === true },
    meta: {
      bestTime: typeof doc.bestTime === 'number' ? doc.bestTime : 0,
      bestLevel: typeof doc.bestLevel === 'number' ? doc.bestLevel : 0,
      bestKills: typeof doc.bestKills === 'number' ? doc.bestKills : 0,
      runs: typeof doc.runs === 'number' ? doc.runs : 0,
      wins: typeof doc.wins === 'number' ? doc.wins : 0,
    },
    run: null,
  };
}

/** v1 had no town. The knight arrives in Mistford with an empty purse. */
function migrateV1(doc: Record<string, unknown>): Record<string, unknown> {
  const run = isRecord(doc.run) ? doc.run : null;
  const characterId = run && typeof run.characterId === 'string' ? run.characterId : 'rainKnight';
  return {
    version: 2,
    settings: doc.settings,
    meta: doc.meta,
    run: doc.run ?? null,
    town: {
      ...freshProfile(characterId),
      coins: 0,
      hp: 0,
      visited: false,
      fromLegacy: true,
    },
  };
}

function normalizeSave(doc: Record<string, unknown>): SaveData | null {
  if (doc.version !== SAVE_VERSION) return null;
  const settings = readSettings(doc.settings) ?? { muted: false };
  const meta = readMeta(doc.meta) ?? defaultSave().meta;
  const run = doc.run == null ? null : readRun(doc.run);
  const town = readTown(doc.town);
  return { version: 2, settings, meta, run, town, ...(doc.story === undefined ? {} : { story: sanitizeStory(doc.story) }) };
}

const CONSUMABLE_IDS = new Set(CONSUMABLES.map((item) => item.id));
const ARMOR_IDS = new Set(ARMOR.map((item) => item.id));

function readTown(value: unknown): TownProfile {
  const blank = freshProfile();
  blank.fromLegacy = true;
  if (!isRecord(value)) return blank;
  const characterId = typeof value.characterId === 'string' && CHARACTER_IDS.has(value.characterId) ? value.characterId : blank.characterId;
  const ownedArmor = Array.isArray(value.ownedArmor)
    ? value.ownedArmor.filter((id): id is string => typeof id === 'string' && ARMOR_IDS.has(id))
    : [];
  const armorId = typeof value.armorId === 'string' && ownedArmor.includes(value.armorId) ? value.armorId : null;
  const charms = sanitizeCharms(value.charms, value.worn);
  const max = townMaxHp(characterId, armorId);
  const hpRaw = readInt(value.hp, 1, 10_000);
  const coins = readInt(value.coins, 0, MAX_DRIPS) ?? 0;
  return {
    characterId,
    unlocked: sanitizeUnlocked(value.unlocked, CHARACTER_IDS, characterId),
    coins,
    bag: readStacks(value.bag, BAG_CAP),
    stash: readStacks(value.stash, STASH_CAP),
    ownedArmor,
    armorId,
    charms: charms.owned,
    worn: charms.worn,
    hero: sanitizeHero(value.hero),
    hp: hpRaw === null ? max : Math.min(max, hpRaw),
    visited: value.visited === true,
    fromLegacy: value.fromLegacy === true,
  };
}

function readStacks(value: unknown, cap: number): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [id, count] of Object.entries(value)) {
    if (!CONSUMABLE_IDS.has(id)) continue;
    const n = readInt(count, 1, cap);
    if (n !== null) out[id] = n;
  }
  return out;
}

function readSettings(value: unknown): SaveSettings | null {
  if (!isRecord(value) || typeof value.muted !== 'boolean') return null;
  return { muted: value.muted };
}

function readMeta(value: unknown): SaveMeta | null {
  if (!isRecord(value)) return null;
  const bestTime = readNum(value.bestTime, 0, 100_000);
  const bestLevel = readInt(value.bestLevel, 0, 999);
  const bestKills = readInt(value.bestKills, 0, 1_000_000);
  const runs = readInt(value.runs, 0, 1_000_000);
  const wins = readInt(value.wins, 0, 1_000_000);
  if (bestTime === null || bestLevel === null || bestKills === null || runs === null || wins === null) return null;
  return { bestTime, bestLevel, bestKills, runs, wins };
}

function readRun(value: unknown): RunSnapshot | null {
  if (!isRecord(value)) return null;
  if (typeof value.characterId !== 'string' || !CHARACTER_IDS.has(value.characterId)) return null;
  if (typeof value.regionId !== 'string' || !REGION_IDS.has(value.regionId)) return null;
  const weatherLabel = readText(value.weatherLabel, 40);
  const weatherCondition = readText(value.weatherCondition, 40);
  const weatherTint = readInt(value.weatherTint, 0, 0xffffff);
  const startFrontIndex = readInt(value.startFrontIndex, 0, WEATHER_FRONTS.length - 1);
  const elapsedSeconds = readNum(value.elapsedSeconds, 0, 86_400);
  const pendingLevelUps = readInt(value.pendingLevelUps, 0, 30);
  let bossHp: number | null;
  if (value.bossHp == null) bossHp = null;
  else {
    const hp = readNum(value.bossHp, 1, 100_000);
    if (hp === null) return null;
    bossHp = hp;
  }
  const player = readPlayer(value.player);
  const mapSeed = readInt(value.mapSeed, 0, 0x7fffffff);
  const usedPois = Array.isArray(value.usedPois)
    ? [...new Set(value.usedPois.filter((k): k is string => typeof k === 'string' && /^[sut]\d{1,2}(:\d{1,2})?$/.test(k)))].slice(0, 120)
    : [];
  if (
    !weatherLabel ||
    !weatherCondition ||
    weatherTint === null ||
    startFrontIndex === null ||
    elapsedSeconds === null ||
    pendingLevelUps === null ||
    !player
  ) {
    return null;
  }
  return {
    characterId: value.characterId,
    regionId: value.regionId,
    weatherLabel,
    weatherCondition,
    weatherTint,
    startFrontIndex,
    elapsedSeconds,
    bossHp,
    pendingLevelUps,
    player,
    // Optional and additive (no version bump): a missing or invalid seed just means a fresh map.
    ...(mapSeed !== null ? { mapSeed } : {}),
    ...(usedPois.length > 0 ? { usedPois } : {}),
  };
}

function readPlayer(value: unknown): PlayerSnapshot | null {
  if (!isRecord(value)) return null;
  const x = readNum(value.x, 0, WORLD.width);
  const y = readNum(value.y, 0, WORLD.height);
  const maxHp = readNum(value.maxHp, 1, 10_000);
  const hp = readNum(value.hp, 1, 10_000);
  const baseMoveSpeed = readNum(value.baseMoveSpeed, 1, 800);
  const attackDamage = readNum(value.attackDamage, 1, 10_000);
  const attackRange = readNum(value.attackRange, 1, 4_000);
  const attackCooldown = readNum(value.attackCooldown, 1, 10_000);
  const magnetRadius = readNum(value.magnetRadius, 0, 4_000);
  const pierce = readInt(value.pierce, 0, 99);
  const xp = readNum(value.xp, 0, 1_000_000);
  const level = readInt(value.level, 1, 999);
  const xpToNext = readNum(value.xpToNext, 1, 1_000_000);
  const kills = readInt(value.kills, 0, 1_000_000);
  const powerups = readPowerups(value.powerups);
  const bonusPowers = readPowerups(value.bonusPowers) ?? undefined;
  const facing = FACINGS.find((entry) => entry === value.facing);
  const aimX = readNum(value.aimX, -1, 1);
  const aimY = readNum(value.aimY, -1, 1);
  if (
    x === null ||
    y === null ||
    maxHp === null ||
    hp === null ||
    hp > maxHp ||
    baseMoveSpeed === null ||
    attackDamage === null ||
    attackRange === null ||
    attackCooldown === null ||
    magnetRadius === null ||
    pierce === null ||
    xp === null ||
    level === null ||
    xpToNext === null ||
    xp >= xpToNext ||
    kills === null ||
    !powerups ||
    !facing ||
    typeof value.flipX !== 'boolean' ||
    aimX === null ||
    aimY === null
  ) {
    return null;
  }
  return {
    x,
    y,
    hp,
    maxHp,
    baseMoveSpeed,
    attackDamage,
    attackRange,
    attackCooldown,
    magnetRadius,
    pierce,
    xp,
    level,
    xpToNext,
    kills,
    powerups,
    ...(isRecord(value.statAlloc) ? { statAlloc: readAlloc(value.statAlloc, level) } : {}),
    ...(bonusPowers ? { bonusPowers } : {}),
    facing,
    flipX: value.flipX,
    aimX,
    aimY,
  };
}

/** Spent stat points, trusted only if the level could have earned them. */
function readAlloc(value: unknown, level: number): Allocation {
  const alloc = sanitizeAllocation(value);
  return pointsSpent(alloc) <= pointsForLevel(level) ? alloc : freshAllocation();
}

function readPowerups(value: unknown): PowerupSnapshot | null {
  if (!isRecord(value)) return null;
  const sunbeam = readInt(value.sunbeam, 0, 99);
  const rainbowShield = readInt(value.rainbowShield, 0, 99);
  const gale = readInt(value.gale, 0, 99);
  const frost = readInt(value.frost, 0, 99);
  const staticCharge = readInt(value.staticCharge, 0, 99);
  if (sunbeam === null || rainbowShield === null || gale === null || frost === null || staticCharge === null) return null;
  return { sunbeam, rainbowShield, gale, frost, staticCharge };
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < 1 || text.length > max) return null;
  return text;
}

function readNum(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

function readInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return readNum(value, min, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
