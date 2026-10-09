import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Bookmark, BookmarkCheck, Check, Footprints, Navigation, MapPinCheck, SlidersHorizontal, Sparkles, WifiOff, Zap } from 'lucide-react';
import { MOODS, type Energy, type Mood, type OutdoorPlace } from '@ramble/shared';
import { useMapStore } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore, visitsFor } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';
import { useFeatures } from '../../app/store/featuresStore';
import { readiness } from '../../lib/personalize/features';
import { LevelBadge } from '../../ui/Level';
import { LocationButton, LocationError } from '../map/LocationButton';
import type { LonLat } from '../../lib/geo/geo';
import { KIND_STYLE, MOOD_STYLE, gradient } from '../../ui/visuals';
import { explore, type ExploreCard, type ExplorePrefs, type ExploreResult } from './explore';

const TIMES = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
];
const ENERGIES: { value: Energy; label: string }[] = [
  { value: 'easy', label: 'Easy stroll' },
  { value: 'moderate', label: 'Steady' },
  { value: 'push', label: 'Push me' },
];
const LOADING_LINES = ['Scouting parks and lookouts…', 'Timing it with the light…', 'Asking Gemma for the best three…'];

type Stage = 'setup' | 'loading' | 'results';

const sheetMotion = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { type: 'spring', stiffness: 380, damping: 34 },
} as const;

function Segmented<T extends string | number>({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-2xl bg-mist p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className="relative rounded-xl py-2.5 text-sm font-semibold"
          >
            {active && (
              <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl bg-white shadow-float" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            <span className={`relative ${active ? 'text-forest' : 'text-ink/55'}`}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MoodTile({ mood, active, onClick }: { mood: Mood; active: boolean; onClick: () => void }) {
  const s = MOOD_STYLE[mood];
  const Icon = s.icon;
  return (
    <m.button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`relative flex h-[104px] w-[112px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl p-3 text-left text-white transition-shadow ${
        active ? 'shadow-float ring-2 ring-forest ring-offset-2 ring-offset-cream' : 'opacity-90'
      }`}
      style={{ background: gradient(s.from, s.to) }}
    >
      <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
      <span>
        <span className="block text-[15px] leading-tight font-bold">{s.label}</span>
        <span className="block text-[11px] font-medium text-white/80">{s.blurb}</span>
      </span>
      {active && (
        <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-white text-forest">
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </m.span>
      )}
    </m.button>
  );
}

function SourceBadge({ result }: { result: ExploreResult }) {
  if (result.refining) {
    return (
      <span className="relative flex items-center gap-1 overflow-hidden rounded-full bg-forest px-2.5 py-1 text-xs font-semibold text-white">
        <m.span animate={{ rotate: [0, 20, -10, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
          <Sparkles size={13} aria-hidden="true" />
        </m.span>
        Gemma is thinking
        <span className="skeleton absolute inset-0 opacity-30 mix-blend-overlay" aria-hidden="true" />
      </span>
    );
  }
  if (result.source === 'gemma') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-forest to-moss px-2.5 py-1 text-xs font-semibold text-white">
        <Sparkles size={13} aria-hidden="true" /> Picked by Gemma
      </span>
    );
  }
  return navigator.onLine ? (
    <span className="flex items-center gap-1 rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-forest">
      <Zap size={13} aria-hidden="true" /> Quick picks
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-semibold text-white">
      <WifiOff size={13} aria-hidden="true" /> Offline picks
    </span>
  );
}

function PlaceCard({ card, rank, selected }: { card: ExploreCard; rank: number; selected: boolean }) {
  const s = KIND_STYLE[card.place.kind];
  const Icon = s.icon;
  return (
    <article
      className={`flex h-full flex-col rounded-[24px] bg-cream p-4 shadow-sheet transition-[box-shadow,transform] ${
        selected ? 'ring-2 ring-forest' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: gradient(s.from, s.to) }}>
          <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
          <span className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-forest-deep text-[11px] font-bold text-white ring-2 ring-cream">
            {rank}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[19px] leading-tight font-semibold text-ink">{card.place.name}</h3>
          <p className="mt-0.5 flex items-center gap-2 text-xs font-medium text-ink/55">
            {s.label}
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <Footprints size={12} aria-hidden="true" /> {card.walkMin} min walk
            </span>
          </p>
        </div>
      </div>
      {card.love !== undefined && (
        <p className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-forest/10 px-2 py-0.5 text-[11px] font-bold text-forest" title="TabPFN, from your own visit history">
          💚 {Math.round(card.love * 100)}% your kind of place
        </p>
      )}
      <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ink/75">{card.reason}</p>
      <CardActions place={card.place} />
    </article>
  );
}

/** Save for later, or check in on arrival. Stops the tap from also moving the map. */
function CardActions({ place }: { place: OutdoorPlace }) {
  const saved = useUserStore((st) => st.places.find((p) => p.sourceId === place.id));
  const visits = useUserStore((st) => (saved ? visitsFor(st.visits, saved.id) : 0));
  const { savePlace, toggleWantToGo, checkIn } = useUserStore.getState();
  const { showToast, openComposer, openPlace } = useUiStore.getState();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const toggleSave = () =>
    run(async () => {
      if (!saved) {
        await savePlace(place, true);
        showToast(`Saved ${place.name} to Want to go`);
      } else {
        await toggleWantToGo(saved.id);
      }
    });

  const arrived = () =>
    run(async () => {
      const p = saved ?? (await savePlace(place, false));
      const visit = await checkIn(p.id);
      showToast(`Checked in at ${p.name}`);
      openComposer({ placeId: p.id, visitId: visit.id });
    });

  return (
    <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => void useWalkStore.getState().start({ name: place.name, kind: place.kind, lonLat: [place.lon, place.lat], placeId: saved?.id, sourceId: place.id })}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest py-2 text-sm font-semibold text-white"
      >
        <Navigation size={15} aria-hidden="true" /> Walk here
      </button>
      <button type="button" onClick={() => void arrived()} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-xl bg-mist px-3 py-2 text-sm font-semibold text-forest disabled:opacity-60">
        <MapPinCheck size={15} aria-hidden="true" /> I'm here
      </button>
      <button
        type="button"
        onClick={() => void toggleSave()}
        disabled={busy}
        aria-pressed={!!saved?.wantToGo}
        aria-label={saved?.wantToGo ? 'Remove from Want to go' : 'Save to Want to go'}
        className={`grid size-9 place-items-center rounded-xl ${saved?.wantToGo ? 'bg-sunset text-white' : 'bg-mist text-forest'}`}
      >
        {saved?.wantToGo ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
      </button>
      {saved && (
        <button type="button" onClick={() => openPlace(saved.id)} className="rounded-xl" aria-label={`Open ${place.name}`}>
          <LevelBadge visits={visits} />
        </button>
      )}
    </div>
  );
}

/** While personalisation is on but there isn't enough history yet, say so honestly. */
function TasteHint() {
  const enabled = useFeatures((st) => st.personalize);
  const places = useUserStore((st) => st.places);
  const visits = useUserStore((st) => st.visits);
  if (!enabled) return null;
  const r = readiness(places, visits);
  return (
    <p className="mb-3 rounded-xl bg-forest/5 px-3 py-2 text-xs font-medium text-forest">
      {r.ready ? '💚 Picks are tuned to your taste (TabPFN, from your visits).' : `💚 Ramble is learning your taste: ${r.visited}/${r.needed} places visited.`}
    </p>
  );
}

export function ExplorePanel() {
  const [prefs, setPrefs] = useState<ExplorePrefs>({ minutes: 60, mood: 'nature', energy: 'easy' });
  const [stage, setStage] = useState<Stage>('setup');
  const [error, setError] = useState(false);
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [line, setLine] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const { map, userPos, setPins, select, selectedId, selectedBy } = useMapStore();

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (stage !== 'loading') return;
    const id = setInterval(() => setLine((n) => (n + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(id);
  }, [stage]);

  // A pin tapped on the map scrolls its card into view.
  useEffect(() => {
    if (selectedBy !== 'map' || !selectedId) return;
    railRef.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedId, selectedBy]);

  // Swiping the rail selects the card in view and moves the map to it.
  useEffect(() => {
    const rail = railRef.current;
    if (stage !== 'results' || !rail || !result?.cards.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        const id = hit?.target.getAttribute('data-id');
        const card = result.cards.find((c) => c.place.id === id);
        if (!card) return;
        select(card.place.id, 'list');
        map?.easeTo({ center: [card.place.lon, card.place.lat], zoom: Math.max(map.getZoom(), 14.5), padding: { top: 80, bottom: 260, left: 0, right: 0 }, duration: 700 });
      },
      { root: rail, threshold: 0.75 },
    );
    rail.querySelectorAll('[data-id]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [stage, result, map, select]);

  const origin = (): LonLat => {
    if (userPos) return userPos;
    const c = map?.getCenter();
    return c ? [c.lng, c.lat] : [144.9631, -37.8136];
  };

  async function go() {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(false);
    setStage('loading');
    setResult(null);
    try {
      await explore(
        origin(),
        prefs,
        (r) => {
          if (ctl.signal.aborted) return;
          setResult(r);
          setStage('results');
          setPins(
            r.cards.map((c, i) => ({
              id: c.place.id,
              rank: i + 1,
              name: c.place.name,
              lonLat: [c.place.lon, c.place.lat],
              color: KIND_STYLE[c.place.kind].pin,
            })),
          );
          if (!r.refining) fitPins(r.cards.map((c) => [c.place.lon, c.place.lat]));
        },
        {
          map,
          signal: ctl.signal,
          user: { places: useUserStore.getState().places, visits: useUserStore.getState().visits },
          personalize: useFeatures.getState().personalize,
        },
      );
    } catch {
      if (!ctl.signal.aborted) {
        setError(true);
        setStage('setup');
      }
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
      { padding: { top: 90, bottom: 280, left: 48, right: 48 }, maxZoom: 15.5, duration: 800 },
    );
  }

  function edit() {
    abortRef.current?.abort();
    setStage('setup');
    setResult(null);
    setPins([]);
  }

  const summary = `${TIMES.find((t) => t.value === prefs.minutes)?.label} · ${MOOD_STYLE[prefs.mood].label} · ${
    ENERGIES.find((e) => e.value === prefs.energy)?.label
  }`;

  return (
    // Phones: full-width bottom sheet. Larger screens: a floating panel on the left, like a desktop maps app.
    <div className="absolute inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-10 md:right-auto md:left-4 md:w-[420px]">
      <AnimatePresence mode="wait">
        {stage !== 'results' ? (
          <m.section
            key="sheet"
            {...sheetMotion}
            aria-label="Get me outside"
            className="mx-3 max-h-[68vh] overflow-y-auto rounded-[28px] bg-cream/95 px-4 pt-2 pb-4 shadow-sheet backdrop-blur-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />

            {stage === 'setup' ? (
              <>
                <p className="text-[11px] font-bold tracking-[0.14em] text-moss uppercase">Get me outside</p>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <h2 className="font-display text-[28px] leading-[1.1] font-semibold tracking-tight text-forest">Where to today?</h2>
                  <LocationButton />
                </div>
                <LocationError />
                <TasteHint />

                <p className="mb-2 text-sm font-semibold text-ink/70">How long have you got?</p>
                <Segmented id="time" options={TIMES} value={prefs.minutes} onChange={(minutes) => setPrefs({ ...prefs, minutes })} />

                <p className="mt-4 mb-2 text-sm font-semibold text-ink/70">What's the mood?</p>
                <div role="radiogroup" className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 py-1">
                  {MOODS.map((mood) => (
                    <MoodTile key={mood} mood={mood} active={prefs.mood === mood} onClick={() => setPrefs({ ...prefs, mood })} />
                  ))}
                </div>

                <p className="mt-4 mb-2 text-sm font-semibold text-ink/70">Energy</p>
                <Segmented id="energy" options={ENERGIES} value={prefs.energy} onChange={(energy) => setPrefs({ ...prefs, energy })} />

                {error && (
                  <p role="alert" className="mt-3 rounded-xl bg-ember/10 px-3 py-2 text-sm font-medium text-ember">
                    Couldn't reach the map service. Check your connection and try again.
                  </p>
                )}

                <m.button
                  type="button"
                  onClick={go}
                  whileTap={{ scale: 0.98 }}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-forest to-moss py-4 text-base font-bold text-white shadow-float"
                >
                  <Sparkles size={18} aria-hidden="true" />
                  Find my walk
                </m.button>
              </>
            ) : (
              <div aria-live="polite" className="py-1">
                <p className="text-[11px] font-bold tracking-[0.14em] text-moss uppercase">One moment</p>
                <AnimatePresence mode="wait">
                  <m.h2
                    key={line}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mb-4 font-display text-[24px] leading-tight font-semibold text-forest"
                  >
                    {LOADING_LINES[line]}
                  </m.h2>
                </AnimatePresence>
                {[0, 1].map((i) => (
                  <div key={i} className="mb-2 flex gap-3 rounded-2xl bg-white p-3">
                    <div className="skeleton size-12 rounded-2xl" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="skeleton h-4 w-2/3 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                      <div className="skeleton h-3 w-full rounded" />
                    </div>
                  </div>
                ))}
                <p className="mt-2 text-center text-xs text-ink/50">The first search in a new area can take a few seconds.</p>
              </div>
            )}
          </m.section>
        ) : (
          <m.section key="results" {...sheetMotion} aria-label="Places to go">
            <div className="mx-3 mb-2.5 flex items-center justify-between gap-2 rounded-2xl bg-cream/90 py-2 pr-2 pl-3.5 shadow-float backdrop-blur-xl">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-forest">{summary}</p>
                <div className="mt-0.5 flex">{result && <SourceBadge result={result} />}</div>
              </div>
              <button type="button" onClick={edit} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-mist px-3 py-2 text-sm font-semibold text-forest">
                <SlidersHorizontal size={15} aria-hidden="true" /> Change
              </button>
            </div>

            {result && result.cards.length === 0 ? (
              <div className="mx-3 rounded-[24px] bg-cream p-5 text-center shadow-sheet">
                <p className="font-display text-xl font-semibold text-forest">Nothing within reach</p>
                <p className="mt-1 text-sm text-ink/65">Try a longer walk or a different mood.</p>
                <button
                  type="button"
                  onClick={() => {
                    setPrefs({ ...prefs, minutes: 120 });
                    setStage('setup');
                  }}
                  className="mt-4 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Try 2 hours
                </button>
              </div>
            ) : (
              <ol ref={railRef} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-1">
                {result?.cards.map((c, i) => (
                  <m.li
                    key={c.place.id + (result.source === 'gemma' ? '-g' : '-r')}
                    data-id={c.place.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07, type: 'spring', stiffness: 400, damping: 32 }}
                    className="w-[86%] max-w-sm shrink-0 snap-center"
                    onClick={() => {
                      select(c.place.id, 'list');
                      map?.easeTo({ center: [c.place.lon, c.place.lat], zoom: 15.5, padding: { top: 80, bottom: 260, left: 0, right: 0 }, duration: 700 });
                    }}
                  >
                    <PlaceCard card={c} rank={i + 1} selected={selectedId === c.place.id} />
                  </m.li>
                ))}
              </ol>
            )}
          </m.section>
        )}
      </AnimatePresence>
    </div>
  );
}
