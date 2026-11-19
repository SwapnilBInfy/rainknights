import Phaser from 'phaser';
import { WORLD } from '../config/constants';
import {
  FIRST_HAZARD_DELAY_MS,
  scaledInterval,
  zoneCount,
  type HazardKind,
  type HazardSpec,
  type WeatherRule,
} from '../config/weatherRules';
import { drawChevron, fillPixelCircle, ringPixelCircle, type Cardinal } from '../gfx/pixelShapes';
import type { Enemy } from '../entities/enemies/Enemy';
import type { Player } from '../entities/Player';
import { audio } from '../audio/engine';
import { STATUS_TUNING } from './status';

/** What the director needs from the scene. */
export interface HazardHost {
  scene: Phaser.Scene;
  player: Player;
  enemies(): Enemy[];
  isOpenGround(x: number, y: number): boolean;
  frontIndex(): number;
  hurtEnemy(enemy: Enemy, damage: number, kind: 'lightning'): void;
  popup(x: number, y: number, text: string, color: string): void;
  /** Id of the water body at a point (0 = not standing in water). */
  waterBodyAt(x: number, y: number): number;
  /** Tile centres of a water body within a radius (what a strike runs through). */
  waterTilesNear(x: number, y: number, radius: number, bodyId: number): { x: number; y: number }[];
  /** A shallow-water spot near a point, or null. */
  wetSpotNear(x: number, y: number, radius: number): { x: number; y: number } | null;
}

type ZoneKind = Exclude<HazardKind, 'gust'>;

interface ZoneDef {
  r: number;
  warnMs: number;
  liveMs: number;
  tickMs: number;
  color: number;
}

const ZONES: Record<ZoneKind, ZoneDef> = {
  lightning: { r: 22, warnMs: 1100, liveMs: 180, tickMs: 0, color: 0xfff060 },
  scorch: { r: 20, warnMs: 900, liveMs: 5000, tickMs: 250, color: 0xff7030 },
  frost: { r: 22, warnMs: 900, liveMs: 6000, tickMs: 100, color: 0x80dcff },
};

const LIGHTNING_DAMAGE = 10;
const LIGHTNING_ENEMY_DAMAGE = 35;
/** Water carries a strike this far from where it lands, to everyone standing in the same water. */
const CONDUCT_RADIUS = 96;
const CONDUCT_DAMAGE = 8;
const CONDUCT_ENEMY_DAMAGE = 22;
/** How often a lightning strike is aimed at nearby water instead of dry ground. */
const WATER_SEEKING = 0.4;

interface Zone {
  kind: ZoneKind;
  x: number;
  y: number;
  age: number;
  struck: boolean;
  tick: number;
  seed: number;
  /** Water body a strike here runs through (0 = dry ground) and the tiles that will light up. */
  bodyId: number;
  tiles: { x: number; y: number }[];
}

const GUST = { warnMs: 1200, liveMs: 2500, force: 34 };
const DIRS: Record<Cardinal, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const STREAKS = 16;
const DEPTH_GROUND = 2.5;
const DEPTH_OVERLAY = 60;

/**
 * Spawns the weather's hazards (lightning, scorch, frost patches, gusts) on a
 * schedule. Every hazard shows a ground warning first, so nothing is hidden.
 * All timers run on frame deltas, so the pause menu freezes them correctly.
 */
export class HazardDirector {
  private ground: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private zones: Zone[] = [];
  private timers: number[];
  private gustState: { age: number; dir: Cardinal; sounded: boolean } | null = null;

  constructor(
    private readonly host: HazardHost,
    private readonly rule: WeatherRule
  ) {
    const scene = host.scene;
    this.ground = scene.add.graphics().setDepth(DEPTH_GROUND);
    this.overlay = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_OVERLAY);
    this.flash = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH_OVERLAY + 1);
    this.timers = rule.hazards.map(() => FIRST_HAZARD_DELAY_MS + Math.random() * 2500);
  }

  /** Push (px/s) every creature feels from the current gust. */
  get gustPush(): { x: number; y: number } {
    const g = this.gustState;
    if (!g || g.age < GUST.warnMs) return { x: 0, y: 0 };
    const d = DIRS[g.dir];
    return { x: d.x * GUST.force, y: d.y * GUST.force };
  }

  /** For tests and the debug bridge. */
  snapshot() {
    return {
      zones: this.zones.map((z) => ({
        kind: z.kind,
        x: Math.round(z.x),
        y: Math.round(z.y),
        phase: z.age < ZONES[z.kind].warnMs ? 'warn' : 'live',
      })),
      gust: this.gustState ? (this.gustState.age < GUST.warnMs ? 'warn' : 'live') : null,
    };
  }

  update(delta: number) {
    const dt = Math.min(delta, STATUS_TUNING.maxStepMs);
    this.rule.hazards.forEach((spec, i) => {
      this.timers[i] -= dt;
      if (this.timers[i] > 0) return;
      this.spawn(spec);
      this.timers[i] = scaledInterval(spec, this.host.frontIndex(), Math.random);
    });

    for (const zone of this.zones) this.updateZone(zone, dt);
    this.zones = this.zones.filter((z) => z.age < ZONES[z.kind].warnMs + ZONES[z.kind].liveMs);
    this.updateGust(dt);
    this.render();
  }

  destroy() {
    this.ground.destroy();
    this.overlay.destroy();
    this.flash.destroy();
    this.zones = [];
  }

  // --- spawning ---

  private spawn(spec: HazardSpec) {
    if (spec.kind === 'gust') {
      if (!this.gustState) this.startGust(Phaser.Utils.Array.GetRandom(['left', 'right', 'up', 'down']) as Cardinal);
      return;
    }
    const n = zoneCount(spec, this.host.frontIndex());
    for (let i = 0; i < n; i++) {
      const pos = this.pickSpot(spec.kind === 'lightning');
      if (pos) this.addZone(spec.kind as ZoneKind, pos.x, pos.y);
    }
  }

  /**
   * Debug / test hook: drop a hazard right now, ignoring the schedule. `instant` skips the ground
   * warning so a zone takes effect on the next frame (tests that need the hit at an exact moment).
   */
  trigger(kind: HazardKind, dx = 40, dy = 0, dir: Cardinal = 'left', instant = false) {
    if (kind === 'gust') {
      this.startGust(dir);
      return;
    }
    this.addZone(kind, this.host.player.x + dx, this.host.player.y + dy);
    if (instant) this.zones[this.zones.length - 1].age = ZONES[kind as ZoneKind].warnMs;
  }

  private addZone(kind: ZoneKind, x: number, y: number) {
    const bodyId = kind === 'lightning' ? this.host.waterBodyAt(x, y) : 0;
    const tiles = bodyId ? this.host.waterTilesNear(x, y, CONDUCT_RADIUS, bodyId) : [];
    this.zones.push({ kind, x, y, age: 0, struck: false, tick: 0, seed: Math.floor(Math.random() * 1e6), bodyId, tiles });
    audio.play('warn');
  }

  /** A walkable spot near the player; lightning also likes to land near enemies. */
  private pickSpot(allowEnemy: boolean): { x: number; y: number } | null {
    const p = this.host.player;
    // Lightning likes water: often aim at a nearby puddle, pond or river so players learn to stay out of it.
    if (allowEnemy && Math.random() < WATER_SEEKING) {
      const wet = this.host.wetSpotNear(p.x, p.y, 110);
      if (wet) return wet;
    }
    const near = allowEnemy && Math.random() < 0.4 ? this.host.enemies().filter((e) => Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < 120) : [];
    for (let attempt = 0; attempt < 10; attempt++) {
      let x: number;
      let y: number;
      if (near.length > 0 && attempt < 5) {
        const e = Phaser.Utils.Array.GetRandom(near);
        x = e.x + Phaser.Math.Between(-10, 10);
        y = e.y + Phaser.Math.Between(-10, 10);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = Phaser.Math.Between(20, 95);
        x = p.x + Math.cos(angle) * dist;
        y = p.y + Math.sin(angle) * dist;
      }
      if (x < 24 || y < 24 || x > WORLD.width - 24 || y > WORLD.height - 24) continue;
      if (this.host.isOpenGround(x, y)) return { x, y };
    }
    return null;
  }

  // --- zone behaviour ---

  private updateZone(zone: Zone, dt: number) {
    const def = ZONES[zone.kind];
    zone.age += dt;

    if (zone.kind === 'lightning') {
      if (!zone.struck && zone.age >= def.warnMs) {
        zone.struck = true;
        this.strike(zone);
      }
      return;
    }

    if (zone.age < def.warnMs) return;
    zone.tick += dt;
    while (zone.tick >= def.tickMs) {
      zone.tick -= def.tickMs;
      this.applyPatch(zone, def);
    }
  }

  private strike(zone: Zone) {
    const { player } = this.host;
    const def = ZONES.lightning;
    audio.play('strike');
    this.host.scene.cameras.main.shake(110, 0.004);
    this.host.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(0.32);
    this.host.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 140 });

    if (Phaser.Math.Distance.Between(player.x, player.y, zone.x, zone.y) <= def.r + 4) {
      const now = this.host.scene.time.now;
      const dmg = Math.round(LIGHTNING_DAMAGE * (player.statuses.has('wet') ? STATUS_TUNING.wetShockBonus : 1));
      if (!player.isInvulnerable(now)) this.host.popup(player.x, player.y - 10, 'ZAP', '#d8a800');
      player.takeDamage(dmg, now);
      player.applyStatus('shocked', STATUS_TUNING.shockedPlayerMs);
    }
    for (const enemy of this.host.enemies()) {
      if (!enemy.isLive) continue; // a Static Charge chain from an earlier hit here may have killed it
      const reach = def.r + (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, zone.x, zone.y) <= reach) {
        this.host.hurtEnemy(enemy, LIGHTNING_ENEMY_DAMAGE, 'lightning');
      }
    }
    if (zone.bodyId) this.conduct(zone);
  }

  /** The strike ran into water: everyone standing in that same water, nearby, is shocked. */
  private conduct(zone: Zone) {
    const { player } = this.host;
    const direct = ZONES.lightning.r + 4;
    const inWater = (x: number, y: number) => this.host.waterBodyAt(x, y) === zone.bodyId && Phaser.Math.Distance.Between(x, y, zone.x, zone.y) <= CONDUCT_RADIUS;
    if (inWater(player.x, player.y) && Phaser.Math.Distance.Between(player.x, player.y, zone.x, zone.y) > direct) {
      const now = this.host.scene.time.now;
      const dmg = Math.round(CONDUCT_DAMAGE * (player.statuses.has('wet') ? STATUS_TUNING.wetShockBonus : 1));
      if (!player.isInvulnerable(now)) this.host.popup(player.x, player.y - 10, 'SHOCK', '#d8a800');
      player.takeDamage(dmg, now);
      player.applyStatus('shocked', STATUS_TUNING.shockedPlayerMs);
    }
    for (const enemy of this.host.enemies()) {
      if (!enemy.isLive) continue;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, zone.x, zone.y) <= direct + (enemy.body as Phaser.Physics.Arcade.Body).halfWidth) continue;
      if (inWater(enemy.x, enemy.y)) this.host.hurtEnemy(enemy, CONDUCT_ENEMY_DAMAGE, 'lightning');
    }
  }

  private applyPatch(zone: Zone, def: ZoneDef) {
    const { player } = this.host;
    const scorch = zone.kind === 'scorch';
    const touch = (x: number, y: number, reach: number) => Phaser.Math.Distance.Between(x, y, zone.x, zone.y) <= def.r + reach;

    if (touch(player.x, player.y, 4)) {
      if (scorch) this.reactionPopup(player.x, player.y, player.applyStatus('burning', STATUS_TUNING.burnMs).reaction);
      else if (player.statuses.addChill(def.tickMs)) {
        audio.play('freeze');
        this.host.popup(player.x, player.y - 10, 'FROZEN', '#58a8e0');
      }
    }
    for (const enemy of this.host.enemies()) {
      if (!enemy.isLive) continue;
      if (!touch(enemy.x, enemy.y, (enemy.body as Phaser.Physics.Arcade.Body).halfWidth)) continue;
      if (scorch) this.reactionPopup(enemy.x, enemy.y, enemy.applyStatus('burning', STATUS_TUNING.burnMs).reaction);
      else if (enemy.statuses.addChill(def.tickMs)) audio.play('freeze');
    }
  }

  private reactionPopup(x: number, y: number, reaction?: 'steam' | 'thaw') {
    if (reaction === 'steam') {
      audio.play('steam');
      this.host.popup(x, y - 10, 'STEAM', '#a8a8b8');
    } else if (reaction === 'thaw') {
      this.host.popup(x, y - 10, 'THAW', '#58a8e0');
    }
  }

  // --- gusts ---

  private startGust(dir: Cardinal) {
    if (this.gustState) return;
    this.gustState = { age: 0, dir, sounded: false };
    audio.play('warn');
  }

  private updateGust(dt: number) {
    const g = this.gustState;
    if (!g) return;
    g.age += dt;
    if (g.age >= GUST.warnMs && !g.sounded) {
      g.sounded = true;
      audio.play('gust');
    }
    if (g.age >= GUST.warnMs + GUST.liveMs) {
      this.gustState = null;
    }
  }

  // --- drawing ---

  private render() {
    const g = this.ground;
    g.clear();
    for (const zone of this.zones) this.drawZone(g, zone);
    this.drawGust();
  }

  private drawZone(g: Phaser.GameObjects.Graphics, zone: Zone) {
    const def = ZONES[zone.kind];
    const warn = zone.age < def.warnMs;
    const progress = Math.min(1, zone.age / def.warnMs);

    if (zone.tiles.length > 0) this.drawConduction(g, zone, warn, progress);

    if (warn) {
      // Blinks faster as it gets close, with a ring closing in on the target.
      const blink = Math.sin(zone.age / (95 - 65 * progress)) > -0.2;
      const alpha = blink ? 0.9 : 0.35;
      fillPixelCircle(g, zone.x, zone.y, def.r, def.color, 0.12 + 0.12 * progress);
      ringPixelCircle(g, zone.x, zone.y, def.r, 1, def.color, alpha);
      const inner = Math.max(2, Math.round(def.r * (1 - progress)));
      ringPixelCircle(g, zone.x, zone.y, inner, 1, 0xffffff, alpha * 0.8);
      return;
    }

    const live = (zone.age - def.warnMs) / def.liveMs; // 0..1
    if (zone.kind === 'lightning') {
      const fade = 1 - live;
      fillPixelCircle(g, zone.x, zone.y, def.r, 0xffffff, 0.7 * fade);
      ringPixelCircle(g, zone.x, zone.y, def.r, 2, def.color, fade);
      g.fillStyle(0xffffff, fade);
      let bx = zone.x;
      for (let y = zone.y - 80; y < zone.y; y += 8) {
        bx += ((Math.floor(y + zone.seed) % 3) - 1) * 3;
        g.fillRect(Math.round(bx) - 1, y, 3, 8);
      }
      g.fillStyle(def.color, fade);
      g.fillRect(Math.round(zone.x) - 2, zone.y - 4, 5, 5);
      return;
    }

    const fade = live > 0.85 ? (1 - live) / 0.15 : 1;
    const base = zone.kind === 'scorch' ? 0xd04010 : 0x9fe0ff;
    fillPixelCircle(g, zone.x, zone.y, def.r, base, 0.38 * fade);
    ringPixelCircle(g, zone.x, zone.y, def.r, 1, def.color, 0.8 * fade);
    // Flickering flame / frost sparkle pixels, deterministic per frame bucket.
    const bucket = Math.floor(zone.age / (zone.kind === 'scorch' ? 110 : 260));
    for (let i = 0; i < 9; i++) {
      const h = Math.imul(zone.seed + bucket * 31 + i * 977, 2654435761) >>> 0;
      const a = (h % 628) / 100;
      const d = ((h >>> 10) % 100) / 100;
      const px = Math.round(zone.x + Math.cos(a) * d * (def.r - 3));
      const py = Math.round(zone.y + Math.sin(a) * d * (def.r - 3));
      if (zone.kind === 'scorch') {
        g.fillStyle(i % 2 ? 0xffe060 : 0xff9030, fade);
        g.fillRect(px, py - 1, 1, 3);
      } else {
        g.fillStyle(0xffffff, fade);
        g.fillRect(px, py, 2, 2);
      }
    }
  }

  /** The water a strike will run through: a faint pulse while it is coming, a bright flash when it lands. */
  private drawConduction(g: Phaser.GameObjects.Graphics, zone: Zone, warn: boolean, progress: number) {
    const def = ZONES[zone.kind];
    let alpha: number;
    if (warn) alpha = (Math.sin(zone.age / 120) > 0 ? 0.22 : 0.1) + 0.12 * progress;
    else alpha = 0.7 * (1 - (zone.age - def.warnMs) / def.liveMs);
    g.fillStyle(warn ? 0xfff8a0 : 0xffffff, Math.max(0, alpha));
    for (const t of zone.tiles) g.fillRect(Math.round(t.x) - 7, Math.round(t.y) - 7, 14, 14);
  }

  private drawGust() {
    const o = this.overlay;
    o.clear();
    const g = this.gustState;
    if (!g) return;
    const d = DIRS[g.dir];
    const w = this.host.scene.scale.width;
    const h = this.host.scene.scale.height;

    if (g.age < GUST.warnMs) {
      // Warning: three chevrons pulse toward where you'll be shoved.
      const blink = Math.sin(g.age / 70) > -0.3 ? 0.9 : 0.3;
      for (let k = 0; k < 3; k++) {
        drawChevron(o, w / 2 + d.x * (k * 14 - 14), h / 2 - 10 + d.y * (k * 14 - 14), g.dir, 6, 0xffffff, blink * (0.5 + k * 0.25));
      }
      return;
    }

    // Live: wind streaks sweep across the screen in the gust direction.
    const t = g.age - GUST.warnMs;
    const vertical = d.y !== 0;
    const span = (vertical ? h : w) + 40;
    const forward = d.x + d.y > 0;
    for (let i = 0; i < STREAKS; i++) {
      const lane = Math.floor(((i * 53) % 100) / 100 * (vertical ? w : h));
      const travel = (t * (0.22 + (i % 3) * 0.05) + i * 37) % span;
      const along = Math.round((forward ? travel : span - travel) - 20);
      const len = 8 + (i % 3) * 4;
      o.fillStyle(0xffffff, 0.45);
      if (vertical) o.fillRect(lane, along, 1, len);
      else o.fillRect(along, lane, len, 1);
    }
  }
}
