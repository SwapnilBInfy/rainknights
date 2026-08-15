import type { Player } from '../entities/Player';

export class HUD {
  private root: HTMLElement;
  private container!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpLabel!: HTMLElement;
  private xpFill!: HTMLElement;
  private levelLabel!: HTMLElement;
  private timerLabel!: HTMLElement;
  private weatherLabel!: HTMLElement;
  private bossWrap!: HTMLElement;
  private bossFill!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build() {
    this.container = document.createElement('div');
    this.container.className = 'hud';
    this.container.innerHTML = `
      <div class="hud-top">
        <div class="hud-bar-wrap hp">
          <div class="hud-bar-fill hp-fill"></div>
          <span class="hud-bar-label hp-label"></span>
        </div>
        <div class="hud-bar-wrap xp">
          <div class="hud-bar-fill xp-fill"></div>
        </div>
      </div>
      <div class="hud-mid">
        <div class="hud-level"></div>
        <div class="hud-timer">00:00</div>
        <div class="hud-weather"></div>
      </div>
      <div class="hud-boss-wrap hidden">
        <div class="hud-boss-label">TORNADO</div>
        <div class="hud-bar-wrap boss">
          <div class="hud-bar-fill boss-fill"></div>
        </div>
      </div>
    `;
    this.root.appendChild(this.container);

    this.hpFill = this.container.querySelector('.hp-fill')!;
    this.hpLabel = this.container.querySelector('.hp-label')!;
    this.xpFill = this.container.querySelector('.xp-fill')!;
    this.levelLabel = this.container.querySelector('.hud-level')!;
    this.timerLabel = this.container.querySelector('.hud-timer')!;
    this.weatherLabel = this.container.querySelector('.hud-weather')!;
    this.bossWrap = this.container.querySelector('.hud-boss-wrap')!;
    this.bossFill = this.container.querySelector('.boss-fill')!;
  }

  update(player: Player, elapsedSeconds: number, frontName: string) {
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    this.hpFill.style.width = `${hpPct}%`;
    this.hpLabel.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;

    const xpPct = Math.max(0, Math.min(100, (player.xp / player.xpToNext) * 100));
    this.xpFill.style.width = `${xpPct}%`;

    this.levelLabel.textContent = `Lv ${player.level}`;

    const m = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(elapsedSeconds % 60)
      .toString()
      .padStart(2, '0');
    this.timerLabel.textContent = `${m}:${s}`;

    this.weatherLabel.textContent = frontName;
  }

  setBoss(hp: number | null, maxHp: number) {
    if (hp === null) {
      this.bossWrap.classList.add('hidden');
      return;
    }
    this.bossWrap.classList.remove('hidden');
    const pct = Math.max(0, (hp / maxHp) * 100);
    this.bossFill.style.width = `${pct}%`;
  }

  destroy() {
    this.container.remove();
  }
}
