import Phaser from 'phaser';
import { drawWindow, FONT, textStyle } from '../ui/Window';
import { audio } from '../audio/engine';
import { loadGame } from '../save/save';

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes.toString().padStart(2, '0')}:${remain.toString().padStart(2, '0')}`;
}

interface GameOverData {
  won: boolean;
  time: number;
  kills: number;
  level: number;
  /** Drips picked up during this run. */
  drips?: number;
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
    this.add.text(50, 54, `TIME     ${m}:${s}`, textStyle());
    this.add.text(50, 68, `LEVEL    ${data.level}`, textStyle());
    this.add.text(50, 82, `DEFEATED ${data.kills}`, textStyle());
    this.add.text(50, 96, `DRIPS    ${data.drips ?? 0}`, textStyle('#c07800'));
    this.add.text(50, 110, `BEST     ${clock(loadGame().meta.bestTime)}`, textStyle('#686868'));

    const prompt = this.add.text(width / 2, 124, 'PRESS START', textStyle('#c07800')).setOrigin(0.5, 0);
    this.tweens.add({ targets: prompt, alpha: 0, duration: 500, yoyo: true, repeat: -1, hold: 200 });

    const restart = () => {
      audio.play('confirm');
      this.scene.start('TownScene');
    };
    this.input.once('pointerdown', restart);
    this.input.keyboard?.once('keydown-SPACE', restart);
    this.input.keyboard?.once('keydown-ENTER', restart);
  }
}
