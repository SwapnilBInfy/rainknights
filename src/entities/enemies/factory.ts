import Phaser from 'phaser';
import { ENEMY_STATS } from '../../config/constants';
import { ChaserEnemy } from './ChaserEnemy';
import { ErraticEnemy } from './ErraticEnemy';
import { DasherEnemy } from './DasherEnemy';
import { TornadoBoss } from './TornadoBoss';
import type { Enemy } from './Enemy';

export function createEnemy(
  scene: Phaser.Scene,
  typeKey: string,
  x: number,
  y: number,
  target: Phaser.Physics.Arcade.Sprite
): Enemy {
  const stats = ENEMY_STATS[typeKey];
  switch (typeKey) {
    case 'windWraith':
      return new ErraticEnemy(scene, x, y, stats, target);
    case 'lightningWisp':
      return new DasherEnemy(scene, x, y, stats, target);
    case 'tornadoBoss':
      return new TornadoBoss(scene, x, y, stats, target);
    default:
      return new ChaserEnemy(scene, x, y, stats, target);
  }
}
