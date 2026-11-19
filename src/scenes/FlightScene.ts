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
  ALT_MIN,
  atLandingHeight,
  CAM_BACK,
  CAM_LIFT,
  FOCAL,
  HORIZON,
  groundDistance,
  headingTo,
  projectToScreen,
  radarPoint,
  starNear,
  starsFor,
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
/** Where the knight sits on the screen: fixed, because the camera rides along behind them. */
const KNIGHT_Y = HORIZON + Math.round((CAM_LIFT * FOCAL) / CAM_BACK);
const BAR_Y = 138;
const RADAR = { x: 24, y: 24, r: 17, range: 380 };
const MINI = { x: 172, y: 5 };
/** How long (ms) the knight climbs out of Mistford on takeoff, before the controls are theirs. */
const TAKEOFF_MS = 900;

interface FlightBridge {
  state: () => FlightState;
  stars: () => { id: string; x: number; y: number }[];
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
 * Flying between locations. The world map is the ground, seen in perspective from behind the knight, and every
 * location is a star hovering over it. Steer with left and right, A descends (and lands, over a star), B ascends.
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

  create() {
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

    const home = this.stars[0];
    // The first flight faces the first city, so there is somewhere to head for right away.
    this.state = { x: home.x, y: home.y, heading: headingTo(home.x, home.y, this.stars[1]), alt: ALT_MIN };

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
      state: () => ({ ...this.state }),
      stars: () => this.stars.map((s) => ({ id: s.id, x: s.x, y: s.y })),
      near: () => this.nearId,
      low: () => this.lowNow,
      frames: () => this.frames,
      landing: () => this.isLanding,
      weatherReady: () => this.weather.size,
      teleportTo: (id, alt = ALT_MIN) => {
        const star = this.stars.find((s) => s.id === id);
        if (star) this.state = { ...this.state, x: star.x, y: star.y, alt };
        this.flying = TAKEOFF_MS;
      },
    };
    window.__flight = bridge;
  }

  private readInput(): FlightInput {
    const c = this.cursors;
    const k = this.keys;
    const climbing = this.flying < TAKEOFF_MS;
    return {
      left: !!(c.left?.isDown || k.a.isDown),
      right: !!(c.right?.isDown || k.d.isDown),
      up: !!(c.up?.isDown || k.w.isDown),
      down: !!(c.down?.isDown || k.s.isDown),
      descend: !climbing && !!(c.space?.isDown || k.z.isDown),
      ascend: climbing || !!(k.x.isDown || k.j.isDown || k.k.isDown || k.shift.isDown),
    };
  }

  update(time: number, delta: number) {
    this.frames += 1;
    if (!this.isLanding) {
      this.flying += delta;
      const input = this.readInput();
      const before = this.state.heading;
      this.state = stepFlight(this.state, input, delta);
      // A both descends and lands: hold it all the way down over a star and you touch down there.
      const below = starNear(this.stars, this.state);
      if (input.descend && below && this.state.alt <= ALT_MIN + 0.001 && this.flying >= TAKEOFF_MS) this.land(below);
      this.tilt += (Phaser.Math.Clamp((this.state.heading - before) * 70, -0.35, 0.35) - this.tilt) * 0.2;
    }

    this.ground.render(this.state);
    this.moveClouds(time);
    this.knight.setPosition(KNIGHT_X, KNIGHT_Y + Math.sin(time / 170) * 1.5).setRotation(this.tilt);

    const near = starNear(this.stars, this.state);
    this.nearId = near?.id ?? '';
    this.lowNow = atLandingHeight(this.state);

    this.overlay.clear();
    this.shadow(this.overlay, KNIGHT_X, HORIZON + ((this.state.alt + CAM_LIFT) * FOCAL) / CAM_BACK, 12 - Math.round((this.state.alt - ALT_MIN) / 12));
    this.placeStars(time, near);
    this.drawRadar();
    this.drawPlate();
    this.drawBar();
  }

  private moveClouds(time: number) {
    const turn = this.state.heading * 140;
    for (const cloud of this.clouds) {
      const x = ((((cloud.base - turn + (time / 1000) * cloud.speed) % 330) + 330) % 330) - 45;
      cloud.img.setPosition(x, cloud.y);
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
      const float = 14 + Math.sin(time / 260 + star.x) * 1.6;
      const top = projectToScreen(this.state, star.x, star.y, float);
      const base = projectToScreen(this.state, star.x, star.y, 0);
      if (!top || !base || top.sy > BAR_Y + 12) {
        img.setVisible(false);
        continue;
      }
      const scale = Phaser.Math.Clamp(Math.round((FOCAL / top.depth) * 3 * 2) / 2, 1, 2.5);
      const haze = Phaser.Math.Clamp(1.1 - top.depth / 1900, 0.55, 1);
      img
        .setVisible(true)
        .setPosition(Math.round(top.sx), Math.round(top.sy))
        .setScale(scale)
        .setTint(this.colourOf(star))
        .setAlpha(haze * (0.82 + 0.18 * Math.sin(time / 140 + star.y)))
        .setDepth(top.depth < CAM_BACK ? 30 : 10 + Math.max(0, 4 - top.depth / 400));
      this.shadow(this.overlay, base.sx, base.sy, Math.round(6 * scale));
      if (top.depth > 90) {
        // a faint beam of light: stars can be seen from across the ocean
        const bx = Math.round(top.sx);
        this.overlay.fillStyle(this.colourOf(star), 0.28 * haze).fillRect(bx, 0, 1, Math.max(0, Math.round(top.sy - 6 * scale)));
        this.overlay.fillStyle(0xffffff, 0.16 * haze).fillRect(bx - 1, 0, 3, Math.max(0, Math.round(top.sy - 6 * scale)));
      }
      if (near && near.id === star.id && this.lowNow && base.sy < BAR_Y) {
        // a pulsing ring on the ground says "land here"
        const r = Math.round(7 * scale + 1.5 * Math.sin(time / 120));
        this.overlay.lineStyle(1, 0xffffff, 0.9).strokeRect(Math.round(base.sx - r), Math.round(base.sy - r / 3), r * 2, Math.round((r * 2) / 3));
      }
      const w = this.weather.get(star.id);
      if (w && top.depth < 330) drawWeatherIcon(this.overlay, Math.round(top.sx) - 4, Math.round(top.sy - 7 * scale - 10), w.condition);
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
    const mx = MINI.x + (this.state.x / OUTLINE_CELL) % OUTLINE_W;
    const my = MINI.y + Math.min(OUTLINE_H - 1, this.state.y / OUTLINE_CELL);
    if (Math.floor(this.frames / 20) % 2 === 0) g.fillStyle(0xff4a4a, 1).fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
    for (const star of this.stars) {
      g.fillStyle(this.colourOf(star), 1).fillRect(MINI.x + Math.floor(star.x / OUTLINE_CELL), MINI.y + Math.floor(star.y / OUTLINE_CELL), 1, 1);
    }
  }

  /** The nearest star's name and weather, across the top, once it is close enough to matter. */
  private drawPlate() {
    let best: Star | null = null;
    let bestD = 300;
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
        : [{ t: 'A:', c: '#ffffff' }, { t: ' DESCEND ', c: '#58e0b0' }, { t: 'B:', c: '#ffffff' }, { t: ' ASCEND', c: '#58e0b0' }];
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
    if (this.isLanding || this.flying < TAKEOFF_MS) return;
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
