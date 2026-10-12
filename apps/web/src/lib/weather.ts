import { z } from 'zod';
import type { LonLat } from './geo/geo';

/**
 * Current weather from Open-Meteo (free, keyless, open data). Only a ~1 km-rounded point is sent.
 * Cached per cell for 30 minutes so reopening the app costs nothing.
 */
const URL = 'https://api.open-meteo.com/v1/forecast';
const TTL_MS = 30 * 60_000;

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Weather {
  tempC: number;
  sky: Sky;
  /** Chance of rain in the next hour, 0-100. */
  rainPct: number;
  isDay: boolean;
}

/** WMO weather code → a handful of sky kinds. */
export function skyFor(code: number): Sky {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

const schema = z.object({
  current: z.object({ temperature_2m: z.number(), weather_code: z.number(), is_day: z.number() }),
  hourly: z.object({ precipitation_probability: z.array(z.number().nullable()).min(1) }).optional(),
});

let memo: { key: string; at: number; w: Weather } | null = null;

export async function currentWeather(at: LonLat, signal?: AbortSignal): Promise<Weather | null> {
  const key = `${at[1].toFixed(2)},${at[0].toFixed(2)}`;
  if (memo?.key === key && Date.now() - memo.at < TTL_MS) return memo.w;
  if (!navigator.onLine) return memo?.w ?? null;
  const params = new URLSearchParams({
    latitude: at[1].toFixed(2),
    longitude: at[0].toFixed(2),
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'precipitation_probability',
    forecast_hours: '2',
    timezone: 'auto',
  });
  try {
    const res = await fetch(`${URL}?${params}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal ?? AbortSignal.timeout(8000) });
    if (!res.ok) return memo?.w ?? null;
    const d = schema.parse(await res.json());
    const w: Weather = {
      tempC: Math.round(d.current.temperature_2m),
      sky: skyFor(d.current.weather_code),
      rainPct: Math.round(d.hourly?.precipitation_probability[0] ?? 0),
      isDay: d.current.is_day === 1,
    };
    memo = { key, at: Date.now(), w };
    return w;
  } catch {
    return memo?.w ?? null;
  }
}
