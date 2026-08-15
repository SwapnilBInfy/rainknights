import Phaser from 'phaser';
import { Enemy } from './Enemy';

/** Wobbling chase with a wide erratic swing — used by Wind Wraith. */
export class ErraticEnemy extends Enemy {
  behavior(time: number): void {
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    const wobble = Math.sin(time * 0.004 + this.wobbleSeed) * 0.9;
    const angle = baseAngle + wobble;
    const speed = this.stats.speed;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }
}
