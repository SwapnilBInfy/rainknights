import Phaser from 'phaser';

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
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    const title = data.won ? 'VICTORY' : 'GAME OVER';
    const color = data.won ? '#4be05a' : '#ff5f5f';

    this.add
      .text(width / 2, height * 0.3, title, {
        fontFamily: 'Courier New, monospace',
        fontSize: '38px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const m = Math.floor(data.time / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(data.time % 60)
      .toString()
      .padStart(2, '0');

    this.add
      .text(
        width / 2,
        height * 0.48,
        `Survived: ${m}:${s}\nLevel reached: ${data.level}\nEnemies defeated: ${data.kills}`,
        {
          fontFamily: 'Courier New, monospace',
          fontSize: '15px',
          color: '#eef0ff',
          align: 'center',
        }
      )
      .setOrigin(0.5);

    const prompt = this.add
      .text(width / 2, height * 0.68, 'CLICK OR PRESS SPACE TO RESTART', {
        fontFamily: 'Courier New, monospace',
        fontSize: '14px',
        color: '#ffd76b',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 650, yoyo: true, repeat: -1 });

    const restart = () => this.scene.start('GameScene');
    this.input.once('pointerdown', restart);
    this.input.keyboard?.once('keydown-SPACE', restart);
  }
}
