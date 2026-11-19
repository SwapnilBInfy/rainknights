import type { Climate, RegionDef } from '../config/regions';

export interface RegionWeatherState {
  condition: string;
  label: string;
  glyph: string;
  frontIndex: number;
  tint: number;
  temp: number;
  source: 'live' | 'fallback';
}

const THUNDER_CODES = [95, 96, 99];
const RAINY_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];

export interface Reading {
  code: number;
  temp: number;
  wind: number;
  humidity: number;
}

type Classified = Omit<RegionWeatherState, 'temp' | 'source'>;

/** Every condition the game knows, with its label, front and tint. */
export const CONDITION_PRESETS: Record<string, Classified> = {
  thunderstorm: { condition: 'thunderstorm', label: 'Thunderstorm', glyph: '⛈', frontIndex: 3, tint: 0x1c2440 },
  cold_front: { condition: 'cold_front', label: 'Cold Front', glyph: '❄', frontIndex: 4, tint: 0x8fd8ff },
  windy: { condition: 'windy', label: 'Urban Wind', glyph: '💨', frontIndex: 1, tint: 0x6f8f7a },
  rain: { condition: 'rain', label: 'Rain', glyph: '🌧', frontIndex: 0, tint: 0x3a5f7a },
  clear: { condition: 'clear', label: 'Clear', glyph: '☀', frontIndex: 0, tint: 0x8fe0ff },
  hurricane: { condition: 'hurricane', label: 'Hurricane Risk', glyph: '🌀', frontIndex: 5, tint: 0x2a1f3a },
  tropical_downpour: { condition: 'tropical_downpour', label: 'Tropical Downpour', glyph: '🌴', frontIndex: 3, tint: 0x2f6f8f },
  heat: { condition: 'heat', label: 'Heat', glyph: '🔥', frontIndex: 1, tint: 0xffb347 },
  humid: { condition: 'humid', label: 'Humid', glyph: '💧', frontIndex: 0, tint: 0x5fae9a },
};

const isStormy = (code: number) => THUNDER_CODES.includes(code);
const isWet = (code: number) => RAINY_CODES.includes(code);

/** Turn a live reading into a front, using the city's own cut-offs. Pure, so it is unit-tested. */
export function classifyReading(reading: Reading, climate: Climate): Classified {
  const { code, temp, wind, humidity } = reading;
  if (climate.kind === 'tropical') {
    if (isStormy(code) && wind >= (climate.stormWindAt ?? 60)) return CONDITION_PRESETS.hurricane;
    if (isStormy(code) || isWet(code)) return CONDITION_PRESETS.tropical_downpour;
    if (temp >= (climate.heatAt ?? 30)) return CONDITION_PRESETS.heat;
    if (humidity >= (climate.humidAt ?? 70)) return CONDITION_PRESETS.humid;
    return { ...CONDITION_PRESETS.clear, tint: 0xffe9b3 };
  }
  if (isStormy(code) && climate.stormWindAt !== undefined && wind >= climate.stormWindAt) return CONDITION_PRESETS.hurricane;
  if (isStormy(code)) return CONDITION_PRESETS.thunderstorm;
  if (temp <= (climate.coldAt ?? 5)) return CONDITION_PRESETS.cold_front;
  if (wind >= (climate.windyAt ?? 30)) return CONDITION_PRESETS.windy;
  if (isWet(code)) return CONDITION_PRESETS.rain;
  return CONDITION_PRESETS.clear;
}

/**
 * `?weather=thunderstorm` forces a condition for demos, screenshots and tests
 * instead of using the live reading. Unknown values are ignored.
 */
function forcedWeather(): RegionWeatherState | null {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('weather');
  const preset = id ? CONDITION_PRESETS[id] : undefined;
  return preset ? { ...preset, temp: 20, source: 'fallback' } : null;
}

function fallbackFor(region: RegionDef): RegionWeatherState {
  return {
    condition: 'clear',
    label: 'Unknown skies',
    glyph: '☀',
    frontIndex: 0,
    tint: region.fallback.tint,
    temp: region.fallback.temp,
    source: 'fallback',
  };
}

export async function fetchRegionWeather(region: RegionDef): Promise<RegionWeatherState> {
  const forced = forcedWeather();
  if (forced) return forced;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API error ${res.status}`);
    const json = await res.json();

    const reading: Reading = {
      code: json.current?.weather_code ?? 0,
      temp: json.current?.temperature_2m ?? 20,
      wind: json.current?.wind_speed_10m ?? 0,
      humidity: json.current?.relative_humidity_2m ?? 50,
    };

    const classified = classifyReading(reading, region.climate);
    return { ...classified, temp: reading.temp, source: 'live' };
  } catch {
    return fallbackFor(region);
  }
}
