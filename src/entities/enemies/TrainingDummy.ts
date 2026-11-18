import Phaser from 'phaser';
import { Enemy } from './Enemy';
import type { EnemyStats } from '../../config/constants';

/** A straw dummy that stands still and never hurts you. Used by the tutorial. */
export class TrainingDummy extends Enemy {
  constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats, target: Phaser.Physics.Arcade.Sprite) {
    super(scene, x, y, stats, target);
    this.bobs = false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(6, this.width / 2 - 6, this.height - 18);
    body.setImmovable(true);
  }

  get contactDamage(): number {
    return 0;
  }

  get debugPhase(): string {
    return 'dummy';
  }

  behavior(): void {
    this.setVelocity(0, 0);
  }
}
