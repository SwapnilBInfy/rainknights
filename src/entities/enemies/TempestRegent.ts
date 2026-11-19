import { Enemy } from './Enemy';
import { REGENT_PHASES, REGENT_STANDOFF, regentPhase } from '../../systems/regent';

/**
 * The finale's boss. It drifts after the knight, keeping a little distance, and every few seconds emits
 * `regentCast` so the scene can drop lightning (see systems/regent.ts for the rules). At each lower phase it
 * emits `bossRage`, which the scene answers with a shake and a message, and speeds up.
 */
export class TempestRegent extends Enemy {
  phase = 0;
  private castIn = 2200;
  /** The scene sets this from the run, so the cast schedule holds while the game is paused. */
  get speedMultiplier(): number {
    return REGENT_PHASES[this.phase].speed;
  }

  get debugPhase(): string {
    return `phase${this.phase + 1}`;
  }

  /** `raging` is true from the second phase, for the debug bridge. */
  get raging(): boolean {
    return this.phase >= 1;
  }

  behavior(_time: number, delta: number): void {
    const phase = regentPhase(this.hp, this.maxHp);
    if (phase > this.phase) {
      this.phase = phase;
      this.castIn = Math.min(this.castIn, 700); // a lower phase answers at once
      this.emit('bossRage', this);
    }
    const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (dist > REGENT_STANDOFF) this.scene.physics.moveToObject(this, this.target, this.stats.speed * this.speedMultiplier);
    else this.setVelocity(0, 0);
    this.castIn -= delta;
    if (this.castIn <= 0) {
      this.castIn = REGENT_PHASES[this.phase].castMs;
      this.emit('regentCast', this, REGENT_PHASES[this.phase].strikes);
    }
  }
}
