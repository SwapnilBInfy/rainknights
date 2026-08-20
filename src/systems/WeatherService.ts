import type { RegionDef } from '../config/regions';

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

interface Reading {
  code: number;
  temp: number;
  wind: number;
  humidity: number;
}

type Classified = Omit<RegionWeatherState, 'temp' | 'source'>;

function classifyNYC({ code, temp, wind }: Reading): Classified {
  if (THUNDER_CODES.includes(code)) {
    return { condition: 'thunderstorm', label: 'Thunderstorm', glyph: '⛈', frontIndex: 3, tint: 0x1c2440 };
  }
  if (temp <= 5) {
    return { condition: 'cold_front', label: 'Cold Front', glyph: '❄', frontIndex: 4, tint: 0x8fd8ff };
  }
  if (wind >= 30) {
    return { condition: 'windy', label: 'Urban Wind', glyph: '💨', frontIndex: 1, tint: 0x6f8f7a };
  }
  if (RAINY_CODES.includes(code)) {
    return { condition: 'rain', label: 'Rain', glyph: '🌧', frontIndex: 0, tint: 0x3a5f7a };
  }
  return { condition: 'clear', label: 'Clear', glyph: '☀', frontIndex: 0, tint: 0x8fe0ff };
}

function classifyMiami({ code, temp, wind, humidity }: Reading): Classified {
  if (THUNDER_CODES.includes(code) && wind >= 60) {
    return { condition: 'hurricane', label: 'Hurricane Risk', glyph: '🌀', frontIndex: 5, tint: 0x2a1f3a };
  }
  if (THUNDER_CODES.includes(code) || RAINY_CODES.includes(code)) {
    return { condition: 'tropical_downpour', label: 'Tropical Downpour', glyph: '🌴', frontIndex: 3, tint: 0x2f6f8f };
  }
  if (temp >= 30) {
    return { condition: 'heat', label: 'Heat', glyph: '🔥', frontIndex: 1, tint: 0xffb347 };
  }
  if (humidity >= 70) {
    return { condition: 'humid', label: 'Humid', glyph: '💧', frontIndex: 0, tint: 0x5fae9a };
  }
  return { condition: 'clear', label: 'Clear', glyph: '☀', frontIndex: 0, tint: 0xffe9b3 };
}

function fallbackFor(region: RegionDef): RegionWeatherState {
  const base = region.id === 'miami'
    ? { condition: 'clear', label: 'Unknown skies', glyph: '☀', frontIndex: 0, tint: 0xffe9b3, temp: 28 }
    : { condition: 'clear', label: 'Unknown skies', glyph: '☀', frontIndex: 0, tint: 0x8fe0ff, temp: 15 };
  return { ...base, source: 'fallback' };
}

export async function fetchRegionWeather(region: RegionDef): Promise<RegionWeatherState> {
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

    const classified = region.id === 'miami' ? classifyMiami(reading) : classifyNYC(reading);
    return { ...classified, temp: reading.temp, source: 'live' };
  } catch {
    return fallbackFor(region);
  }
}
