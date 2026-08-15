import Phaser from 'phaser';
import { fetchLocalWeatherFront, type LocalWeatherResult } from '../systems/WeatherService';

interface WeatherCheckData {
  characterId: string;
}

const FONT = 'Courier New, monospace';

export class WeatherCheckScene extends Phaser.Scene {
  private started = false;
  private characterId!: string;

  constructor() {
    super('WeatherCheckScene');
  }

  create(data: WeatherCheckData) {
    this.started = false;
    this.characterId = data.characterId;
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    let currentResult: LocalWeatherResult = {
      frontIndex: 0,
      label: 'Unknown skies — starting calm',
      source: 'fallback',
    };

    const status = this.add
      .text(width / 2, height * 0.42, 'READING THE SKY ABOVE YOU…', {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#8fe0ff',
        align: 'center',
        wordWrap: { width: width * 0.85 },
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: status, alpha: 0.3, duration: 550, yoyo: true, repeat: -1 });

    const hint = this.add
      .text(width / 2, height * 0.42 + 44, 'your browser may ask for location access — click or press space to skip', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#6f6a94',
        align: 'center',
        wordWrap: { width: width * 0.8 },
      })
      .setOrigin(0.5);

    const skip = () => this.begin(currentResult);
    this.input.once('pointerdown', skip);
    this.input.keyboard?.once('keydown-SPACE', skip);

    fetchLocalWeatherFront().then((result) => {
      if (this.started) return;
      currentResult = result;
      this.tweens.killTweensOf(status);
      status.setAlpha(1).setText(`TODAY'S STORM: ${result.label.toUpperCase()}`);
      hint.setText('click or press space to continue');
      this.time.delayedCall(1400, () => this.begin(currentResult));
    });
  }

  private begin(result: LocalWeatherResult) {
    if (this.started) return;
    this.started = true;
    this.input.keyboard?.removeAllListeners();
    this.scene.start('GameScene', {
      characterId: this.characterId,
      startFrontIndex: result.frontIndex,
      weatherLabel: result.label,
    });
  }
}
