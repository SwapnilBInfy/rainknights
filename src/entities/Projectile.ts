import Phaser from 'phaser';
import type { Enemy } from './enemies/Enemy';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage = 0;
  pierceLeft = 0;
  hitSet = new Set<Enemy>();
}
