/**
 * The wind-up / charge / stall loop behind the Cab Wraith and the Phantom Bus.
 * Plain data + math (no Phaser) so the rules can be unit-tested. Timers count
 * frame deltas, so the pause menu freezes them.
 *
 *   cruise    - drive at the player, steering
 *   telegraph - stop and show the lane (and a "!") so the player can react
 *   charge    - a straight, fast run along the locked lane
 *   stall     - engine cut out: slow and vulnerable, then back to cruise
 */

export type ChargePhase = 'cruise' | 'telegraph' | 'charge' | 'stall';

export interface ChargeTuning {
  /** Random cruise time range before the next wind-up (ms). */
  cruiseMs: readonly [number, number];
  telegraphMs: number;
  chargeMs: number;
  stallMs: number;
  /** Extra stall time when a charge ends by crashing into something (default 0). */
  crashStallMs?: number;
}

/** Frame deltas above this are treated as a hiccup (tab switch, resume). */
export const CHARGE_MAX_STEP_MS = 100;
/** A charge that hits a wall before this long keeps going this long, so it is not cut to a flicker. */
const MIN_CHARGE_MS = 120;

export class ChargeCycle {
  phase: ChargePhase = 'cruise';
  /** True if the last charge ended by hitting something rather than running its course. */
  crashed = false;
  private left: number;
  private inPhaseMs = 0;

  constructor(
    private tuning: ChargeTuning,
    private readonly rand: () => number = Math.random
  ) {
    this.left = this.rollCruise();
  }

  private rollCruise(): number {
    const [lo, hi] = this.tuning.cruiseMs;
    return lo + (hi - lo) * this.rand();
  }

  /** Swap in a faster tuning (a boss entering its rage phase). Takes effect next phase. */
  setTuning(tuning: ChargeTuning) {
    this.tuning = tuning;
  }

  /** Milliseconds left in the telegraph, or 0 when not telegraphing. */
  get telegraphLeftMs(): number {
    return this.phase === 'telegraph' ? Math.max(0, this.left) : 0;
  }

  /** 0..1 through the current phase. */
  get progress(): number {
    const total = { cruise: 1, telegraph: this.tuning.telegraphMs, charge: this.tuning.chargeMs, stall: this.tuning.stallMs }[this.phase];
    return Math.min(1, this.inPhaseMs / Math.max(1, total));
  }

  /**
   * Advance. `inRange` gates the wind-up (a cab far across the map keeps
   * cruising); `blocked` ends a charge early when it hits a wall.
   * Returns the new phase if it changed this step.
   */
  update(deltaMs: number, opts: { inRange: boolean; blocked?: boolean }): ChargePhase | null {
    const dt = Math.min(Math.max(deltaMs, 0), CHARGE_MAX_STEP_MS);
    this.left -= dt;
    this.inPhaseMs += dt;

    switch (this.phase) {
      case 'cruise':
        if (this.left <= 0 && opts.inRange) return this.go('telegraph', this.tuning.telegraphMs);
        if (this.left <= 0) this.left = 0; // wait for the target to come into range
        return null;
      case 'telegraph':
        if (this.left <= 0) {
          this.crashed = false;
          return this.go('charge', this.tuning.chargeMs);
        }
        return null;
      case 'charge':
        if (opts.blocked && this.inPhaseMs >= MIN_CHARGE_MS) {
          this.crashed = true;
          return this.go('stall', this.tuning.stallMs + (this.tuning.crashStallMs ?? 0));
        }
        if (this.left <= 0) {
          this.crashed = false;
          return this.go('stall', this.tuning.stallMs);
        }
        return null;
        return null;
      case 'stall':
        if (this.left <= 0) return this.go('cruise', this.rollCruise());
        return null;
    }
  }

  private go(phase: ChargePhase, ms: number): ChargePhase {
    this.phase = phase;
    this.left = ms;
    this.inPhaseMs = 0;
    return phase;
  }
}
