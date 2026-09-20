import Phaser from 'phaser';
import { REGIONS, type RegionDef } from '../config/regions';
import { fetchRegionWeather, type RegionWeatherState } from '../systems/WeatherService';
import { UI } from '../gfx/palette';
import { drawWindow, textStyle } from '../ui/Window';
import { drawWeatherIcon, WEATHER_SHORT } from '../ui/weatherIcons';

interface RegionSelectData {
  characterId: string;
}

const PANEL_XS = [2, 122];

export class RegionSelectScene extends Phaser.Scene {
  private characterId!: string;
  private chosen = false;
  private selected = 0;

  constructor() {
    super('RegionSelectScene');
  }

  create(data: RegionSelectData) {
    this.characterId = data.characterId;
    this.chosen = false;
    this.selected = 0;
    this.cameras.main.setBackgroundColor('#181c38');

    const weather: (RegionWeatherState | null)[] = REGIONS.map(() => null);
    const frames = REGIONS.map(() => this.add.graphics().setDepth(2));
    const highlight = () =>
      frames.forEach((g, i) => {
        g.clear();
        if (i !== this.selected) return;
        g.lineStyle(2, UI.accent, 1);
        g.strokeRect(PANEL_XS[i] + 1, 9, 114, 116);
      });

    REGIONS.forEach((region, i) => {
      const x0 = PANEL_XS[i];
      drawWindow(this, x0, 8, 116, 118);

      if (this.textures.exists(region.emblemKey)) {
        this.add.image(x0 + 10, 14, region.emblemKey).setOrigin(0, 0);
      } else {
        this.add.rectangle(x0 + 10, 14, 96, 64, 0x303848).setOrigin(0, 0);
      }
      this.add.text(x0 + 58, 84, region.name, textStyle()).setOrigin(0.5, 0);
      this.add
        .text(x0 + 58, 96, region.subtitle.replace(/^The /, ''), textStyle('#686868'))
        .setOrigin(0.5, 0);

      const status = this.add.text(x0 + 58, 110, 'checking...', textStyle('#3078d8')).setOrigin(0.5, 0);
      const icon = this.add.graphics();
      this.tweens.add({ targets: status, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });

      fetchRegionWeather(region).then((w) => {
        weather[i] = w;
        this.tweens.killTweensOf(status);
        const label = `${WEATHER_SHORT[w.condition] ?? w.label} ${Math.round(w.temp)}C`;
        status.setAlpha(1).setText(label).setColor('#383838').setX(x0 + 62);
        drawWeatherIcon(icon, x0 + 62 - status.width / 2 - 11, 110, w.condition);
      });

      const zone = this.add
        .rectangle(x0, 8, 116, 118, 0xffffff, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        this.selected = i;
        highlight();
      });
      zone.on('pointerdown', () => this.choose(region, weather[i]));
    });

    const box = drawWindow(this, 4, 128, 232, 30);
    box.setDepth(1);
    this.add
      .text(12, 133, 'Live weather from each city. Choose where to fight!', { ...textStyle(), wordWrap: { width: 216 } })
      .setDepth(3);
    highlight();

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.selected = 0;
      else if (k === 'arrowright' || k === 'd') this.selected = 1;
      else if (k === 'enter' || k === ' ' || k === 'z') return this.choose(REGIONS[this.selected], weather[this.selected]);
      else if (k === '1' || k === '2') return this.choose(REGIONS[Number(k) - 1], weather[Number(k) - 1]);
      highlight();
    });
  }

  private choose(region: RegionDef, weather: RegionWeatherState | null) {
    if (this.chosen) return;
    this.chosen = true;
    const resolved: RegionWeatherState =
      weather ?? { frontIndex: 0, label: 'Unknown skies', glyph: '', tint: 0x8fe0ff, condition: 'clear', temp: 20, source: 'fallback' };
    this.scene.start('GameScene', {
      characterId: this.characterId,
      regionId: region.id,
      startFrontIndex: resolved.frontIndex,
      weatherLabel: resolved.label,
      weatherCondition: resolved.condition,
      weatherTint: resolved.tint,
    });
  }
}
