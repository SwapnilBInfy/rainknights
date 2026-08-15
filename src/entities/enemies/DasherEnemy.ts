import Phaser from 'phaser';
import { Enemy } from './Enemy';

type DashState = 'approach' | 'telegraph' | 'dash' | 'recover';

/** Charges up, then bursts toward the target in a straight line — used by Lightning Wisp. */
export class DasherEnemy extends Enemy {
  private dashState: DashState = 'approach';
  private dashVector = new Phaser.Math.Vector2();

  behavior(time: number): void {
    if (this.nextStateChangeAt === 0) this.nextStateChangeAt = time + Phaser.Math.Between(500, 1200);

    switch (this.dashState) {
      case 'approach':
        this.scene.physics.moveToObject(this, this.target, this.stats.speed * 0.55);
        if (time >= this.nextStateChangeAt) {
          this.dashState = 'telegraph';
          this.nextStateChangeAt = time + 350;
          this.setVelocity(0, 0);
        }
        break;
      case 'telegraph':
        this.setTint(0xffffff);
        if (time >= this.nextStateChangeAt) {
          const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
          this.dashVector.setToPolar(angle, this.stats.speed * 3.2);
          this.clearTint();
          this.dashState = 'dash';
          this.nextStateChangeAt = time + 260;
        }
        break;
      case 'dash':
        this.setVelocity(this.dashVector.x, this.dashVector.y);
        if (time >= this.nextStateChangeAt) {
          this.dashState = 'recover';
          this.nextStateChangeAt = time + 500;
        }
        break;
      case 'recover':
        this.setVelocity(0, 0);
        if (time >= this.nextStateChangeAt) {
          this.dashState = 'approach';
          this.nextStateChangeAt = time + Phaser.Math.Between(500, 1200);
        }
        break;
    }
  }
}
