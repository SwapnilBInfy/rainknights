import { describe, expect, it } from 'vitest';
import { generateMap, TileType, type Grid } from '../src/systems/mapGen';
import {
  applyFlood,
  applyStaticWeather,
  effectsFor,
  floodRingsFor,
  ICE_GRIP,
  MUD_SLOW,
  waterBodies,
  WADE_SLOW,
  weatherTerrain,
} from '../src/systems/terrainRules';

const count = (g: Grid, t: number) => g.flat().filter((v) => v === t).length;
const nyc = generateMap('nyc', 12345).grid;

describe('tile effects', () => {
  it('shallow water soaks and slows, ice is slippery, everything else is ordinary', () => {
    expect(effectsFor(TileType.SHALLOW)).toEqual({ slow: WADE_SLOW, grip: 1, wet: true });
    expect(effectsFor(TileType.ICE).grip).toBe(ICE_GRIP);
    expect(effectsFor(TileType.ICE).wet).toBe(false);
    for (const t of [TileType.GRASS_A, TileType.GRASS_B, TileType.PATH, TileType.BRIDGE]) expect(effectsFor(t)).toEqual({ slow: 1, grip: 1, wet: false });
    expect(ICE_GRIP).toBeLessThan(0.5);
    expect(WADE_SLOW).toBeLessThan(1);
  });
});

describe('static weather', () => {
  it('a cold front freezes all water into walkable ice and leaves buildings alone', () => {
    const out = applyStaticWeather(nyc, 'cold_front', 1);
    expect(count(out, TileType.WATER)).toBe(0);
    expect(count(out, TileType.SHALLOW)).toBe(0);
    expect(count(out, TileType.ICE)).toBe(count(nyc, TileType.WATER) + count(nyc, TileType.SHALLOW));
    expect(count(out, TileType.BUILDING)).toBe(count(nyc, TileType.BUILDING));
  });

  it('heat dries the shallows but keeps the deep water', () => {
    const out = applyStaticWeather(nyc, 'heat', 1);
    expect(count(out, TileType.SHALLOW)).toBe(0);
    expect(count(out, TileType.WATER)).toBe(count(nyc, TileType.WATER));
  });

  it('rain leaves puddles, and more in a storm; clear weather changes nothing', () => {
    expect(applyStaticWeather(nyc, 'clear', 1)).toEqual(nyc);
    const rain = applyStaticWeather(nyc, 'rain', 1);
    const storm = applyStaticWeather(nyc, 'thunderstorm', 1);
    expect(count(rain, TileType.SHALLOW)).toBeGreaterThan(count(nyc, TileType.SHALLOW));
    expect(count(storm, TileType.SHALLOW)).toBeGreaterThan(count(rain, TileType.SHALLOW) - 1);
  });

  it('puddles are deterministic per seed and never appear on the spawn plaza or in buildings', () => {
    expect(applyStaticWeather(nyc, 'rain', 9)).toEqual(applyStaticWeather(nyc, 'rain', 9));
    const out = applyStaticWeather(nyc, 'rain', 9);
    const cx = Math.floor(out[0].length / 2);
    const cy = Math.floor(out.length / 2);
    for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 7; x <= cx + 7; x++) expect(out[y][x]).toBe(nyc[y][x]);
    expect(count(out, TileType.BUILDING)).toBe(count(nyc, TileType.BUILDING));
  });

  it('does not change the grid it is given', () => {
    const before = nyc.map((r) => r.slice());
    applyStaticWeather(nyc, 'cold_front', 1);
    applyStaticWeather(nyc, 'rain', 1);
    expect(nyc).toEqual(before);
  });

  it('knows which weather does what', () => {
    expect(weatherTerrain('cold_front').freeze).toBe(true);
    expect(weatherTerrain('heat').dry).toBe(true);
    expect(weatherTerrain('hurricane').puddleDensity).toBeGreaterThan(0);
    expect(weatherTerrain('clear')).toEqual({ freeze: false, dry: false, puddleDensity: 0, mudDensity: 0 });
  });
});

describe('flooding', () => {
  it('only hurricanes and downpours flood, and the flood grows with the storm front', () => {
    expect(floodRingsFor('clear', 5)).toBe(0);
    expect(floodRingsFor('thunderstorm', 5)).toBe(0);
    let last = -1;
    for (let f = 0; f <= 5; f++) {
      const r = floodRingsFor('hurricane', f);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    expect(floodRingsFor('hurricane', 0)).toBe(0);
    expect(floodRingsFor('hurricane', 5)).toBe(4);
    expect(floodRingsFor('tropical_downpour', 5)).toBe(2);
  });

  it('spreads shallow water out from existing water, ring by ring, only over open ground', () => {
    const base = applyStaticWeather(nyc, 'hurricane', 3);
    const one = applyFlood(base, 1);
    const three = applyFlood(base, 3);
    expect(count(one, TileType.SHALLOW)).toBeGreaterThan(count(base, TileType.SHALLOW));
    expect(count(three, TileType.SHALLOW)).toBeGreaterThan(count(one, TileType.SHALLOW));
    expect(count(three, TileType.BUILDING)).toBe(count(base, TileType.BUILDING));
    expect(count(three, TileType.WATER)).toBe(count(base, TileType.WATER));
    expect(applyFlood(base, 0)).toEqual(base);
  });

  it('never makes a walkable tile solid', () => {
    const base = applyStaticWeather(nyc, 'hurricane', 3);
    const flooded = applyFlood(base, 4);
    for (let y = 0; y < base.length; y++) {
      for (let x = 0; x < base[0].length; x++) {
        if (flooded[y][x] !== base[y][x]) expect(flooded[y][x]).toBe(TileType.SHALLOW);
      }
    }
  });
});

describe('water bodies', () => {
  it('labels connected water with one id, separate ponds with different ids, and land with 0', () => {
    const g: Grid = Array.from({ length: 10 }, () => Array<number>(10).fill(TileType.GRASS_A));
    g[2][2] = TileType.SHALLOW;
    g[2][3] = TileType.WATER; // same body: deep and shallow together
    g[7][7] = TileType.SHALLOW; // a separate pond
    const b = waterBodies(g);
    expect(b.count).toBe(2);
    expect(b.ids[2 * 10 + 2]).toBe(b.ids[2 * 10 + 3]);
    expect(b.ids[7 * 10 + 7]).not.toBe(b.ids[2 * 10 + 2]);
    expect(b.ids[0]).toBe(0);
  });

  it('a river is one body even where bridges cross it, so a strike runs through all of it', () => {
    const g = generateMap('nyc', 12345).grid;
    const b = waterBodies(g);
    const sizes = new Map<number, number>();
    for (const id of b.ids) if (id) sizes.set(id, (sizes.get(id) ?? 0) + 1);
    expect(Math.max(...sizes.values())).toBeGreaterThan(400); // bridges do not cut it in two
  });
});

describe('mud', () => {
  const count = (grid: Grid, t: number) => grid.flat().filter((v) => v === t).length;

  it('slows you down but does not soak you, and is not solid', () => {
    expect(effectsFor(TileType.MUD)).toEqual({ slow: MUD_SLOW, grip: 1, wet: false });
    expect(MUD_SLOW).toBeLessThan(1);
    expect(MUD_SLOW).toBeLessThan(0.85); // worse than wading
    expect(effectsFor(TileType.GRASS_A).slow).toBe(1);
  });

  it('rain churns open grass into mud; heat, cold and clear skies leave none', () => {
    const { grid } = generateMap('nyc', 33);
    for (const wet of ['rain', 'thunderstorm', 'tropical_downpour', 'hurricane']) {
      expect(count(applyStaticWeather(grid, wet, 33), TileType.MUD), wet).toBeGreaterThan(8);
    }
    for (const dry of ['clear', 'heat', 'cold_front', 'windy']) expect(count(applyStaticWeather(grid, dry, 33), TileType.MUD), dry).toBe(0);
    expect(weatherTerrain('tropical_downpour').mudDensity).toBeGreaterThan(weatherTerrain('rain').mudDensity);
  });

  it('only ever replaces grass: never a road, a building, the water or the plaza', () => {
    for (const region of ['nyc', 'miami', 'london', 'tokyo', 'mumbai']) {
      const { grid, spawn } = generateMap(region, 77);
      const out = applyStaticWeather(grid, 'tropical_downpour', 77);
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[0].length; x++) {
          if (out[y][x] !== TileType.MUD) continue;
          expect([TileType.GRASS_A, TileType.GRASS_B], `${region} ${x},${y} was ${grid[y][x]}`).toContain(grid[y][x]);
          expect(Math.hypot(x - spawn.col, y - spawn.row), 'the plaza stays clear').toBeGreaterThan(7);
        }
      }
    }
  });

  it('is the same map every time for the same seed and weather, and different for another seed', () => {
    const { grid } = generateMap('london', 5);
    expect(applyStaticWeather(grid, 'rain', 5)).toEqual(applyStaticWeather(grid, 'rain', 5));
    expect(applyStaticWeather(grid, 'rain', 5)).not.toEqual(applyStaticWeather(grid, 'rain', 6));
  });

  it('collects beside water, where the ground is low', () => {
    let near = 0;
    let far = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { grid } = generateMap('nyc', seed);
      const out = applyStaticWeather(grid, 'rain', seed);
      const water = (x: number, y: number) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if ([TileType.WATER, TileType.SHALLOW].includes(grid[y + dy]?.[x + dx])) return true;
        return false;
      };
      for (let y = 0; y < out.length; y++) for (let x = 0; x < out[0].length; x++) if (out[y][x] === TileType.MUD) (water(x, y) ? (near += 1) : (far += 1));
    }
    expect(near + far).toBeGreaterThan(0);
    expect(near / (near + far)).toBeGreaterThan(0.4);
  });
});
