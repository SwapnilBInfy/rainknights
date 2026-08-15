import { WEATHER_FRONTS } from '../config/constants';

export interface LocalWeatherResult {
  frontIndex: number;
  label: string;
  source: 'live' | 'fallback';
}

const FALLBACK: LocalWeatherResult = {
  frontIndex: 0,
  label: 'Unknown skies — starting calm',
  source: 'fallback',
};

type Category = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'snow' | 'thunder';

const CATEGORY_TO_FRONT: Record<Category, number> = {
  clear: 0,
  cloudy: 0,
  drizzle: 0,
  rain: 2,
  snow: 4,
  thunder: 3,
};

const CATEGORY_LABEL: Record<Category, string> = {
  clear: 'Clear skies',
  cloudy: 'Cloudy',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  thunder: 'Thunderstorms',
};

function categorize(code: number): Category {
  if (code === 0) return 'clear';
  if ([1, 2, 3, 45, 48].includes(code)) return 'cloudy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'cloudy';
}

function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 6000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

export async function fetchLocalWeatherFront(): Promise<LocalWeatherResult> {
  try {
    const { lat, lon } = await getPosition();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API error ${res.status}`);
    const json = await res.json();

    const code: number = json.current?.weather_code ?? 0;
    const temp: number = json.current?.temperature_2m ?? 15;
    const wind: number = json.current?.wind_speed_10m ?? 0;

    const category = categorize(code);
    const windy = wind >= 30;
    let frontIndex = CATEGORY_TO_FRONT[category];
    if (windy) frontIndex = Math.max(frontIndex, 1);
    frontIndex = Math.max(0, Math.min(WEATHER_FRONTS.length - 1, frontIndex));

    const label = `${CATEGORY_LABEL[category]} · ${Math.round(temp)}°C${windy ? ' · breezy' : ''}`;
    return { frontIndex, label, source: 'live' };
  } catch {
    return FALLBACK;
  }
}
