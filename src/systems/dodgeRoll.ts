/**
 * Dodge roll timing. Plain data + math (no Phaser) so the rules can be
 * unit-tested. Times are the scene clock in milliseconds, the same clock
 * the player's other cooldowns use.
 */

export const ROLL = {
  durationMs: 220,
  /** Roll speed in px/s (walking is 80). */
  speed: 205,
  cooldownMs: 850,
  /** Untouchable a touch longer than the visible roll, so it feels fair. */
  invulnMs: 260,
  /** A press this soon before the roll is ready is remembered. */
  bufferMs: 150,
  ghostEveryMs: 45,
} as const;

export class DodgeRoll {
  private startedAt = -Infinity;
  private readyAt = 0;
  /** Multiplies the recharge (the Speed stat shortens it). */
  cooldownScale = 1;
  private lastCooldown: number = ROLL.cooldownMs;
  /** Unit vector of the current / last roll. */
  readonly dir = { x: 0, y: 1 };

  canStart(time: number): boolean {
    return time >= this.readyAt && !this.isActive(time);
  }

  /** Begin a roll. `dx, dy` need not be normalised; (0, 0) rolls down. */
  start(time: number, dx: number, dy: number): boolean {
    if (!this.canStart(time)) return false;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      this.dir.x = 0;
      this.dir.y = 1;
    } else {
      this.dir.x = dx / len;
      this.dir.y = dy / len;
    }
    this.startedAt = time;
    this.lastCooldown = ROLL.cooldownMs * this.cooldownScale;
    this.readyAt = time + this.lastCooldown;
    return true;
  }

  isActive(time: number): boolean {
    return time >= this.startedAt && time < this.startedAt + ROLL.durationMs;
  }

  /** 0..1 through the roll (1 once it is over). */
  progress(time: number): number {
    return Math.min(1, Math.max(0, (time - this.startedAt) / ROLL.durationMs));
  }

  /** True while the roll's invulnerability window is open. */
  isInvulnerable(time: number): boolean {
    return time >= this.startedAt && time < this.startedAt + ROLL.invulnMs;
  }

  /** 0..1 recharge, for the HUD gauge. */
  charge(time: number): number {
    if (time >= this.readyAt) return 1;
    return Math.min(1, Math.max(0, 1 - (this.readyAt - time) / this.lastCooldown));
  }

  reset() {
    this.startedAt = -Infinity;
    this.readyAt = 0;
  }
}
