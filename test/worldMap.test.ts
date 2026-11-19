import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/config/regions';
import {
  ALT_MAX,
  ALT_MIN,
  atLandingHeight,
  BOOST,
  CRUISE,
  groundDistance,
  headingTo,
  isLandAt,
  landMask,
  MAP_H,
  MAP_W,
  MISTFORD_ID,
  MISTFORD_LONLAT,
  NO_INPUT,
  project,
  projectToScreen,
  radarPoint,
  SLOW,
  starNear,
  starsFor,
  stepFlight,
  unproject,
  VIEW_W,
  wrapDx,
  type FlightState,
} from '../src/systems/worldMap';

const stars = starsFor(REGIONS);
const star = (id: string) => stars.find((s) => s.id === id)!;
const at = (over: Partial<FlightState> = {}): FlightState => ({ x: 500, y: 300, heading: 0, alt: 30, ...over });

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
      expect(landWithin(s.x, s.y, 3), `${region.id} is on land`).toBe(true);
    }
    const home = star(MISTFORD_ID);
    expect(home.home).toBe(true);
    expect(isLandAt(MISTFORD_LONLAT[0], MISTFORD_LONLAT[1])).toBe(true);
    expect(isLandAt(MISTFORD_LONLAT[0], MISTFORD_LONLAT[1] + 8), 'it is an island').toBe(false);
  });

  it('has a star for Mistford first and then one for every city, each in a different place', () => {
    expect(stars.map((s) => s.id)).toEqual([MISTFORD_ID, ...REGIONS.map((r) => r.id)]);
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        expect(Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y), `${stars[i].id} / ${stars[j].id}`).toBeGreaterThan(25);
      }
    }
    // real positions: Tokyo is east of London, which is east of New York; Mumbai is south of London
    expect(star('tokyo').x).toBeGreaterThan(star('london').x);
    expect(star('london').x).toBeGreaterThan(star('nyc').x);
    expect(star('mumbai').y).toBeGreaterThan(star('london').y);
  });
});

describe('stepFlight', () => {
  it('flies forward along the heading: north is up the map, east is to the right', () => {
    const north = stepFlight(at({ heading: 0 }), NO_INPUT, 1000);
    expect(north.x).toBeCloseTo(500, 6);
    expect(north.y).toBeCloseTo(300 - CRUISE, 6);
    const east = stepFlight(at({ heading: Math.PI / 2 }), NO_INPUT, 1000);
    expect(east.x).toBeCloseTo(500 + CRUISE, 6);
    expect(east.y).toBeCloseTo(300, 6);
  });

  it('steers: right turns clockwise, left anticlockwise, and neither is faster at an angle', () => {
    expect(stepFlight(at(), { ...NO_INPUT, right: true }, 500).heading).toBeGreaterThan(0);
    expect(stepFlight(at(), { ...NO_INPUT, left: true }, 500).heading).toBeLessThan(0);
    expect(stepFlight(at(), { ...NO_INPUT, left: true, right: true }, 500).heading).toBe(0);
    const a = stepFlight(at({ heading: 0.6 }), NO_INPUT, 1000);
    expect(Math.hypot(a.x - 500, a.y - 300)).toBeCloseTo(CRUISE, 6);
  });

  it('up boosts and down slows', () => {
    const dist = (input: Partial<Parameters<typeof stepFlight>[1]>) => {
      const f = stepFlight(at(), { ...NO_INPUT, ...input }, 1000);
      return Math.hypot(f.x - 500, f.y - 300);
    };
    expect(dist({ up: true })).toBeCloseTo(BOOST, 6);
    expect(dist({ down: true })).toBeCloseTo(SLOW, 6);
    expect(dist({ up: true })).toBeGreaterThan(dist({}));
    expect(dist({})).toBeGreaterThan(dist({ down: true }));
  });

  it('B climbs and A descends, within limits', () => {
    expect(stepFlight(at({ alt: 30 }), { ...NO_INPUT, ascend: true }, 200).alt).toBeGreaterThan(30);
    expect(stepFlight(at({ alt: 30 }), { ...NO_INPUT, descend: true }, 200).alt).toBeLessThan(30);
    expect(stepFlight(at({ alt: ALT_MAX }), { ...NO_INPUT, ascend: true }, 5000).alt).toBe(ALT_MAX);
    expect(stepFlight(at({ alt: ALT_MIN }), { ...NO_INPUT, descend: true }, 5000).alt).toBe(ALT_MIN);
  });

  it('the world is round east to west, but the poles stop you', () => {
    const wrapped = stepFlight(at({ x: MAP_W - 10, heading: Math.PI / 2 }), NO_INPUT, 1000);
    expect(wrapped.x).toBeGreaterThanOrEqual(0);
    expect(wrapped.x).toBeLessThan(MAP_W);
    expect(wrapped.x).toBeCloseTo(CRUISE - 10, 6);
    expect(stepFlight(at({ y: 8, heading: 0 }), NO_INPUT, 5000).y).toBeGreaterThanOrEqual(6);
    expect(stepFlight(at({ y: MAP_H - 8, heading: Math.PI }), NO_INPUT, 5000).y).toBeLessThanOrEqual(MAP_H - 6);
    expect(wrapDx(MAP_W - 20)).toBeCloseTo(-20, 6);
    expect(wrapDx(20)).toBeCloseTo(20, 6);
  });
});

describe('seeing the stars', () => {
  const ahead = (distance: number, over: Partial<FlightState> = {}) => {
    const f = at(over);
    return { f, s: { id: 'x', name: 'X', home: false, x: f.x + Math.sin(f.heading) * distance, y: f.y - Math.cos(f.heading) * distance } };
  };

  it('a star straight ahead is in the middle of the screen; to the right, right of centre', () => {
    const { f, s } = ahead(300);
    expect(projectToScreen(f, s.x, s.y, 10)!.sx).toBeCloseTo(VIEW_W / 2, 6);
    const right = projectToScreen(f, s.x + 40, s.y, 10)!;
    expect(right.sx).toBeGreaterThan(VIEW_W / 2);
    const left = projectToScreen(f, s.x - 40, s.y, 10)!;
    expect(left.sx).toBeLessThan(VIEW_W / 2);
  });

  it('closer things are lower on the screen, and things behind you are not drawn', () => {
    const { f, s } = ahead(400);
    const far = projectToScreen(f, s.x, s.y, 0)!;
    const near = projectToScreen(f, f.x + Math.sin(f.heading) * 120, f.y - Math.cos(f.heading) * 120, 0)!;
    expect(near.sy).toBeGreaterThan(far.sy);
    expect(near.depth).toBeLessThan(far.depth);
    expect(projectToScreen(f, f.x - Math.sin(f.heading) * 200, f.y + Math.cos(f.heading) * 200, 0)).toBeNull();
  });

  it('works the same whichever way you face, and across the seam of the world', () => {
    for (const heading of [0, 1, 2.5, -1.2]) {
      const { f, s } = ahead(250, { heading });
      expect(projectToScreen(f, s.x, s.y, 10)!.sx).toBeCloseTo(VIEW_W / 2, 4);
    }
    const f = at({ x: MAP_W - 30, y: 200, heading: Math.PI / 2 });
    expect(projectToScreen(f, 40, 200, 10)).not.toBeNull(); // 70px ahead, on the other side of the seam
  });

  it('finds the star you are over, and can tell when you are low enough to land', () => {
    const tokyo = star('tokyo');
    expect(starNear(stars, at({ x: tokyo.x + 5, y: tokyo.y - 5 }))?.id).toBe('tokyo');
    expect(starNear(stars, at({ x: tokyo.x + 60, y: tokyo.y }))).toBeNull();
    expect(starNear(stars, at({ x: tokyo.x + 20, y: tokyo.y }))?.id, 'a forgiving radius: the knight never stops flying').toBe('tokyo');
    expect(groundDistance(at({ x: tokyo.x + 3, y: tokyo.y + 4 }), tokyo)).toBeCloseTo(5, 6);
    expect(atLandingHeight(at({ alt: ALT_MIN }))).toBe(true);
    expect(atLandingHeight(at({ alt: ALT_MAX }))).toBe(false);
  });

  it('finds a star over the seam of the world too', () => {
    const f = at({ x: MAP_W - 3, y: 200 });
    expect(starNear([{ id: 'edge', name: 'Edge', home: false, x: 4, y: 200 }], f)?.id).toBe('edge');
  });
});

describe('the radar', () => {
  it('puts what is ahead at the top, what is to the right on the right, whichever way you face', () => {
    for (const heading of [0, 1.1, 3, -2]) {
      const f = at({ heading });
      const fwd = { id: 'f', name: 'F', home: false, x: f.x + Math.sin(heading) * 100, y: f.y - Math.cos(heading) * 100 };
      const rgt = { id: 'r', name: 'R', home: false, x: f.x + Math.cos(heading) * 100, y: f.y + Math.sin(heading) * 100 };
      const a = radarPoint(f, fwd, 400);
      expect(a.x).toBeCloseTo(0, 6);
      expect(a.y).toBeLessThan(0);
      const b = radarPoint(f, rgt, 400);
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeCloseTo(0, 6);
    }
  });

  it('pins far stars to the rim and says so', () => {
    const f = at();
    const p = radarPoint(f, { id: 'x', name: 'X', home: false, x: f.x, y: f.y - 1000 }, 300);
    expect(p.far).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6);
    expect(radarPoint(f, { id: 'x', name: 'X', home: false, x: f.x, y: f.y - 100 }, 300).far).toBe(false);
  });

  it('the first flight can face a city: heading to it puts it dead ahead', () => {
    const home = star(MISTFORD_ID);
    for (const city of REGIONS) {
      const target = star(city.id);
      const f = at({ x: home.x, y: home.y, heading: headingTo(home.x, home.y, target) });
      const p = radarPoint(f, target, 5000);
      expect(Math.abs(p.x), city.id).toBeLessThan(1e-6);
      expect(p.y, city.id).toBeLessThan(0);
    }
  });
});
