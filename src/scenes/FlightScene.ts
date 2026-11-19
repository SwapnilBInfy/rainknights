import Phaser from 'phaser';
import { REGIONS, type RegionDef } from '../config/regions';
import { audio } from '../audio/engine';
import { chibiKey } from '../gfx/chibi';
import {
  FLIGHT_TEX,
  generateCloudTexture,
  generateOutlineTexture,
  generateStarTexture,
  GroundRenderer,
  OUTLINE_H,
  OUTLINE_W,
  OUTLINE_CELL,
} from '../gfx/flight';
import { loadGame } from '../save/save';
import { fetchRegionWeather, type RegionWeatherState } from '../systems/WeatherService';
import { runStartData } from '../systems/runStart';
import { textStyle } from '../ui/Window';
import { drawWeatherIcon, WEATHER_SHORT } from '../ui/weatherIcons';
import {
  add,
  ALT_MIN,
  atLandingHeight,
  CAM_BACK,
  dot,
  faceToward,
  groundDistance,
  HORIZON,
  knightPoint,
  lonLatOf,
  project,
  projectToScreen,
  radarPoint,
  scale,
  starNear,
  starsFor,
  startFlight,
  stepFlight,
  VIEW_H,
  VIEW_W,
  type FlightInput,
  type FlightState,
  type Star,
} from '../systems/worldMap';

/** A star is tinted to its weather, so you can pick a destination by the look of its sky. */
const STAR_COLOURS: Record<string, number> = {
  clear: 0xffe14a,
  rain: 0x7ac8ff,
  thunderstorm: 0xc0a8ff,
  cold_front: 0xc8f4ff,
  windy: 0xb8f0c0,
  humid: 0x8ee0c0,
  heat: 0xffa040,
  tropical_downpour: 0x58e0d0,
  hurricane: 0xff7aa8,
};
const STAR_UNKNOWN = 0xffe14a;
const HOME_COLOUR = 0xff9ad8;

const KNIGHT_X = VIEW_W / 2;
const KNIGHT_Y = 75;
const BAR_Y = 138;
/** The radar's edge, in radians of the planet. */
const RADAR = { x: 24, y: 24, r: 17, range: 1.2 };
const MINI = { x: 172, y: 5 };
/** How long (ms) the knight climbs out of Mistford on takeoff, before the controls are theirs. */
const TAKEOFF_MS = 900;
/** ...or until they reach this height, whichever comes first. */
const TAKEOFF_ALT = 0.07;

interface FlightBridge {
  state: () => { lon: number; lat: number; alt: number; speed: number; yaw: number; p: { x: number; y: number; z: number } };
  stars: () => { id: string; lon: number; lat: number }[];
  near: () => string;
  low: () => boolean;
  frames: () => number;
  landing: () => boolean;
  weatherReady: () => number;
  teleportTo: (id: string, alt?: number) => void;
}

declare global {
  interface Window {
    __flight?: FlightBridge;
  }
}

/**
 * Flying between locations. The world is a sphere, seen from behind and above the knight, and every location is a
 * star hovering over it. The knight only moves forward while Up (or W) is held; left and right turn, A descends
 * (and lands, over a star), B ascends.
 */
export class FlightScene extends Phaser.Scene {
  private characterId = 'rainKnight';
  private stars: Star[] = [];
  private state!: FlightState;
  private ground!: GroundRenderer;
  private knight!: Phaser.GameObjects.Sprite;
  private starImages = new Map<string, Phaser.GameObjects.Image>();
  private clouds: { img: Phaser.GameObjects.Image; base: number; y: number; speed: number }[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private radar!: Phaser.GameObjects.Graphics;
  private plate!: Phaser.GameObjects.Graphics;
  private plateText!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private barTexts: Phaser.GameObjects.Text[] = [];
  private barKey = '';
  private weather = new Map<string, RegionWeatherState>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'w' | 'a' | 's' | 'd' | 'z' | 'x' | 'j' | 'k' | 'shift', Phaser.Input.Keyboard.Key>;
  private nearId = '';
  private lowNow = false;
  private frames = 0;
  private flying = 0;
  private isLanding = false;
  private tilt = 0;

  constructor() {
    super('FlightScene');
  }

  create(data: { from?: string } = {}) {
    this.characterId = loadGame().town.characterId;
    this.stars = starsFor(REGIONS);
    this.frames = 0;
    this.flying = 0;
    this.isLanding = false;
    this.tilt = 0;
    this.nearId = '';
    this.barKey = '';
    this.barTexts = [];
    this.weather = new Map();
    this.starImages = new Map();
    this.clouds = [];

    // Start over the place you left, facing the nearest other star, so there is somewhere to head for right away.
    const origin = this.stars.find((st) => st.id === data.from) ?? this.stars[0];
    const others = this.stars.filter((st) => st !== origin).sort((a, b) => dot(b.v, origin.v) - dot(a.v, origin.v));
    this.state = startFlight(origin.v, (origin.home ? this.stars[1] : others[0]).v);

    this.cameras.main.setBackgroundColor('#2f7fe0');
    this.cameras.main.fadeIn(350, 255, 255, 255);
    generateStarTexture(this);
    generateCloudTexture(this);
    generateOutlineTexture(this);
    this.ground = new GroundRenderer(this);
    this.add.image(0, 0, FLIGHT_TEX.view).setOrigin(0, 0).setDepth(0);

    for (let i = 0; i < 8; i++) {
      const img = this.add.image(0, 0, FLIGHT_TEX.cloud).setDepth(1).setAlpha(0.85).setScale(1 + (i % 3) * 0.5);
      this.clouds.push({ img, base: (i * 300) / 8 + (i % 2) * 17, y: 6 + ((i * 13) % 34), speed: 2 + (i % 4) });
    }

    this.overlay = this.add.graphics().setDepth(12);
    for (const star of this.stars) {
      this.starImages.set(star.id, this.add.image(0, 0, FLIGHT_TEX.star).setOrigin(0.5, 0.5).setVisible(false));
    }

    this.knight = this.add.sprite(KNIGHT_X, KNIGHT_Y, chibiKey(this.characterId, 'up', 'stand')).setDepth(20);
    if (this.anims.exists(`walk_${this.characterId}_up`)) this.knight.play(`walk_${this.characterId}_up`);

    this.radar = this.add.graphics().setDepth(40);
    this.add.image(MINI.x, MINI.y, FLIGHT_TEX.outline).setOrigin(0, 0).setDepth(38).setAlpha(0.9);
    this.plate = this.add.graphics().setDepth(41);
    this.plateText = this.add.text(VIEW_W / 2, 6, '', { ...textStyle('#ffffff'), stroke: '#14121f', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(42);
    this.bar = this.add.graphics().setDepth(44);
    this.drawBar();

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = {
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      z: kb.addKey('Z'),
      x: kb.addKey('X'),
      j: kb.addKey('J'),
      k: kb.addKey('K'),
      shift: kb.addKey('SHIFT'),
    };
    kb.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === ' ' || k === 'enter' || k === 'z') this.pressA();
      else if (k === 'escape') this.land(this.stars[0]);
    });

    let alive = true;
    this.events.once('shutdown', () => {
      alive = false;
      if (window.__flight === bridge) delete window.__flight;
    });
    for (const region of REGIONS) {
      void fetchRegionWeather(region).then((w) => {
        if (alive) this.weather.set(region.id, w);
      });
    }

    audio.playMusic('flight');
    audio.setAmbience('windy');

    const bridge: FlightBridge = {
      state: () => ({ ...lonLatOf(this.state), alt: this.state.alt, speed: this.state.speed, yaw: this.state.yaw, p: { ...this.state.p } }),
      stars: () => this.stars.map((st) => ({ id: st.id, lon: Math.atan2(st.v.x, st.v.z) * (180 / Math.PI), lat: Math.asin(st.v.y) * (180 / Math.PI) })),
      near: () => this.nearId,
      low: () => this.lowNow,
      frames: () => this.frames,
      landing: () => this.isLanding,
      weatherReady: () => this.weather.size,
      teleportTo: (id, alt = ALT_MIN) => {
        const star = this.stars.find((st) => st.id === id);
        if (star) this.state = { ...this.state, p: star.v, f: faceToward(star.v, add(star.v, this.state.f)), alt, speed: 0 };
        this.flying = TAKEOFF_MS;
      },
    };
    window.__flight = bridge;
  }

  /** The climb out of the pad: up to a low cruising height (or a second, whichever comes first), and then the controls are theirs. */
  private inTakeoff(): boolean {
    return this.flying < TAKEOFF_MS && this.state.alt < TAKEOFF_ALT;
  }

  private readInput(): FlightInput {
    const c = this.cursors;
    const k = this.keys;
    // the climb out of the pad: up to a low cruising height, and then the controls are theirs
    const climbing = this.inTakeoff();
    return {
      left: !!(c.left?.isDown || k.a.isDown),
      right: !!(c.right?.isDown || k.d.isDown),
      forward: !!(c.up?.isDown || k.w.isDown),
      back: !!(c.down?.isDown || k.s.isDown),
      descend: !climbing && !!(c.space?.isDown || k.z.isDown),
      ascend: climbing || !!(k.x.isDown || k.j.isDown || k.k.isDown || k.shift.isDown),
    };
  }

  update(time: number, delta: number) {
    this.frames += 1;
    if (!this.isLanding) {
      this.flying += delta;
      const input = this.readInput();
      const before = this.state.yaw;
      this.state = stepFlight(this.state, input, delta);
      // A both descends and lands: hold it all the way down over a star and you touch down there.
      const below = starNear(this.stars, this.state);
      if (input.descend && below && this.state.alt <= ALT_MIN + 0.001 && !this.inTakeoff()) this.land(below);
      this.tilt += (Phaser.Math.Clamp((this.state.yaw - before) * 70, -0.35, 0.35) - this.tilt) * 0.2;
    }

    this.ground.render(this.state);
    this.moveClouds(time);
    const at = projectToScreen(this.state, knightPoint(this.state));
    const ky = at ? Phaser.Math.Clamp(at.sy, 60, 92) : KNIGHT_Y;
    this.knight.setPosition(KNIGHT_X, ky + Math.sin(time / 170) * 1.5).setRotation(this.tilt);
    // flapping only while they fly
    if (this.state.speed > 0.05 && this.anims.exists(`walk_${this.characterId}_up`)) {
      if (!this.knight.anims.isPlaying) this.knight.play(`walk_${this.characterId}_up`);
    } else {
      this.knight.anims.stop();
      this.knight.setTexture(chibiKey(this.characterId, 'up', 'stand'));
    }

    const near = starNear(this.stars, this.state);
    this.nearId = near?.id ?? '';
    this.lowNow = atLandingHeight(this.state);

    this.overlay.clear();
    const under = projectToScreen(this.state, this.state.p);
    if (under) this.shadow(this.overlay, under.sx, under.sy, 12 - Math.round(((this.state.alt - ALT_MIN) / 0.28) * 7));
    this.placeStars(time, near);
    this.drawRadar();
    this.drawPlate();
    this.drawBar();
  }

  private moveClouds(time: number) {
    const turn = this.state.yaw * 140;
    const open = 1 - Math.min(1, (this.state.alt - ALT_MIN) / 0.28) * 0.6; // the higher you are, the thinner the cloud
    for (const cloud of this.clouds) {
      const x = ((((cloud.base - turn + (time / 1000) * cloud.speed) % 330) + 330) % 330) - 45;
      cloud.img.setPosition(x, cloud.y).setAlpha(0.85 * open);
    }
  }

  /** A pixel oval on the ground: the black blobs under things that fly. */
  private shadow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number) {
    if (cy > BAR_Y || cy < HORIZON || w < 3) return;
    const x = Math.round(cx);
    const y = Math.round(cy);
    g.fillStyle(0x0c1420, 0.8);
    g.fillRect(x - w / 2 + 2, y - 1, w - 4, 1);
    g.fillRect(x - w / 2, y, w, 1);
    g.fillRect(x - w / 2 + 2, y + 1, w - 4, 1);
  }

  private colourOf(star: Star): number {
    if (star.home) return HOME_COLOUR;
    const w = this.weather.get(star.id);
    return w ? STAR_COLOURS[w.condition] ?? STAR_UNKNOWN : STAR_UNKNOWN;
  }

  private placeStars(time: number, near: Star | null) {
    for (const star of this.stars) {
      const img = this.starImages.get(star.id)!;
      const float = 0.03 + Math.sin(time / 260 + star.x) * 0.004;
      const top = projectToScreen(this.state, scale(star.v, 1 + float));
      const base = projectToScreen(this.state, star.v);
      if (!top || !base || top.sy > BAR_Y + 12 || top.sx < -20 || top.sx > VIEW_W + 20) {
        img.setVisible(false);
        continue;
      }
      const size = Phaser.Math.Clamp(Math.round((0.25 / top.depth) * 2) / 2, 1, 2.5);
      const haze = Phaser.Math.Clamp(1.1 - top.depth * 0.7, 0.5, 1);
      img
        .setVisible(true)
        .setPosition(Math.round(top.sx), Math.round(top.sy))
        .setScale(size)
        .setTint(this.colourOf(star))
        .setAlpha(haze * (0.82 + 0.18 * Math.sin(time / 140 + star.x)))
        .setDepth(top.depth < CAM_BACK ? 30 : 10 + Math.max(0, 4 - top.depth * 4));
      this.shadow(this.overlay, base.sx, base.sy, Math.round(6 * size));
      if (top.depth > 0.3) {
        // a faint beam of light: stars can be seen from across the ocean
        const bx = Math.round(top.sx);
        const h = Math.max(0, Math.round(top.sy - 6 * size));
        this.overlay.fillStyle(this.colourOf(star), 0.28 * haze).fillRect(bx, 0, 1, h);
        this.overlay.fillStyle(0xffffff, 0.16 * haze).fillRect(bx - 1, 0, 3, h);
      }
      if (near && near.id === star.id && this.lowNow && base.sy < BAR_Y) {
        // a pulsing ring on the ground says "land here"
        const r = Math.round(7 * size + 1.5 * Math.sin(time / 120));
        this.overlay.lineStyle(1, 0xffffff, 0.9).strokeRect(Math.round(base.sx - r), Math.round(base.sy - r / 3), r * 2, Math.round((r * 2) / 3));
      }
      const w = this.weather.get(star.id);
      if (w && top.depth < 0.9) drawWeatherIcon(this.overlay, Math.round(top.sx) - 4, Math.round(top.sy - 7 * size - 10), w.condition);
    }
  }

  private drawRadar() {
    const g = this.radar;
    const { x: cx, y: cy, r } = RADAR;
    g.clear();
    const disc = (rad: number, color: number, alpha: number) => {
      g.fillStyle(color, alpha);
      for (let dy = -rad; dy <= rad; dy++) {
        const half = Math.round(Math.sqrt(rad * rad - dy * dy));
        g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
      }
    };
    disc(r + 2, 0x14121f, 1);
    disc(r + 1, 0xe8f0f8, 1);
    disc(r, 0x142a44, 0.92);
    g.fillStyle(0x2f6a8a, 0.8);
    g.fillRect(cx - r + 1, cy, r * 2 - 1, 1);
    g.fillRect(cx, cy - r + 1, 1, r * 2 - 1);
    g.lineStyle(1, 0x2f6a8a, 0.8).strokeCircle(cx, cy, Math.round(r / 2));
    for (const star of this.stars) {
      const p = radarPoint(this.state, star, RADAR.range);
      const colour = this.colourOf(star);
      const px = Math.round(cx + p.x * (r - 2));
      const py = Math.round(cy + p.y * (r - 2));
      g.fillStyle(0x14121f, 1).fillRect(px - 2, py - 2, 5, 5);
      g.fillStyle(colour, p.far ? 0.6 : 1).fillRect(px - 1, py - 1, 3, 3);
    }
    // the knight: a small arrow at the centre, always pointing up
    g.fillStyle(0xffffff, 1);
    g.fillRect(cx, cy - 2, 1, 5);
    g.fillRect(cx - 1, cy - 1, 3, 1);
    g.fillRect(cx - 2, cy, 5, 1);

    // the world in the clouds, with a blinking dot for where you are
    const here = lonLatOf(this.state);
    const spot = project(here.lon, here.lat);
    const mx = MINI.x + Math.min(OUTLINE_W - 1, spot.x / OUTLINE_CELL);
    const my = MINI.y + Math.min(OUTLINE_H - 1, spot.y / OUTLINE_CELL);
    if (Math.floor(this.frames / 20) % 2 === 0) g.fillStyle(0xff4a4a, 1).fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
    for (const star of this.stars) {
      g.fillStyle(this.colourOf(star), 1).fillRect(MINI.x + Math.floor(star.x / OUTLINE_CELL), MINI.y + Math.floor(star.y / OUTLINE_CELL), 1, 1);
    }
  }

  /** The nearest star's name and weather, across the top, once it is close enough to matter. */
  private drawPlate() {
    let best: Star | null = null;
    let bestD = 0.9;
    for (const star of this.stars) {
      const d = groundDistance(this.state, star);
      if (d < bestD) {
        best = star;
        bestD = d;
      }
    }
    this.plate.clear();
    if (!best) {
      this.plateText.setText('');
      return;
    }
    const w = this.weather.get(best.id);
    const name = (this.regionOf(best)?.shortName ?? best.name).toUpperCase();
    const label = w ? `${name} ${WEATHER_SHORT[w.condition] ?? ''} ${Math.round(w.temp)}C` : name;
    this.plateText.setText(label).setX(VIEW_W / 2 + (w ? 5 : 0));
    const width = this.plateText.width + (w ? 18 : 8);
    this.plate.fillStyle(0x14121f, 0.65).fillRect(Math.round(VIEW_W / 2 - width / 2), 3, width, 13);
    if (w) drawWeatherIcon(this.plate, Math.round(VIEW_W / 2 - width / 2) + 3, 5, w.condition);
  }

  private regionOf(star: Star): RegionDef | undefined {
    return REGIONS.find((r) => r.id === star.id);
  }

  /** The strip along the bottom that says what A and B do; it changes over a star. */
  private drawBar() {
    const near = this.nearId ? this.stars.find((s) => s.id === this.nearId) : undefined;
    const name = near ? (this.regionOf(near)?.shortName ?? near.name).toUpperCase() : '';
    const parts: { t: string; c: string }[] = near && this.lowNow
      ? [{ t: 'A:', c: '#ffffff' }, { t: ' LAND ', c: '#ffd85a' }, { t: name, c: '#58e0b0' }]
      : near
        ? [{ t: 'A:', c: '#ffffff' }, { t: ' DESCEND TO LAND', c: '#58e0b0' }]
        : [{ t: 'UP:', c: '#ffffff' }, { t: ' FLY ', c: '#58e0b0' }, { t: 'A:', c: '#ffffff' }, { t: ' DESCEND ', c: '#58e0b0' }, { t: 'B:', c: '#ffffff' }, { t: ' ASCEND', c: '#58e0b0' }];
    const key = parts.map((p) => p.t).join('|');
    if (key === this.barKey) return;
    this.barKey = key;
    this.bar.clear();
    this.bar.fillStyle(0x0c2418, 1).fillRect(0, BAR_Y, VIEW_W, VIEW_H - BAR_Y);
    this.bar.fillStyle(0xf0c020, 1).fillRect(0, BAR_Y, VIEW_W, 2).fillRect(0, VIEW_H - 2, VIEW_W, 2);
    for (const t of this.barTexts) t.destroy();
    this.barTexts = [];
    let x = 8;
    for (const part of parts) {
      const text = this.add.text(x, BAR_Y + 7, part.t, textStyle(part.c)).setDepth(46);
      this.barTexts.push(text);
      x += text.width;
    }
  }

  /** A tapped over a star, low enough: land. Held, A descends (in `readInput`) and lands once it reaches the ground. */
  private pressA() {
    if (this.isLanding || this.inTakeoff()) return;
    const near = starNear(this.stars, this.state);
    if (near && atLandingHeight(this.state)) this.land(near);
  }

  private land(star: Star) {
    if (this.isLanding) return;
    this.isLanding = true;
    audio.play('confirm');
    this.tweens.add({ targets: this.knight, scale: 0.55, y: KNIGHT_Y + 14, duration: 420, ease: 'Sine.easeIn' });
    this.cameras.main.fadeOut(480, 255, 255, 255);
    this.time.delayedCall(560, () => {
      if (star.home) {
        this.scene.start('TownScene', { at: 'pad' });
        return;
      }
      const region = this.regionOf(star)!;
      this.scene.start('GameScene', runStartData(this.characterId, region, this.weather.get(region.id)));
    });
  }
}
