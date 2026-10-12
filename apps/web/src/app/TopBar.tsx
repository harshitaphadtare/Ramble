import { useEffect, useState } from 'react';
import * as SunCalc from 'suncalc';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun, Sunrise, Sunset, WifiOff } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { currentWeather, type Sky, type Weather } from '../lib/weather';
import { useMapStore } from './store/mapStore';

const SKY_ICON: Record<Sky, typeof Sun> = { clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: Snowflake, storm: CloudLightning };
const SKY_TEXT: Record<Sky, string> = { clear: 'clear', partly: 'partly cloudy', cloudy: 'cloudy', fog: 'foggy', drizzle: 'drizzle', rain: 'rain', snow: 'snow', storm: 'thunderstorms' };

const DEFAULT: [number, number] = [144.9631, -37.8136];

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** A friendly line about the light right now: the thing that decides a good walk. */
function lightStatus(lonLat: [number, number], now = new Date()) {
  const { sunrise, sunset, goldenHour } = SunCalc.getTimes(now, lonLat[1], lonLat[0]);
  const valid = (d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime());
  // Polar summer or winter: no normal sunrise/sunset today.
  if (!valid(sunset) || !valid(sunrise) || !valid(goldenHour)) return { icon: Sunset, text: 'Long days' };
  const toGolden = (goldenHour.getTime() - now.getTime()) / 60_000;
  const toSunset = (sunset.getTime() - now.getTime()) / 60_000;
  if (now < sunrise) return { icon: Sunrise, text: `Sunrise ${fmtTime(sunrise)}` };
  if (toGolden > 90) return { icon: Sunset, text: `Sunset ${fmtTime(sunset)}` };
  if (toGolden > 0) return { icon: Sunset, text: `Golden hour in ${Math.round(toGolden)} min`, warm: true };
  if (toSunset > 0) return { icon: Sunset, text: `Golden hour now · ${Math.round(toSunset)} min of light`, warm: true };
  return { icon: Moon, text: 'After dark' };
}

export function TopBar() {
  const map = useMapStore((s) => s.map);
  const userPos = useMapStore((s) => s.userPos);
  const [, tick] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      clearInterval(id);
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);

  const c = map?.getCenter();
  const where: [number, number] = userPos ?? (c ? [c.lng, c.lat] : DEFAULT);
  const light = lightStatus(where);
  const LightIcon = light.icon;

  // Weather for roughly where you are (rounded to ~1 km, refreshed when you move that far).
  const [weather, setWeather] = useState<Weather | null>(null);
  const cell = `${where[1].toFixed(2)},${where[0].toFixed(2)}`;
  useEffect(() => {
    const ctl = new AbortController();
    const [lat, lon] = cell.split(',').map(Number) as [number, number];
    void currentWeather([lon, lat], ctl.signal).then((w) => !ctl.signal.aborted && setWeather(w));
    return () => ctl.abort();
  }, [cell, online]);
  const SkyIcon = weather ? SKY_ICON[weather.sky] : null;

  return (
    <header className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center justify-between gap-2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-cream/85 py-1.5 pr-3.5 pl-1.5 shadow-float backdrop-blur-xl">
        <Logo />
        <span className="hidden font-display text-[19px] font-semibold tracking-tight text-forest min-[360px]:inline">Ramble</span>
      </div>
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
        {!online && (
          <span className="flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1.5 text-xs font-semibold text-white shadow-float backdrop-blur-xl">
            <WifiOff size={13} aria-hidden="true" /> Offline
          </span>
        )}
        {weather && SkyIcon && (
          <span
            title={`${weather.tempC}°C, ${SKY_TEXT[weather.sky]}${weather.rainPct >= 20 ? `, ${weather.rainPct}% chance of rain in the next hour` : ''}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-cream/85 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-ink/80 shadow-float backdrop-blur-xl"
          >
            <SkyIcon size={14} aria-hidden="true" />
            {weather.tempC}°
            {weather.rainPct >= 20 && <span className="hidden text-[#3b82f6] min-[400px]:inline">{weather.rainPct}%</span>}
          </span>
        )}
        <span
          className={`flex max-w-[48vw] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-float backdrop-blur-xl sm:max-w-none ${
            light.warm ? 'bg-gradient-to-r from-[#f9c06a] to-[#ee8a3f] text-white' : 'bg-cream/85 text-ink/80'
          }`}
        >
          <LightIcon size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{light.text}</span>
        </span>
      </div>
    </header>
  );
}
