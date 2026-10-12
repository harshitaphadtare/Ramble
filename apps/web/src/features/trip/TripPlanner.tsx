import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowDown, ArrowUp, ChevronDown, LoaderCircle, LocateFixed, MapPin, Plus, Route, Search, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { tripPlanResponseSchema, type PlannedStop } from '@ramble/shared';
import { useMapStore } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useWalkStore, type TripStop } from '../../app/store/walkStore';
import type { LonLat } from '../../lib/geo/geo';
import { MODE_LABEL, type TravelMode } from '../../lib/geo/route';
import { distanceM } from '../../lib/geo/geo';
import { mapPadding } from '../../ui/Sheet';
import { fromFound, useTripDraft, type PlanStop } from './tripDraft';
import { searchPlaces, stopOptions, type FoundPlace } from '../../lib/places/search';

const MODES: TravelMode[] = ['walk', 'bike', 'car'];
const EXAMPLE = "I'm going to St Kilda today. On the way I want a coffee and fish and chips, and on the way back I'll stop at Comm Bank, then home.";

const lerp = (a: LonLat, b: LonLat, t: number): LonLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);


function StopChooser({ stop, onChoose, autoOpen }: { stop: PlanStop; onChoose: (f: FoundPlace) => void; autoOpen: boolean }) {
  // The first stop still to choose opens by itself; after that it's up to you.
  const [manual, setOpen] = useState<boolean | null>(null);
  const open = manual ?? autoOpen;
  if (!stop.options || stop.options.length < 2) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap ${stop.chosen ? 'bg-mist text-forest' : 'bg-sunset/15 text-[#b45309]'}`}
      >
        {stop.chosen ? `Change · ${stop.options.length} options` : `Pick one of ${stop.options.length}`}
        <ChevronDown size={13} className={open ? 'rotate-180' : ''} aria-hidden="true" />
      </button>
      {open && (
        <ul role="radiogroup" aria-label={`Options for ${stop.asked ?? stop.name}`} className="mt-1.5 space-y-1">
          {stop.options.map((o) => {
            const selected = stop.chosen && o.id === stop.sourceId;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onChoose(o);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${selected ? 'bg-forest/10 ring-1 ring-forest' : 'bg-mist/60 hover:bg-mist'}`}
                >
                  <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-forest bg-forest' : 'border-ink/25'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{o.name}</span>
                    {o.detail && <span className="block truncate text-[11px] text-ink/55">{o.detail}</span>}
                  </span>
                  {stop.near && <span className="shrink-0 text-[11px] font-semibold text-ink/50">{fmtKm(distanceM(o.lonLat, stop.near))} off the way</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

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
  const stops = useTripDraft((s) => s.stops);
  const setStops = useTripDraft((s) => s.setStops);
  const userPos = useMapStore((s) => s.userPos);
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

  /** Plans start from where you are: ask for your location if Ramble doesn't have it yet. */
  async function startPoint(): Promise<LonLat> {
    const ms = useMapStore.getState();
    if (!ms.userPos && ms.locateStatus !== 'locating') await ms.locate();
    const pos = useMapStore.getState().userPos;
    if (pos) startRef.current = pos;
    return origin();
  }

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
        { padding: mapPadding('sheet'), maxZoom: 15, duration: 700 },
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
      setBusy('Finding real places for each stop…');
      const home = await startPoint();
      const out = plan.stops.filter((s) => s.leg === 'out');
      const back = plan.stops.filter((s) => s.leg === 'back');
      const dest = out.at(-1)!;
      const destOptions = await stopOptions(dest.query, home, dest.category).catch(() => []);
      const destAt = destOptions[0]?.lonLat ?? home;
      // Each stop is searched where it fits on the way: evenly between home and the destination.
      const find = async (s: PlannedStop, near: LonLat) => ({ s, near, options: await stopOptions(s.query, near, s.category).catch(() => [] as FoundPlace[]) });
      const found = [
        ...(await Promise.all(out.slice(0, -1).map((s, i) => find(s, lerp(home, destAt, (i + 1) / out.length))))),
        { s: dest, near: home, options: destOptions },
        ...(await Promise.all(back.map((s, i) => find(s, lerp(destAt, home, (i + 1) / (back.length + 1)))))),
      ];
      const missing = found.filter((f) => !f.options.length).map((f) => f.s.query);
      const next: PlanStop[] = found
        .filter((f) => f.options.length)
        .map((f) => ({
          ...fromFound(f.options[0]!, f.s.leg),
          asked: f.s.query,
          options: f.options,
          near: f.s === dest ? undefined : f.near,
          // Only one real match: nothing to choose. Several: you pick.
          chosen: f.options.length === 1,
        }));
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
    useTripDraft.getState().add(f);
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

  const choose = (i: number, f: FoundPlace) => setStops((prev) => prev.map((s, k) => (k === i ? { ...s, ...fromFound(f, s.leg), chosen: true } : s)));
  const unchosen = stops.filter((s) => !s.chosen).length;

  function go() {
    if (unchosen) return;
    // Way-there stops first, then the way back, keeping the order within each. Only the trip
    // fields go to the walk (not the options).
    const strip = ({ name, kind, lonLat, sourceId, placeId, leg }: PlanStop): TripStop => ({ name, kind, lonLat, sourceId, placeId, leg });
    const ordered = [...stops.filter((s) => s.leg === 'out'), ...(roundTrip ? stops.filter((s) => s.leg === 'back') : [])].map(strip);
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

      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink/55">
        <LocateFixed size={13} className={userPos ? 'text-forest' : 'text-ink/40'} aria-hidden="true" />
        {userPos ? 'Starting from your location' : 'Starting from the middle of the map (allow location to start from where you are)'}
      </p>

      <div className="mt-3 mb-2 flex items-center justify-between">
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
              className={`flex items-start gap-2 rounded-xl bg-white px-2.5 py-2 ${s.chosen ? '' : 'ring-1 ring-sunset/60'}`}
            >
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${s.leg === 'back' ? 'bg-[#6fa36b]' : 'bg-forest'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                {s.asked && s.asked.toLowerCase() !== s.name.toLowerCase() && <p className="text-[11px] font-semibold text-ink/45">You asked for: {s.asked}</p>}
                <p className="truncate text-sm font-semibold text-ink">{s.chosen ? s.name : `${s.name}?`}</p>
                <button type="button" onClick={() => toggleLeg(i)} className="text-[11px] font-semibold text-moss" title="Switch between the way there and the way back">
                  {i === destIndex ? 'Destination' : s.leg === 'out' ? 'On the way there' : 'On the way back'} ⇄
                </button>
                <StopChooser stop={s} onChoose={(f) => choose(i, f)} autoOpen={!s.chosen && stops.findIndex((x) => !x.chosen) === i} />
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
          disabled={destIndex < 0 || unchosen > 0}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-forest to-moss py-4 text-base font-bold text-white shadow-float disabled:opacity-50"
        >
          <Route size={18} aria-hidden="true" />
          {destIndex < 0
            ? stops.length
              ? 'Set one stop as "on the way there"'
              : 'Add a place to start'
            : unchosen
              ? `Choose ${unchosen} stop${unchosen === 1 ? '' : 's'} above first`
              : `Start trip · ${stops.filter((s) => roundTrip || s.leg === 'out').length} stop${stops.length === 1 ? '' : 's'}${roundTrip ? ' + home' : ''}`}
        </m.button>
      </div>
    </div>
  );
}
