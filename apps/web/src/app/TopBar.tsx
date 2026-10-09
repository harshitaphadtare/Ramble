import { useEffect, useState } from 'react';
import * as SunCalc from 'suncalc';
import { Moon, Sunrise, Sunset, WifiOff } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { useMapStore } from './store/mapStore';

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

  return (
    <header className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center justify-between gap-2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-cream/85 py-1.5 pr-3.5 pl-1.5 shadow-float backdrop-blur-xl">
        <Logo />
        <span className="font-display text-[19px] font-semibold tracking-tight text-forest">Ramble</span>
      </div>
      <div className="pointer-events-auto flex items-center gap-1.5">
        {!online && (
          <span className="flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1.5 text-xs font-semibold text-white shadow-float backdrop-blur-xl">
            <WifiOff size={13} aria-hidden="true" /> Offline
          </span>
        )}
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-float backdrop-blur-xl ${
            light.warm ? 'bg-gradient-to-r from-[#f9c06a] to-[#ee8a3f] text-white' : 'bg-cream/85 text-ink/80'
          }`}
        >
          <LightIcon size={14} aria-hidden="true" />
          {light.text}
        </span>
      </div>
    </header>
  );
}
