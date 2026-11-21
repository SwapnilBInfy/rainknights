/**
 * The optional tutorial, as plain data. A step has a title, up to two lines of
 * instruction (27 characters each, so they fit the prompt panel) and a
 * predicate over `TutorialState`, the counters the scene fills in as the
 * player does things. `TutorialRunner` walks the steps. No Phaser here, so it
 * is unit-tested.
 */

export interface TutorialState {
  /** Pixels walked. */
  movedPx: number;
  /** Sword/hammer/dagger hits landed. */
  swingHits: number;
  /** Beam hits landed (a piercing beam can score several at once). */
  beamHits: number;
  gems: number;
  bagOpened: boolean;
  /** A Cab Wraith charged and the player was not touched. */
  dodgedCharge: boolean;
  cabKilled: boolean;
  /** Hits on a Wet foe that triggered the shock bonus. */
  wetShocks: boolean;
  /** A lightning strike landed without hitting the player. */
  strikeAvoided: boolean;
  /** The player confirmed the ending. */
  finished: boolean;
}

export function freshState(): TutorialState {
  return {
    movedPx: 0,
    swingHits: 0,
    beamHits: 0,
    gems: 0,
    bagOpened: false,
    dodgedCharge: false,
    cabKilled: false,
    wetShocks: false,
    strikeAvoided: false,
    finished: false,
  };
}

/** What each control is called on this device (keyboard vs touch). */
export interface ControlNames {
  move: string;
  swing: string;
  beam: string;
  roll: string;
  pause: string;
  bag: string;
}

export const KEYBOARD_CONTROLS: ControlNames = { move: 'WASD', swing: 'SPACE', beam: 'J', roll: 'SHIFT or K', pause: 'ESC', bag: 'I' };
export const TOUCH_CONTROLS: ControlNames = { move: 'the STICK', swing: 'A', beam: 'B', roll: 'R', pause: 'START', bag: 'BAG' };

export type TutorialStepId =
  | 'move'
  | 'swing'
  | 'beam'
  | 'gems'
  | 'levelup'
  | 'dodge'
  | 'strike'
  | 'wet'
  | 'storm'
  | 'done';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  /** At most two lines of 27 characters. */
  lines: (c: ControlNames) => [string, string];
  done: (s: TutorialState) => boolean;
}

export const MAX_LINE = 27;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'move',
    title: 'MOVE',
    lines: (c) => [`Walk around with ${c.move}.`, 'Go on, take a few steps!'],
    done: (s) => s.movedPx >= 60,
  },
  {
    id: 'swing',
    title: 'SWING',
    lines: (c) => [`Press ${c.swing} to swing at`, 'the training dummy!'],
    done: (s) => s.swingHits >= 2,
  },
  {
    id: 'beam',
    title: 'ENERGY BEAM',
    lines: (c) => [`Press ${c.beam} for a beam that`, 'pierces everything in line!'],
    done: (s) => s.beamHits >= 2,
  },
  {
    id: 'gems',
    title: 'XP GEMS',
    lines: () => ['Defeated foes drop gems.', 'Walk over them to collect!'],
    done: (s) => s.gems >= 3,
  },
  {
    id: 'levelup',
    title: 'LEVEL UP',
    lines: (c) => ['Each level: 3 stat points.', `Press ${c.bag} for the Bag.`],
    done: (s) => s.bagOpened,
  },
  {
    id: 'dodge',
    title: 'DODGE ROLL',
    lines: (c) => ['A Cab Wraith charges! Press', `${c.roll} to roll across.`],
    done: (s) => s.dodgedCharge,
  },
  {
    id: 'strike',
    title: 'STALL STRIKE',
    lines: () => ['After a charge it stalls.', 'Hit it then: +50% damage!'],
    done: (s) => s.cabKilled,
  },
  {
    id: 'wet',
    title: 'WET + SHOCK',
    lines: (c) => ['Rain makes foes WET. Beam', `(${c.beam}) a wet foe: SHOCK!`],
    done: (s) => s.wetShocks,
  },
  {
    id: 'storm',
    title: 'LIGHTNING',
    lines: () => ['A circle blinks where the', 'bolt lands. Leave it!'],
    done: (s) => s.strikeAvoided,
  },
  {
    id: 'done',
    title: 'ALL SET!',
    lines: (c) => [`You are ready! Pause: ${c.pause}`, `${c.swing}: back to the title`],
    done: (s) => s.finished,
  },
];

export type RunnerEvent =
  | { type: 'enter'; index: number; step: TutorialStep }
  | { type: 'complete'; index: number; step: TutorialStep; skipped: boolean }
  | { type: 'finished' };

/** How long a finished step lingers (so the player sees it worked) before the next begins. */
export const HOLD_MS = 1100;
/** A stuck player is moved on after this long on one step. */
export const STUCK_MS = 75_000;
const MAX_STEP_MS = 100;

export class TutorialRunner {
  index = 0;
  readonly state: TutorialState = freshState();
  private hold = 0;
  private holding = false;
  private inStepMs = 0;
  private over = false;

  constructor(readonly steps: readonly TutorialStep[] = TUTORIAL_STEPS) {}

  get step(): TutorialStep {
    return this.steps[Math.min(this.index, this.steps.length - 1)];
  }

  get isFinished(): boolean {
    return this.over;
  }

  /** True while a completed step is lingering before the next one. */
  get isHolding(): boolean {
    return this.holding;
  }

  /** Call once on start to get the first `enter` event. */
  begin(): RunnerEvent[] {
    return [{ type: 'enter', index: 0, step: this.steps[0] }];
  }

  /** Skip the current step (Enter on a keyboard). Not allowed on the last step: it ends the tutorial. */
  skip(): RunnerEvent[] {
    if (this.over || this.holding || this.index >= this.steps.length - 1) return [];
    return this.advance(true);
  }

  update(deltaMs: number): RunnerEvent[] {
    if (this.over) return [];
    const dt = Math.min(Math.max(deltaMs, 0), MAX_STEP_MS);
    const last = this.index >= this.steps.length - 1;

    if (this.holding) {
      this.hold -= dt;
      if (this.hold <= 0) return this.advance(false);
      return [];
    }

    this.inStepMs += dt;
    if (this.step.done(this.state)) {
      if (last) {
        this.over = true;
        return [{ type: 'complete', index: this.index, step: this.step, skipped: false }, { type: 'finished' }];
      }
      this.holding = true;
      this.hold = HOLD_MS;
      return [{ type: 'complete', index: this.index, step: this.step, skipped: false }];
    }
    if (!last && this.inStepMs >= STUCK_MS) return this.advance(true);
    return [];
  }

  private advance(skipped: boolean): RunnerEvent[] {
    const events: RunnerEvent[] = [];
    if (skipped) events.push({ type: 'complete', index: this.index, step: this.step, skipped: true });
    this.holding = false;
    this.inStepMs = 0;
    this.index += 1;
    events.push({ type: 'enter', index: this.index, step: this.step });
    return events;
  }
}
