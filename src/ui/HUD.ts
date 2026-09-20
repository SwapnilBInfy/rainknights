import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { UI } from '../gfx/palette';
import { drawWindow, textStyle } from './Window';
import { drawWeatherIcon, WEATHER_SHORT } from './weatherIcons';

const DEPTH = 100;

/**
 * GBA-Pokémon-style in-canvas HUD, authored in native 240x160 pixels:
 * boxed status panel (level, timer, HP bar, XP bar) top-left, a weather
 * condition badge top-right, a boss HP bar, and a bottom message box.
 */
export class HUD {
  private scene: Phaser.Scene;
  private objects: Phaser.GameObjects.GameObject[] = [];

  private bars: Phaser.GameObjects.Graphics;
  private lvText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;

  private badge: Phaser.GameObjects.Container | null = null;
  private condition = 'clear';
  private conditionLabel = '';
  private frontName = '';

  private bossGfx: Phaser.GameObjects.Graphics;
  private bossFrame: Phaser.GameObjects.Container | null = null;

  private message: Phaser.GameObjects.Container | null = null;
  private messageTimer: Phaser.Time.TimerEvent | null = null;

  private displayHp = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.add(drawWindow(scene, 2, 2, 100, 54));
    this.lvText = this.text(7, 6, 'Lv1');
    this.timeText = this.text(97, 6, '00:00').setOrigin(1, 0);
    this.text(7, 18, 'HP', '#c07800');
    this.hpText = this.text(97, 26, '', '#383838').setOrigin(1, 0);
    this.text(7, 45, 'J', '#3078d8');
    this.bars = this.add(scene.add.graphics());

    this.bossGfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
  }

  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    (obj as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH);
    this.objects.push(obj);
    return obj;
  }

  private text(x: number, y: number, str: string, color = '#383838') {
    return this.add(this.scene.add.text(x, y, str, textStyle(color)));
  }

  update(player: Player, elapsedSeconds: number, frontName: string, delta = 16, beamCharge = 1) {
    if (this.displayHp < 0) this.displayHp = player.hp;
    // HP drains/refills smoothly like the real games.
    const step = (60 * delta) / 1000;
    if (this.displayHp > player.hp) this.displayHp = Math.max(player.hp, this.displayHp - step);
    else if (this.displayHp < player.hp) this.displayHp = Math.min(player.hp, this.displayHp + step);

    this.lvText.setText(`Lv${player.level}`);
    const m = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
    this.timeText.setText(`${m}:${s}`);
    this.hpText.setText(`${Math.ceil(player.hp)}/${player.maxHp}`);

    const g = this.bars;
    g.clear();
    const pct = Phaser.Math.Clamp(this.displayHp / player.maxHp, 0, 1);
    g.fillStyle(UI.ink, 1);
    g.fillRect(26, 17, 72, 8);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(27, 18, 70, 6);
    g.fillStyle(pct > 0.5 ? UI.hpGreen : pct > 0.2 ? UI.hpYellow : UI.hpRed, 1);
    g.fillRect(27, 18, Math.round(70 * pct), 6);

    const xpPct = Phaser.Math.Clamp(player.xp / player.xpToNext, 0, 1);
    g.fillStyle(UI.ink, 1);
    g.fillRect(6, 36, 92, 5);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(7, 37, 90, 3);
    g.fillStyle(UI.xpBlue, 1);
    g.fillRect(7, 37, Math.round(90 * xpPct), 3);

    // energy beam recharge gauge (fires on J / X)
    g.fillStyle(UI.ink, 1);
    g.fillRect(20, 45, 78, 7);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(21, 46, 76, 5);
    g.fillStyle(beamCharge >= 1 ? 0x60e0ff : 0x3078a8, 1);
    g.fillRect(21, 46, Math.round(76 * beamCharge), 5);

    if (frontName !== this.frontName) {
      this.frontName = frontName;
      this.renderBadge();
    }
  }

  /** Persistent weather condition for the run, shown top-right. */
  setWeatherCondition(condition: string, label: string) {
    this.condition = condition;
    this.conditionLabel = WEATHER_SHORT[condition] ?? label;
    this.renderBadge();
  }

  private renderBadge() {
    this.badge?.destroy();
    const chars = Math.max(this.conditionLabel.length + 2, this.frontName.length);
    const w = chars * 8 + 10;
    const x = 240 - w - 2;
    const win = drawWindow(this.scene, x, 2, w, 26);
    const icon = this.scene.add.graphics();
    drawWeatherIcon(icon, x + 5, 6, this.condition);
    const label = this.scene.add.text(x + 16, 6, this.conditionLabel, textStyle());
    const front = this.scene.add.text(x + 5, 17, this.frontName, textStyle('#686868'));
    this.badge = this.scene.add.container(0, 0, [win, icon, label, front]).setScrollFactor(0).setDepth(DEPTH);
  }

  setBoss(hp: number | null, maxHp: number) {
    const g = this.bossGfx;
    g.clear();
    if (hp === null) {
      this.bossFrame?.destroy();
      this.bossFrame = null;
      return;
    }
    if (!this.bossFrame) {
      const win = drawWindow(this.scene, 40, 60, 160, 14);
      const label = this.scene.add.text(45, 63, 'TORNADO', textStyle('#6c5b8f'));
      this.bossFrame = this.scene.add.container(0, 0, [win, label]).setScrollFactor(0).setDepth(DEPTH);
    }
    const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    g.fillStyle(UI.ink, 1);
    g.fillRect(106, 64, 90, 6);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(107, 65, 88, 4);
    g.fillStyle(0xa080d0, 1);
    g.fillRect(107, 65, Math.round(88 * pct), 4);
  }

  /** Pokémon-style bottom message box; replaces any message currently showing. */
  showMessage(text: string, durationMs = 2600) {
    this.message?.destroy();
    this.messageTimer?.remove(false);
    const win = drawWindow(this.scene, 4, 118, 232, 38);
    const label = this.scene.add.text(12, 126, text, {
      ...textStyle(),
      wordWrap: { width: 216 },
    });
    this.message = this.scene.add.container(0, 0, [win, label]).setScrollFactor(0).setDepth(DEPTH + 1);
    this.messageTimer = this.scene.time.delayedCall(durationMs, () => {
      this.message?.destroy();
      this.message = null;
    });
  }

  /** Hides/shows the whole HUD (e.g. behind a full-screen menu). */
  setVisible(visible: boolean) {
    this.objects.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible));
    this.bossGfx.setVisible(visible);
    this.bossFrame?.setVisible(visible);
    this.badge?.setVisible(visible);
    this.message?.setVisible(visible);
  }

  destroy() {
    this.objects.forEach((o) => o.destroy());
    this.bossGfx.destroy();
    this.bossFrame?.destroy();
    this.badge?.destroy();
    this.message?.destroy();
    this.messageTimer?.remove(false);
  }
}
