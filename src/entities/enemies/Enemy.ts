import Phaser from 'phaser';
import type { EnemyStats } from '../../config/constants';

export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  stats: EnemyStats;
  hp: number;
  maxHp: number;
  target: Phaser.Physics.Arcade.Sprite;
  wobbleSeed = Math.random() * 1000;
  nextStateChangeAt = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    stats: EnemyStats,
    target: Phaser.Physics.Arcade.Sprite
  ) {
    super(scene, x, y, stats.key);
    this.stats = stats;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.target = target;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);
    this.setScale(stats.scale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle((this.width / 2) * 0.8);
    body.setOffset(this.width / 2 - body.radius, this.height / 2 - body.radius);
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.active) this.clearTint();
    });
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.emit('enemyDied', this);
    this.destroy();
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active || !this.target.active) return;
    this.behavior(time, delta);
  }

  abstract behavior(time: number, delta: number): void;
}
