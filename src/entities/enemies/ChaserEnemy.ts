import { Enemy } from './Enemy';

/** Simple, relentless chase — used by Rain Imp, Hail Brute, Snow Golem. */
export class ChaserEnemy extends Enemy {
  behavior(): void {
    this.scene.physics.moveToObject(this, this.target, this.stats.speed);
  }
}
