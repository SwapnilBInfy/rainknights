import Phaser from 'phaser';
import { REGIONS, type RegionDef } from '../config/regions';
import { fetchRegionWeather, type RegionWeatherState } from '../systems/WeatherService';
import { UI } from '../gfx/palette';
import { drawWindow, textStyle } from '../ui/Window';
import { drawWeatherIcon, WEATHER_SHORT } from '../ui/weatherIcons';
import { audio } from '../audio/engine';
import { runStartData } from '../systems/runStart';

interface RegionSelectData {
  characterId: string;
}

/** The city list down the left, one row per city; the chosen city's emblem on the right. */
const LIST = { x: 2, y: 8, w: 116, h: 118, rowY: 13, rowH: 21 };
const CARD = { x: 122, y: 8, w: 116, h: 118 };

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
    audio.playMusic('town');
    this.cameras.main.setBackgroundColor('#181c38');

    const weather: (RegionWeatherState | null)[] = REGIONS.map(() => null);
    let alive = true;
    this.events.once('shutdown', () => {
      alive = false;
    });

    // The list.
    drawWindow(this, LIST.x, LIST.y, LIST.w, LIST.h);
    const cursor = this.add.graphics().setDepth(2);
    const rowTop = (i: number) => LIST.y + (LIST.rowY - LIST.y) + i * LIST.rowH;

    // The selected city's card.
    drawWindow(this, CARD.x, CARD.y, CARD.w, CARD.h);
    const emblems = REGIONS.map((region) =>
      this.textures.exists(region.emblemKey)
        ? this.add.image(CARD.x + 10, CARD.y + 6, region.emblemKey).setOrigin(0, 0)
        : this.add.rectangle(CARD.x + 10, CARD.y + 6, 96, 64, 0x303848).setOrigin(0, 0)
    );
    const cardName = this.add.text(CARD.x + CARD.w / 2, CARD.y + 76, '', textStyle()).setOrigin(0.5, 0);
    const cardSub = this.add.text(CARD.x + CARD.w / 2, CARD.y + 88, '', textStyle('#686868')).setOrigin(0.5, 0);
    const cardKey = this.add.text(CARD.x + CARD.w / 2, CARD.y + 104, '', textStyle('#3078d8')).setOrigin(0.5, 0);

    const show = () => {
      cursor.clear();
      cursor.fillStyle(UI.accent, 0.25).fillRect(LIST.x + 4, rowTop(this.selected) - 1, LIST.w - 8, LIST.rowH - 2);
      cursor.lineStyle(1, UI.accent, 1).strokeRect(LIST.x + 4.5, rowTop(this.selected) - 0.5, LIST.w - 9, LIST.rowH - 3);
      emblems.forEach((e, i) => e.setVisible(i === this.selected));
      const region = REGIONS[this.selected];
      cardName.setText(region.name);
      cardSub.setText(region.subtitle.replace(/^The /, ''));
      cardKey.setText(`Press ${this.selected + 1}`);
    };

    REGIONS.forEach((region, i) => {
      const y = rowTop(i);
      this.add.text(LIST.x + 8, y, `${i + 1} ${region.shortName ?? region.name}`, textStyle()).setDepth(3);
      const status = this.add.text(LIST.x + 22, y + 9, 'checking...', textStyle('#3078d8')).setDepth(3);
      const icon = this.add.graphics().setDepth(3);
      this.tweens.add({ targets: status, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });

      fetchRegionWeather(region).then((w) => {
        weather[i] = w;
        // The player can leave this scene before the forecast returns.
        if (!alive || !status.active) return;
        this.tweens.killTweensOf(status);
        status.setAlpha(1).setText(`${WEATHER_SHORT[w.condition] ?? w.label} ${Math.round(w.temp)}C`).setColor('#383838');
        drawWeatherIcon(icon, LIST.x + 9, y + 9, w.condition);
      });

      const zone = this.add
        .rectangle(LIST.x + 4, y - 1, LIST.w - 8, LIST.rowH - 2, 0xffffff, 0)
        .setOrigin(0, 0)
        .setDepth(4)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (this.selected !== i) audio.play('move');
        this.selected = i;
        show();
      });
      zone.on('pointerdown', () => this.choose(region, weather[i]));
    });

    const box = drawWindow(this, 4, 128, 232, 30);
    box.setDepth(1);
    this.add
      .text(12, 133, 'Live weather from each city. Choose where to fight!', { ...textStyle(), wordWrap: { width: 216 } })
      .setDepth(3);
    show();

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const before = this.selected;
      if (k === 'arrowup' || k === 'w' || k === 'arrowleft' || k === 'a') this.selected = (this.selected + REGIONS.length - 1) % REGIONS.length;
      else if (k === 'arrowdown' || k === 's' || k === 'arrowright' || k === 'd') this.selected = (this.selected + 1) % REGIONS.length;
      if (this.selected !== before) audio.play('move');
      else if (k === 'enter' || k === ' ' || k === 'z') return this.choose(REGIONS[this.selected], weather[this.selected]);
      else if (/^[1-9]$/.test(k) && Number(k) <= REGIONS.length) return this.choose(REGIONS[Number(k) - 1], weather[Number(k) - 1]);
      else if (k === 'escape') {
        if (!this.chosen) this.scene.start('TownScene', { at: 'plaza' });
        return;
      }
      show();
    });
  }

  private choose(region: RegionDef, weather: RegionWeatherState | null) {
    if (this.chosen) return;
    this.chosen = true;
    audio.play('confirm');
    this.scene.start('GameScene', runStartData(this.characterId, region, weather));
  }
}
