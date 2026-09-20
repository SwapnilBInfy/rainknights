import Phaser from 'phaser';
import { drawWindow, FONT, textStyle } from '../ui/Window';
import { audio } from '../audio/engine';

interface GameOverData {
  won: boolean;
  time: number;
  kills: number;
  level: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: GameOverData) {
    const { width } = this.scale;
    audio.setAmbience(null);
    audio.playMusic(data.won ? 'victory' : 'gameover');
    this.cameras.main.setBackgroundColor('#181c38');
    drawWindow(this, 30, 16, 180, 128);

    const title = data.won ? 'VICTORY!' : 'GAME OVER';
    this.add
      .text(width / 2, 28, title, { fontFamily: FONT, fontSize: '16px', color: data.won ? '#28a038' : '#d03028' })
      .setOrigin(0.5, 0);

    const m = Math.floor(data.time / 60).toString().padStart(2, '0');
    const s = Math.floor(data.time % 60).toString().padStart(2, '0');
    this.add.text(50, 60, `TIME     ${m}:${s}`, textStyle());
    this.add.text(50, 76, `LEVEL    ${data.level}`, textStyle());
    this.add.text(50, 92, `DEFEATED ${data.kills}`, textStyle());

    const prompt = this.add.text(width / 2, 120, 'PRESS START', textStyle('#c07800')).setOrigin(0.5, 0);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 500, yoyo: true, repeat: -1, hold: 200 });

    const restart = () => {
      audio.play('confirm');
      this.scene.start('CharacterSelectScene');
    };
    this.input.once('pointerdown', restart);
    this.input.keyboard?.once('keydown-SPACE', restart);
    this.input.keyboard?.once('keydown-ENTER', restart);
  }
}
