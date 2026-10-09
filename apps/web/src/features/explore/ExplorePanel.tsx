import { useEffect, useRef, useState } from 'react';
import type { Energy, Mood, PlaceKind } from '@ramble/shared';
import { useMapStore } from '../../app/store/mapStore';
import type { LonLat } from '../../lib/geo/geo';
import { explore, type ExplorePrefs, type ExploreResult } from './explore';

const TIMES = [30, 60, 120] as const;
const MOODS: { id: Mood; label: string }[] = [
  { id: 'nature', label: '🌳 Nature' },
  { id: 'views', label: '⛰️ Views' },
  { id: 'quiet', label: '🤫 Quiet' },
  { id: 'golden-hour', label: '🌅 Golden hour' },
  { id: 'surprise', label: '🎲 Surprise me' },
];
const ENERGIES: { id: Energy; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'push', label: 'Push me' },
];
const KIND_EMOJI: Record<PlaceKind, string> = {
  park: '🌳',
  garden: '🌷',
  reserve: '🦜',
  viewpoint: '🔭',
  water: '💧',
  beach: '🏖️',
  peak: '⛰️',
  trail: '🥾',
  picnic: '🧺',
  other: '📍',
};

type Status = 'idle' | 'loading' | 'done' | 'error';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-forest text-white' : 'bg-sand text-ink/80'
      }`}
    >
      {children}
    </button>
  );
}

export function ExplorePanel() {
  const [prefs, setPrefs] = useState<ExplorePrefs>({ minutes: 60, mood: 'nature', energy: 'easy' });
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<ExploreResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { map, userPos, setPins, select, selectedId } = useMapStore();

  useEffect(() => () => abortRef.current?.abort(), []);

  const origin = (): LonLat => {
    if (userPos) return userPos;
    const c = map?.getCenter();
    return c ? [c.lng, c.lat] : [144.9631, -37.8136];
  };

  async function go() {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setStatus('loading');
    setResult(null);
    try {
      await explore(
        origin(),
        prefs,
        (r) => {
          if (ctl.signal.aborted) return;
          setResult(r);
          setStatus('done');
          setPins(r.cards.map((c, i) => ({ id: c.place.id, rank: i + 1, name: c.place.name, lonLat: [c.place.lon, c.place.lat] })));
          if (!r.refining) fitPins(r.cards.map((c) => [c.place.lon, c.place.lat]));
        },
        ctl.signal,
      );
    } catch {
      if (!ctl.signal.aborted) setStatus('error');
    }
  }

  function fitPins(points: LonLat[]) {
    if (!map || points.length === 0) return;
    const all = [...points, origin()];
    const lons = all.map((p) => p[0]);
    const lats = all.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 60, bottom: 420, left: 40, right: 40 }, maxZoom: 15, duration: 600 },
    );
  }

  function focus(id: string, lonLat: LonLat) {
    select(id);
    map?.flyTo({ center: lonLat, zoom: 15, padding: { top: 0, bottom: 380, left: 0, right: 0 }, duration: 600 });
  }

  function reset() {
    abortRef.current?.abort();
    setStatus('idle');
    setResult(null);
    setPins([]);
  }

  return (
    <section
      aria-label="Get me outside"
      className="absolute inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.5rem)] max-h-[60vh] overflow-y-auto rounded-2xl bg-white/97 p-4 shadow-xl backdrop-blur"
    >
      {status === 'idle' || status === 'error' ? (
        <>
          <h2 className="text-lg font-semibold text-forest">Get me outside</h2>
          <p className="mb-3 text-sm text-ink/60">
            {userPos ? 'Near you' : 'Near the middle of the map. Tap the locate button to use your position'}
          </p>

          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {TIMES.map((m) => (
              <Chip key={m} active={prefs.minutes === m} onClick={() => setPrefs({ ...prefs, minutes: m })}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </Chip>
            ))}
          </div>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {MOODS.map((m) => (
              <Chip key={m.id} active={prefs.mood === m.id} onClick={() => setPrefs({ ...prefs, mood: m.id })}>
                {m.label}
              </Chip>
            ))}
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {ENERGIES.map((e) => (
              <Chip key={e.id} active={prefs.energy === e.id} onClick={() => setPrefs({ ...prefs, energy: e.id })}>
                {e.label}
              </Chip>
            ))}
          </div>

          {status === 'error' && (
            <p role="alert" className="mb-3 text-sm text-red-700">
              Couldn't load places nearby. Check your connection and try again.
            </p>
          )}
          <button type="button" onClick={go} className="w-full rounded-xl bg-forest py-3 font-semibold text-white">
            Find somewhere to go
          </button>
        </>
      ) : status === 'loading' ? (
        <p className="py-6 text-center text-ink/70" aria-live="polite">
          Looking for parks, trails and views nearby…
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-forest">Where to go</h2>
            <span
              aria-live="polite"
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                result?.refining ? 'bg-sand text-ink/70' : result?.source === 'gemma' ? 'bg-forest/10 text-forest' : 'bg-sand text-ink/70'
              }`}
            >
              {result?.refining ? '✨ Gemma is thinking…' : result?.source === 'gemma' ? '✨ Picked by Gemma' : navigator.onLine ? 'Quick picks' : 'Offline picks'}
            </span>
          </div>

          {result && result.cards.length === 0 ? (
            <p className="mb-3 text-sm text-ink/70">Nothing outdoors within reach for that time. Try a longer walk or another mood.</p>
          ) : (
            <ol className="mb-3 space-y-2">
              {result?.cards.map((c, i) => (
                <li key={c.place.id}>
                  <button
                    type="button"
                    onClick={() => focus(c.place.id, [c.place.lon, c.place.lat])}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selectedId === c.place.id ? 'border-forest bg-forest/5' : 'border-ink/10'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">
                        <span aria-hidden="true">{i + 1}. {KIND_EMOJI[c.place.kind]} </span>
                        {c.place.name}
                      </span>
                      <span className="shrink-0 text-xs text-ink/60">{c.walkMin} min walk</span>
                    </div>
                    <p className="mt-1 text-sm text-ink/75">{c.reason}</p>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" onClick={reset} className="w-full rounded-xl bg-sand py-2.5 font-medium text-ink/80">
            Change plans
          </button>
        </>
      )}
    </section>
  );
}
