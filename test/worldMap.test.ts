import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/config/regions';
import {
  add,
  ALT_MAX,
  ALT_MIN,
  atLandingHeight,
  cameraOf,
  CRUISE,
  cruiseFactor,
  cross,
  dot,
  faceToward,
  groundDistance,
  isLandAt,
  knightPoint,
  landMask,
  length,
  lonLatOf,
  lonLatToVec,
  MAP_H,
  MAP_W,
  MISTFORD_ID,
  MISTFORD_LONLAT,
  NO_INPUT,
  RAMP_S,
  project,
  projectToScreen,
  radarPoint,
  scale,
  starNear,
  starsFor,
  startFlight,
  stepFlight,
  TURN_RATE,
  unproject,
  vecToLonLat,
  VIEW_W,
  type FlightInput,
  type FlightState,
} from '../src/systems/worldMap';

const stars = starsFor(REGIONS);
const star = (id: string) => stars.find((s) => s.id === id)!;
const FRAME = 1000 / 60;

/** Hovering over (lon, lat), facing east, at `alt`. */
const over = (lon: number, lat: number, alt = ALT_MIN): FlightState => ({ ...startFlight(lonLatToVec(lon, lat), lonLatToVec(lon + 5, lat)), alt });

/** Run `ms` of frames with the same input. */
function fly(s: FlightState, input: Partial<FlightInput>, ms: number): FlightState {
  let cur = s;
  for (let t = 0; t < ms; t += FRAME) cur = stepFlight(cur, { ...NO_INPUT, ...input }, FRAME);
  return cur;
}
const angleBetween = (a: FlightState, b: FlightState) => Math.acos(Math.max(-1, Math.min(1, dot(a.p, b.p))));

/** True if any pixel within `r` of the point is land (cities sit on coasts, so the exact pixel may be sea). */
function landWithin(x: number, y: number, r: number) {
  const mask = landMask();
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (mask[Math.round(y + dy) * MAP_W + Math.round(x + dx)]) return true;
  return false;
}

describe('the world', () => {
  it('projects longitude and latitude to the map and back', () => {
    for (const [lon, lat] of [[0, 0], [-74, 40.7], [139.6, 35.7], [-179, -80]]) {
      const p = project(lon, lat);
      const back = unproject(p.x, p.y);
      expect(back.lon).toBeCloseTo(lon, 6);
      expect(back.lat).toBeCloseTo(lat, 6);
    }
    expect(project(-180, 90)).toEqual({ x: 0, y: 0 });
    expect(project(180, -90)).toEqual({ x: MAP_W, y: MAP_H });
  });

  it('has the continents where they belong, and oceans between them', () => {
    expect(isLandAt(10, 20)).toBe(true); // the Sahara
    expect(isLandAt(-100, 40)).toBe(true); // the US
    expect(isLandAt(100, 55)).toBe(true); // Siberia
    expect(isLandAt(135, -25)).toBe(true); // Australia
    expect(isLandAt(-60, -10)).toBe(true); // Brazil
    expect(isLandAt(0, -85)).toBe(true); // Antarctica
    expect(isLandAt(-150, 0)).toBe(false); // the Pacific
    expect(isLandAt(-30, 0)).toBe(false); // the Atlantic
    expect(isLandAt(80, -30)).toBe(false); // the Indian Ocean
    expect(isLandAt(34, 43)).toBe(false); // the Black Sea
  });

  it('puts every city on land, and Mistford on its own island in the Atlantic', () => {
    for (const region of REGIONS) {
      const s = star(region.id);
      expect(landWithin(s.x, s.y, 4), `${region.id} is on land`).toBe(true);
    }
    expect(star(MISTFORD_ID).home).toBe(true);
    expect(isLandAt(MISTFORD_LONLAT[0], MISTFORD_LONLAT[1])).toBe(true);
    expect(isLandAt(MISTFORD_LONLAT[0], MISTFORD_LONLAT[1] + 8), 'it is an island').toBe(false);
  });

  it('has a star for Mistford first and then one for every city, each in a different place', () => {
    expect(stars.map((s) => s.id)).toEqual([MISTFORD_ID, ...REGIONS.map((r) => r.id)]);
    for (let i = 0; i < stars.length; i++) {
      expect(length(stars[i].v), stars[i].id).toBeCloseTo(1, 9);
      for (let j = i + 1; j < stars.length; j++) {
        expect(Math.acos(dot(stars[i].v, stars[j].v)), `${stars[i].id} / ${stars[j].id}`).toBeGreaterThan(0.1);
      }
    }
    expect(star('tokyo').x).toBeGreaterThan(star('london').x);
    expect(star('london').x).toBeGreaterThan(star('nyc').x);
    expect(star('mumbai').y).toBeGreaterThan(star('london').y);
  });

  it('gives each star its real place on the sphere', () => {
    for (const r of REGIONS) {
      const back = vecToLonLat(star(r.id).v);
      expect(back.lon, r.id).toBeCloseTo(r.lon, 6);
      expect(back.lat, r.id).toBeCloseTo(r.lat, 6);
    }
    // London to New York is about 5,570 km: 0.874 of the planet's radius (6,371 km)
    expect(groundDistance(over(-74.006, 40.7128), star('london'))).toBeGreaterThan(0.85);
    expect(groundDistance(over(-74.006, 40.7128), star('london'))).toBeLessThan(0.9);
  });

  it('turns longitude and latitude into points on the sphere and back, including the poles', () => {
    expect(lonLatToVec(0, 0)).toEqual({ x: 0, y: 0, z: 1 });
    expect(lonLatToVec(90, 0).x).toBeCloseTo(1, 12);
    expect(lonLatToVec(0, 90).y).toBeCloseTo(1, 12);
    for (const [lon, lat] of [[10, 20], [-120, -45], [179, 80], [-179, -80]]) {
      const back = vecToLonLat(lonLatToVec(lon, lat));
      expect(back.lon).toBeCloseTo(lon, 9);
      expect(back.lat).toBeCloseTo(lat, 9);
    }
  });
});

describe('flying: the knight only moves when told to', () => {
  it('starts hovering, low, facing along the ground', () => {
    const s = startFlight(lonLatToVec(10, 20), lonLatToVec(30, 20));
    expect(s.speed).toBe(0);
    expect(s.alt).toBe(ALT_MIN);
    expect(length(s.p)).toBeCloseTo(1, 12);
    expect(dot(s.p, s.f)).toBeCloseTo(0, 12);
    expect(length(s.f)).toBeCloseTo(1, 12);
  });

  it('does not drift: with no key held the knight stays exactly where they are, however long you wait', () => {
    const s = over(10, 20);
    const later = fly(s, {}, 30_000);
    expect(later.p).toEqual(s.p);
    expect(later.speed).toBe(0);
  });

  it('turning and climbing do not move them either', () => {
    const s = over(10, 20);
    const turned = fly(s, { left: true, ascend: true }, 2000);
    expect(angleBetween(s, turned)).toBeCloseTo(0, 9);
    expect(turned.alt).toBeGreaterThan(s.alt);
  });

  it('flies forward only while Up is held, builds speed, and coasts to a stop when released', () => {
    const s = over(0, 0);
    const a = fly(s, { forward: true }, 1000);
    const moved = angleBetween(s, a);
    expect(moved).toBeGreaterThan(CRUISE * 0.8);
    expect(moved).toBeLessThanOrEqual(CRUISE + 1e-9);
    expect(a.speed).toBeCloseTo(CRUISE, 9);
    const stopped = fly(a, {}, 1000);
    expect(stopped.speed).toBe(0);
    const rest = fly(stopped, {}, 1000);
    expect(angleBetween(stopped, rest)).toBeCloseTo(0, 12);
    // it did not jump to full speed at once
    expect(stepFlight(s, { ...NO_INPUT, forward: true }, FRAME).speed).toBeLessThan(CRUISE);
    expect(stepFlight(s, { ...NO_INPUT, forward: true }, FRAME).speed).toBeCloseTo((CRUISE / RAMP_S) * (FRAME / 1000), 9);
    // and it takes the same short time to get up to speed at any height
    const high = { ...over(0, 0, ALT_MAX) };
    expect(fly(high, { forward: true }, RAMP_S * 1000 + FRAME).speed).toBeCloseTo(CRUISE * cruiseFactor(ALT_MAX), 9);
    expect(fly(s, { forward: true }, RAMP_S * 1000 + FRAME).speed).toBeCloseTo(CRUISE, 9);
  });

  it('Down backs up, slowly; forward is faster than back', () => {
    const s = over(0, 0);
    const back = fly(s, { back: true }, 1000);
    expect(dot(back.p, s.f)).toBeLessThan(0);
    expect(angleBetween(s, back)).toBeLessThan(angleBetween(s, fly(s, { forward: true }, 1000)));
    expect(back.speed).toBeLessThan(0);
  });

  it('flying higher is faster', () => {
    expect(cruiseFactor(ALT_MIN)).toBe(1);
    expect(cruiseFactor(ALT_MAX)).toBe(4);
    const low = fly(over(0, 0, ALT_MIN), { forward: true }, 2000);
    const high = fly(over(0, 0, ALT_MAX), { forward: true }, 2000);
    expect(angleBetween(over(0, 0), high)).toBeGreaterThan(angleBetween(over(0, 0), low) * 3);
  });

  it('B climbs and A descends, within limits', () => {
    expect(fly(over(0, 0, 0.1), { ascend: true }, 200).alt).toBeGreaterThan(0.1);
    expect(fly(over(0, 0, 0.1), { descend: true }, 200).alt).toBeLessThan(0.1);
    expect(fly(over(0, 0, ALT_MAX), { ascend: true }, 9000).alt).toBe(ALT_MAX);
    expect(fly(over(0, 0, ALT_MIN), { descend: true }, 9000).alt).toBe(ALT_MIN);
  });
});

describe('flying: the world is a sphere', () => {
  it('stays on the sphere and along the ground however long you fly and turn', () => {
    let s = over(30, 40, 0.15);
    for (let i = 0; i < 6000; i++) s = stepFlight(s, { ...NO_INPUT, forward: true, left: i % 400 < 150 }, FRAME);
    expect(length(s.p)).toBeCloseTo(1, 9);
    expect(length(s.f)).toBeCloseTo(1, 9);
    expect(dot(s.p, s.f)).toBeCloseTo(0, 9);
  });

  it('follows a great circle: flying east along the equator, longitude is the distance travelled', () => {
    let s = over(0, 0, ALT_MAX);
    const start = s;
    while (angleBetween(start, s) < Math.PI / 2) s = stepFlight(s, { ...NO_INPUT, forward: true }, FRAME);
    const here = lonLatOf(s);
    expect(here.lat).toBeCloseTo(0, 6);
    expect(here.lon).toBeCloseTo((angleBetween(start, s) * 180) / Math.PI, 3);
    expect(here.lon).toBeGreaterThan(89);
  });

  it('flies over the pole and out the other side: there is no edge to the world', () => {
    let s = { ...startFlight(lonLatToVec(0, 60), lonLatToVec(0, 70)), alt: ALT_MAX }; // facing north
    const start = s;
    let sawPole = 0;
    while (angleBetween(start, s) < (80 * Math.PI) / 180) {
      s = stepFlight(s, { ...NO_INPUT, forward: true }, FRAME);
      sawPole = Math.max(sawPole, lonLatOf(s).lat);
    }
    expect(sawPole).toBeGreaterThan(89);
    // 30 degrees to the pole, then 50 more down the other side: 40N, on the opposite meridian
    const end = lonLatOf(s);
    expect(end.lat).toBeGreaterThan(38);
    expect(end.lat).toBeLessThan(42);
    expect(Math.abs(end.lon)).toBeGreaterThan(170);
  });

  it('goes all the way round and comes back to where it started', () => {
    let s = over(10, 30, ALT_MAX);
    const start = s;
    let travelled = 0;
    let last = s;
    while (travelled < 2 * Math.PI - 0.01) {
      s = stepFlight(s, { ...NO_INPUT, forward: true }, FRAME);
      travelled += angleBetween(last, s);
      last = s;
    }
    // within one frame of home
    expect(angleBetween(start, s)).toBeLessThan(0.05);
  });

  it('turns clockwise to the right and anticlockwise to the left, on the spot', () => {
    const north = { ...startFlight(lonLatToVec(0, 0), lonLatToVec(0, 10)) };
    expect(north.f.y).toBeCloseTo(1, 9);
    const quarter = (Math.PI / 2 / TURN_RATE) * 1000;
    const right = fly(north, { right: true }, quarter);
    expect(right.f.x).toBeGreaterThan(0.98); // east
    const left = fly(north, { left: true }, quarter);
    expect(left.f.x).toBeLessThan(-0.98); // west
    expect(right.yaw).toBeGreaterThan(1.4);
    expect(left.yaw).toBeLessThan(-1.4);
    expect(angleBetween(north, right)).toBeCloseTo(0, 9);
  });

  it('faces a star: heading toward it puts it dead ahead, and flying forward reaches it', () => {
    const home = star(MISTFORD_ID);
    for (const city of REGIONS) {
      const target = star(city.id);
      let s = { ...startFlight(home.v, target.v), alt: ALT_MAX };
      const p = radarPoint(s, target, 5);
      expect(Math.abs(p.x), city.id).toBeLessThan(1e-6);
      expect(p.y, city.id).toBeLessThan(0);
      let frames = 0;
      while (groundDistance(s, target) > 0.02 && frames++ < 20_000) s = stepFlight(s, { ...NO_INPUT, forward: true }, FRAME);
      expect(groundDistance(s, target), `${city.id} reached`).toBeLessThan(0.1);
    }
  });

  it('faceToward is along the ground and points at the target', () => {
    const f = faceToward(lonLatToVec(0, 0), lonLatToVec(40, 0));
    expect(f.x).toBeCloseTo(1, 9);
    expect(dot(f, lonLatToVec(0, 0))).toBeCloseTo(0, 12);
  });
});

describe('seeing things from the camera', () => {
  const ahead = (s: FlightState, angle: number) => add(scale(s.p, Math.cos(angle)), scale(s.f, Math.sin(angle)));
  const toTheRight = (s: FlightState, angle: number) => add(scale(s.p, Math.cos(angle)), scale(cross(s.f, s.p), Math.sin(angle)));

  it('puts the camera behind and above the knight, looking along their heading', () => {
    const s = over(10, 20, 0.1);
    const cam = cameraOf(s);
    expect(length(cam.c)).toBeGreaterThan(1 + 0.1);
    expect(dot(cam.fc, cam.up)).toBeCloseTo(0, 9);
    expect(dot(cam.r, cam.up)).toBeCloseTo(0, 9);
    expect(dot(cam.r, cam.fc)).toBeCloseTo(0, 9);
    expect(dot(cam.fc, s.f)).toBeGreaterThan(0.99);
    expect(dot(cam.c, s.f)).toBeLessThan(dot(knightPoint(s), s.f)); // behind them
  });

  it('a star straight ahead is in the middle of the screen; to the right, right of centre', () => {
    const s = over(10, 20, 0.1);
    expect(projectToScreen(s, scale(ahead(s, 0.3), 1.03))!.sx).toBeCloseTo(VIEW_W / 2, 6);
    expect(projectToScreen(s, scale(toTheRight(s, 0.3), 1.03))!.sx).toBeGreaterThan(VIEW_W / 2 + 10);
    const left = add(scale(s.p, Math.cos(0.3)), scale(cross(s.p, s.f), Math.sin(0.3)));
    expect(projectToScreen(s, scale(left, 1.03))!.sx).toBeLessThan(VIEW_W / 2 - 10);
  });

  it('closer things are lower on the screen', () => {
    const s = over(10, 20, 0.1);
    const near = projectToScreen(s, ahead(s, 0.15))!;
    const far = projectToScreen(s, ahead(s, 0.3))!;
    expect(near.sy).toBeGreaterThan(far.sy);
    expect(near.depth).toBeLessThan(far.depth);
  });

  it('what is behind you, and what is on the far side of the planet, is not drawn', () => {
    const s = over(10, 20, 0.1);
    expect(projectToScreen(s, ahead(s, -0.6))).toBeNull(); // behind
    expect(projectToScreen(s, scale(s.p, -1))).toBeNull(); // the other side of the world
    expect(projectToScreen(s, ahead(s, 2.5))).toBeNull(); // over the horizon, ahead
    expect(projectToScreen(s, ahead(s, 0.3))).not.toBeNull(); // still on the near side of the horizon
  });

  it('works the same whichever way you face and wherever you are, including at the poles', () => {
    for (const [lon, lat] of [[0, 0], [170, 50], [-100, -60], [0, 89]]) {
      for (const turn of [0, 1, 2.5, -1.2]) {
        const s = fly(over(lon, lat, 0.1), { right: turn > 0, left: turn < 0 }, (Math.abs(turn) / TURN_RATE) * 1000);
        expect(projectToScreen(s, scale(ahead(s, 0.25), 1.03))!.sx, `${lon},${lat} ${turn}`).toBeCloseTo(VIEW_W / 2, 4);
      }
    }
  });

  it('a higher camera sees more of the world: a point that is over the horizon from the ground is visible from up high', () => {
    const low = over(0, 0, ALT_MIN);
    const high = over(0, 0, ALT_MAX);
    const far = ahead(low, 0.5); // beyond the horizon from near the ground, inside it from up high
    expect(projectToScreen(low, far)).toBeNull();
    expect(projectToScreen(high, far)).not.toBeNull();
  });
});

describe('finding and landing on stars', () => {
  it('finds the star you are over, within a forgiving radius', () => {
    const tokyo = star('tokyo');
    const s = { ...startFlight(tokyo.v, star('london').v) };
    expect(starNear(stars, s)?.id).toBe('tokyo');
    const nudged = fly(s, { forward: true }, 300);
    expect(groundDistance(nudged, tokyo)).toBeGreaterThan(0);
    expect(starNear(stars, nudged)?.id).toBe('tokyo');
    expect(starNear(stars, fly(s, { forward: true }, 4000))).toBeNull();
  });

  it('measures the distance along the ground, and can tell when the knight is low enough to land', () => {
    const a = over(0, 0);
    const b = over(0, 90);
    expect(groundDistance(a, { ...star('nyc'), v: b.p })).toBeCloseTo(Math.PI / 2, 9);
    expect(atLandingHeight(over(0, 0, ALT_MIN))).toBe(true);
    expect(atLandingHeight(over(0, 0, ALT_MAX))).toBe(false);
  });

  it('can hover over a star for as long as it likes, which is what makes landing easy', () => {
    const tokyo = star('tokyo');
    const s = startFlight(tokyo.v, star('london').v);
    const later = fly(s, { descend: true }, 5000);
    expect(starNear(stars, later)?.id).toBe('tokyo');
    expect(atLandingHeight(later)).toBe(true);
  });
});

describe('the radar', () => {
  it('puts what is ahead at the top, what is to the right on the right, whichever way you face', () => {
    for (const turn of [0, 1.1, 3, -2]) {
      const s = fly(over(10, 20), { right: turn > 0, left: turn < 0 }, (Math.abs(turn) / TURN_RATE) * 1000);
      const fwdV = add(scale(s.p, Math.cos(0.3)), scale(s.f, Math.sin(0.3)));
      const rgtV = add(scale(s.p, Math.cos(0.3)), scale(cross(s.f, s.p), Math.sin(0.3)));
      const a = radarPoint(s, { id: 'f', name: 'F', home: false, x: 0, y: 0, v: fwdV }, 1);
      expect(a.x).toBeCloseTo(0, 6);
      expect(a.y).toBeLessThan(0);
      const b = radarPoint(s, { id: 'r', name: 'R', home: false, x: 0, y: 0, v: rgtV }, 1);
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeCloseTo(0, 6);
    }
  });

  it('pins far stars to the rim and says so', () => {
    const s = over(0, 0);
    const far = { id: 'x', name: 'X', home: false, x: 0, y: 0, v: lonLatToVec(0, 80) };
    const p = radarPoint(s, far, 0.5);
    expect(p.far).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
    expect(radarPoint(s, { ...far, v: lonLatToVec(0, 10) }, 0.5).far).toBe(false);
  });
});
