import Phaser from 'phaser';
import { REGIONS, type RegionDef } from '../config/regions';
import { fetchRegionWeather, type RegionWeatherState } from '../systems/WeatherService';

interface RegionSelectData {
  characterId: string;
}

const FONT = 'Courier New, monospace';

export class RegionSelectScene extends Phaser.Scene {
  private characterId!: string;
  private chosen = false;

  constructor() {
    super('RegionSelectScene');
  }

  create(data: RegionSelectData) {
    this.characterId = data.characterId;
    this.chosen = false;
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    this.add
      .text(width / 2, 40, 'CHOOSE YOUR REGION', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ffd76b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 66, 'live weather, checked now — click a region, or press 1 / 2', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9a94c0',
      })
      .setOrigin(0.5);

    const panelXs = [width * 0.28, width * 0.72];
    const panelY = height * 0.58;
    const panelW = 260;
    const panelH = 320;

    REGIONS.forEach((region, i) => {
      const px = panelXs[i];
      const border = this.add
        .rectangle(px, panelY, panelW, panelH, 0x14121f, 0.85)
        .setStrokeStyle(2, 0x3a3550);

      if (this.textures.exists(region.emblemKey)) {
        this.add.image(px, panelY - 95, region.emblemKey).setDisplaySize(160, 110);
      } else {
        this.add.circle(px, panelY - 95, 46, 0x1c1a2c).setStrokeStyle(2, 0x3a3550);
        this.add
          .text(px, panelY - 95, region.id === 'nyc' ? '🏙' : '🌴', { fontSize: '36px' })
          .setOrigin(0.5);
      }

      this.add
        .text(px, panelY - 8, region.name, {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#eef0ff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      this.add
        .text(px, panelY + 14, `"${region.subtitle}"`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#9a94c0',
        })
        .setOrigin(0.5);

      const status = this.add
        .text(px, panelY + 44, 'reading skies…', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#8fe0ff',
          align: 'center',
          wordWrap: { width: panelW - 24 },
        })
        .setOrigin(0.5);
      this.tweens.add({ targets: status, alpha: 0.3, duration: 550, yoyo: true, repeat: -1 });

      let currentWeather: RegionWeatherState | null = null;

      fetchRegionWeather(region).then((weather) => {
        currentWeather = weather;
        this.tweens.killTweensOf(status);
        status.setAlpha(1).setText(`${weather.glyph} ${weather.label} · ${Math.round(weather.temp)}°C`);
      });

      const zone = this.add
        .rectangle(px, panelY, panelW, panelH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => border.setStrokeStyle(3, 0xffd76b));
      zone.on('pointerout', () => border.setStrokeStyle(2, 0x3a3550));
      zone.on('pointerdown', () => this.choose(region, currentWeather));

      this.input.keyboard?.once(`keydown-${['ONE', 'TWO'][i]}`, () => this.choose(region, currentWeather));
    });
  }

  private choose(region: RegionDef, weather: RegionWeatherState | null) {
    if (this.chosen) return;
    this.chosen = true;
    this.input.keyboard?.removeAllListeners();
    const resolved =
      weather ?? { frontIndex: 0, label: 'Unknown skies', glyph: '☀', tint: 0x8fe0ff, condition: 'clear', temp: 20, source: 'fallback' as const };
    this.scene.start('GameScene', {
      characterId: this.characterId,
      regionId: region.id,
      startFrontIndex: resolved.frontIndex,
      weatherLabel: resolved.label,
      weatherGlyph: resolved.glyph,
      weatherTint: resolved.tint,
    });
  }
}
