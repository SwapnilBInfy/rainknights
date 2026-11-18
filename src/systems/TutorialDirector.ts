import type { Enemy } from '../entities/enemies/Enemy';
import type { Player } from '../entities/Player';
import { audio } from '../audio/engine';
import {
  KEYBOARD_CONTROLS,
  TOUCH_CONTROLS,
  TutorialRunner,
  type RunnerEvent,
  type TutorialState,
  type TutorialStep,
  type TutorialStepId,
} from './tutorialSteps';

/** The first dummy stands this close: comfortably inside sword reach even if the knight is still drifting. */
const SWING_DIST = 22;

/** What the director needs from the scene. */
export interface TutorialHost {
  player: Player;
  isTouch(): boolean;
  /** Headline over two lines of instruction; the HUD panel. */
  prompt(headline: string, lines: string[]): void;
  /** The top-right badge's second line. */
  badge(text: string): void;
  popup(x: number, y: number, text: string, color: string): void;
  enemies(): Enemy[];
  clearEnemies(): void;
  /** Is this open ground (not rock or water)? */
  isOpen(x: number, y: number): boolean;
  spawnDummy(x: number, y: number): Enemy;
  spawnCab(x: number, y: number): Enemy;
  spawnGems(count: number): void;
  grantLevel(): void;
  /** Drop a lightning strike on the player; `lightningActive` is true while one is blinking or landing. */
  lightning(): void;
  lightningActive(): boolean;
  healPlayer(): void;
  finish(): void;
}

/** What the scene tells the director happened. */
export type TutorialNote = 'meleeHit' | 'beamHit' | 'gem' | 'powerup' | 'wetShock' | 'hurt';

/**
 * Sets up and watches each tutorial step in the real game: dummies to hit,
 * gems to collect, a Cab Wraith to dodge, a wet foe to shock, a lightning
 * strike to leave. The rules (which step, when it is done) live in
 * `TutorialRunner`; this is the Phaser side.
 */
export class TutorialDirector {
  readonly runner = new TutorialRunner();
  private lastPos: { x: number; y: number } | null = null;
  private cab: Enemy | null = null;
  private dummy: Enemy | null = null;
  private lastCabPhase = '';
  private hurtThisAttempt = false;
  private strikeArmed = false;
  private strikeSeen = false;
  private strikeDelay = 0;
  private wetClock = 0;
  private doneArmedMs = 0;

  constructor(private readonly host: TutorialHost) {}

  get stepId(): TutorialStepId {
    return this.runner.step.id;
  }

  start() {
    this.handle(this.runner.begin());
  }

  note(kind: TutorialNote) {
    const s = this.runner.state;
    if (this.runner.isHolding || this.runner.isFinished) return;
    switch (kind) {
      case 'meleeHit':
        if (this.stepId === 'swing') s.swingHits += 1;
        break;
      case 'beamHit':
        if (this.stepId === 'beam') s.beamHits += 1;
        break;
      case 'gem':
        if (this.stepId === 'gems') s.gems += 1;
        break;
      case 'powerup':
        if (this.stepId === 'levelup') s.powerupPicked = true;
        break;
      case 'wetShock':
        if (this.stepId === 'wet') s.wetShocks = true;
        break;
      case 'hurt':
        this.hurtThisAttempt = true;
        break;
    }
  }

  /** Space / Enter / a tap on the last step. Ignored until the ending has been up for a moment. */
  confirm() {
    if (this.stepId === 'done' && this.doneArmedMs >= 700) this.runner.state.finished = true;
  }

  skip() {
    this.handle(this.runner.skip());
  }

  update(deltaMs: number) {
    const dt = Math.min(Math.max(deltaMs, 0), 100);
    const { player } = this.host;
    // The tutorial is for learning, not dying.
    if (player.hp < player.maxHp * 0.35) this.host.healPlayer();

    const s = this.runner.state;
    if (this.lastPos && !this.runner.isHolding && this.stepId === 'move') {
      s.movedPx += Math.hypot(player.x - this.lastPos.x, player.y - this.lastPos.y);
    }
    this.lastPos = { x: player.x, y: player.y };

    if (!this.runner.isHolding) this.watchStep(dt);
    this.handle(this.runner.update(dt));
  }

  // --- per-step behaviour ---

  private enter(step: TutorialStep) {
    const { x, y } = this.host.player;
    // The cab from the dodge step carries over to the strike step; every other step starts clean.
    if (step.id !== 'strike') {
      this.host.clearEnemies();
      this.cab = null;
    }
    this.dummy = null;
    this.strikeArmed = false;
    this.strikeSeen = false;
    this.hurtThisAttempt = false;
    this.lastCabPhase = '';
    this.doneArmedMs = 0;

    switch (step.id) {
      case 'swing':
        this.dummy = this.placeAhead([SWING_DIST])[0];
        break;
      case 'beam':
        // Two in a row along the way the knight faces: the beam goes through both.
        this.placeAhead([44, 78]);
        break;
      case 'gems':
        this.host.spawnGems(3);
        break;
      case 'levelup':
        this.host.grantLevel();
        break;
      case 'dodge':
        this.cab = this.host.spawnCab(x + 95, y - 25);
        break;
      case 'strike':
        // The same cab is still the target (a fresh one is called in if it is gone).
        break;
      case 'wet':
        this.dummy = this.placeAhead([46])[0];
        this.dummy.applyStatus('wet', 60_000);
        this.wetClock = 0;
        break;
      case 'storm':
        this.strikeDelay = 800; // read the prompt first
        break;
      default:
        break;
    }
  }

  /**
   * Put dummies at these distances in a straight line, in a direction that is clear
   * ground (the knight's own facing if possible), and turn the knight to face them.
   * Rocks and water are random, so the target is never left out of reach or behind them.
   */
  private placeAhead(distances: number[]): Enemy[] {
    const p = this.host.player;
    const base = Math.atan2(p.aim.y, p.aim.x);
    let chosen = base;
    for (const turn of [0, 0.78, -0.78, 1.57, -1.57, 2.36, -2.36, 3.14]) {
      const a = base + turn;
      if (distances.every((d) => this.host.isOpen(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d))) {
        chosen = a;
        break;
      }
    }
    const dx = Math.cos(chosen);
    const dy = Math.sin(chosen);
    p.faceToward(dx, dy);
    return distances.map((d) => this.host.spawnDummy(p.x + dx * d, p.y + dy * d));
  }

  private watchStep(dt: number) {
    const s = this.runner.state;
    switch (this.stepId) {
      case 'swing':
        if (!this.dummy?.active) this.dummy = this.placeAhead([SWING_DIST])[0];
        break;
      case 'beam':
        if (this.host.enemies().length < 2) {
          this.host.clearEnemies();
          this.placeAhead([44, 78]);
        }
        break;
      case 'dodge':
      case 'strike':
        this.watchCab(s);
        break;
      case 'wet': {
        if (!this.dummy?.active) {
          this.dummy = this.placeAhead([46])[0];
          this.dummy.applyStatus('wet', 60_000);
        }
        this.wetClock += dt;
        if (this.wetClock >= 1000) {
          this.wetClock = 0;
          this.dummy.applyStatus('wet', 60_000);
        }
        break;
      }
      case 'storm':
        this.watchStrike(s, dt);
        break;
      case 'done':
        this.doneArmedMs += dt;
        break;
      default:
        break;
    }
  }

  /** Dodge: a charge counts when the cab reaches its stall without touching the knight. Strike: kill it. */
  private watchCab(s: TutorialState) {
    if (this.stepId === 'dodge' && (!this.cab || !this.cab.active)) {
      this.cab = this.host.spawnCab(this.host.player.x + 95, this.host.player.y - 25);
      this.lastCabPhase = '';
    }
    if (this.stepId === 'strike' && (!this.cab || !this.cab.active)) {
      if (this.cab && !this.cab.active) s.cabKilled = true;
      else this.cab = this.host.spawnCab(this.host.player.x + 95, this.host.player.y - 25);
      return;
    }
    const cab = this.cab;
    if (!cab) return;
    const phase = cab.debugPhase;
    if (phase === this.lastCabPhase) return;
    if (phase === 'telegraph') this.hurtThisAttempt = false;
    if (this.stepId === 'dodge' && phase === 'stall') {
      if (this.hurtThisAttempt) {
        this.host.popup(this.host.player.x, this.host.player.y - 14, 'OUCH! AGAIN', '#f04040');
        this.host.healPlayer();
      } else {
        s.dodgedCharge = true;
      }
    }
    this.lastCabPhase = phase;
  }

  /** Storm: strike under the knight; it only counts if they got out of the circle in time. */
  private watchStrike(s: TutorialState, dt: number) {
    if (!this.strikeArmed) {
      this.strikeDelay -= dt;
      if (this.strikeDelay > 0) return;
      this.strikeArmed = true;
      this.strikeSeen = false;
      this.hurtThisAttempt = false;
      this.host.lightning();
      return;
    }
    if (this.host.lightningActive()) {
      this.strikeSeen = true;
      return;
    }
    if (!this.strikeSeen) return;
    // The strike has landed.
    if (this.hurtThisAttempt) {
      this.host.popup(this.host.player.x, this.host.player.y - 14, 'OUCH! AGAIN', '#f04040');
      this.host.healPlayer();
      this.strikeArmed = false;
      this.strikeDelay = 1500;
    } else {
      s.strikeAvoided = true;
    }
  }

  // --- runner events ---

  private handle(events: RunnerEvent[]) {
    for (const e of events) {
      if (e.type === 'enter') {
        const c = this.host.isTouch() ? TOUCH_CONTROLS : KEYBOARD_CONTROLS;
        const total = this.runner.steps.length;
        this.host.prompt(`${e.index + 1}/${total} ${e.step.title}`, [...e.step.lines(c)]);
        this.host.badge(this.host.isTouch() ? 'Quit: START' : 'ENTER: skip');
        this.enter(e.step);
      } else if (e.type === 'complete') {
        if (e.skipped) {
          this.host.popup(this.host.player.x, this.host.player.y - 14, 'SKIPPED', '#a8a8b8');
        } else if (e.step.id !== 'done') {
          audio.play('levelUp');
          this.host.popup(this.host.player.x, this.host.player.y - 14, 'GOOD!', '#58e078');
        }
      } else if (e.type === 'finished') {
        this.host.finish();
      }
    }
  }
}
