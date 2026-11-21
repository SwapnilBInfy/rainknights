import type { RegionDef } from '../config/regions';
import type { RegionWeatherState } from './WeatherService';

/** What the weather is taken to be if the forecast has not come back by the time the player commits. */
const UNKNOWN: RegionWeatherState = { frontIndex: 0, label: 'Unknown skies', glyph: '', tint: 0x8fe0ff, condition: 'clear', temp: 20, source: 'fallback' };

/**
 * The data GameScene starts a run with. Landing from the flight map starts a run (and so does the automation-only `__start`), so they share this:
 * whichever way you reach a city, you begin in the same place with the same weather rules.
 */
export function runStartData(characterId: string, region: RegionDef, weather: RegionWeatherState | null | undefined) {
  const w = weather ?? UNKNOWN;
  return {
    characterId,
    regionId: region.id,
    startFrontIndex: w.frontIndex,
    weatherLabel: w.label,
    weatherCondition: w.condition,
    weatherTint: w.tint,
  };
}
