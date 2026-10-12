import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowDown, ArrowUp, LoaderCircle, MapPin, Plus, Route, Search, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { tripPlanResponseSchema, type PlannedStop } from '@ramble/shared';
import { useMapStore } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useWalkStore, type TripStop } from '../../app/store/walkStore';
import type { LonLat } from '../../lib/geo/geo';
import { MODE_LABEL, type TravelMode } from '../../lib/geo/route';
import { findStop, searchPlaces, type FoundPlace } from '../../lib/places/search';

const MODES: TravelMode[] = ['walk', 'bike', 'car'];
const EXAMPLE = "I'm going to St Kilda today. On the way I want a coffee and fish and chips, and on the way back I'll stop at Comm Bank, then home.";

const lerp = (a: LonLat, b: LonLat, t: number): LonLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function ModePicker({ value, onChange, label, showLabel = true }: { value: TravelMode; onChange: (m: TravelMode) => void; label: string; showLabel?: boolean }) {
  return (
    <div>
      {showLabel && <p className="mb-1.5 text-xs font-semibold text-ink/60">{label}</p>}
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-xl bg-mist p-1">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value === mode}
            onClick={() => onChange(mode)}
            className={`rounded-lg py-1.5 text-sm font-semibold ${value === mode ? 'bg-white text-forest shadow-float' : 'text-ink/55'}`}
          >
            {MODE_LABEL[mode]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Plan a trip: say it in your own words (Gemma), or add stops by hand; optionally plan the way back. */
export function TripPlanner() {
  const [text, setText] = useState('');
  const [stops, setStops] = useState<TripStop[]>([]);
  const [mode, setMode] = useState<TravelMode>('walk');
  const [roundTrip, setRoundTrip] = useState(true);
  const [backMode, setBackMode] = useState<TravelMode>('walk');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundPlace[]>([]);
  const searchAbort = useRef<AbortController | null>(null);
  /** The start, fixed when planning begins (the map moves to show the stops afterwards). */
  const startRef = useRef<LonLat | null>(null);

  const origin = (): LonLat => {
    const { userPos, map } = useMapStore.getState();
    if (userPos) return userPos;
    if (startRef.current) return startRef.current;
    const c = map?.getCenter();
    startRef.current = c ? [c.lng, c.lat] : [144.9631, -37.8136];
    return startRef.current;
  };

  // Show the stops on the map as numbered pins while planning.
  useEffect(() => {
    useMapStore.getState().setPins(
      stops.map((s, i) => ({ id: `trip-${i}`, rank: i + 1, name: s.name, lonLat: s.lonLat, color: s.leg === 'back' ? '#6fa36b' : '#1d3a2a' })),
    );
    const map = useMapStore.getState().map;
    if (map && stops.length) {
      const pts = [...stops.map((s) => s.lonLat), origin()];
      const lons = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: { top: 90, bottom: 360, left: 50, right: 50 }, maxZoom: 15, duration: 700 },
      );
    }
  }, [stops]);

  // Manual search, debounced.
  useEffect(() => {
    searchAbort.current?.abort();
    if (query.trim().length < 2) return;
    const ctl = new AbortController();
    searchAbort.current = ctl;
    const id = setTimeout(() => {
      searchPlaces(query, origin(), { limit: 6, signal: ctl.signal })
        .then((r) => !ctl.signal.aborted && setResults(r))
        .catch(() => !ctl.signal.aborted && setResults([]));
    }, 350);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [query]);

  /** Gemma reads the plan; each stop is then matched to a real place where it fits on the way. */
  async function planFromText() {
    setBusy('Reading your plan…');
    setNote(null);
    try {
      const res = await fetch('/api/ai/plan-trip', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error();
      const plan = tripPlanResponseSchema.parse(await res.json());
      if (!plan.stops.length) {
        setNote("Couldn't read that plan. Try naming the places, or add stops below.");
        return;
      }
      setBusy('Finding the places…');
      const home = origin();
      const out = plan.stops.filter((s) => s.leg === 'out');
      const back = plan.stops.filter((s) => s.leg === 'back');
      const dest = out.at(-1)!;
      const destPlace = await findStop(dest.query, home, dest.category);
      const destAt = destPlace?.lonLat ?? home;
      const find = (s: PlannedStop, near: LonLat) => findStop(s.query, near, s.category).catch(() => null);
      const outFound = await Promise.all(out.slice(0, -1).map((s, i) => find(s, lerp(home, destAt, (i + 1) / out.length))));
      const backFound = await Promise.all(back.map((s, i) => find(s, lerp(destAt, home, (i + 1) / (back.length + 1)))));
      const missing: string[] = [];
      const toStop = (f: FoundPlace | null, s: PlannedStop): TripStop | null => {
        if (!f) {
          missing.push(s.query);
          return null;
        }
        return { name: f.name, kind: f.kind, lonLat: f.lonLat, sourceId: f.id, leg: s.leg };
      };
      const next = [
        ...outFound.map((f, i) => toStop(f, out[i]!)),
        toStop(destPlace, dest),
        ...backFound.map((f, i) => toStop(f, back[i]!)),
      ].filter((s): s is TripStop => !!s);
      setStops(next);
      setRoundTrip(plan.returnHome);
      if (plan.mode) setMode(plan.mode);
      if (plan.backMode) setBackMode(plan.backMode);
      setNote(missing.length ? `Couldn't find: ${missing.join(', ')}. Search for it below to add it.` : null);
    } catch {
      setNote("Couldn't plan that right now. You can still add stops by hand below.");
    } finally {
      setBusy(null);
    }
  }

  function addStop(f: FoundPlace) {
    // The first place you add is where you're going; later ones are stops on the way there
    // (just before the destination). Move them or switch them to the way back from the list.
    setStops((prev) => {
      const s: TripStop = { name: f.name, kind: f.kind, lonLat: f.lonLat, sourceId: f.id, leg: 'out' };
      const dest = prev.map((p) => p.leg).lastIndexOf('out');
      if (dest < 0) return [s, ...prev];
      return [...prev.slice(0, dest), s, ...prev.slice(dest)];
    });
    setQuery('');
    setResults([]);
  }

  const move = (i: number, d: -1 | 1) =>
    setStops((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const toggleLeg = (i: number) => setStops((prev) => prev.map((s, k) => (k === i ? { ...s, leg: s.leg === 'out' ? 'back' : 'out' } : s)));

  function go() {
    // Way-there stops first, then the way back, keeping the order within each.
    const ordered = [...stops.filter((s) => s.leg === 'out'), ...(roundTrip ? stops.filter((s) => s.leg === 'back') : [])];
    if (!ordered.some((s) => s.leg === 'out')) return;
    try {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch {
      /* optional */
    }
    void useWalkStore.getState().startTrip({ stops: ordered, mode, backMode: roundTrip ? backMode : null, from: startRef.current ?? undefined });
    useUiStore.getState().closeTab();
  }

  const destIndex = stops.map((s) => s.leg).lastIndexOf('out');

  return (
    <div>
      <label htmlFor="trip-text" className="mb-2 block text-sm font-semibold text-ink/70">
        Tell Ramble your plan
      </label>
      <textarea
        id="trip-text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        rows={3}
        placeholder={EXAMPLE}
        className="w-full resize-none rounded-2xl border border-ink/10 bg-white px-3.5 py-3 text-[15px] leading-snug text-ink placeholder:text-ink/40 focus:border-forest focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void planFromText()}
        disabled={text.trim().length < 3 || !!busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-mist py-2.5 text-sm font-bold text-forest disabled:opacity-50"
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
        {busy ?? 'Plan it with Gemma'}
      </button>
      {note && <p className="mt-2 rounded-xl bg-sunset/10 px-3 py-2 text-xs font-medium text-ink/75">{note}</p>}

      <div className="mt-4 mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink/70">Stops {stops.length > 0 && <span className="text-ink/40">· {stops.length}</span>}</p>
        {stops.length > 0 && (
          <button type="button" onClick={() => setStops([])} className="flex items-center gap-1 text-xs font-semibold text-ink/50">
            <Undo2 size={13} aria-hidden="true" /> Clear
          </button>
        )}
      </div>

      <ol className="space-y-1.5">
        <AnimatePresence initial={false}>
          {stops.map((s, i) => (
            <m.li
              key={`${s.sourceId ?? s.name}-${i}`}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2"
            >
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${s.leg === 'back' ? 'bg-[#6fa36b]' : 'bg-forest'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                <button type="button" onClick={() => toggleLeg(i)} className="text-[11px] font-semibold text-moss" title="Switch between the way there and the way back">
                  {i === destIndex ? 'Destination' : s.leg === 'out' ? 'On the way there' : 'On the way back'} ⇄
                </button>
              </div>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.name} up`} className="grid size-7 place-items-center rounded-lg text-ink/50 disabled:opacity-30">
                <ArrowUp size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label={`Move ${s.name} down`} className="grid size-7 place-items-center rounded-lg text-ink/50 disabled:opacity-30">
                <ArrowDown size={15} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setStops((p) => p.filter((_, k) => k !== i))} aria-label={`Remove ${s.name}`} className="grid size-7 place-items-center rounded-lg text-ember/80">
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </m.li>
          ))}
        </AnimatePresence>
      </ol>

      <div className="relative mt-2">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink/40" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) setResults([]);
          }}
          placeholder={stops.length ? 'Add another stop (e.g. a café)' : 'Search for a place to go'}
          aria-label="Search for a stop"
          className="w-full rounded-xl border border-ink/10 bg-white py-2.5 pr-3 pl-9 text-sm text-ink placeholder:text-ink/40 focus:border-forest focus:outline-none"
        />
        {results.length > 0 && (
          <ul className="mt-1.5 overflow-hidden rounded-xl border border-ink/10 bg-white">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => addStop(r)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-mist">
                  <MapPin size={15} className="shrink-0 text-moss" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                    {r.detail && <span className="block truncate text-xs text-ink/50">{r.detail}</span>}
                  </span>
                  <Plus size={16} className="text-forest" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ModePicker label="Getting there" value={mode} onChange={setMode} />
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink/60">Coming back</p>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink/60">
              <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="accent-forest" />
              Plan the way home
            </label>
          </div>
          {roundTrip ? (
            <ModePicker label="Coming back by" showLabel={false} value={backMode} onChange={setBackMode} />
          ) : (
            <p className="rounded-xl bg-mist px-3 py-2.5 text-sm text-ink/55">One way</p>
          )}
        </div>
      </div>

      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-3 bg-gradient-to-t from-cream from-70% to-transparent px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
        <m.button
          type="button"
          onClick={go}
          disabled={destIndex < 0}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-forest to-moss py-4 text-base font-bold text-white shadow-float disabled:opacity-50"
        >
          <Route size={18} aria-hidden="true" />
          {destIndex < 0 ? 'Add a place to start' : `Start trip · ${stops.filter((s) => roundTrip || s.leg === 'out').length} stop${stops.length === 1 ? '' : 's'}${roundTrip ? ' + home' : ''}`}
        </m.button>
      </div>
    </div>
  );
}
