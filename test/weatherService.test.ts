import { describe, expect, it } from 'vitest';
import { REGIONS, getRegion } from '../src/config/regions';
import { classifyReading, CONDITION_PRESETS } from '../src/systems/WeatherService';
import { hasDrawnEmblem } from '../src/gfx/emblems';
import { DECOR_PALETTES, TERRAIN_THEMES } from '../src/gfx/palette';
import { buildSong } from '../src/audio/music';

const reading = (over: Partial<{ code: number; temp: number; wind: number; humidity: number }> = {}) => ({
  code: 0,
  temp: 15,
  wind: 5,
  humidity: 50,
  ...over,
});
const climate = (id: string) => getRegion(id).climate;

describe('classifyReading', () => {
  it('temperate cities: thunder, cold, wind, rain, then clear', () => {
    const c = climate('nyc');
    expect(classifyReading(reading({ code: 95 }), c)).toBe(CONDITION_PRESETS.thunderstorm);
    expect(classifyReading(reading({ temp: 2 }), c)).toBe(CONDITION_PRESETS.cold_front);
    expect(classifyReading(reading({ wind: 40 }), c)).toBe(CONDITION_PRESETS.windy);
    expect(classifyReading(reading({ code: 61 }), c)).toBe(CONDITION_PRESETS.rain);
    expect(classifyReading(reading(), c)).toBe(CONDITION_PRESETS.clear);
  });

  it('tropical cities: hurricane, downpour, heat, humid, then clear', () => {
    const c = climate('miami');
    expect(classifyReading(reading({ code: 95, wind: 70 }), c)).toBe(CONDITION_PRESETS.hurricane);
    expect(classifyReading(reading({ code: 95, wind: 20 }), c)).toBe(CONDITION_PRESETS.tropical_downpour);
    expect(classifyReading(reading({ code: 63 }), c)).toBe(CONDITION_PRESETS.tropical_downpour);
    expect(classifyReading(reading({ temp: 33 }), c)).toBe(CONDITION_PRESETS.heat);
    expect(classifyReading(reading({ humidity: 80 }), c)).toBe(CONDITION_PRESETS.humid);
    expect(classifyReading(reading({ temp: 25 }), c).condition).toBe('clear');
  });

  it('each city uses its own cut-offs', () => {
    // 4 C is a cold front in New York, but London is hardier: its cold front starts at 3 C
    expect(classifyReading(reading({ temp: 4 }), climate('nyc'))).toBe(CONDITION_PRESETS.cold_front);
    expect(classifyReading(reading({ temp: 4 }), climate('london'))).toBe(CONDITION_PRESETS.clear);
    // 33 km/h wind is Urban Wind in New York, but not in London
    expect(classifyReading(reading({ wind: 33 }), climate('nyc'))).toBe(CONDITION_PRESETS.windy);
    expect(classifyReading(reading({ wind: 33 }), climate('london'))).toBe(CONDITION_PRESETS.clear);
    // a strong storm is a typhoon in Tokyo, but only a thunderstorm in New York or London
    const storm = reading({ code: 95, wind: 70 });
    expect(classifyReading(storm, climate('tokyo'))).toBe(CONDITION_PRESETS.hurricane);
    expect(classifyReading(storm, climate('nyc'))).toBe(CONDITION_PRESETS.thunderstorm);
    expect(classifyReading(storm, climate('london'))).toBe(CONDITION_PRESETS.thunderstorm);
    // Mumbai is hotter before it counts as a Heat front, and its monsoon storms turn severe sooner than Miami's
    expect(classifyReading(reading({ temp: 32 }), climate('miami'))).toBe(CONDITION_PRESETS.heat);
    expect(classifyReading(reading({ temp: 32 }), climate('mumbai')).condition).not.toBe('heat');
    expect(classifyReading(reading({ code: 95, wind: 55 }), climate('mumbai'))).toBe(CONDITION_PRESETS.hurricane);
    expect(classifyReading(reading({ code: 95, wind: 55 }), climate('miami'))).toBe(CONDITION_PRESETS.tropical_downpour);
  });

  it('every front a city can produce is one the game knows how to play', () => {
    const known = new Set(Object.keys(CONDITION_PRESETS));
    for (const region of REGIONS) {
      for (const code of [0, 3, 45, 61, 80, 95]) {
        for (const temp of [-5, 15, 36]) {
          for (const wind of [5, 40, 80]) {
            const out = classifyReading(reading({ code, temp, wind, humidity: 85 }), region.climate);
            expect(known.has(out.condition), `${region.id} ${code}/${temp}/${wind}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('every city is fully defined', () => {
  it('has unique ids, keys, coordinates and its own art, palette and song', () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.terrainTilesKey)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.emblemKey)).size).toBe(REGIONS.length);
    expect(new Set(REGIONS.map((r) => r.music)).size).toBe(REGIONS.length);
    for (const r of REGIONS) {
      expect(r.lat, r.id).toBeGreaterThanOrEqual(-90);
      expect(r.lat, r.id).toBeLessThanOrEqual(90);
      expect(r.lon, r.id).toBeGreaterThanOrEqual(-180);
      expect(r.lon, r.id).toBeLessThanOrEqual(180);
      expect(TERRAIN_THEMES[r.id], `${r.id} terrain`).toBeDefined();
      expect(DECOR_PALETTES[r.id], `${r.id} decor`).toBeDefined();
      expect(buildSong(r.music).bars, `${r.id} song`).toBeGreaterThan(0);
      for (const line of [r.signatureHint, r.bossIntro].filter((x): x is string => !!x)) {
        const lines = line.split('\n');
        expect(lines.length, `${r.id} message`).toBeLessThanOrEqual(2);
        for (const l of lines) expect(l.length, `${r.id}: ${l}`).toBeLessThanOrEqual(27);
      }
    }
  });

  it('draws an emblem for each city that has no PNG', () => {
    expect(hasDrawnEmblem('london') && hasDrawnEmblem('tokyo') && hasDrawnEmblem('mumbai')).toBe(true);
    expect(hasDrawnEmblem('nyc') || hasDrawnEmblem('miami')).toBe(false);
  });

  it('the first two cities keep their keys, so the Digit1 and Digit2 shortcuts still pick them', () => {
    expect(REGIONS.slice(0, 2).map((r) => r.id)).toEqual(['nyc', 'miami']);
  });
});
