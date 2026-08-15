import { Enemy } from './Enemy';

/** Slow relentless chaser; its pull field and minion summons are driven by GameScene. */
export class TornadoBoss extends Enemy {
  behavior(): void {
    this.scene.physics.moveToObject(this, this.target, this.stats.speed);
  }
}
