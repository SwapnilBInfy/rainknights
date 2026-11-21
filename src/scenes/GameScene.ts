import Phaser from 'phaser';
import { WORLD, TILE, PLAYER_BASE, AUTO_ATTACK, BOSS_SUMMONS, BOSS_SPAWN_DISTANCE, MAX_LIVING_ENEMIES, frontIndexAt } from '../config/constants';
import { MELEE, BEAM } from '../config/weapons';
import { beamKey, SPARK_KEY } from '../gfx/weapons';
import { TEX } from '../gfx/spriteDefs';
import { getCharacter } from '../config/characters';
import { getRegion, type RegionDef } from '../config/regions';
import { drawFlightPad } from '../gfx/flight';
import { finaleBuff, LANTERN_WARNING, readTablet, tabletsAvailable, TABLETS_NEEDED, runEnded as storyRunEnded, runObjective } from '../story/story';
import { STRIKE, strikeHits, strikeSpots } from '../systems/regent';
import { onPad, padCenterFor, PAD_SIZE, stepPadCharge } from '../systems/flightPad';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import type { Enemy } from '../entities/enemies/Enemy';
import { createEnemy } from '../entities/enemies/factory';
import { WeatherDirector } from '../systems/WeatherDirector';
import { CampDirector } from '../systems/CampDirector';
import { GateDirector, GATE_NAME } from '../systems/GateDirector';
import { gateLevels, levelForZone, suggestedLevel, zoneAt } from '../systems/zones';
import { NO_SCALE, bossScaleFor, scaleFor } from '../systems/difficulty';
import { placeCamps, tunnelCamps } from '../systems/camps';
import { laterHero } from '../systems/hero';
import { HazardDirector, type HazardHost } from '../systems/HazardDirector';
import { TutorialDirector } from '../systems/TutorialDirector';
import type { TutorialStepId } from '../systems/tutorialSteps';
import { resolveHit, STATUS_TUNING, type DamageKind, type StatusId } from '../systems/status';
import { hazardsEnabled, ruleFor, type HazardKind, type WeatherRule } from '../config/weatherRules';
import { FONT } from '../ui/Window';
import { applyFrostAura, applySunbeamPulse, applyStaticChain } from '../systems/PowerupSystem';
import { buildTerrain, buildUndergroundTerrain, randomSeed, seedFromUrl, type TerrainResult } from '../systems/Terrain';
import { generateMap } from '../systems/mapGen';
import { placePois, poiCenter, poisOf, tunnelFor, type Poi } from '../systems/pois';
import { generateUnderground, type Tunnel } from '../systems/underground';
import { PoiDirector, type PoiItem } from '../systems/PoiDirector';
import { Darkness } from '../gfx/darkness';
import type { MiniDot } from '../ui/Minimap';
import { BagMenu, type BagHost } from '../ui/BagMenu';
import { charm as charmDef, fit, rankLabel, toggle as toggleCharm, charmSlots, type CharmBox } from '../economy/charms';
import { addPoint, removePoint, type StatId } from '../systems/stats';
import { Enemy as EnemyBase } from '../entities/enemies/Enemy';
import { floodRingsFor } from '../systems/terrainRules';
import { HUD } from '../ui/HUD';
import { audio } from '../audio/engine';
import { replayHeldKeys } from '../input/keys';
import { attackHint, beamKeyLabel, rollHint, rollKeyLabel } from '../input/prompts';
import { isTouchControlsActive, onTouchControlsChange } from '../input/touchControls';
import { bindGameplayPause, closePauseMenu, openPauseMenu } from '../ui/PauseOverlay';
import { clearRun, loadGame, loadStory, recordRunResult, resetGameSave, saveRun, writeProfile, writeStory } from '../save/save';
import { DEFEAT_HP_FRACTION, battleGear, charmDrop, charmOfPickup, charmPickup, collect, consumable, crateCharm, lootFor, spendItem, townMaxHp } from '../economy/economy';

interface RunBridge {
  /** Queue exactly enough XP for one level. Applied on the next scene update. */
  grantLevel: () => void;
  isScenePaused: () => boolean;
  elapsedSeconds: () => number;
  level: () => number;
  x: () => number;
  y: () => number;
  hp: () => number;
  maxHp: () => number;
  /** Spend (or take back) a stat point by name (automation). */
  spend: (stat: string, dir: number) => boolean;
  characterId: () => string;
  regionId: () => string;
  /** Player status ids, e.g. ['wet','shocked']. */
  statuses: () => StatusId[];
  /** Status ids of every living enemy, nearest first. */
  enemyStatuses: () => StatusId[][];
  /** Live hazard zones, or null when this weather has none. */
  hazards: () => ReturnType<HazardDirector['snapshot']> | null;
  /** Drop a hazard next to the player now (debug / tests). */
  triggerHazard: (kind: HazardKind, dx?: number, dy?: number, instant?: boolean) => void;
  /** Put a status on the player or nearest enemy (debug / tests). */
  applyStatus: (target: 'player' | 'enemy', id: StatusId, ms?: number) => void;
  /** The gates between the zones: where, what level, and whether open (debug / tests). */
  gates: () => { ring: number; level: number; open: boolean; x: number; y: number; tiles: number }[];
  /** Set the knight's level outright (debug / tests); the points and slots follow. */
  setLevel: (level: number) => void;
  /** Put the knight here (debug / tests). */
  tpTo: (x: number, y: number) => void;
  /** Spawn an enemy a short way from the player (debug / tests). */
  spawnEnemy: (type: string, dx?: number, dy?: number) => void;
  /** Dodge roll state, for tests. */
  rolling: () => boolean;
  rollCharge: () => number;
  invulnerable: () => boolean;
  /** Dodge rolls started this run: lets a test see that a roll happened without catching its 220ms window. */
  rolls: () => number;
  /** Hits avoided by rolling this run. */
  dodges: () => number;
  /** How many enemies are currently winding up an attack. */
  alerts: () => number;
  /** Behaviour phase of each living enemy (cab / bus: cruise, telegraph, charge, stall). */
  enemyPhases: () => string[];
  /** Type keys of the living enemies. */
  enemyTypes: () => string[];
  /** Call in the region's boss now (debug / tests). */
  spawnBoss: () => void;
  /** Boss hp as a fraction 0..1, or null when there is no boss. */
  bossHpFraction: () => number | null;
  /** Set the living boss's hp to a fraction of its max (debug / tests). */
  setBossHp: (fraction: number) => void;
  /** Whether the boss has entered its rage phase (the Phantom Bus below half health). */
  bossRaging: () => boolean;
  /** Distance from the knight to each living enemy, in the same order as enemyTypes / enemyPhases. */
  enemyDistances: () => number[];
  /** World positions of the XP gems on the ground (debug / tests). */
  gems: () => number[][];
  /** Defeat the nearest living enemy (debug / tests). */
  killNearest: () => void;
  /** Quietly remove every living enemy but the boss, and stop the camps refilling: no XP, no loot (debug / tests). */
  clearEnemies: () => void;
  /** The camps: how many residents there are, how many stand now, and where the boss waits (debug / tests). */
  camps: () => { count: number; alive: number; empty: number; spots: { x: number; y: number; type: string; alive: boolean; aggro: boolean; at: { x: number; y: number } | null }[]; boss: { x: number; y: number; aggro: boolean } | null };
  /** Defeat the boss, if one is on the field; how many times the Regent has called lightning; its phase (debug / tests). */
  killBoss: () => void;
  lightningCasts: () => number;
  regentPhase: () => number;
  /** The map: its seed, tile counts, flood level and what is under the knight. */
  terrain: () => { seed: number; floodRings: number; counts: Record<string, number>; under: number; grip: number; speed: number; decorOps: number; decorDraws: number };
  /** Raise the flood to this many rings now (debug / tests). */
  floodTo: (rings: number) => number;
  /** Teleport the knight beside a tile of this type, on its west side, facing it (debug / tests). */
  tpBesideSolid: (type: number) => boolean;
  /** Rotation of each living enemy in degrees, in the same order as enemyTypes. */
  enemyAngles: () => number[];
  /** Where each living enemy is relative to the knight, [dx, dy] in px, in the same order as enemyTypes. */
  enemyOffsets: () => number[][];
  /** Spawn this many of an enemy around the knight the way the storm does (so the cap applies) (debug / tests). */
  spawnAround: (type: string, count: number) => void;
  /** Give the knight a powerup level, e.g. ('staticCharge', 3) (debug / tests). */
  givePowerup: (name: 'sunbeam' | 'rainbowShield' | 'gale' | 'frost' | 'staticCharge', level: number) => void;
  /** Make the next frame throw, to prove one bad frame cannot freeze the game (debug / tests). */
  throwNextFrame: () => void;
  /** Restore the knight to full health (debug / tests that are about something other than survival). */
  heal: () => void;
  /** Hurt the knight (debug / tests). A lethal hit ends the run. */
  hurt: (amount: number) => void;
  /** Grant XP. Enough to level up heals to full and opens the level-up menu. */
  addXp: (amount: number) => void;
  /** End the run as a defeat without a damage popup (debug / tests). */
  defeat: () => void;
  /** Drips in the purse right now. */
  coins: () => number;
  /** The knight's powerup levels, and how many enemies they have defeated this run (debug / tests). */
  powers: () => Record<string, number>;
  kills: () => number;
  /** Vehicle crashes so far this run. */
  crashes: () => number;
  /** Teleport the knight onto a long street, `tilesBefore` tiles before it ends at a wall; returns whether one was found. */
  tpStreetEnd: (tilesBefore?: number) => boolean;
  /** How many living enemies are standing inside a solid tile (should always be 0). */
  enemiesInSolid: () => number;
  /** Teleport the knight onto a tile of this type that has `run` more of it to its right (debug / tests). */
  tpToTile: (type: number, run?: number, offCols?: number, offRows?: number) => boolean;
  /** Take hit points off the knight, leaving at least 1 (debug / tests). */
  wound: (amount: number) => void;
  /** Which level the knight is on, what is on the surface map (and whether it has been used), and ways onto things (debug / tests). */
  depth: () => 'surface' | 'underground';
  pois: () => { id: number; kind: string; col: number; row: number; used: boolean; pair?: number; tunnel?: number }[];
  /** Aurel's Lantern is lit for this fight (the finale, with the Lantern from the Undercroft). */
  lantern: () => boolean;
  usedPois: () => string[];
  tpToPoi: (kind: 'entrance' | 'crate' | 'shrine', n?: number) => boolean;
  /** Underground: put the knight on the stairs back (`back`), or the stairs on (`far`), or by a chest (`chest`). */
  tpToStairs: (which: 'back' | 'far' | 'chest' | 'tablet', n?: number) => boolean;
  tunnelChests: () => number;
  /** Drop a charm at the knight's feet, to be picked up like any find (automation). */
  dropCharm: (id: string) => void;
  /** The numbers charms and stat points feed (automation). */
  combat: () => { damage: number; range: number; cooldown: number; pierce: number; magnet: number; moveSpeed: number; worn: string[] };
  /** Open the Bag on a page (automation); the page name when it is open, else null. */
  bagPage: () => string | null;
  statPoints: () => number;
  openBag: (page?: 'top' | 'items' | 'map' | 'stats' | 'charms') => void;
  /** The darkness has a light round the knight (underground only). */
  dark: () => boolean;
  /** The flight pad: where it is, how full its ring is (0..1), and a way onto it. */
  padAt: () => { x: number; y: number };
  padCharge: () => number;
  tpToPad: () => void;
  /** Current tutorial step id, or null outside the tutorial. */
  tutorialStep: () => TutorialStepId | null;
  /** Skip the current tutorial step (debug / tests). */
  skipTutorialStep: () => void;
}

declare global {
  interface Window {
    __rk?: RunBridge;
  }
}

interface GameSceneData {
  characterId?: string;
  regionId?: string;
  startFrontIndex?: number;
  weatherLabel?: string;
  weatherCondition?: string;
  weatherTint?: number;
  /** Continue the run stored in the local save. */
  resume?: boolean;
  /** The optional tutorial: no waves, no clock, no boss, and nothing written to the save. */
  tutorial?: boolean;
  /** Go down into the tunnels under the city, by this entrance (the run itself comes from the save, as for Continue). */
  underground?: { entry: number };
}

/** What each shrine's power is called. */
const POWER_NAME: Record<string, string> = { sunbeam: 'Sunbeam', rainbowShield: 'Rainbow Shield', gale: 'Gale', frost: 'Frost Aura', staticCharge: 'Static Charge' };
const SHRINE_POWERS = ['sunbeam', 'frost', 'gale', 'staticCharge', 'rainbowShield'] as const;

export class GameScene extends Phaser.Scene {
  player!: Player;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private projectileGroup!: Phaser.Physics.Arcade.Group;
  private gemGroup!: Phaser.Physics.Arcade.Group;
  private pickupGroup!: Phaser.Physics.Arcade.Group;
  private weather!: WeatherDirector;
  private hud!: HUD;
  private boss: Enemy | null = null;
  private region!: RegionDef;
  private signatureSeen = false;
  private bossSummonEvent: Phaser.Time.TimerEvent | null = null;
  private paused = false;
  private userPaused = false;
  private detachPause: (() => void) | null = null;
  private ambientDrops: Phaser.GameObjects.Image[] = [];
  private terrain!: TerrainResult;
  private lastFrontIndex = 0;
  private ended = false;
  private xpGrant = 0;
  private detachTouch: (() => void) | null = null;
  private runCharacterId = 'rainKnight';
  private runRegionId = 'nyc';
  private runWeatherLabel = 'Clear';
  private runWeatherCondition = 'clear';
  private runWeatherTint = 0x8fe0ff;
  private runStartFront = 0;
  private rule: WeatherRule = ruleFor('clear');
  private hazards: HazardDirector | null = null;
  private wetClock = 0;
  private hitStopMs = 0;
  private hitStopLockMs = 0;
  private floaters = 0;
  private tutorial: TutorialDirector | null = null;
  private tutorialBadge = '';
  private mapSeed = 0;
  private crashCount = 0;
  private rollCount = 0;
  /** Test hook: throw on the next update. */
  private faultNextFrame = false;
  private terrainClock = 0;
  private padGfx: Phaser.GameObjects.Graphics | null = null;
  private padCharge = 0;
  private padHinted = 0;
  private finaleBuffText = '';
  private level: 'surface' | 'underground' = 'surface';
  private surfacePois: Poi[] = [];
  private tunnelPlan: { tun: Tunnel; entry: number; exitId: number; tunnel: number; reversed: boolean } | null = null;
  private poiDirector: PoiDirector | null = null;
  private darkness: Darkness | null = null;
  private camps: CampDirector | null = null;
  private gateDir: GateDirector | null = null;
  private surfaceSpawn = { col: 0, row: 0 };
  /** Where the boss waits (the far end of the map), in px. */
  private bossHome: { x: number; y: number } | null = null;
  private castCount = 0;
  private lantern = false;
  private wasWet = false;
  private runDrips = 0;
  private bagMenu: BagMenu | null = null;

  constructor() {
    super('GameScene');
  }

  create(data: GameSceneData = {}) {
    this.paused = false;
    this.userPaused = false;
    this.ended = false;
    this.boss = null;
    this.bossSummonEvent = null;
    this.hazards = null;
    this.wetClock = 0;
    this.hitStopMs = 0;
    this.hitStopLockMs = 0;
    this.floaters = 0;
    this.signatureSeen = false;
    this.tutorial = null;
    this.tutorialBadge = '';
    this.terrainClock = 0;
    this.crashCount = 0;
    this.rollCount = 0;
    this.wasWet = false;
    this.runDrips = 0;
    this.bagMenu = null;
    this.physics.world.timeScale = 1;

    const resume = data.resume ? loadGame().run : null;
    const character = getCharacter(resume?.characterId ?? data.characterId);
    const region = getRegion(resume?.regionId ?? data.regionId);
    this.region = region;
    this.runCharacterId = character.id;
    this.runRegionId = region.id;
    this.runWeatherLabel = resume?.weatherLabel ?? data.weatherLabel ?? 'Clear';
    this.runWeatherCondition = resume?.weatherCondition ?? data.weatherCondition ?? 'clear';
    this.runWeatherTint = resume?.weatherTint ?? data.weatherTint ?? 0x8fe0ff;
    this.runStartFront = resume?.startFrontIndex ?? data.startFrontIndex ?? 0;
    this.rule = ruleFor(this.runWeatherCondition);

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    // The map: seeded (so Continue returns to the same one), shaped by the live weather, and flooded
    // as far as the storm front already warrants.
    this.mapSeed = seedFromUrl() ?? resume?.mapSeed ?? randomSeed();
    const startFront = resume ? frontIndexAt(resume.elapsedSeconds) : (data.startFrontIndex ?? 0);
    // The surface map's points of interest (where the stairs down are, the crates, the shrines) come from the map alone,
    // so a trip underground and back finds everything where it was.
    // The game's cities are cut into zones by level-locked gates; the tutorial's arena and the story's finale are not
    const zoned = !data.tutorial && !region.story;
    const surfaceMap = generateMap(region.id, this.mapSeed, undefined, undefined, zoned);
    this.surfaceSpawn = surfaceMap.spawn;
    this.surfacePois = data.tutorial ? [] : placePois(surfaceMap.grid, surfaceMap.spawn, this.mapSeed, region.dress);
    this.tunnelPlan = null;
    if (resume && data.underground && !data.tutorial) {
      const link = tunnelFor(this.surfacePois, data.underground.entry);
      if (link) this.tunnelPlan = { tun: generateUnderground(region.id, this.mapSeed, link.tunnel, region.dress), entry: data.underground.entry, exitId: link.exitId, tunnel: link.tunnel, reversed: link.reversed };
    }
    this.level = this.tunnelPlan ? 'underground' : 'surface';
    this.camps = null;
    this.bossHome = null;
    if (this.tunnelPlan) {
      // down in the tunnels: from the stairs at our end, a few steps in
      const { tun, reversed } = this.tunnelPlan;
      const start = reversed ? tun.b : tun.a;
      this.terrain = buildUndergroundTerrain(this, region, tun.grid, this.mapSeed, { col: start.col + (reversed ? -3 : 3), row: start.row });
    } else {
      this.terrain = buildTerrain(this, region, { seed: this.mapSeed, condition: this.runWeatherCondition, frontIndex: startFront, zoned });
    }

    this.player = new Player(this, this.terrain.spawn.x, this.terrain.spawn.y, character);
    if (!data.tutorial) {
      // What the knight is made of: the character and the armor, and (in the finale) the Stormglass. Stat points and
      // the worn charms are added on top (see Player.recompute); a continued run keeps its level, XP and points.
      const town = loadGame().town;
      this.player.applyBattleGear(battleGear(this.runCharacterId, town.armorId, town.hp));
      // The knight's growth lasts: the level, the XP and the spent points come from the profile.
      this.player.setHero(town.hero);
      const buff = region.id === 'stormhold' ? finaleBuff(loadStory()) : null;
      if (buff && buff.hp > 0) this.player.boostBase(buff.hp, 1 + buff.damage);
      this.player.setCharms(fit({ owned: town.charms, worn: town.worn }, charmSlots(laterHero(town.hero, { level: resume?.player.level ?? 1, xp: 0, alloc: town.hero.alloc }).level)));
      if (!resume && buff && buff.hp > 0) this.finaleBuffText = `The Stormglass hums:\n+${buff.hp} HP, +${Math.round(buff.damage * 100)}% damage.`;
    }
    if (resume) {
      this.player.applySnapshot(resume.player);
      // (a continued fight from before growth was kept may be further along than the profile: the later one wins)
      if (!data.tutorial) {
        const town = loadGame().town;
        this.player.setHero(laterHero(town.hero, this.player.toHero()));
        this.syncCharms();
      }
      // An older save has no map seed, so the map is new: make sure the knight is not inside a building.
      const spot = this.openSpot(this.player.x, this.player.y);
      this.player.setPosition(spot.x, spot.y);
      if (this.level === 'underground') this.player.setPosition(this.terrain.spawn.x, this.terrain.spawn.y);
    }
    this.player.onDied = () => this.endRun(false);
    this.padCharge = 0;
    this.castCount = 0;
    // Aurel's Lantern, from the Undercroft, is lit for the finale only
    this.lantern = !data.tutorial && region.id === 'stormhold' && finaleBuff(loadStory()).lantern;
    this.padHinted = -1e9;
    this.padGfx = data.tutorial || this.level === 'underground' ? null : this.add.graphics().setDepth(0.6);
    this.player.onLevelUp = () => this.onLevelGained();
    this.player.on('hurt', (amount: number) => {
      this.tutorial?.note('hurt');
      this.floatText(this.player.x, this.player.y - 12, `-${amount}`, '#f04040');
      this.hitStop(55);
    });
    this.player.on('rolled', () => {
      this.rollCount += 1;
    });
    this.player.on('dodged', () => {
      audio.play('dodge');
      this.popup(this.player.x, this.player.y - 12, 'DODGE', '#58e078');
    });
    this.player.on('extinguished', () => {
      audio.play('steam');
      this.popup(this.player.x, this.player.y - 12, 'OUT', '#a8a8b8');
    });
    this.player.on('sunbeamPulse', (radius: number, damage: number) => {
      audio.play('sunbeam');
      applySunbeamPulse(this, this.player, radius, damage, this.getActiveEnemies(), () => {});
    });
    this.player.on('shieldActivated', (duration: number) => {
      audio.play('shield');
      this.player.setAlpha(0.55);
      this.time.delayedCall(duration, () => {
        if (this.player.active) this.player.setAlpha(1);
      });
    });

    this.enemyGroup = this.physics.add.group();
    this.projectileGroup = this.physics.add.group();
    this.gemGroup = this.physics.add.group();
    this.pickupGroup = this.physics.add.group();

    this.physics.add.overlap(this.player, this.enemyGroup, this.onPlayerHitEnemy as any, undefined, this);
    this.physics.add.overlap(
      this.projectileGroup,
      this.enemyGroup,
      this.onProjectileHitEnemy as any,
      undefined,
      this
    );
    this.physics.add.collider(this.player, this.terrain.layer);
    this.physics.add.collider(this.enemyGroup, this.terrain.layer);
    this.gateDir = null;
    if (zoned && this.level === 'surface') {
      this.gateDir = new GateDirector(this, surfaceMap.gates, this.player, this.enemyGroup);
      this.gateDir.onOpened = (gate) => {
        audio.play('levelUp');
        this.hud.showMessage(`Lv${gate.level}: the ${GATE_NAME[gate.ring]} gate opens!`, 2600);
      };
      this.gateDir.onBump = (gate) => {
        this.hud.showMessage(`${GATE_NAME[gate.ring]} gate: Lv${gate.level} needed.\nYou are Lv${this.player.level}.`, 2600);
      };
      this.gateDir.update(this.player.level, 0, false); // (those the knight already has the level for start open)
    }

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1);

    this.weather = new WeatherDirector(resume ? 0 : (data.startFrontIndex ?? 0));
    if (resume) this.weather.restoreClock(resume.elapsedSeconds);

    audio.playMusic(region.music);
    audio.setAmbience(this.level === 'underground' ? null : resume ? this.runWeatherCondition : (data.weatherCondition ?? null));
    this.hud = new HUD(this);
    this.hud.setObjective(data.tutorial ? '' : runObjective(loadStory(), region.id));
    this.detachTouch = onTouchControlsChange((touch) => {
      this.hud.setBeamKeyLabel(beamKeyLabel(touch));
      this.hud.setRollKeyLabel(rollKeyLabel(touch));
    });
    const bridge: RunBridge = {
      grantLevel: () => {
        if (this.ended || this.paused || this.userPaused) return;
        const need = this.player.xpToNext - this.player.xp;
        if (need > 0) this.xpGrant += need;
      },
      isScenePaused: () => this.sys.isPaused(),
      elapsedSeconds: () => this.weather.elapsedSeconds,
      level: () => this.player.level,
      x: () => this.player.x,
      y: () => this.player.y,
      hp: () => this.player.hp,
      maxHp: () => this.player.maxHp,
      spend: (stat, dir) => this.spendPoint(stat as StatId, dir),
      characterId: () => this.runCharacterId,
      regionId: () => this.runRegionId,
      statuses: () => this.player.statuses.list(),
      enemyStatuses: () => this.getActiveEnemies().map((e) => e.statuses.list()),
      hazards: () => this.hazards?.snapshot() ?? null,
      triggerHazard: (kind, dx = 40, dy = 0, instant = false) => this.hazards?.trigger(kind, dx, dy, 'left', instant),
      applyStatus: (target, id, ms = 4000) => {
        if (target === 'player') this.player.applyStatus(id, ms);
        else this.getActiveEnemies()[0]?.applyStatus(id, ms);
      },
      tpTo: (x, y) => this.player.setPosition(x, y),
      gates: () => (this.gateDir?.gates ?? []).map(({ gate, open }) => ({ ring: gate.ring, level: gate.level, open, x: gate.col * TILE + TILE / 2, y: gate.row * TILE + TILE / 2, tiles: gate.tiles.length })),
      setLevel: (level) => {
        this.player.setHero({ level: Math.max(1, Math.floor(level)), xp: 0, alloc: this.player.toHero().alloc });
        this.syncCharms();
      },
      spawnEnemy: (type, dx = 50, dy = 0) => {
        // (returns nothing: Playwright would try to serialize a returned Phaser sprite, which stalls the page)
        this.spawnEnemyAt(type, this.player.x + dx, this.player.y + dy);
        this.noteSignature(type);
      },
      rolling: () => this.player.isRolling,
      rollCharge: () => this.player.rollCharge(this.time.now),
      invulnerable: () => this.player.isInvulnerable(this.time.now),
      dodges: () => this.player.dodgeCount,
      alerts: () => this.getActiveEnemies().filter((e) => e.isTelegraphing).length,
      enemyPhases: () => this.getActiveEnemies().map((e) => e.debugPhase),
      enemyTypes: () => this.getActiveEnemies().map((e) => e.stats.key),
      spawnBoss: () => this.callBoss(),
      bossHpFraction: () => (this.boss?.active ? this.boss.hp / this.boss.maxHp : null),
      enemyDistances: () => this.getActiveEnemies().map((e) => Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y)),
      gems: () => this.gemGroup.getChildren().filter((g) => g.active).map((g) => [(g as Phaser.Physics.Arcade.Sprite).x, (g as Phaser.Physics.Arcade.Sprite).y]),
      killNearest: () => {
        // (the boss has its own: killBoss)
        const target = this.findNearestEnemy(9999, false);
        if (target) target.takeDamage(99999);
      },
      clearEnemies: () => {
        if (this.camps) this.camps.held = true; // a quiet city: nothing comes back
        for (const enemy of this.getActiveEnemies()) if (enemy !== this.boss) enemy.destroy();
      },
      camps: () => ({
        count: this.camps?.count ?? 0,
        alive: this.camps?.alive ?? 0,
        empty: this.camps?.empty ?? 0,
        spots: this.camps?.positions() ?? [],
        boss: this.boss?.active ? { x: this.boss.x, y: this.boss.y, aggro: this.boss.isAggro } : null,
      }),
      killBoss: () => {
        if (this.boss?.active) this.boss.takeDamage(99999);
      },
      lightningCasts: () => this.castCount,
      regentPhase: () => (this.boss as unknown as { phase?: number } | null)?.phase ?? -1,
      terrain: () => {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        return {
          seed: this.mapSeed,
          floodRings: this.terrain.field.floodRings,
          counts: this.terrain.field.counts(),
          under: this.terrain.field.tileAt(body.center.x, body.center.y),
          grip: this.player.grip,
          speed: this.player.terrainSpeed,
          decorOps: this.terrain.field.decorOps,
          decorDraws: this.terrain.field.decorDraws,
        };
      },
      floodTo: (rings) => this.terrain.field.setFloodRings(rings),
      tpBesideSolid: (type) => {
        const spot = this.terrain.field.findBesideSolid(type);
        if (!spot) return false;
        this.player.setPosition(spot.x, spot.y);
        return true;
      },
      enemyAngles: () => this.getActiveEnemies().map((e) => (((e.angle % 360) + 360) % 360)),
      enemyOffsets: () => this.getActiveEnemies().map((e) => [e.x - this.player.x, e.y - this.player.y]),
      heal: () => {
        this.player.hp = this.player.maxHp;
      },
      hurt: (amount) => {
        this.player.takeDamage(amount, this.time.now);
      },
      addXp: (amount: number) => {
        this.xpGrant += Math.max(0, amount);
      },
      /** End the run the way a defeat does, without a damage number (debug / tests). */
      defeat: () => {
        if (this.ended || this.tutorial) return;
        this.player.hp = 0;
        this.player.onDied?.();
      },
      coins: () => loadGame().town.coins,
      powers: () => ({ ...this.player.powerups }),
      kills: () => this.player.kills,
      spawnAround: (type, count) => {
        for (let i = 0; i < count; i++) this.spawnEnemyAroundPlayer(type);
      },
      givePowerup: (name, level) => {
        this.player.setBonusPowers({ ...this.player.bonusPowers, [name]: level });
      },
      throwNextFrame: () => {
        this.faultNextFrame = true;
      },
      crashes: () => this.crashCount,
      rolls: () => this.rollCount,
      tpStreetEnd: (tilesBefore = 3) => {
        const end = this.terrain.field.findStreetEnd();
        if (!end) return false;
        this.player.setPosition(end.x - tilesBefore * 16, end.y);
        return true;
      },
      enemiesInSolid: () => this.getActiveEnemies().filter((e) => this.terrain.field.isSolidAt(e.x, e.y)).length,
      tpToTile: (type, run = 0, offCols = 0, offRows = 0) => {
        const spot = this.terrain.field.findTile(type, run);
        if (!spot) return false;
        this.player.setPosition(spot.x + offCols * 16, spot.y + offRows * 16);
        return true;
      },
      wound: (amount) => {
        this.player.hp = Math.max(1, this.player.hp - amount);
      },
      depth: () => this.level,
      pois: () => this.surfacePois.map((p) => ({ id: p.id, kind: p.kind, col: p.col, row: p.row, used: this.poiDirector?.isUsed(`s${p.id}`) ?? false, pair: p.pair, tunnel: p.tunnel })),
      lantern: () => this.lantern,
      usedPois: () => [...(this.poiDirector?.used ?? [])],
      tpToPoi: (kind, n = 0) => {
        const poi = poisOf(this.surfacePois, kind)[n];
        if (!poi) return false;
        const at = poiCenter(poi);
        this.player.setPosition(at.x, at.y);
        return true;
      },
      tpToStairs: (which, n = 0) => {
        const items = this.poiDirector?.items.filter((i) => (which === 'chest' ? i.kind === 'crate' : i.kind === which)) ?? [];
        const item = items[n];
        if (!item) return false;
        this.player.setPosition(item.x, item.y);
        return true;
      },
      tunnelChests: () => this.tunnelPlan?.tun.chests.length ?? 0,
      dropCharm: (id) => this.spawnPickup(this.player.x + 3, this.player.y + 2, 0, charmPickup(id)),
      combat: () => ({
        damage: this.player.attackDamage,
        range: this.player.attackRange,
        cooldown: this.player.attackCooldown,
        pierce: this.player.pierce,
        magnet: this.player.magnetRadius,
        moveSpeed: this.player.baseMoveSpeed,
        worn: [...this.player.charms.worn],
      }),
      bagPage: () => (this.bagMenu?.isOpen ? this.bagMenu.current : null),
      statPoints: () => this.player.statPoints,
      openBag: (page = 'top') => this.openBag(page),
      dark: () => !!this.darkness,
      padAt: () => padCenterFor(this.terrain.spawn),
      padCharge: () => this.padCharge,
      tpToPad: () => {
        const at = padCenterFor(this.terrain.spawn);
        this.player.setPosition(at.x, at.y);
      },
      tutorialStep: () => this.tutorial?.stepId ?? null,
      skipTutorialStep: () => this.tutorial?.skip(),
      bossRaging: () => !!(this.boss?.active && (this.boss as unknown as { raging?: boolean }).raging),
      setBossHp: (fraction) => {
        if (this.boss?.active) this.boss.hp = Math.max(1, Math.round(this.boss.maxHp * fraction));
      },
    };
    window.__rk = bridge;
    this.detachPause = bindGameplayPause({
      canPause: () => this.sys.isActive() && !this.ended && !this.userPaused,
      isUserPaused: () => this.userPaused,
      isMenuOpen: () => !!this.bagMenu?.isOpen,
      isEnded: () => this.ended,
      pause: () => this.enterUserPause(),
      resume: () => this.resumeFromUserPause(),
      quit: () => this.quitToTitle(),
      resetSave: () => this.resetAndQuit(),
      quitQuestion: data.tutorial ? 'Leave tutorial?' : undefined,
    });
    this.hud.setWeatherCondition(data.tutorial ? 'tutorial' : this.level === 'underground' ? 'clear' : this.runWeatherCondition, data.tutorial ? 'Tutorial' : this.level === 'underground' ? 'Underground' : this.runWeatherLabel);
    this.lastFrontIndex = this.weather.currentFrontIndex;
    if (!data.tutorial && !resume) {
      this.time.delayedCall(3000, () => this.showAttackHint());
      this.time.delayedCall(10000, () => this.showRollHint());
    }
    if (data.tutorial) {
      // The tutorial panel replaces the usual run intro and hints.
    } else if (this.level === 'underground') {
      this.hud.showMessage(region.dress === 'street' ? 'The subway.\nTime stands still down here.' : 'A cave under the shore.\nTime stands still down here.');
    } else if (resume) {
      this.hud.showMessage(`${region.name}.\nThe ${this.weather.frontName} resumes.`);
    } else {
      this.hud.showMessage(`${region.name}: ${data.weatherLabel ?? 'unknown'}.\nThe ${this.weather.frontName} begins!`);
      // the gates ask for a level: say which, once the weather has been read, unless the knight is past them
      if (zoned && this.player.level < suggestedLevel(region.id)) {
        const [a, b] = gateLevels(region.id);
        this.time.delayedCall(4200, () => !this.ended && !this.paused && this.hud.showMessage(`Gates open at Lv${a} and Lv${b}.\nBring Lv${suggestedLevel(region.id)} for the boss.`, 3200));
      }
    }
    if (!data.tutorial) this.setupCamps(surfaceMap, resume?.bossHp ?? null);

    this.setupAmbientWeather(this.runWeatherTint);
    const hazardHost: HazardHost = {
      scene: this,
      player: this.player,
      enemies: () => this.getActiveEnemies(),
      isOpenGround: (x, y) => {
        const tile = this.terrain.layer.getTileAtWorldXY(x, y);
        return !!tile && !tile.collides;
      },
      frontIndex: () => this.weather.currentFrontIndex,
      hurtEnemy: (enemy, damage, kind) => this.damageEnemy(enemy, damage, kind),
      popup: (x, y, text, color) => this.popup(x, y, text, color),
      waterBodyAt: (x, y) => this.terrain.field.waterBodyAt(x, y),
      waterTilesNear: (x, y, radius, bodyId) => this.terrain.field.waterTilesNear(x, y, radius, bodyId),
      wetSpotNear: (x, y, radius) => this.terrain.field.wetSpotNear(x, y, radius),
    };
    if (data.tutorial) {
      // No scheduled hazards: the tutorial drops its own lightning strike on cue.
      this.hazards = new HazardDirector(hazardHost, { wet: false, hazards: [] });
      this.startTutorial();
    } else if (hazardsEnabled() && this.rule.hazards.length > 0 && this.level === 'surface') {
      this.hazards = new HazardDirector(hazardHost, this.rule);
    }
    if (!data.tutorial) this.setupWorldDepth(resume?.usedPois ?? []);
    if (!data.tutorial && this.rule.terrainHint && this.level === 'surface' ) {
      this.time.delayedCall(14000, () => {
        if (this.ended || this.paused || !this.rule.terrainHint) return;
        this.hud.showMessage(this.rule.terrainHint);
        const app = document.getElementById('app');
        if (app) app.dataset.terrainHint = this.rule.terrainHint;
      });
    }
    if (!data.tutorial && this.rule.hint && !resume) {
      this.time.delayedCall(6000, () => this.showWeatherHint());
    }
    this.checkpoint();
    this.input.keyboard?.on('keydown-I', (event: KeyboardEvent) => {
      if (!event.repeat) this.openBag();
    });
    this.input.keyboard?.on('keydown-N', (event: KeyboardEvent) => {
      if (!event.repeat) this.openBag('map');
    });

    this.events.once('shutdown', () => {
      this.closeBagNow();
      this.gateDir?.destroy();
      this.gateDir = null;
      this.detachPause?.();
      this.detachPause = null;
      this.detachTouch?.();
      this.detachTouch = null;
      if (window.__rk === bridge) delete window.__rk;
      this.hazards?.destroy();
      this.hazards = null;
      this.hud.destroy();
      this.closeBagNow();
      audio.setMuffled(false);
    });
  }

  /** Controls reminder. Touch leads with A / B / Start and keeps the key aliases. */
  private showAttackHint() {
    if (this.ended || this.paused) return;
    const text = attackHint(isTouchControlsActive());
    this.hud.showMessage(text);
    const app = document.getElementById('app');
    if (app) app.dataset.attackHint = text;
  }

  /** Second controls reminder: the dodge roll. */
  private showRollHint() {
    if (this.ended || this.paused) return;
    const text = rollHint(isTouchControlsActive());
    this.hud.showMessage(text);
    const app = document.getElementById('app');
    if (app) app.dataset.rollHint = text;
  }

  update(time: number, delta: number) {
    if (this.faultNextFrame) {
      this.faultNextFrame = false;
      throw new Error('test fault: a frame that throws');
    }
    if (this.xpGrant > 0 && !this.ended && !this.paused && !this.userPaused) {
      const amount = this.xpGrant;
      this.xpGrant = 0;
      this.player.addXp(amount);
    }
    if (this.paused || this.userPaused) return;

    this.tickHitStop(delta);
    this.updateFlightPad(time, delta);
    if (this.ended) return; // flew out
    this.updateWorldDepth(time, delta);
    if (this.ended) return; // went up or down some stairs
    if (!this.tutorial && this.level === 'surface') this.weather.update(delta); // the tutorial has no storm clock; time stands still underground
    if (this.level === 'surface') {
      this.updateAmbientWeather(delta);
      this.updateWeatherEffects(delta);
    }
    this.camps?.update();
    this.gateDir?.update(this.player.level, time);
    this.updateTerrainEffects(delta);
    this.updateGems();
    this.updatePickups();
    applyFrostAura(this.player, this.getActiveEnemies());
    this.updatePull();
    this.handleManualAttacks(time);
    if (!this.tutorial) this.handleAttack(time); // the tutorial teaches the manual attacks
    this.tutorial?.update(delta);

    this.hud.update(this.player, this.tutorial ? this.tutorialBadge : this.weather.frontName, delta, this.player.beamCharge(time), this.player.rollCharge(time));
    this.hud.setStatuses(this.player.statuses.list());
    this.hud.setBoss(this.boss?.active && this.boss.isAggro ? this.boss.hp : null, this.boss?.maxHp ?? 1, this.boss?.stats.name.toUpperCase());
    if (this.weather.currentFrontIndex !== this.lastFrontIndex) {
      this.lastFrontIndex = this.weather.currentFrontIndex;
      const flooded = this.terrain.field.setFloodRings(floodRingsFor(this.runWeatherCondition, this.weather.currentFrontIndex)) > 0;
      this.hud.showMessage(flooded ? `The ${this.weather.frontName} is rolling in!\nThe streets are flooding!` : `The ${this.weather.frontName} is rolling in!`);
      if (flooded) audio.play('flood');
      audio.play('front');
      this.checkpoint();
    }
  }

  // --- the residents: enemies at fixed spots, a boss waiting at the far end ---

  /**
   * Put the city's enemies where they live: camps spread over the map (or along a tunnel), tougher the further out,
   * and the boss at the far end. They stand and loop at their spots until the knight comes close (see Enemy.live).
   */
  private setupCamps(surfaceMap: { grid: number[][]; spawn: { col: number; row: number } }, bossHp: number | null) {
    let list;
    if (this.tunnelPlan) {
      const { tun, tunnel } = this.tunnelPlan;
      list = tunnelCamps(tun.grid, tun.a, tun.b, (this.mapSeed + tunnel * 977) >>> 0);
    } else {
      const plan = placeCamps(surfaceMap.grid, surfaceMap.spawn, this.mapSeed, this.region.signature);
      list = plan.camps;
      const at = this.openSpot(plan.boss.col * TILE + TILE / 2, plan.boss.row * TILE + TILE / 2);
      this.bossHome = this.region.boss === 'phantomBus' ? this.terrain.field.roadSpotNear(at.x, at.y, 8) ?? at : at;
    }
    this.camps = new CampDirector(
      {
        place: (type, x, y, phase) => this.placeResident(type, x, y, phase),
        knight: () => ({ x: this.player.x, y: this.player.y }),
      },
      list
    );
    this.camps.start();
    if (this.bossHome) this.createBoss(this.bossHome.x, this.bossHome.y, true, bossHp);
  }

  /** An enemy at its spot, looping round it, until the knight is spotted. */
  private placeResident(type: string, x: number, y: number, phase: number): Enemy {
    let spot = { x, y };
    if (type === 'cabWraith') spot = this.terrain.field.roadSpotNear(x, y, 6) ?? spot; // vehicles live on streets
    const enemy = this.spawnEnemyAt(type, spot.x, spot.y);
    enemy.live(spot, phase, type === 'cabWraith' ? 10 : 14);
    enemy.on('spotted', this.handleSpotted);
    return enemy;
  }

  private handleSpotted = (enemy: Enemy) => {
    if (this.ended || !enemy.active) return;
    if (enemy === this.boss) return; // (the boss has its own entrance)
    this.floatText(enemy.x, enemy.y - 14, '!', '#f8d020');
    this.noteSignature(enemy.stats.key);
  };

  /** The first time the city's signature enemy shows itself, say what it does. */
  private noteSignature(typeKey: string) {
    if (this.tutorial || this.signatureSeen || typeKey !== this.region.signature || !this.region.signatureHint) return;
    this.signatureSeen = true;
    // Shown a moment after the first sighting; if a menu is open at that moment, try again rather than lose it.
    const show = () => {
      if (this.ended) return;
      if (this.paused) {
        this.time.delayedCall(1000, show);
        return;
      }
      this.hud.showMessage(this.region.signatureHint!);
      const app = document.getElementById('app');
      if (app) app.dataset.signatureHint = this.region.signatureHint!;
    };
    this.time.delayedCall(1500, show);
  }

  /** How tough an enemy is at this spot: by the zone it is in and the city (none in the tutorial; tunnels count as midtown). */
  private scaleAt(x: number, y: number) {
    if (this.tutorial) return NO_SCALE;
    if (this.level === 'underground') return scaleFor(this.region.id, 1);
    return scaleFor(this.region.id, zoneAt(Math.floor(x / TILE), Math.floor(y / TILE), this.surfaceSpawn));
  }

  /** A free enemy near the knight that chases at once: a boss's backup, or one from the debug bridge. */
  spawnEnemyAroundPlayer(typeKey: string) {
    if (this.enemyGroup.countActive(true) >= MAX_LIVING_ENEMIES) return; // see MAX_LIVING_ENEMIES
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(130, 180);
    // On open ground: with city blocks and canals about, a random spot is often inside a building.
    let spot = this.openSpot(this.player.x + Math.cos(angle) * dist, this.player.y + Math.sin(angle) * dist);
    // Vehicles belong on streets: put them on the nearest road if there is one close by.
    if (typeKey === 'cabWraith') spot = this.terrain.field.roadSpotNear(spot.x, spot.y, 6) ?? spot;
    this.spawnEnemyAt(typeKey, spot.x, spot.y);
    this.noteSignature(typeKey); // (a resident says it when it spots the knight: handleSpotted)
  }

  private spawnEnemyAt(typeKey: string, x: number, y: number): Enemy {
    const enemy = createEnemy(this, typeKey, x, y, this.player);
    enemy.terrain = this.terrain.field;
    enemy.scaleTo(this.scaleAt(x, y));
    enemy.on('crash', this.handleCrash);
    enemy.once('enemyDied', this.handleEnemyDeath);
    this.enemyGroup.add(enemy);
    if (this.rule.wet) enemy.applyStatus('wet', STATUS_TUNING.wetMs);
    return enemy;
  }

  /**
   * The boss. It waits at the far end of the map (`resident`) and stands still until the knight comes close, then the
   * fight begins; or it is a free one that comes at the knight now (the debug bridge).
   */
  private createBoss(x: number, y: number, resident: boolean, remainingHp?: number | null): Enemy {
    const boss = createEnemy(this, this.region.boss, x, y, this.player);
    boss.terrain = this.terrain.field;
    if (!this.tutorial) boss.scaleTo(bossScaleFor(this.region.id));
    boss.on('crash', this.handleCrash);
    boss.once('enemyDied', this.handleEnemyDeath);
    boss.on('bossRage', () => {
      audio.play('bossAppears');
      this.cameras.main.shake(260, 0.004);
      this.hud.showMessage(`The ${boss.stats.name} is enraged!\nIt calls for backup!`);
      if (boss.stats.key === 'tempestRegent') for (let i = 0; i < 3; i++) this.spawnEnemyAroundPlayer('lightningWisp');
    });
    boss.on('regentCast', (_regent: Enemy, strikes: number) => this.castLightning(strikes));
    this.enemyGroup.add(boss);
    this.boss = boss;
    if (remainingHp != null) boss.hp = Math.min(boss.maxHp, remainingHp);
    const entrance = () => this.bossEntrance(boss, remainingHp != null);
    if (resident) {
      boss.live({ x, y }, 0, 0); // it waits where it stands
      boss.once('spotted', entrance);
      boss.on('calmed', () => !this.ended && audio.playMusic(this.region.music));
    } else {
      entrance();
    }
    return boss;
  }

  /** The knight has come to the boss: the music, the message and the summons begin. */
  private bossEntrance(boss: Enemy, resumed: boolean) {
    if (this.ended || !boss.active) return;
    audio.play('bossAppears');
    audio.playMusic('boss');
    if (!resumed && this.region.bossIntro) this.hud.showMessage(this.region.bossIntro);
    if (!resumed && this.finaleBuffText) this.time.delayedCall(2800, () => this.hud.showMessage(this.finaleBuffText));
    if (!resumed && this.lantern) this.time.delayedCall(5600, () => this.hud.showMessage("Aurel's Lantern glows:\nstrike warnings last longer."));
    boss.on('calmed', () => this.bossSummonEvent?.remove(false));
    boss.on('spotted', () => this.startSummons(boss));
    this.startSummons(boss);
  }

  private startSummons(boss: Enemy) {
    this.bossSummonEvent?.remove(false);
    this.bossSummonEvent = null;
    const summon = BOSS_SUMMONS[boss.stats.key];
    if (!summon) return;
    this.bossSummonEvent = this.time.addEvent({
      delay: summon.everyMs,
      loop: true,
      callback: () => {
        if (!this.boss?.active || !this.boss.isAggro) return;
        for (let i = 0; i < summon.count; i++) this.spawnEnemyAroundPlayer(Phaser.Utils.Array.GetRandom(summon.types));
      },
    });
  }

  /** The debug bridge: bring the boss to the knight (the waiting one, or a new one if there is none). */
  private callBoss() {
    if (this.boss?.active) {
      const dist = BOSS_SPAWN_DISTANCE[this.region.boss] ?? 170;
      const angle = Math.random() * Math.PI * 2;
      const spot = this.openSpot(Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 50, WORLD.width - 50), Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 50, WORLD.height - 50));
      this.boss.setPosition(spot.x, spot.y);
      if (this.boss.home) this.boss.home = { x: spot.x, y: spot.y };
      this.boss.provoke();
      return;
    }
    const dist = BOSS_SPAWN_DISTANCE[this.region.boss] ?? 170;
    const angle = Math.random() * Math.PI * 2;
    let spot = this.openSpot(Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 50, WORLD.width - 50), Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 50, WORLD.height - 50));
    if (this.region.boss === 'phantomBus') spot = this.terrain.field.roadSpotNear(spot.x, spot.y, 8) ?? spot;
    this.createBoss(spot.x, spot.y, false);
  }

  // --- combat ---

  private handleEnemyDeath = (enemy: Enemy) => {
    audio.play('enemyDie');
    this.hitStop(enemy === this.boss ? 140 : 45);
    this.player.kills += 1;
    this.spawnXpGem(enemy.x, enemy.y, enemy.stats.xp);
    this.spawnLoot(enemy);
    if (enemy === this.boss) {
      this.boss = null;
      this.bossSummonEvent?.remove(false);
      this.bossSummonEvent = null;
      this.time.delayedCall(300, () => this.endRun(true));
    }
  };

  private onPlayerHitEnemy = (_playerObj: unknown, enemyObj: unknown) => {
    const enemy = enemyObj as Enemy;
    if (!enemy.active || enemy.isPassive) return; // one that has not spotted the knight does no harm
    this.player.takeDamage(enemy.contactDamage, this.time.now);
  };

  /** Damage from any source; also feeds Static Charge chaining. */
  private damageEnemy(enemy: Enemy, damage: number, kind: DamageKind = 'bolt', shatterMult = 1) {
    audio.play('hit');
    const hit = resolveHit(kind, enemy.statuses, damage, shatterMult);
    damage = Math.round(hit.damage * enemy.damageMultiplier);
    const x = enemy.x;
    const y = enemy.y;
    enemy.takeDamage(damage);
    if (kind === 'melee') this.tutorial?.note('meleeHit');
    if (kind === 'beam') this.tutorial?.note('beamHit');
    if (hit.wetShock) this.tutorial?.note('wetShock');
    const color = hit.shattered ? '#58a8e0' : hit.wetShock ? '#f8d020' : '#f8f8f8';
    this.floatText(x + Phaser.Math.Between(-6, 6), y - 8, `${damage}`, color);
    if (enemy.active && hit.shockMs > 0) {
      const result = enemy.applyStatus('shocked', hit.shockMs);
      if (result.applied) {
        audio.play('zap');
        if (hit.wetShock) this.popup(enemy.x, enemy.y - 12, 'SHOCK', '#d8a800');
      }
    }
    if (hit.shattered) {
      audio.play('shatter');
      this.popup(enemy.x, enemy.y - 12, 'SHATTER', '#58a8e0');
    }
    if (this.player.powerups.staticCharge > 0) {
      applyStaticChain(
        this,
        enemy,
        Math.round(damage * 0.5),
        this.player.powerups.staticCharge,
        this.getActiveEnemies(),
        () => {}
      );
    }
  }

  private onProjectileHitEnemy = (projObj: unknown, enemyObj: unknown) => {
    const proj = projObj as Projectile;
    const enemy = enemyObj as Enemy;
    if (!proj.active || !enemy.active || proj.hitSet.has(enemy)) return;
    proj.hitSet.add(enemy);

    this.damageEnemy(enemy, proj.damage);

    proj.pierceLeft -= 1;
    if (proj.pierceLeft < 0) proj.destroy();
  };

  /** Automatic Storm Bolt — a weaker backup to the manual swing and beam. */
  private handleAttack(time: number) {
    if (time - this.player.lastAttackAt < this.player.attackCooldown * AUTO_ATTACK.cooldownMult) return;
    // The backup bolt fights what is fighting the knight; it does not wake what has not spotted them.
    const target = this.findNearestEnemy(this.player.attackRange, true, true);
    if (!target) return;
    this.player.lastAttackAt = time;
    this.fireProjectile(target);
  }

  private fireProjectile(target: Enemy) {
    const proj = new Projectile(this, this.player.x, this.player.y, TEX.projectile);
    this.add.existing(proj);
    this.physics.add.existing(proj);
    proj.setDepth(6);
    proj.damage = Math.max(1, Math.round(this.player.attackDamage * AUTO_ATTACK.damageMult * this.player.rangedMult));
    proj.pierceLeft = this.player.pierce;

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const body = proj.body as Phaser.Physics.Arcade.Body;
    this.physics.velocityFromRotation(angle, PLAYER_BASE.projectileSpeed, body.velocity);
    proj.setRotation(angle);

    this.projectileGroup.add(proj);
    this.time.delayedCall(1000, () => {
      if (proj.active) proj.destroy();
    });
  }

  // --- manual attacks: Space swings the weapon, J / X fires the energy beam ---

  private handleManualAttacks(time: number) {
    // Upgrades and character speed that shorten the auto cooldown speed these up too.
    if (this.player.isRolling) return; // the roll is a dodge, not an attack
    const ratio = this.player.attackCooldown / PLAYER_BASE.attackCooldown;
    if (this.player.wantsSwing && time >= this.player.meleeReadyAt) this.swingWeapon(time, ratio);
    if (this.player.wantsBeam && time >= this.player.beamReadyAt) this.fireBeam(time, ratio);
  }

  private hitSpark(x: number, y: number) {
    const spark = this.add.image(x, y, SPARK_KEY).setDepth(13);
    this.tweens.add({ targets: spark, scale: 1.8, alpha: 0, duration: 140, onComplete: () => spark.destroy() });
  }

  private swingWeapon(time: number, ratio: number) {
    const p = this.player;
    const stats = MELEE[p.weaponType];
    p.meleeReadyAt = time + stats.cooldownMs * ratio;
    p.playAttackSwing(time, p.x + p.aim.x * 30, p.y + p.aim.y * 30);
    audio.play('swing', p.weaponType);

    const cosHalf = Math.cos(Phaser.Math.DegToRad(stats.arcDeg / 2));
    const damage = Math.round(p.attackDamage * stats.damageMult * p.meleeMult);
    for (const enemy of this.getActiveEnemies()) {
      if (!enemy.isLive) continue; // an earlier hit's Static Charge chain may have killed this one
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const dist = Math.hypot(dx, dy);
      const radius = (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
      if (dist > stats.reach + radius) continue;
      const cos = dist > 0.001 ? (dx * p.aim.x + dy * p.aim.y) / dist : 1;
      if (dist > radius + 6 && cos < cosHalf) continue; // point-blank enemies are always hit

      this.damageEnemy(enemy, damage, 'melee', stats.shatterMult);
      if (enemy.active && dist > 0.001) {
        const shove = enemy === this.boss ? stats.knockback * 0.25 : stats.knockback;
        enemy.x += (dx / dist) * shove;
        enemy.y += (dy / dist) * shove;
      }
      this.hitSpark(enemy.x, enemy.y);
    }
    if (p.weaponType === 'hammer') this.cameras.main.shake(90, 0.002);
  }

  private fireBeam(time: number, ratio: number) {
    const p = this.player;
    const stats = BEAM[p.weaponType];
    p.startBeamCooldown(time, stats.cooldownMs * ratio);
    p.playCast(time);
    audio.play('beam', p.weaponType);

    const len = p.attackRange * 0.95;
    const ox = p.x + p.aim.x * 8;
    const oy = p.y + p.aim.y * 8 + 2;
    const abx = p.aim.x * len;
    const aby = p.aim.y * len;
    const ex = ox + abx;
    const ey = oy + aby;

    const damage = Math.round(p.attackDamage * stats.damageMult * p.rangedMult);
    for (const enemy of this.getActiveEnemies()) {
      if (!enemy.isLive) continue;
      const t = Phaser.Math.Clamp(((enemy.x - ox) * abx + (enemy.y - oy) * aby) / (len * len), 0, 1);
      const dist = Math.hypot(enemy.x - (ox + abx * t), enemy.y - (oy + aby * t));
      const radius = (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
      if (dist > stats.halfWidth + radius) continue;
      this.damageEnemy(enemy, damage, 'beam'); // the beam pierces everything in line
      this.hitSpark(enemy.x, enemy.y);
    }

    const beam = this.add
      .image(ox, oy, beamKey(p.weaponType))
      .setOrigin(0, 0.5)
      .setRotation(Math.atan2(p.aim.y, p.aim.x))
      .setDisplaySize(len, stats.halfWidth * 2 + 1)
      .setDepth(12);
    this.tweens.add({
      targets: beam,
      scaleY: beam.scaleY * 0.25,
      alpha: 0,
      duration: 240,
      onComplete: () => beam.destroy(),
    });
    this.hitSpark(ox, oy);
    this.hitSpark(ex, ey);
    this.cameras.main.shake(70, 0.0015);
  }

  private findNearestEnemy(range: number, includeBoss = true, onlyAggro = false): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = range;
    for (const enemy of this.getActiveEnemies()) {
      if (!includeBoss && enemy === this.boss) continue;
      if (onlyAggro && !enemy.isAggro) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private getActiveEnemies(): Enemy[] {
    return this.enemyGroup.getChildren().filter((e) => e.active && (e as Enemy).isLive) as Enemy[];
  }

  private updatePull() {
    if (!this.boss || !this.boss.active || !this.boss.isAggro || this.boss.stats.key !== 'tornadoBoss') return; // only the Tornado pulls, and only once it has noticed the knight
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
    if (dist < 140 && dist > 25) {
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += Math.cos(angle) * 20;
      body.velocity.y += Math.sin(angle) * 20;
    }
  }

  // --- xp gems ---

  private spawnLoot(enemy: Enemy) {
    if (this.tutorial) return;
    const loot = lootFor(enemy.stats.key, Math.random());
    if (loot.coins > 0) this.spawnPickup(enemy.x + 5, enemy.y - 3, loot.coins, null);
    if (loot.itemId) this.spawnPickup(enemy.x - 6, enemy.y + 4, 0, loot.itemId);
    const found = charmDrop(enemy.stats.key, Math.random(), Math.random(), this.townCharms());
    if (found) this.spawnPickup(enemy.x + 1, enemy.y - 9, 0, found);
  }

  private spawnPickup(x: number, y: number, coins: number, itemId: string | null) {
    const drop = this.physics.add.sprite(x, y, itemId ? TEX.supply : TEX.coin).setDepth(3);
    if (charmOfPickup(itemId)) drop.setTint(0xffd84a); // a charm glints gold
    drop.setData('coins', coins);
    drop.setData('item', itemId ?? '');
    drop.setData('ready', 0);
    const body = drop.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Phaser.Math.Between(-36, 36), Phaser.Math.Between(-60, -16));
    this.pickupGroup.add(drop);
    this.time.delayedCall(160, () => {
      if (drop.active) drop.setData('ready', 1);
    });
  }

  private updatePickups() {
    const magnetRadiusSq = this.player.magnetRadius * this.player.magnetRadius;
    for (const child of this.pickupGroup.getChildren()) {
      const drop = child as Phaser.Physics.Arcade.Sprite;
      if (!drop.active) continue;
      const body = drop.body as Phaser.Physics.Arcade.Body;
      if (drop.getData('full')) {
        body.setVelocity(0, 0);
        continue;
      }
      const dx = this.player.x - drop.x;
      const dy = this.player.y - drop.y;
      const distSq = dx * dx + dy * dy;
      if (drop.getData('ready') && distSq < 12 * 12) {
        this.collectPickup(drop);
        continue;
      }
      if (drop.getData('ready') && distSq < magnetRadiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        body.setVelocity((dx / dist) * 190, (dy / dist) * 190);
      } else if (drop.getData('ready')) {
        body.setVelocity(0, 0);
      }
    }
  }

  private collectPickup(drop: Phaser.Physics.Arcade.Sprite) {
    const coins = Number(drop.getData('coins')) || 0;
    const item = String(drop.getData('item') || '') || null;
    const got = collectIntoTown(coins, item, charmSlots(this.player.level));
    if (item && !got.storedItem) {
      drop.setData('full', 1);
      this.popup(drop.x, drop.y - 8, 'BAG FULL', '#f8f8f8');
      return;
    }
    if (coins > 0) {
      this.runDrips += coins;
      audio.play('coin');
      this.popup(drop.x, drop.y - 8, `+${coins}`, '#f8d020');
    }
    if (got.charm) {
      const def = charmDef(got.charm.id);
      this.syncCharms();
      audio.play('levelUp');
      this.popup(drop.x, drop.y - 12, `${def?.name.toUpperCase() ?? 'CHARM'} ${rankLabel(got.charm.rank)}`, '#ffd84a');
      this.hud.showMessage(`${def?.name ?? 'A charm'} ${rankLabel(got.charm.rank)}!\n${got.charm.wornNow ? 'Worn.' : 'Wear it from the Bag (I).'}`, 2400);
    } else if (item && got.storedItem) {
      audio.play('gem');
      this.popup(drop.x, drop.y - 12, charmOfPickup(item) ? 'MAXED' : consumable(item)?.short ?? 'ITEM', '#f8f8f8');
    }
    const pop = this.add.image(drop.x, drop.y, drop.texture.key).setDepth(4);
    this.tweens.add({ targets: pop, scale: 1.7, alpha: 0, duration: 140, onComplete: () => pop.destroy() });
    drop.destroy();
    const app = document.getElementById('app');
    if (app) app.dataset.coins = String(loadGame().town.coins);
  }

  private spawnXpGem(x: number, y: number, value: number) {
    const gem = this.physics.add.sprite(x, y, TEX.xpGem).setDepth(3);
    gem.setData('xp', value);
    this.gemGroup.add(gem);
  }

  private updateGems() {
    const magnetRadiusSq = this.player.magnetRadius * this.player.magnetRadius;
    for (const child of this.gemGroup.getChildren()) {
      const gem = child as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) continue;
      const dx = this.player.x - gem.x;
      const dy = this.player.y - gem.y;
      const distSq = dx * dx + dy * dy;
      const body = gem.body as Phaser.Physics.Arcade.Body;

      if (distSq < 11 * 11) {
        audio.play('gem');
        this.tutorial?.note('gem');
        this.player.addXp(gem.getData('xp'));
        gem.destroy();
        continue;
      }
      if (distSq < magnetRadiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        body.setVelocity((dx / dist) * 190, (dy / dist) * 190);
      } else {
        body.setVelocity(0, 0);
      }
    }
  }

  // --- level up / end of run ---

  /**
   * A level is a reward, not an interruption: the knight is mended, three stat points are earned, and play goes on.
   * The points are spent from the Bag (I, then STATS) whenever the player likes.
   */
  private onLevelGained() {
    audio.play('levelUp');
    const n = this.player.statPoints;
    this.floatText(this.player.x, this.player.y - 16, `LEVEL ${this.player.level}!`, '#f8d020');
    this.hud.showMessage(`Level ${this.player.level}!\n${n} point${n === 1 ? '' : 's'} to spend: press I.`, 2600);
    this.checkpoint();
  }

  private enterUserPause() {
    if (!this.sys.isActive() || this.ended || this.userPaused || this.bagMenu?.isOpen) return;
    this.userPaused = true;
    this.paused = true;
    this.hud.setVisible(false);
    audio.setMuffled(true);
    // Pause the whole scene, not just physics: enemy AI and auras live in
    // preUpdate, and the storm clock would keep running otherwise.
    this.sys.pause();
    this.checkpoint();
    openPauseMenu();
  }

  private resumeFromUserPause() {
    if (!this.userPaused) return;
    this.userPaused = false;
    closePauseMenu();
    if (this.sys.isPaused()) this.sys.resume();
    this.input.keyboard?.resetKeys();
    replayHeldKeys();
    audio.setMuffled(false);
    this.hud.setVisible(true);
    this.paused = false;
  }

  // --- the world's depth: crates, shrines, stairs, tunnels ---

  /** Put the crates, shrines and stairs in the world (or the chests and stairs in a tunnel), and the dark underground. */
  private setupWorldDepth(used: string[]) {
    const items: PoiItem[] = [];
    if (this.level === 'surface') {
      for (const p of this.surfacePois) {
        const at = poiCenter(p);
        items.push({
          key: `s${p.id}`,
          kind: p.kind,
          x: at.x,
          y: at.y,
          poi: p,
          dress: this.region.dress,
          ...(p.kind === 'shrine' ? { power: SHRINE_POWERS[p.id % SHRINE_POWERS.length] } : {}),
        });
      }
    } else if (this.tunnelPlan) {
      const { tun, reversed, tunnel } = this.tunnelPlan;
      const start = reversed ? tun.b : tun.a;
      const far = reversed ? tun.a : tun.b;
      items.push({ key: 'back', kind: 'back', ...poiCenter(start) }, { key: 'far', kind: 'far', ...poiCenter(far) });
      // In the story, while Aurel's tablets are being gathered, the tunnel's farthest dead end holds one instead of a chest
      const tablet = !this.tutorial && tabletsAvailable(loadStory()) ? tun.chests.length - 1 : -1;
      tun.chests.forEach((c, i) => items.push(i === tablet ? { key: `t${tunnel}`, kind: 'tablet', ...poiCenter(c) } : { key: `u${tunnel}:${i}`, kind: 'crate', ...poiCenter(c) }));
      this.darkness = new Darkness(this);
    }
    this.poiDirector = new PoiDirector(this, { trigger: (item) => this.onPoi(item) }, items, used);
    this.events.once('shutdown', () => {
      this.poiDirector?.destroy();
      this.darkness?.destroy();
      this.poiDirector = null;
      this.darkness = null;
    });
  }

  private minimapKey(): string {
    return `${this.level}:${this.terrain.field.floodRings}`;
  }

  /** The blips on the Bag's map: stairs, crates, shrines, the pad, and the boss. */
  private mapDots(): MiniDot[] {
    const dots: MiniDot[] = [];
    for (const item of this.poiDirector?.items ?? []) {
      if (this.poiDirector!.isUsed(item.key) && item.kind !== 'entrance' && item.kind !== 'back' && item.kind !== 'far') continue;
      const color = item.kind === 'entrance' ? 0x58e0d0 : item.kind === 'crate' ? 0xffd84a : item.kind === 'shrine' ? 0xc080ff : item.kind === 'tablet' ? 0xff9ad8 : item.kind === 'far' ? 0x58d8ff : 0xffe680;
      dots.push({ x: item.x, y: item.y, color });
    }
    if (this.level === 'surface' && !this.tutorial) dots.push({ ...padCenterFor(this.terrain.spawn), color: 0x3f8cf0 });
    for (const { gate, open } of this.gateDir?.gates ?? []) dots.push({ x: gate.col * TILE + TILE / 2, y: gate.row * TILE + TILE / 2, color: open ? 0x58e058 : 0xff8a3a });
    if (this.boss?.active && this.level === 'surface') dots.push({ x: this.boss.x, y: this.boss.y, color: 0xff4a4a });
    return dots;
  }

  private updateWorldDepth(time: number, delta: number) {
    if (!this.poiDirector) return;
    this.poiDirector.update(time, delta, this.player);
    if (this.ended) return;
    const cam = this.cameras.main.worldView;

    if (this.level === 'underground') {
      const lights = [{ x: this.player.x - cam.x, y: this.player.y - cam.y, r: 62 + Math.sin(time / 230) * 2 }];
      for (const item of this.poiDirector.items) if (!this.poiDirector.isUsed(item.key)) lights.push({ x: item.x - cam.x, y: item.y - cam.y, r: item.kind === 'crate' ? 22 : 30 });
      this.darkness?.update(lights);
    }
  }

  private onPoi(item: PoiItem) {
    if (this.ended) return;
    audio.play('confirm');
    if (item.kind === 'crate') this.openCrate(item);
    else if (item.kind === 'shrine') this.blessKnight(item);
    else if (item.kind === 'entrance' && item.poi) this.descend(item.poi);
    else if (item.kind === 'tablet') this.readTabletHere();
    else if (item.kind === 'back' || item.kind === 'far') this.ascend(item.kind);
  }

  /** A crate on the surface, or a buried chest: drips, a bun maybe, a spill of gems. */
  private openCrate(item: PoiItem) {
    const buried = item.key.startsWith('u');
    this.spawnPickup(item.x + 6, item.y - 6, Phaser.Math.Between(buried ? 18 : 8, buried ? 34 : 18), null);
    if (Math.random() < (buried ? 0.8 : 0.45)) this.spawnPickup(item.x - 7, item.y + 4, 0, 'rainBun');
    const found = crateCharm(buried, Math.random(), Math.random(), this.townCharms());
    if (found) this.spawnPickup(item.x + 1, item.y - 10, 0, found);
    for (let i = 0; i < 3; i++) this.spawnXpGem(item.x + Phaser.Math.Between(-10, 10), item.y + Phaser.Math.Between(-8, 8), buried ? 14 : 8);
    this.hud.showMessage(buried ? 'A buried chest!\nDrips, gems, a bun, a charm?' : 'A supply crate!\nDrips and gems spill out.', 1900);
  }

  /** One of Aurel's tablets: his words, a few lines at a time. The first from each city counts toward the three. */
  private readTabletHere() {
    const result = readTablet(loadStory(), this.region.id);
    writeStory(result.state);
    result.pages.forEach((page, i) => this.time.delayedCall(i * 3600, () => !this.ended && this.hud.showMessage(page.join('\n'), 3400)));
    if (result.counted) {
      const n = result.state.flags.filter((f) => f.startsWith('tablet:')).length;
      this.time.delayedCall(result.pages.length * 3600, () => {
        if (this.ended) return;
        this.hud.showMessage(n >= TABLETS_NEEDED ? 'All three tablets read!\nThe hatch in Mistford opens.' : `Tablets read: ${n} of ${TABLETS_NEEDED}.\nOne in each city.`, 3000);
        this.hud.setObjective(runObjective(loadStory(), this.region.id));
      });
    }
  }

  /** A weather shrine: its power gains a level, and the knight is mended a little. */
  private blessKnight(item: PoiItem) {
    const power = (item.power ?? 'sunbeam') as keyof typeof this.player.powerups;
    const level = this.player.addBonusPower(power);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * 0.25));
    this.cameras.main.flash(260, 255, 255, 255, false);
    this.hud.showMessage(`${POWER_NAME[power] ?? power} shrine!\nPower up: level ${level}.`, 2400);
    audio.play('levelUp');
  }

  /** Down some stairs: save the run where it stands at the entrance, then go under. */
  private descend(entrance: Poi) {
    if (!tunnelFor(this.surfacePois, entrance.id)) return;
    const at = poiCenter(entrance);
    const snapshot = this.captureRun();
    saveRun({ ...snapshot, player: { ...snapshot.player, x: at.x, y: at.y + 24 }, usedPois: [...(this.poiDirector?.used ?? [])] });
    this.changeLevel({ resume: true, underground: { entry: entrance.id } });
  }

  /** Up some stairs: back to the stairs we came down (`back`), or out the other end of the tunnel (`far`), on the surface. */
  private ascend(which: 'back' | 'far') {
    const plan = this.tunnelPlan;
    const base = loadGame().run;
    if (!plan || !base) return;
    const exit = this.surfacePois.find((p) => p.id === (which === 'back' ? plan.entry : plan.exitId));
    if (!exit) return;
    // a tunnel is no way round a gate: the far stairs are sealed to a knight too low for the zone they come out in
    const needed = levelForZone(this.region.id, zoneAt(exit.col, exit.row, this.surfaceSpawn));
    if (which === 'far' && this.player.level < needed) {
      this.hud.showMessage(`The far stairs are sealed:\nbring Lv${needed} to go up.`, 2600);
      return;
    }
    const at = poiCenter(exit);
    saveRun({
      ...base,
      player: { ...this.player.toSnapshot(), x: at.x, y: at.y + 24 },
      pendingLevelUps: 0,
      usedPois: [...(this.poiDirector?.used ?? [])],
    });
    this.changeLevel({ resume: true });
  }

  /** Fade out and start the scene again on the other level (the run itself travels in the save). */
  private changeLevel(data: GameSceneData) {
    if (this.ended) return;
    this.ended = true;
    this.paused = true;
    this.userPaused = false;
    closePauseMenu();
    this.closeBagNow();
    if (this.sys.isPaused()) this.sys.resume();
    audio.setMuffled(false);
    this.physics.pause();
    this.bossSummonEvent?.remove(false);
    this.cameras.main.fadeOut(320, 0, 0, 0);
    this.time.delayedCall(380, () => this.scene.start('GameScene', data));
  }

  /** The Regent calls lightning: rings on the ground where it will land, then the strikes. The first is on the knight. */
  private castLightning(strikes: number) {
    if (this.ended || !this.player?.active) return;
    this.castCount += 1;
    // Aurel's Lantern, if the knight carries it, makes every warning last longer
    const warning = STRIKE.telegraphMs * (this.lantern ? LANTERN_WARNING : 1);
    audio.play('thunder');
    for (const spot of strikeSpots(this.player, strikes, Math.random)) {
      const ring = this.add.graphics().setDepth(6);
      const draw = (alpha: number, fill: number) => {
        ring.clear();
        ring.fillStyle(fill, alpha * 0.45).fillCircle(spot.x, spot.y, STRIKE.radius);
        ring.lineStyle(2, 0xfff06a, Math.min(1, alpha + 0.3)).strokeCircle(spot.x, spot.y, STRIKE.radius);
      };
      draw(0.35, 0xb070ff);
      this.tweens.addCounter({ from: 0.35, to: 0.9, duration: warning, onUpdate: (t) => ring.active && draw(t.getValue() ?? 0.5, 0xb070ff) });
      this.time.delayedCall(warning, () => {
        if (!ring.active) return;
        ring.clear();
        ring.fillStyle(0xffffff, 0.9).fillCircle(spot.x, spot.y, STRIKE.radius + 4);
        ring.fillStyle(0xfff06a, 0.9).fillRect(spot.x - 2, spot.y - 90, 4, 90);
        this.time.delayedCall(140, () => ring.destroy());
        if (this.ended || !this.player?.active) return;
        this.cameras.main.shake(110, 0.003);
        if (strikeHits(spot, this.player)) this.player.takeDamage(STRIKE.damage, this.time.now);
      });
    }
  }

  /** The blue pad on the plaza: stand still on it and the ring fills; full, and the knight flies out. */
  private updateFlightPad(time: number, delta: number) {
    if (!this.padGfx) return;
    const at = padCenterFor(this.terrain.spawn);
    const standing = onPad(this.player, at) && this.player.active;
    const before = this.padCharge;
    this.padCharge = stepPadCharge(this.padCharge, standing, delta);
    if (standing && before === 0 && time - this.padHinted > 8000) {
      this.padHinted = time;
      this.hud.showMessage('Stay on the pad to fly out.\nThe run ends.', 2400);
    }
    drawFlightPad(this.padGfx, at.x, at.y, PAD_SIZE, time, this.padCharge);
    if (this.padCharge > 0) {
      // the ring: a bar above the pad that fills
      this.padGfx.fillStyle(0x14121f, 0.85).fillRect(at.x - 13, at.y - 24, 26, 6);
      this.padGfx.fillStyle(0xffffff, 1).fillRect(at.x - 12, at.y - 23, Math.round(24 * this.padCharge), 4);
    }
    if (this.padCharge >= 1) this.flyOut();
  }

  /** Leave the run by air: it ends as a retreat (not a win), the knight's HP carries home, and the flight map opens here. */
  private flyOut() {
    if (this.tutorial || this.ended) return;
    this.saveHero();
    this.ended = true;
    this.userPaused = false;
    closePauseMenu();
    this.closeBagNow();
    if (this.sys.isPaused()) this.sys.resume();
    audio.setMuffled(false);
    audio.play('confirm');
    this.paused = true;
    this.physics.pause();
    this.bossSummonEvent?.remove(false);
    const town = loadGame().town;
    const max = townMaxHp(town.characterId, town.armorId);
    const ratio = this.player.maxHp > 0 ? Math.max(0, this.player.hp) / this.player.maxHp : 0;
    recordRunResult(
      { won: false, time: this.weather.elapsedSeconds, kills: this.player.kills, level: this.player.level },
      Math.max(1, Math.round(max * ratio))
    );
    this.tweens.add({ targets: this.player, y: this.player.y - 30, alpha: 0.2, duration: 500, ease: 'Sine.easeIn' });
    this.cameras.main.fadeOut(480, 255, 255, 255);
    this.time.delayedCall(560, () => this.scene.start('FlightScene', { from: this.runRegionId }));
  }

  private quitToTitle() {
    if (this.tutorial) return this.leaveTutorial(); // never touches the saved run
    this.saveHero();
    this.ended = true;
    clearRun();
    this.userPaused = false;
    closePauseMenu();
    audio.setMuffled(false);
    if (this.sys.isPaused()) this.sys.resume();
    this.paused = true;
    this.closeBagNow();
    this.scene.start('MenuScene');
  }

  private resetAndQuit() {
    this.ended = true;
    resetGameSave();
    audio.applyMuted(false);
    this.userPaused = false;
    closePauseMenu();
    audio.setMuffled(false);
    if (this.sys.isPaused()) this.sys.resume();
    this.paused = true;
    this.closeBagNow();
    this.scene.start('MenuScene');
  }

  /** Write the in-progress run. No-op once the run has ended or been abandoned. */
  checkpoint() {
    this.saveHero();
    if (this.tutorial || this.ended || this.level === 'underground' || !this.player?.active || !this.weather) return;
    saveRun(this.captureRun());
  }

  /** Keep the knight's growth (level, XP, spent points) with the profile: it outlasts the fight, a defeat and a flight. */
  private saveHero() {
    if (this.tutorial || !this.player) return;
    const hero = this.player.toHero();
    const town = loadGame().town;
    const same = town.hero.level === hero.level && town.hero.xp === hero.xp && JSON.stringify(town.hero.alloc) === JSON.stringify(hero.alloc);
    if (!same) writeProfile({ ...town, hero });
  }

  private captureRun() {
    this.saveHero();
    return {
      characterId: this.runCharacterId,
      regionId: this.runRegionId,
      weatherLabel: this.runWeatherLabel,
      weatherCondition: this.runWeatherCondition,
      weatherTint: this.runWeatherTint,
      startFrontIndex: this.runStartFront,
      elapsedSeconds: this.weather.elapsedSeconds,
      bossHp: this.boss?.active ? this.boss.hp : null,
      pendingLevelUps: 0,
      mapSeed: this.mapSeed,
      ...(this.poiDirector && this.poiDirector.used.size > 0 ? { usedPois: [...this.poiDirector.used] } : {}),
      player: this.player.toSnapshot(),
    };
  }

  private endRun(won: boolean) {
    if (this.tutorial) return; // the tutorial cannot be lost, and records nothing
    if (this.ended) return;
    this.saveHero();
    this.ended = true;
    this.userPaused = false;
    closePauseMenu();
    this.closeBagNow();
    if (this.sys.isPaused()) this.sys.resume();
    audio.setMuffled(false);
    this.paused = true;
    this.physics.pause();
    this.bossSummonEvent?.remove(false);
    const data = {
      won,
      time: this.weather.elapsedSeconds,
      kills: this.player.kills,
      level: this.player.level,
    };
    const town = loadGame().town;
    const max = townMaxHp(town.characterId, town.armorId);
    const ratio = this.player.maxHp > 0 ? Math.max(0, this.player.hp) / this.player.maxHp : 0;
    const townHp = won ? Math.max(1, Math.round(max * ratio)) : Math.max(1, Math.round(max * DEFEAT_HP_FRACTION));
    recordRunResult(data, townHp);
    // Story mode: a win in the right city recovers a shard; a win at the Eye ends the story.
    const outcome = storyRunEnded(loadStory(), this.region.id, won);
    if (outcome.state !== loadStory()) writeStory(outcome.state);
    this.time.delayedCall(400, () => this.scene.start('GameOverScene', { ...data, drips: this.runDrips, story: outcome.messages }));
  }

  /** The charms the knight owns and wears, as the town profile keeps them (that is where they live for good). */
  private townCharms(): CharmBox {
    const t = loadGame().town;
    return { owned: t.charms, worn: t.worn };
  }

  /** Make the knight wear what the profile says (after a find, a purchase or a swap). */
  private syncCharms() {
    this.player.setCharms(fit(this.townCharms(), charmSlots(this.player.level)));
  }

  private closeBagNow() {
    this.bagMenu?.hide();
    this.bagMenu = null;
  }

  private bagHost(): BagHost {
    return {
      items: () => {
        const profile = loadGame().town;
        return Object.keys(profile.bag)
          .filter((id) => (profile.bag[id] ?? 0) > 0 && consumable(id))
          .map((id) => ({ id, label: `${consumable(id)!.name} x${profile.bag[id]}` }));
      },
      useItem: (id) => this.useBagItem(id),
      stats: () => ({ points: this.player.statPoints, alloc: this.player.statAlloc }),
      spend: (id, dir) => this.spendPoint(id as StatId, dir),
      charms: () => ({ box: this.townCharms(), level: this.player.level }),
      toggleCharm: (id) => this.toggleWornCharm(id),
      map: () => ({ grid: this.terrain.field.currentGrid, stamp: this.minimapKey(), dots: this.mapDots(), player: { x: this.player.x, y: this.player.y } }),
      onClose: () => this.closeBag(),
    };
  }

  /** The Bag: ITEMS, MAP, STATS, CHARMS. It stops the game while it is open, and the knight chooses when. */
  private openBag(page: 'top' | 'items' | 'map' | 'stats' | 'charms' = 'top') {
    if (this.ended || this.userPaused || this.paused || this.bagMenu) return;
    this.bagMenu = new BagMenu(this, this.bagHost());
    this.paused = true;
    this.hud.setVisible(false);
    audio.setMuffled(true);
    this.tutorial?.note('bag');
    if (this.sys.isActive()) this.sys.pause();
    this.bagMenu.show(page);
  }

  /** Eat or drink something from the bag. A line back is a hint to show; null means it worked and the Bag closes. */
  private useBagItem(id: string): string | null {
    const item = consumable(id);
    const next = spendItem(loadGame().town, id);
    if (!item || !next) return 'None left.';
    const before = this.player.hp;
    if (item.fullHeal) this.player.hp = this.player.maxHp;
    else this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.heal);
    const healed = this.player.hp - before;
    if (healed === 0 && item.hasteMs === 0) return 'HP is full.';
    writeProfile(next);
    if (item.hasteMs > 0) this.player.applyHaste(item.hasteMs);
    this.time.delayedCall(0, () => {
      this.popup(this.player.x, this.player.y - 16, healed > 0 ? `+${healed}` : 'QUICK', '#70e090');
      audio.play(healed > 0 ? 'sunbeam' : 'confirm');
    });
    this.checkpoint();
    return null;
  }

  private spendPoint(id: StatId, dir: number): boolean {
    const state = { points: this.player.statPoints, alloc: this.player.statAlloc };
    const next = dir > 0 ? addPoint(state, id) : removePoint(state, id);
    if (!next) return false;
    this.player.setAllocation(next.alloc);
    this.checkpoint();
    return true;
  }

  /** Wear or take off an owned charm. A line back says why it could not be done; null means it was. */
  private toggleWornCharm(id: string): string | null {
    const profile = loadGame().town;
    const next = toggleCharm({ owned: profile.charms, worn: profile.worn }, id, charmSlots(this.player.level));
    if (!next) return 'No free slot.';
    writeProfile({ ...profile, charms: next.owned, worn: next.worn });
    this.syncCharms();
    this.checkpoint();
    return null;
  }

  private closeBag() {
    this.bagMenu?.hide();
    this.bagMenu = null;
    if (this.userPaused || this.ended) return;
    if (this.sys.isPaused()) this.sys.resume();
    this.input.keyboard?.resetKeys();
    replayHeldKeys();
    audio.setMuffled(false);
    this.hud.setVisible(true);
    this.paused = false;
  }

  // --- crashes ---

  /** A vehicle slammed into a wall, a building or a parked car: shake, sparks, a sound, and it is dazed. */
  private handleCrash = (enemy: Enemy) => {
    this.crashCount += 1;
    audio.play('crash');
    const boss = enemy === this.boss;
    this.cameras.main.shake(boss ? 220 : 120, boss ? 0.006 : 0.0025);
    this.popup(enemy.x, enemy.y - 14, 'CRASH!', '#ff9030');
    if (boss) this.hitStop(70);
    this.debris(enemy.x, enemy.y);
  };

  /** A burst of little pieces flying off a crash. */
  private debris(x: number, y: number) {
    const colors = [0xf8c820, 0xc0c0c8, 0x808090, 0xff7030, 0xffffff];
    for (let i = 0; i < 9; i++) {
      const bit = this.add.rectangle(Math.round(x), Math.round(y), 2, 2, colors[i % colors.length]).setDepth(41);
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
      const d = 14 + Math.random() * 16;
      this.tweens.add({
        targets: bit,
        x: Math.round(x + Math.cos(a) * d),
        y: Math.round(y + Math.sin(a) * d),
        alpha: 0,
        duration: 340 + Math.random() * 160,
        ease: 'Quad.easeOut',
        onComplete: () => bit.destroy(),
      });
    }
  }

  // --- terrain under foot ---

  /**
   * Every tenth of a second, look at the tile under the knight and every enemy: wading slows and
   * soaks (which also puts out a fire), ice makes them slide.
   */
  private updateTerrainEffects(delta: number) {
    this.terrainClock += delta;
    if (this.terrainClock < 100) return;
    this.terrainClock = 0;
    const field = this.terrain.field;
    const creatures: (Player | Enemy)[] = [this.player, ...this.getActiveEnemies()];
    for (const c of creatures) {
      const body = c.body as Phaser.Physics.Arcade.Body;
      const fx = field.effectsAt(body.center.x, body.center.y);
      // Vehicles are quick on streets and sluggish off them; everyone else ignores the road.
      c.terrainSpeed = fx.slow * (c instanceof EnemyBase ? c.roadSpeed(field.isRoadAt(body.center.x, body.center.y)) : 1);
      c.grip = fx.grip;
      if (fx.wet) {
        const result = c.applyStatus('wet', 2400);
        if (result.reaction === 'steam') {
          audio.play('steam');
          this.popup(c.x, c.y - 10, 'STEAM', '#a8a8b8');
        }
      }
    }
    const wet = field.effectsAt((this.player.body as Phaser.Physics.Arcade.Body).center.x, (this.player.body as Phaser.Physics.Arcade.Body).center.y).wet;
    if (wet && !this.wasWet) audio.play('splash');
    this.wasWet = wet;
  }

  // --- tutorial ---

  private startTutorial() {
    const touch = () => isTouchControlsActive();
    this.tutorial = new TutorialDirector({
      player: this.player,
      isTouch: touch,
      prompt: (headline, lines) => this.hud.setPrompt(headline, lines),
      badge: (text) => (this.tutorialBadge = text),
      popup: (x, y, text, color) => this.popup(x, y, text, color),
      enemies: () => this.getActiveEnemies(),
      isOpen: (x, y) => this.isOpen(x, y),
      clearEnemies: () => {
        for (const enemy of [...this.enemyGroup.getChildren()]) enemy.destroy();
        for (const proj of [...this.projectileGroup.getChildren()]) proj.destroy();
      },
      spawnDummy: (x, y) => {
        const p = this.openSpot(x, y);
        return this.spawnEnemyAt('trainingDummy', p.x, p.y);
      },
      spawnCab: (x, y) => {
        const p = this.openSpot(x, y);
        return this.spawnEnemyAt('cabWraith', p.x, p.y);
      },
      spawnGems: (count) => {
        // Gems go where the knight can walk straight to them: every step of the way is open ground.
        const clear = (a: number, r: number) => {
          for (let d = 12; d <= r; d += 12) {
            if (!this.isOpen(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d)) return false;
          }
          return true;
        };
        for (let i = 0; i < count; i++) {
          const base = (i / count) * Math.PI * 2 + 0.6;
          let angle = base;
          for (let k = 0; k < 24; k++) {
            const a = base + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.26;
            if (clear(a, 44)) {
              angle = a;
              break;
            }
          }
          const p = this.openSpot(this.player.x + Math.cos(angle) * 44, this.player.y + Math.sin(angle) * 44);
          this.spawnXpGem(p.x, p.y, 4);
        }
      },
      gemsOnGround: () => this.gemGroup.getChildren().filter((g) => g.active).length,
      grantLevel: () => {
        const need = this.player.xpToNext - this.player.xp;
        if (need > 0) this.xpGrant += need;
      },
      lightning: () => this.hazards?.trigger('lightning', 0, 0),
      lightningActive: () => (this.hazards?.snapshot().zones.length ?? 0) > 0,
      healPlayer: () => {
        this.player.hp = this.player.maxHp;
      },
      finish: () => this.leaveTutorial(),
    });
    // Enter skips the step; Space / Enter / a tap confirms the ending.
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.tutorial?.stepId === 'done') this.tutorial.confirm();
      else this.tutorial?.skip();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tutorial?.confirm());
    this.input.on('pointerdown', () => this.tutorial?.confirm());
    this.tutorial.start();
  }

  /** Is this a spot a knight can stand on (not rock or water, with a little room around it)? */
  private isOpen(x: number, y: number): boolean {
    for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
      const tile = this.terrain.layer.getTileAtWorldXY(x + dx, y + dy);
      if (!tile || tile.collides) return false;
    }
    return true;
  }

  /** The requested spot if it is open ground, else the nearest open spot around it. */
  private openSpot(x: number, y: number): { x: number; y: number } {
    const cx = this.clampX(x);
    const cy = this.clampY(y);
    if (this.isOpen(cx, cy)) return { x: cx, y: cy };
    for (let r = 12; r <= 72; r += 12) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const px = this.clampX(cx + Math.cos(a) * r);
        const py = this.clampY(cy + Math.sin(a) * r);
        if (this.isOpen(px, py)) return { x: px, y: py };
      }
    }
    return { x: cx, y: cy };
  }

  private clampX(x: number): number {
    return Phaser.Math.Clamp(x, 24, WORLD.width - 24);
  }

  private clampY(y: number): number {
    return Phaser.Math.Clamp(y, 24, WORLD.height - 24);
  }

  /** Back to the title. Unlike quitting a real run, this never touches the saved run. */
  private leaveTutorial() {
    if (this.ended) return;
    this.ended = true;
    this.userPaused = false;
    closePauseMenu();
    audio.setMuffled(false);
    if (this.sys.isPaused()) this.sys.resume();
    this.paused = true;
    this.closeBagNow();
    this.scene.start('MenuScene');
  }

  // --- status effects and weather hazards ---

  private showWeatherHint() {
    if (this.ended || this.paused || !this.rule.hint) return;
    this.hud.showMessage(this.rule.hint);
  }

  /** Small rising label for reactions (SHOCK, SHATTER, STEAM...). */
  private popup(x: number, y: number, text: string, color: string) {
    const label = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: FONT, fontSize: '8px', color, stroke: '#101018', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(40);
    this.tweens.add({ targets: label, y: label.y - 12, alpha: 0, duration: 650, delay: 150, onComplete: () => label.destroy() });
  }

  /** Damage numbers: shorter-lived than reaction popups, and capped so a crowd cannot flood the screen. */
  private floatText(x: number, y: number, text: string, color: string) {
    if (this.floaters >= 18) return;
    this.floaters += 1;
    const label = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: FONT, fontSize: '8px', color, stroke: '#101018', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(39);
    this.tweens.add({
      targets: label,
      y: label.y - 14,
      alpha: 0,
      duration: 520,
      delay: 80,
      ease: 'Quad.easeOut',
      onComplete: () => {
        label.destroy();
        this.floaters -= 1;
      },
    });
  }

  /**
   * A brief freeze-frame on kills and hits taken: the physics world runs in
   * slow motion for a few frames. Rate limited so a crowd does not stutter.
   */
  private hitStop(ms: number) {
    if (this.hitStopMs > 0 || this.hitStopLockMs > 0) return;
    this.hitStopMs = ms;
    this.physics.world.timeScale = 6;
  }

  private tickHitStop(delta: number) {
    if (this.hitStopMs > 0) {
      this.hitStopMs -= Math.min(delta, 50);
      if (this.hitStopMs <= 0) {
        this.hitStopMs = 0;
        this.hitStopLockMs = 120;
        this.physics.world.timeScale = 1;
      }
    } else if (this.hitStopLockMs > 0) {
      this.hitStopLockMs = Math.max(0, this.hitStopLockMs - delta);
    }
  }

  private updateWeatherEffects(delta: number) {
    if (this.rule.wet) {
      // Rain keeps everyone soaked; re-apply once a second so it never runs out.
      this.wetClock += Math.min(delta, STATUS_TUNING.maxStepMs);
      if (this.wetClock >= 1000) {
        this.wetClock = 0;
        this.player.applyStatus('wet', STATUS_TUNING.wetMs);
        for (const enemy of this.getActiveEnemies()) enemy.applyStatus('wet', STATUS_TUNING.wetMs);
      }
    }
    if (!this.hazards) return;
    this.hazards.update(delta);
    const push = this.hazards.gustPush;
    if (push.x === 0 && push.y === 0) return;
    // A position nudge (like melee knockback): velocities are rewritten every
    // preUpdate, so adding to them here would be lost before physics runs.
    const dt = Math.min(delta, STATUS_TUNING.maxStepMs) / 1000;
    for (const obj of [this.player, ...this.getActiveEnemies()]) {
      obj.x += push.x * dt;
      obj.y += push.y * dt;
    }
  }

  // --- ambient weather ---

  private setupAmbientWeather(tint: number) {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, tint, 0.08)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0.5);

    const { width, height } = this.scale;
    for (let i = 0; i < 22; i++) {
      const drop = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        TEX.rain
      );
      drop.setScrollFactor(0).setDepth(1).setAlpha(0.65).setTint(tint);
      this.ambientDrops.push(drop);
    }
  }

  private updateAmbientWeather(delta: number) {
    const { width, height } = this.scale;
    for (const drop of this.ambientDrops) {
      drop.y += (110 * delta) / 1000;
      drop.x -= (40 * delta) / 1000;
      if (drop.y > height + 6 || drop.x < -4) {
        drop.y = -6;
        drop.x = Phaser.Math.Between(0, width + 40);
      }
    }
  }
}

function collectIntoTown(coins: number, item: string | null, slots: number): { storedItem: boolean; charm?: { id: string; rank: number; wornNow: boolean } } {
  const got = collect(loadGame().town, coins, item, slots);
  writeProfile(got.profile);
  return { storedItem: got.storedItem, charm: got.charm };
}
