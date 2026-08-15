import Phaser from 'phaser';
import { generateAllTextures } from '../gfx/spriteDefs';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    generateAllTextures(this);
    this.scene.start('MenuScene');
  }
}
