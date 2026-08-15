import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    this.add
      .text(width / 2, height * 0.3, 'RAINKNIGHTS', {
        fontFamily: 'Courier New, monospace',
        fontSize: '42px',
        color: '#8fe0ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(3, 3, '#14121f', 0, true, true);

    this.add
      .text(width / 2, height * 0.3 + 38, 'a storm survival', {
        fontFamily: 'Courier New, monospace',
        fontSize: '13px',
        color: '#9a94c0',
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(width / 2, height * 0.6, 'CLICK OR PRESS SPACE TO START', {
        fontFamily: 'Courier New, monospace',
        fontSize: '16px',
        color: '#ffd76b',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 650, yoyo: true, repeat: -1 });

    this.add
      .text(
        width / 2,
        height * 0.76,
        'WASD / Arrows to move — you auto-attack nearby foes\nSurvive the storm fronts. Defeat the Tornado to win.',
        {
          fontFamily: 'Courier New, monospace',
          fontSize: '12px',
          color: '#6f6a94',
          align: 'center',
        }
      )
      .setOrigin(0.5);

    const start = () => this.scene.start('CharacterSelectScene');
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);
  }
}
