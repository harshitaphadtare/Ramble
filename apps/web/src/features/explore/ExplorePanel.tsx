import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Bookmark, BookmarkCheck, Check, Compass, Footprints, Navigation, MapPinCheck, Route, SlidersHorizontal, Sparkles, WifiOff, Zap } from 'lucide-react';
import { MOODS, type Energy, type Mood, type OutdoorPlace } from '@ramble/shared';
import { useMapStore } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore, visitsFor } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';
import { useFeatures } from '../../app/store/featuresStore';
import { readiness } from '../../lib/personalize/features';
import { personalizeOptedIn } from '../../lib/personalize/consent';
import { LevelBadge } from '../../ui/Level';
import { LocationButton, LocationError } from '../map/LocationButton';
import type { LonLat } from '../../lib/geo/geo';
import { KIND_STYLE, MOOD_STYLE, gradient } from '../../ui/visuals';
import { MinimiseButton, PANEL_BODY, PANEL_POSITION, PANEL_POSITION_WIDE, mapPadding, sheetMotion } from '../../ui/Sheet';
import { TripPlanner } from '../trip/TripPlanner';
import { explore, type ExploreCard, type ExplorePrefs, type ExploreResult } from './explore';

/** Sentinel for the "Custom" time option (then a slider picks the minutes). */
const CUSTOM = -1;
const MAX_MINUTES = 480;
const TIMES = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: CUSTOM, label: 'Custom' },
];
const fmtMinutes = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${min % 60} m` : `${min / 60} hour${min === 60 ? '' : 's'}`);
const ENERGIES: { value: Energy; label: string }[] = [
  { value: 'easy', label: 'Easy stroll' },
  { value: 'moderate', label: 'Steady' },
  { value: 'push', label: 'Push me' },
];
const LOADING_LINES = ['Scouting parks and lookouts…', 'Timing it with the light…', 'Asking Gemma for the best three…'];

type Stage = 'setup' | 'loading' | 'results';

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
    <div role="radiogroup" className="grid gap-1 rounded-2xl bg-mist p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
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
      className={`relative flex h-[84px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-1.5 text-left text-white transition-shadow sm:max-md:h-[100px] sm:max-md:p-3 ${
        active ? 'shadow-float ring-2 ring-forest ring-offset-2 ring-offset-cream' : 'opacity-90'
      }`}
      style={{ background: gradient(s.from, s.to) }}
    >
      <Icon className="size-[18px] sm:max-md:size-[22px]" strokeWidth={2.2} aria-hidden="true" />
      <span>
        <span className="block text-[11px] leading-tight font-bold tracking-tight sm:max-md:text-[15px] sm:max-md:tracking-normal md:text-[12px]">{s.label}</span>
        <span className="hidden text-[11px] font-medium text-white/80 sm:max-md:block">{s.blurb}</span>
      </span>
      {active && (
        <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-white text-forest sm:max-md:top-2 sm:max-md:right-2">
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </m.span>
      )}
    </m.button>
  );
}

function SourceBadge({ result }: { result: ExploreResult }) {
  if (result.refining) {
    return (
      <span className="relative flex items-center gap-1 shrink-0 overflow-hidden rounded-full bg-forest px-2 py-0.5 text-[11px] font-semibold text-white">
        <m.span animate={{ rotate: [0, 20, -10, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
          <Sparkles size={13} aria-hidden="true" />
        </m.span>
        Gemma…
        <span className="skeleton absolute inset-0 opacity-30 mix-blend-overlay" aria-hidden="true" />
      </span>
    );
  }
  if (result.source === 'gemma') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-forest to-moss px-2 py-0.5 text-[11px] font-semibold text-white">
        <Sparkles size={12} aria-hidden="true" /> Gemma
      </span>
    );
  }
  return navigator.onLine ? (
    <span className="flex items-center gap-1 shrink-0 rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-forest">
      <Zap size={13} aria-hidden="true" /> Quick picks
    </span>
  ) : (
    <span className="flex items-center gap-1 shrink-0 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">
      <WifiOff size={13} aria-hidden="true" /> Offline picks
    </span>
  );
}

function PlaceCard({ card, rank, selected }: { card: ExploreCard; rank: number; selected: boolean }) {
  const s = KIND_STYLE[card.place.kind];
  const Icon = s.icon;
  return (
    <article
      className={`flex h-full flex-col rounded-[20px] bg-cream p-3.5 shadow-sheet transition-[box-shadow,transform] ${
        selected ? 'ring-2 ring-forest' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: gradient(s.from, s.to) }}>
          <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
          <span className="absolute -top-1.5 -left-1.5 grid size-[18px] place-items-center rounded-full bg-forest-deep text-[10px] font-bold text-white ring-2 ring-cream">
            {rank}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[17px] leading-tight font-semibold text-ink">{card.place.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink/55">
            {s.label}
            <span aria-hidden="true">·</span>
            <Footprints size={12} aria-hidden="true" /> {card.walkMin} min
            {card.love !== undefined && (
              <span className="ml-1 rounded-full bg-forest/10 px-1.5 font-bold text-forest" title="TabPFN, from your own visit history">
                💚 {Math.round(card.love * 100)}%
              </span>
            )}
          </p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-snug text-ink/70" title={card.reason}>
        {card.reason}
      </p>
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
    <div className="mt-2.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => void useWalkStore.getState().start({ name: place.name, kind: place.kind, lonLat: [place.lon, place.lat], placeId: saved?.id, sourceId: place.id })}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest py-2 text-[13px] font-semibold text-white"
      >
        <Navigation size={14} aria-hidden="true" /> Walk here
      </button>
      <button type="button" onClick={() => void arrived()} disabled={busy} title="I'm here: check in" className="flex items-center justify-center gap-1 rounded-xl bg-mist px-2.5 py-2 text-[13px] font-semibold text-forest disabled:opacity-60">
        <MapPinCheck size={14} aria-hidden="true" /> I'm here
      </button>
      <button
        type="button"
        onClick={() => void toggleSave()}
        disabled={busy}
        aria-pressed={!!saved?.wantToGo}
        aria-label={saved?.wantToGo ? 'Remove from Want to go' : 'Save to Want to go'}
        className={`grid size-[34px] place-items-center rounded-xl ${saved?.wantToGo ? 'bg-sunset text-white' : 'bg-mist text-forest'}`}
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
  if (!enabled || !personalizeOptedIn()) return null;
  const r = readiness(places, visits);
  return (
    <p className="mb-3 rounded-xl bg-forest/5 px-3 py-2 text-xs font-medium text-forest">
      {r.ready ? '💚 Picks are tuned to your taste (TabPFN, from your visits).' : `💚 Ramble is learning your taste: ${r.visited}/${r.needed} places visited.`}
    </p>
  );
}

export function ExplorePanel({ hidden = false }: { hidden?: boolean }) {
  const [prefs, setPrefs] = useState<ExplorePrefs>({ minutes: 60, mood: 'nature', energy: 'easy' });
  const [mode, setMode] = useState<'walk' | 'trip'>('walk');
  const [customTime, setCustomTime] = useState(false);
  const [stage, setStage] = useState<Stage>('setup');
  const [error, setError] = useState(false);
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [line, setLine] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const { map, userPos, setPins, select, selectedId, selectedBy } = useMapStore();

  useEffect(() => () => abortRef.current?.abort(), []);

  // Reopening Explore after a walk: put the picks back on the map (the walk showed only its stops).
  useEffect(() => {
    if (hidden || stage !== 'results' || !result || useWalkStore.getState().status !== 'idle') return;
    setPins(result.cards.map((c, i) => ({ id: c.place.id, rank: i + 1, name: c.place.name, lonLat: [c.place.lon, c.place.lat], color: KIND_STYLE[c.place.kind].pin })));
  }, [hidden, stage, result, setPins]);

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
        map?.easeTo({ center: [card.place.lon, card.place.lat], zoom: Math.max(map.getZoom(), 14.5), padding: mapPadding(), duration: 700 });
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
          personalize: useFeatures.getState().personalize && personalizeOptedIn(),
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
      { padding: mapPadding(), maxZoom: 15.5, duration: 800 },
    );
  }

  function edit() {
    abortRef.current?.abort();
    setStage('setup');
    setResult(null);
    setPins([]);
  }

  const summary = `${fmtMinutes(prefs.minutes)} · ${MOOD_STYLE[prefs.mood].label} · ${ENERGIES.find((e) => e.value === prefs.energy)?.label}`;

  return (
    // Phones: full-width bottom sheet. Wider screens: centred above the menu; results get the full width.
    // display:none inline: the sidebar's md:flex would otherwise win over a `hidden` class.
    <div className={stage === 'results' ? PANEL_POSITION_WIDE : PANEL_POSITION} style={hidden ? { display: 'none' } : undefined}>
      <AnimatePresence mode="wait">
        {stage !== 'results' ? (
          <m.section
            key="sheet"
            {...sheetMotion}
            aria-label="Get me outside"
            className={PANEL_BODY}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
            <MinimiseButton />

            {stage === 'setup' ? (
              <>
                <div className="mb-3 flex items-center gap-1 pr-10" role="tablist" aria-label="What would you like to do?">
                  {(
                    [
                      ['walk', 'Find a walk', Compass],
                      ['trip', 'Plan a trip', Route],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={mode === id}
                      onClick={() => setMode(id)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors ${mode === id ? 'bg-forest text-cream' : 'text-ink/55 hover:bg-mist'}`}
                    >
                      <Icon size={14} aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <h2 className="font-display text-[28px] leading-[1.1] font-semibold tracking-tight text-forest">{mode === 'walk' ? 'Where to today?' : 'Where are you off to?'}</h2>
                  <LocationButton />
                </div>
                <LocationError />
                {mode === 'trip' ? (
                  <TripPlanner />
                ) : (
                  <>
                <TasteHint />

                {/* Side by side on wider screens so the whole form fits without scrolling. */}
                <div className="grid gap-4 sm:max-md:grid-cols-2 sm:max-md:gap-3">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-ink/70">How long have you got?</p>
                    <Segmented
                      id="time"
                      options={TIMES}
                      value={customTime ? CUSTOM : prefs.minutes}
                      onChange={(v) => {
                        setCustomTime(v === CUSTOM);
                        setPrefs({ ...prefs, minutes: v === CUSTOM ? Math.max(prefs.minutes, 180) : v });
                      }}
                    />
                    {customTime && (
                      <div className="mt-2 flex items-center gap-3 rounded-xl bg-white px-3 py-2">
                        <input
                          type="range"
                          min={15}
                          max={MAX_MINUTES}
                          step={15}
                          value={prefs.minutes}
                          onChange={(e) => setPrefs({ ...prefs, minutes: Number(e.target.value) })}
                          aria-label="How many minutes you have"
                          className="flex-1 accent-forest"
                        />
                        <span className="w-16 text-right text-sm font-bold text-forest tabular-nums">{fmtMinutes(prefs.minutes)}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-ink/70">Energy</p>
                    <Segmented id="energy" options={ENERGIES} value={prefs.energy} onChange={(energy) => setPrefs({ ...prefs, energy })} />
                  </div>
                </div>

                <p className="mt-4 mb-2 text-sm font-semibold text-ink/70">What's the mood?</p>
                <div role="radiogroup" className="grid grid-cols-5 gap-1.5 py-1 sm:max-md:gap-2.5">
                  {MOODS.map((mood) => (
                    <MoodTile key={mood} mood={mood} active={prefs.mood === mood} onClick={() => setPrefs({ ...prefs, mood })} />
                  ))}
                </div>

                {error && (
                  <p role="alert" className="mt-3 rounded-xl bg-ember/10 px-3 py-2 text-sm font-medium text-ember">
                    Couldn't reach the map service. Check your connection and try again.
                  </p>
                )}

                {/* Pinned to the bottom of the panel so it's always in reach, even on a short screen. */}
                <div className="sticky -bottom-4 -mx-4 -mb-4 mt-2 bg-gradient-to-t from-cream from-70% to-transparent px-4 pt-3 pb-4 sm:-mx-5 sm:px-5">
                  <m.button
                    type="button"
                    onClick={go}
                    whileTap={{ scale: 0.98 }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-forest to-moss py-4 text-base font-bold text-white shadow-float"
                  >
                    <Sparkles size={18} aria-hidden="true" />
                    Find my walk
                  </m.button>
                </div>
                  </>
                )}
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
          <m.section key="results" {...sheetMotion} aria-label="Places to go" className="md:flex md:min-h-0 md:flex-col">
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-cream/95 py-1.5 pr-1.5 pl-3 shadow-float backdrop-blur-xl">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="truncate text-[13px] font-bold text-forest">{summary}</p>
                {result && <SourceBadge result={result} />}
              </div>
              <button type="button" onClick={edit} aria-label="Change time, mood or energy" title="Change" className="grid size-8 shrink-0 place-items-center rounded-full bg-mist text-forest">
                <SlidersHorizontal size={15} aria-hidden="true" />
              </button>
              <div className="relative size-8 shrink-0 [&>button]:static">
                <MinimiseButton />
              </div>
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
              <ol ref={railRef} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-1 md:min-h-0 md:flex-col md:snap-none md:overflow-x-visible md:overflow-y-auto md:px-2">
                {result?.cards.map((c, i) => (
                  <m.li
                    key={c.place.id + (result.source === 'gemma' ? '-g' : '-r')}
                    data-id={c.place.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07, type: 'spring', stiffness: 400, damping: 32 }}
                    className="w-[86%] max-w-sm shrink-0 snap-center sm:w-[300px] md:w-full md:max-w-none"
                    onClick={() => {
                      select(c.place.id, 'list');
                      map?.easeTo({ center: [c.place.lon, c.place.lat], zoom: 15.5, padding: mapPadding(), duration: 700 });
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
