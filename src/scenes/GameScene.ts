import Phaser from 'phaser';
import { WORLD, PLAYER_BASE, AUTO_ATTACK, BOSS_SUMMONS, BOSS_SPAWN_DISTANCE, MAX_LIVING_ENEMIES, frontIndexAt } from '../config/constants';
import { MELEE, BEAM } from '../config/weapons';
import { beamKey, SPARK_KEY } from '../gfx/weapons';
import { TEX } from '../gfx/spriteDefs';
import { getCharacter } from '../config/characters';
import { getRegion, type RegionDef } from '../config/regions';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import type { Enemy } from '../entities/enemies/Enemy';
import { createEnemy } from '../entities/enemies/factory';
import { WeatherDirector, type WeatherHost } from '../systems/WeatherDirector';
import { HazardDirector, type HazardHost } from '../systems/HazardDirector';
import { TutorialDirector } from '../systems/TutorialDirector';
import type { TutorialStepId } from '../systems/tutorialSteps';
import { resolveHit, STATUS_TUNING, type DamageKind, type StatusId } from '../systems/status';
import { hazardsEnabled, ruleFor, type HazardKind, type WeatherRule } from '../config/weatherRules';
import { FONT } from '../ui/Window';
import { LevelUpSystem } from '../systems/LevelUpSystem';
import { applyFrostAura, applySunbeamPulse, applyStaticChain } from '../systems/PowerupSystem';
import { buildTerrain, randomSeed, seedFromUrl, type TerrainResult } from '../systems/Terrain';
import { Enemy as EnemyBase } from '../entities/enemies/Enemy';
import { floodRingsFor } from '../systems/terrainRules';
import { HUD } from '../ui/HUD';
import { audio } from '../audio/engine';
import { replayHeldKeys } from '../input/keys';
import { attackHint, beamKeyLabel, rollHint, rollKeyLabel } from '../input/prompts';
import { isTouchControlsActive, onTouchControlsChange } from '../input/touchControls';
import { bindGameplayPause, closePauseMenu, openPauseMenu } from '../ui/PauseOverlay';
import { clearRun, loadGame, recordRunResult, resetGameSave, saveRun, writeProfile } from '../save/save';
import { DEFEAT_HP_FRACTION, battleGear, collect, consumable, lootFor, spendItem, townMaxHp } from '../economy/economy';
import { ListMenu } from '../ui/listMenu';

interface RunBridge {
  /** Queue exactly enough XP for one level. Applied on the next scene update. */
  grantLevel: () => void;
  isScenePaused: () => boolean;
  elapsedSeconds: () => number;
  levelUpOpen: () => boolean;
  level: () => number;
  x: () => number;
  y: () => number;
  hp: () => number;
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
  /** Spawn an enemy a short way from the player (debug / tests). */
  spawnEnemy: (type: string, dx?: number, dy?: number) => void;
  /** Dodge roll state, for tests. */
  rolling: () => boolean;
  rollCharge: () => number;
  invulnerable: () => boolean;
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
  /** End the run as a defeat without a damage popup (debug / tests). */
  defeat: () => void;
  /** Drips in the purse right now. */
  coins: () => number;
  /** Vehicle crashes so far this run. */
  crashes: () => number;
  /** Teleport the knight onto a long street, `tilesBefore` tiles before it ends at a wall; returns whether one was found. */
  tpStreetEnd: (tilesBefore?: number) => boolean;
  /** How many living enemies are standing inside a solid tile (should always be 0). */
  enemiesInSolid: () => number;
  /** Teleport the knight onto a tile of this type that has `run` more of it to its right (debug / tests). */
  tpToTile: (type: number, run?: number, offCols?: number, offRows?: number) => boolean;
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
}

export class GameScene extends Phaser.Scene implements WeatherHost {
  player!: Player;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private projectileGroup!: Phaser.Physics.Arcade.Group;
  private gemGroup!: Phaser.Physics.Arcade.Group;
  private pickupGroup!: Phaser.Physics.Arcade.Group;
  private weather!: WeatherDirector;
  private hud!: HUD;
  private levelUpSystem!: LevelUpSystem;
  private boss: Enemy | null = null;
  private region!: RegionDef;
  private signatureSeen = false;
  private bossSummonEvent: Phaser.Time.TimerEvent | null = null;
  private paused = false;
  private levelUpOpen = false;
  private userPaused = false;
  private detachPause: (() => void) | null = null;
  private ambientDrops: Phaser.GameObjects.Image[] = [];
  private terrain!: TerrainResult;
  private lastFrontIndex = 0;
  private pendingLevelUps = 0;
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
  /** Test hook: throw on the next update. */
  private faultNextFrame = false;
  private terrainClock = 0;
  private wasWet = false;
  private runDrips = 0;
  private bagMenu: ListMenu | null = null;

  constructor() {
    super('GameScene');
  }

  create(data: GameSceneData = {}) {
    this.paused = false;
    this.levelUpOpen = false;
    this.userPaused = false;
    this.pendingLevelUps = 0;
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
    this.terrain = buildTerrain(this, region, { seed: this.mapSeed, condition: this.runWeatherCondition, frontIndex: startFront });

    this.player = new Player(this, this.terrain.spawn.x, this.terrain.spawn.y, character);
    if (resume) {
      this.player.applySnapshot(resume.player);
      // An older save has no map seed, so the map is new: make sure the knight is not inside a building.
      const spot = this.openSpot(this.player.x, this.player.y);
      this.player.setPosition(spot.x, spot.y);
    } else if (!data.tutorial) {
      const town = loadGame().town;
      this.player.applyBattleGear(battleGear(this.runCharacterId, town.armorId, town.hp));
    }
    this.player.onDied = () => this.endRun(false);
    this.player.onLevelUp = () => this.pauseForLevelUp();
    this.player.on('hurt', (amount: number) => {
      this.tutorial?.note('hurt');
      this.floatText(this.player.x, this.player.y - 12, `-${amount}`, '#f04040');
      this.hitStop(55);
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

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1);

    this.weather = new WeatherDirector(this, resume ? 0 : (data.startFrontIndex ?? 0), region.signature);
    if (resume) this.weather.restoreClock(resume.elapsedSeconds, resume.bossHp != null);

    audio.playMusic(region.music);
    audio.setAmbience(resume ? this.runWeatherCondition : (data.weatherCondition ?? null));
    this.hud = new HUD(this);
    this.levelUpSystem = new LevelUpSystem(this);
    this.detachTouch = onTouchControlsChange((touch) => {
      this.hud.setBeamKeyLabel(beamKeyLabel(touch));
      this.hud.setRollKeyLabel(rollKeyLabel(touch));
    });
    const bridge: RunBridge = {
      grantLevel: () => {
        if (this.ended || this.levelUpOpen || this.paused || this.userPaused) return;
        const need = this.player.xpToNext - this.player.xp;
        if (need > 0) this.xpGrant += need;
      },
      isScenePaused: () => this.sys.isPaused(),
      elapsedSeconds: () => this.weather.elapsedSeconds,
      levelUpOpen: () => this.levelUpOpen,
      level: () => this.player.level,
      x: () => this.player.x,
      y: () => this.player.y,
      hp: () => this.player.hp,
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
      spawnEnemy: (type, dx = 50, dy = 0) => {
        // (returns nothing: Playwright would try to serialize a returned Phaser sprite, which stalls the page)
        this.spawnEnemyAt(type, this.player.x + dx, this.player.y + dy);
      },
      rolling: () => this.player.isRolling,
      rollCharge: () => this.player.rollCharge(this.time.now),
      invulnerable: () => this.player.isInvulnerable(this.time.now),
      dodges: () => this.player.dodgeCount,
      alerts: () => this.getActiveEnemies().filter((e) => e.isTelegraphing).length,
      enemyPhases: () => this.getActiveEnemies().map((e) => e.debugPhase),
      enemyTypes: () => this.getActiveEnemies().map((e) => e.stats.key),
      spawnBoss: () => {
        if (!this.boss?.active) this.spawnBoss();
      },
      bossHpFraction: () => (this.boss?.active ? this.boss.hp / this.boss.maxHp : null),
      enemyDistances: () => this.getActiveEnemies().map((e) => Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y)),
      gems: () => this.gemGroup.getChildren().filter((g) => g.active).map((g) => [(g as Phaser.Physics.Arcade.Sprite).x, (g as Phaser.Physics.Arcade.Sprite).y]),
      killNearest: () => {
        const target = this.findNearestEnemy(9999);
        if (target) target.takeDamage(99999);
      },
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
      /** End the run the way a defeat does, without a damage number (debug / tests). */
      defeat: () => {
        if (this.ended || this.tutorial) return;
        this.player.hp = 0;
        this.player.onDied?.();
      },
      coins: () => loadGame().town.coins,
      spawnAround: (type, count) => {
        for (let i = 0; i < count; i++) this.spawnEnemyAroundPlayer(type);
      },
      givePowerup: (name, level) => {
        this.player.powerups[name] = level;
      },
      throwNextFrame: () => {
        this.faultNextFrame = true;
      },
      crashes: () => this.crashCount,
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
      tutorialStep: () => this.tutorial?.stepId ?? null,
      skipTutorialStep: () => this.tutorial?.skip(),
      bossRaging: () => !!(this.boss?.active && (this.boss as unknown as { raging?: boolean }).raging),
      setBossHp: (fraction) => {
        if (this.boss?.active) this.boss.hp = Math.max(1, Math.round(this.boss.maxHp * fraction));
      },
    };
    window.__rk = bridge;
    this.detachPause = bindGameplayPause({
      canPause: () => this.sys.isActive() && !this.ended && !this.levelUpOpen && !this.userPaused,
      isUserPaused: () => this.userPaused,
      isLevelUp: () => this.levelUpOpen,
      isEnded: () => this.ended,
      pause: () => this.enterUserPause(),
      resume: () => this.resumeFromUserPause(),
      quit: () => this.quitToTitle(),
      resetSave: () => this.resetAndQuit(),
      quitQuestion: data.tutorial ? 'Leave tutorial?' : undefined,
    });
    this.hud.setWeatherCondition(data.tutorial ? 'tutorial' : this.runWeatherCondition, data.tutorial ? 'Tutorial' : this.runWeatherLabel);
    this.lastFrontIndex = this.weather.currentFrontIndex;
    if (resume && resume.pendingLevelUps > 0) {
      this.pendingLevelUps = resume.pendingLevelUps;
      this.time.delayedCall(0, () => {
        if (!this.ended && this.pendingLevelUps > 0 && !this.levelUpOpen) this.showLevelUpMenu();
      });
    } else if (!data.tutorial) {
      this.time.delayedCall(3000, () => this.showAttackHint());
      this.time.delayedCall(10000, () => this.showRollHint());
    }
    if (data.tutorial) {
      // The tutorial panel replaces the usual run intro and hints.
    } else if (resume) {
      this.hud.showMessage(`${region.name}.\nThe ${this.weather.frontName} resumes.`);
    } else {
      this.hud.showMessage(`${region.name}: ${data.weatherLabel ?? 'unknown'}.\nThe ${this.weather.frontName} begins!`);
    }
    if (resume?.bossHp != null) this.spawnBoss(resume.bossHp);

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
    } else if (hazardsEnabled() && this.rule.hazards.length > 0) {
      this.hazards = new HazardDirector(hazardHost, this.rule);
    }
    if (!data.tutorial && this.rule.terrainHint && !(resume && resume.pendingLevelUps > 0)) {
      this.time.delayedCall(14000, () => {
        if (this.ended || this.paused || !this.rule.terrainHint) return;
        this.hud.showMessage(this.rule.terrainHint);
        const app = document.getElementById('app');
        if (app) app.dataset.terrainHint = this.rule.terrainHint;
      });
    }
    if (!data.tutorial && this.rule.hint && !(resume && resume.pendingLevelUps > 0)) {
      this.time.delayedCall(6000, () => this.showWeatherHint());
    }
    this.checkpoint();
    this.input.keyboard?.on('keydown-I', (event: KeyboardEvent) => {
      if (!event.repeat) this.openBag();
    });

    this.events.once('shutdown', () => {
      this.bagMenu?.hide();
      this.bagMenu = null;
      this.detachPause?.();
      this.detachPause = null;
      this.detachTouch?.();
      this.detachTouch = null;
      if (window.__rk === bridge) delete window.__rk;
      this.hazards?.destroy();
      this.hazards = null;
      this.hud.destroy();
      this.levelUpSystem.close();
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
    if (!this.tutorial) this.weather.update(delta); // the tutorial has no storm clock
    this.updateAmbientWeather(delta);
    this.updateWeatherEffects(delta);
    this.updateTerrainEffects(delta);
    this.updateGems();
    this.updatePickups();
    applyFrostAura(this.player, this.getActiveEnemies());
    this.updatePull();
    this.handleManualAttacks(time);
    if (!this.tutorial) this.handleAttack(time); // the tutorial teaches the manual attacks
    this.tutorial?.update(delta);

    this.hud.update(this.player, this.weather.elapsedSeconds, this.tutorial ? this.tutorialBadge : this.weather.frontName, delta, this.player.beamCharge(time), this.player.rollCharge(time));
    this.hud.setStatuses(this.player.statuses.list());
    this.hud.setBoss(this.boss?.active ? this.boss.hp : null, this.boss?.maxHp ?? 1, this.boss?.stats.name.toUpperCase());
    if (this.weather.currentFrontIndex !== this.lastFrontIndex) {
      this.lastFrontIndex = this.weather.currentFrontIndex;
      const flooded = this.terrain.field.setFloodRings(floodRingsFor(this.runWeatherCondition, this.weather.currentFrontIndex)) > 0;
      this.hud.showMessage(flooded ? `The ${this.weather.frontName} is rolling in!\nThe streets are flooding!` : `The ${this.weather.frontName} is rolling in!`);
      if (flooded) audio.play('flood');
      audio.play('front');
      this.checkpoint();
    }
  }

  // --- WeatherHost ---

  spawnEnemyAroundPlayer(typeKey: string) {
    if (this.enemyGroup.countActive(true) >= MAX_LIVING_ENEMIES) return; // see MAX_LIVING_ENEMIES
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(130, 180);
    // On open ground: with city blocks and canals about, a random spot is often inside a building.
    let spot = this.openSpot(this.player.x + Math.cos(angle) * dist, this.player.y + Math.sin(angle) * dist);
    // Vehicles belong on streets: put them on the nearest road if there is one close by.
    if (typeKey === 'cabWraith') spot = this.terrain.field.roadSpotNear(spot.x, spot.y, 6) ?? spot;
    this.spawnEnemyAt(typeKey, spot.x, spot.y);
  }

  private spawnEnemyAt(typeKey: string, x: number, y: number): Enemy {
    const enemy = createEnemy(this, typeKey, x, y, this.player);
    enemy.terrain = this.terrain.field;
    enemy.on('crash', this.handleCrash);
    enemy.once('enemyDied', this.handleEnemyDeath);
    this.enemyGroup.add(enemy);
    if (this.rule.wet) enemy.applyStatus('wet', STATUS_TUNING.wetMs);
    if (!this.tutorial && !this.signatureSeen && typeKey === this.region.signature && this.region.signatureHint) {
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
    return enemy;
  }

  spawnBoss(remainingHp?: number) {
    const angle = Math.random() * Math.PI * 2;
    const dist = BOSS_SPAWN_DISTANCE[this.region.boss] ?? 170;
    let spot = this.openSpot(Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 50, WORLD.width - 50), Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 50, WORLD.height - 50));
    if (this.region.boss === 'phantomBus') spot = this.terrain.field.roadSpotNear(spot.x, spot.y, 8) ?? spot;
    const x = spot.x;
    const y = spot.y;
    audio.play('bossAppears');
    audio.playMusic('boss');
    const boss = createEnemy(this, this.region.boss, x, y, this.player);
    boss.terrain = this.terrain.field;
    boss.on('crash', this.handleCrash);
    boss.once('enemyDied', this.handleEnemyDeath);
    boss.on('bossRage', () => {
      audio.play('bossAppears');
      this.cameras.main.shake(260, 0.004);
      this.hud.showMessage(`The ${boss.stats.name} is enraged!\nIt calls for backup!`);
    });
    this.enemyGroup.add(boss);
    this.boss = boss;
    if (remainingHp != null) boss.hp = Math.min(boss.maxHp, remainingHp);
    else if (this.region.bossIntro) this.hud.showMessage(this.region.bossIntro);

    const summon = BOSS_SUMMONS[boss.stats.key];
    if (summon) {
      this.bossSummonEvent = this.time.addEvent({
        delay: summon.everyMs,
        loop: true,
        callback: () => {
          if (!this.boss?.active) return;
          for (let i = 0; i < summon.count; i++) this.spawnEnemyAroundPlayer(Phaser.Utils.Array.GetRandom(summon.types));
        },
      });
    }
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
    if (!enemy.active) return;
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
    const target = this.findNearestEnemy(this.player.attackRange);
    if (!target) return;
    this.player.lastAttackAt = time;
    this.fireProjectile(target);
  }

  private fireProjectile(target: Enemy) {
    const proj = new Projectile(this, this.player.x, this.player.y, TEX.projectile);
    this.add.existing(proj);
    this.physics.add.existing(proj);
    proj.setDepth(6);
    proj.damage = Math.max(1, Math.round(this.player.attackDamage * AUTO_ATTACK.damageMult));
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
    const damage = Math.round(p.attackDamage * stats.damageMult);
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

    const damage = Math.round(p.attackDamage * stats.damageMult);
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

  private findNearestEnemy(range: number): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = range;
    for (const enemy of this.getActiveEnemies()) {
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
    if (!this.boss || !this.boss.active || this.boss.stats.key !== 'tornadoBoss') return; // only the Tornado pulls
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
  }

  private spawnPickup(x: number, y: number, coins: number, itemId: string | null) {
    const drop = this.physics.add.sprite(x, y, itemId ? TEX.supply : TEX.coin).setDepth(3);
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
    const got = collectIntoTown(coins, item);
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
    if (item && got.storedItem) {
      audio.play('gem');
      this.popup(drop.x, drop.y - 12, consumable(item)?.short ?? 'ITEM', '#f8f8f8');
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

  private pauseForLevelUp() {
    this.pendingLevelUps += 1;
    if (this.paused) return; // a menu is already open — this level is queued behind it
    this.showLevelUpMenu();
  }

  private showLevelUpMenu() {
    this.levelUpOpen = true;
    this.paused = true;
    this.hud.setVisible(false);
    audio.play('levelUp');
    audio.setMuffled(true);
    // If several levels were gained at once, show each level's menu in turn.
    const level = this.player.level - (this.pendingLevelUps - 1);
    this.checkpoint();
    this.levelUpSystem.presentChoices(this.player, level, () => {
      this.pendingLevelUps -= 1;
      this.tutorial?.note('powerup');
      this.checkpoint();
      if (this.pendingLevelUps > 0) return this.showLevelUpMenu();
      this.levelUpOpen = false;
      if (this.sys.isPaused()) this.sys.resume();
      this.input.keyboard?.resetKeys();
      replayHeldKeys();
      this.hud.setVisible(true);
      audio.setMuffled(false);
      this.paused = false;
    });
    // Same full-scene pause as Esc/Start. Enemy AI and auras run in preUpdate,
    // and the storm clock lives in this scene's update — physics.pause() left
    // both of those running. Phaser drops the scene's own input while paused,
    // so the menu listens on window (see LevelUpSystem).
    if (this.sys.isActive()) this.sys.pause();
  }

  private enterUserPause() {
    if (!this.sys.isActive() || this.ended || this.levelUpOpen || this.userPaused) return;
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
    if (this.pendingLevelUps > 0 && !this.ended) {
      this.showLevelUpMenu();
      return;
    }
    audio.setMuffled(false);
    this.hud.setVisible(true);
    this.paused = false;
  }

  private quitToTitle() {
    if (this.tutorial) return this.leaveTutorial(); // never touches the saved run
    this.ended = true;
    clearRun();
    this.userPaused = false;
    this.levelUpOpen = false;
    closePauseMenu();
    audio.setMuffled(false);
    if (this.sys.isPaused()) this.sys.resume();
    this.paused = true;
    this.levelUpSystem.close();
    this.scene.start('MenuScene');
  }

  private resetAndQuit() {
    this.ended = true;
    resetGameSave();
    audio.applyMuted(false);
    this.userPaused = false;
    this.levelUpOpen = false;
    closePauseMenu();
    audio.setMuffled(false);
    if (this.sys.isPaused()) this.sys.resume();
    this.paused = true;
    this.levelUpSystem.close();
    this.scene.start('MenuScene');
  }

  /** Write the in-progress run. No-op once the run has ended or been abandoned. */
  checkpoint() {
    if (this.tutorial || this.ended || !this.player?.active || !this.weather) return;
    saveRun(this.captureRun());
  }

  private captureRun() {
    return {
      characterId: this.runCharacterId,
      regionId: this.runRegionId,
      weatherLabel: this.runWeatherLabel,
      weatherCondition: this.runWeatherCondition,
      weatherTint: this.runWeatherTint,
      startFrontIndex: this.runStartFront,
      elapsedSeconds: this.weather.elapsedSeconds,
      bossHp: this.boss?.active ? this.boss.hp : null,
      pendingLevelUps: this.pendingLevelUps,
      mapSeed: this.mapSeed,
      player: this.player.toSnapshot(),
    };
  }

  private endRun(won: boolean) {
    if (this.tutorial) return; // the tutorial cannot be lost, and records nothing
    if (this.ended) return; // (a level-up menu being open must not block the ending)
    this.ended = true;
    this.levelUpOpen = false;
    this.userPaused = false;
    closePauseMenu();
    this.levelUpSystem.close();
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
    this.time.delayedCall(400, () => this.scene.start('GameOverScene', { ...data, drips: this.runDrips }));
  }

  private openBag() {
    if (this.tutorial || this.ended || this.levelUpOpen || this.userPaused || this.paused || this.bagMenu) return;
    const profile = loadGame().town;
    const rows = Object.keys(profile.bag)
      .filter((id) => (profile.bag[id] ?? 0) > 0 && consumable(id))
      .map((id) => ({ id, label: `${consumable(id)!.name} x${profile.bag[id]}` }));
    if (rows.length === 0) {
      this.popup(this.player.x, this.player.y - 14, 'BAG EMPTY', '#f8f8f8');
      return;
    }
    rows.push({ id: 'close', label: 'CLOSE' });
    this.bagMenu = new ListMenu(this);
    this.paused = true;
    this.hud.setVisible(false);
    audio.setMuffled(true);
    if (this.sys.isActive()) this.sys.pause();
    this.bagMenu.show({
      title: 'BAG',
      rows,
      hint: 'Use one.',
      onPick: (id) => this.pickBag(id),
      onClose: () => this.closeBag(),
    });
  }

  private pickBag(id: string) {
    if (id === 'close') {
      this.closeBag();
      return;
    }
    const item = consumable(id);
    const next = spendItem(loadGame().town, id);
    if (!item || !next) {
      this.bagMenu?.setHint('None left.');
      return;
    }
    const before = this.player.hp;
    if (item.fullHeal) this.player.hp = this.player.maxHp;
    else this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.heal);
    const healed = this.player.hp - before;
    if (healed === 0 && item.hasteMs === 0) {
      this.bagMenu?.setHint('HP is full.');
      return;
    }
    writeProfile(next);
    if (item.hasteMs > 0) this.player.applyHaste(item.hasteMs);
    this.closeBag();
    this.popup(this.player.x, this.player.y - 16, healed > 0 ? `+${healed}` : 'QUICK', '#70e090');
    audio.play(healed > 0 ? 'sunbeam' : 'confirm');
    this.checkpoint();
  }

  private closeBag() {
    this.bagMenu?.hide();
    this.bagMenu = null;
    if (this.levelUpOpen || this.userPaused || this.ended) return;
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
    this.levelUpOpen = false;
    closePauseMenu();
    audio.setMuffled(false);
    if (this.sys.isPaused()) this.sys.resume();
    this.paused = true;
    this.levelUpSystem.close();
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

function collectIntoTown(coins: number, item: string | null): { storedItem: boolean } {
  const got = collect(loadGame().town, coins, item);
  writeProfile(got.profile);
  return { storedItem: got.storedItem };
}
