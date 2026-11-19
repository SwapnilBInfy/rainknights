import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import { UI } from '../gfx/palette';
import { drawWindow, textStyle } from './Window';
import { drawDigits } from './digits';
import { drawWeatherIcon, WEATHER_SHORT } from './weatherIcons';
import { drawStatusIcon } from './statusIcons';
import type { StatusId } from '../systems/status';

const DEPTH = 100;

/**
 * Slim battle readout along the top of the 240×160 screen: level, timer,
 * a short HP bar with a pixel HP count, a thin XP line, and the J/K gauges.
 * Weather is a one-line chip on the right. Touch controls live in the
 * lower corners, so none of this sits down there.
 */
export class HUD {
  private scene: Phaser.Scene;
  private objects: Phaser.GameObjects.GameObject[] = [];

  private bars: Phaser.GameObjects.Graphics;
  private lvText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private beamKeyText: Phaser.GameObjects.Text;
  private rollKeyText: Phaser.GameObjects.Text;

  private badge: Phaser.GameObjects.Container | null = null;
  private condition = 'clear';
  private conditionLabel = '';
  private frontName = '';

  private statusGfx: Phaser.GameObjects.Graphics;
  private statusKey = '';

  private bossGfx: Phaser.GameObjects.Graphics;
  private bossFrame: Phaser.GameObjects.Container | null = null;
  private bossBarX = 106;

  private prompt: Phaser.GameObjects.Container | null = null;
  private promptKey = '';
  private objective: Phaser.GameObjects.Container | null = null;
  private objectiveText = '';
  private message: Phaser.GameObjects.Container | null = null;
  private messageTimer: Phaser.Time.TimerEvent | null = null;

  private displayHp = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.lvText = this.text(2, 1, 'Lv1');
    this.timeText = this.text(30, 1, '00:00');
    this.beamKeyText = this.text(72, 11, 'J', '#3078d8');
    this.rollKeyText = this.text(104, 11, 'K', '#28a038');
    this.bars = this.add(scene.add.graphics());
    this.statusGfx = this.add(scene.add.graphics());

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

  update(player: Player, elapsedSeconds: number, frontName: string, delta = 16, beamCharge = 1, rollCharge = 1) {
    if (this.displayHp < 0) this.displayHp = player.hp;
    // HP drains/refills smoothly like the real games.
    const step = (60 * delta) / 1000;
    if (this.displayHp > player.hp) this.displayHp = Math.max(player.hp, this.displayHp - step);
    else if (this.displayHp < player.hp) this.displayHp = Math.min(player.hp, this.displayHp + step);

    this.lvText.setText(`Lv${player.level}`);
    const m = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
    this.timeText.setText(`${m}:${s}`);

    const g = this.bars;
    g.clear();
    const pct = Phaser.Math.Clamp(this.displayHp / player.maxHp, 0, 1);
    g.fillStyle(0x14121f, 0.85);
    g.fillRect(1, 10, 68, 6);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(2, 11, 66, 4);
    g.fillStyle(pct > 0.5 ? UI.hpGreen : pct > 0.2 ? UI.hpYellow : UI.hpRed, 1);
    g.fillRect(2, 11, Math.round(66 * pct), 4);
    const hpLabel = String(Math.ceil(this.displayHp));
    g.fillStyle(0x14121f, 0.8);
    g.fillRect(1, 17, hpLabel.length * 4 + 1, 7);
    drawDigits(g, 2, 18, hpLabel, 0xf8f8f0);

    const xpPct = Phaser.Math.Clamp(player.xp / player.xpToNext, 0, 1);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(36, 18, 32, 2);
    g.fillStyle(UI.xpBlue, 1);
    g.fillRect(36, 18, Math.round(32 * xpPct), 2);

    // energy beam recharge gauge (J / X on a keyboard, B on the touch cluster)
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(80, 14, 20, 3);
    g.fillStyle(beamCharge >= 1 ? 0x60e0ff : 0x3078a8, 1);
    g.fillRect(80, 14, Math.round(20 * beamCharge), 3);

    // dodge roll recharge gauge (K / Shift on a keyboard, R on the touch cluster)
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(112, 14, 16, 3);
    g.fillStyle(rollCharge >= 1 ? 0x58e078 : 0x2a7a48, 1);
    g.fillRect(112, 14, Math.round(16 * rollCharge), 3);

    if (frontName !== this.frontName) {
      this.frontName = frontName;
      this.renderBadge();
    }
  }

  /**
   * A persistent instruction panel (the tutorial): a coloured headline over
   * two lines of text. `null` clears it. Redraws only when the text changes.
   */
  setPrompt(headline: string | null, lines: string[] = []) {
    const key = headline === null ? '' : `${headline}|${lines.join('|')}`;
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.prompt?.destroy();
    this.prompt = null;
    const app = document.getElementById('app');
    if (headline === null) {
      if (app) delete app.dataset.prompt;
      return;
    }
    const win = drawWindow(this.scene, 4, 108, 232, 48);
    const head = this.scene.add.text(12, 114, headline, textStyle('#3078d8'));
    const body = this.scene.add.text(12, 126, lines.join('\n'), textStyle());
    this.prompt = this.scene.add.container(0, 0, [win, head, body]).setScrollFactor(0).setDepth(DEPTH + 1);
    if (app) app.dataset.prompt = `${headline} | ${lines.join(' ')}`;
  }

  /** Status icons for the player (wet, burning, ...), drawn under the HP panel. */
  setStatuses(ids: StatusId[]) {
    const key = ids.join(',');
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusGfx.clear();
    ids.forEach((id, i) => drawStatusIcon(this.statusGfx, 4 + i * 11, 26, id));
    const app = document.getElementById('app');
    if (app) app.dataset.statuses = key;
  }

  /** The glyph beside the beam gauge: J on a keyboard, B when touch is active. */
  setBeamKeyLabel(label: string) {
    this.beamKeyText.setText(label);
    const app = document.getElementById('app');
    if (app) app.dataset.beamKey = label;
  }

  /** The glyph beside the roll gauge: K on a keyboard, R when touch is active. */
  setRollKeyLabel(label: string) {
    this.rollKeyText.setText(label);
    const app = document.getElementById('app');
    if (app) app.dataset.rollKey = label;
  }

  /** Persistent weather condition for the run, shown top-right. */
  setWeatherCondition(condition: string, label: string) {
    this.condition = condition;
    this.conditionLabel = WEATHER_SHORT[condition] ?? label;
    this.renderBadge();
  }

  private renderBadge() {
    this.badge?.destroy();
    const w = (this.conditionLabel.length + 2) * 8 + 6;
    const x = 240 - w - 2;
    const win = drawWindow(this.scene, x, 1, w, 12);
    const icon = this.scene.add.graphics();
    drawWeatherIcon(icon, x + 3, 2, this.condition);
    const label = this.scene.add.text(x + 13, 2, this.conditionLabel, textStyle());
    this.badge = this.scene.add.container(0, 0, [win, icon, label]).setScrollFactor(0).setDepth(DEPTH);
  }

  setBoss(hp: number | null, maxHp: number, name = 'TORNADO') {
    const g = this.bossGfx;
    g.clear();
    if (hp === null) {
      this.bossFrame?.destroy();
      this.bossFrame = null;
      const app = document.getElementById('app');
      if (app) delete app.dataset.boss;
      return;
    }
    if (!this.bossFrame) {
      const win = drawWindow(this.scene, 40, 100, 160, 14);
      const label = this.scene.add.text(45, 103, name, textStyle('#6c5b8f'));
      this.bossFrame = this.scene.add.container(0, 0, [win, label]).setScrollFactor(0).setDepth(DEPTH);
      // The bar takes whatever room the name leaves.
      this.bossBarX = 45 + name.length * 8 + 4;
      const app = document.getElementById('app');
      if (app) app.dataset.boss = name;
    }
    const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    g.fillStyle(UI.ink, 1);
    const x = this.bossBarX;
    const w = 196 - x;
    g.fillRect(x, 104, w, 6);
    g.fillStyle(UI.hpTrack, 1);
    g.fillRect(x + 1, 105, w - 2, 4);
    g.fillStyle(0xa080d0, 1);
    g.fillRect(x + 1, 105, Math.round((w - 2) * pct), 4);
  }

  /** A small story line along the bottom ("WIN HERE: GRAY SHARD"); empty text clears it. */
  setObjective(text: string) {
    if (text === this.objectiveText) return;
    this.objectiveText = text;
    this.objective?.destroy();
    this.objective = null;
    const app = document.getElementById('app');
    if (app) {
      if (text) app.dataset.objective = text;
      else delete app.dataset.objective;
    }
    if (!text) return;
    const label = this.scene.add.text(7, 148, `* ${text}`, { ...textStyle('#ffe9a0'), stroke: '#14121f', strokeThickness: 3 });
    const back = this.scene.add.graphics();
    back.fillStyle(0x14121f, 0.6).fillRect(3, 146, label.width + 8, 12);
    this.objective = this.scene.add.container(0, 0, [back, label]).setScrollFactor(0).setDepth(DEPTH);
  }

  /** Pokémon-style bottom message box; replaces any message currently showing. */
  showMessage(text: string, durationMs = 2600) {
    this.message?.destroy();
    this.messageTimer?.remove(false);
    const win = drawWindow(this.scene, 4, 118, 232, 38);
    const label = this.scene.add.text(12, 124, text, {
      ...textStyle(),
      lineSpacing: 1,
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
    this.prompt?.setVisible(visible);
    this.objective?.setVisible(visible);
  }

  destroy() {
    this.objects.forEach((o) => o.destroy());
    this.bossGfx.destroy();
    this.bossFrame?.destroy();
    this.badge?.destroy();
    this.message?.destroy();
    this.prompt?.destroy();
    this.objective?.destroy();
    const app = document.getElementById('app');
    if (app) {
      delete app.dataset.prompt;
      delete app.dataset.objective;
    }
    this.messageTimer?.remove(false);
  }
}
