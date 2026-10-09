import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { BookHeart, Flame, Footprints, MapPin, ShieldCheck, Trash } from 'lucide-react';
import { touchedGrassStreak } from '@ramble/shared';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore, visitsFor } from '../../app/store/userStore';
import { LevelBadge } from '../../ui/Level';
import { Eyebrow, Sheet, Title } from '../../ui/Sheet';
import { KIND_STYLE, gradient } from '../../ui/visuals';
import { JournalCard } from '../journal/JournalCard';
import { AccountCard } from './AccountCard';
import { setTelemetryOptOut, telemetryAvailable, telemetryOptedOut } from '../../lib/telemetry';
import { personalizeOptedIn, setPersonalizeOptIn } from '../../lib/personalize/consent';
import { useFeatures } from '../../app/store/featuresStore';

type View = 'places' | 'journal';
type Filter = 'all' | 'want';

function Stat({ icon: Icon, value, label, accent }: { icon: typeof Flame; value: number; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? 'bg-gradient-to-br from-[#f9c06a] to-[#ee8a3f] text-white' : 'bg-white text-ink'}`}>
      <Icon size={17} aria-hidden="true" className={accent ? 'text-white' : 'text-moss'} />
      <p className="mt-1 font-display text-2xl leading-none font-semibold">{value}</p>
      <p className={`text-[11px] font-semibold ${accent ? 'text-white/85' : 'text-ink/55'}`}>{label}</p>
    </div>
  );
}

/** TabPFN personalisation is opt-in, with a plain description of exactly what is sent. */
function PersonalizeToggle() {
  const available = useFeatures((s) => s.personalize);
  const [on, setOn] = useState(personalizeOptedIn);
  if (!available) return null;
  return (
    <label className="mt-2 flex items-start gap-2">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setPersonalizeOptIn(e.target.checked);
          setOn(e.target.checked);
        }}
        className="mt-0.5 size-4 shrink-0 accent-forest"
      />
      <span>
        <b className="text-forest">Smarter suggestions</b> (TabPFN). Learns which places you love from anonymous numbers only: place type, distance band, time of day, weekday or weekend, and how often you went back. Never names, places, coordinates or ids.
      </span>
    </label>
  );
}

/** Anonymous timing data (Sentry) is on by default when configured; one tap turns it off. */
function TelemetryToggle() {
  const [off, setOff] = useState(telemetryOptedOut);
  if (!telemetryAvailable()) return null;
  return (
    <label className="mt-2 flex items-center gap-2">
      <input
        type="checkbox"
        checked={!off}
        onChange={(e) => {
          setTelemetryOptOut(!e.target.checked);
          setOff(!e.target.checked);
        }}
        className="size-4 accent-forest"
      />
      Share anonymous speed data (timings only, never your places or notes)
    </label>
  );
}

export function YouPanel() {
  const { places, visits, journal, wipe } = useUserStore();
  const { openPlace, showToast } = useUiStore();
  const [view, setView] = useState<View>('places');
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const streak = useMemo(() => touchedGrassStreak(visits.map((v) => v.at)), [visits]);
  const sortedPlaces = useMemo(
    () =>
      places
        .filter((p) => filter === 'all' || p.wantToGo)
        .map((p) => ({ place: p, count: visitsFor(visits, p.id) }))
        .sort((a, b) => b.count - a.count || b.place.updatedAt - a.place.updatedAt),
    [places, visits, filter],
  );
  const entries = useMemo(() => [...journal].sort((a, b) => b.createdAt - a.createdAt), [journal]);

  return (
    <Sheet label="You">
      <Eyebrow>Your map</Eyebrow>
      <Title className="mb-3">Out and about</Title>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat icon={Flame} value={streak} label={streak === 1 ? 'week streak' : 'weeks streak'} accent />
        <Stat icon={MapPin} value={places.length} label="places" />
        <Stat icon={Footprints} value={visits.length} label="visits" />
      </div>

      <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-mist p-1">
        {(['places', 'journal'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className="relative rounded-xl py-2 text-sm font-semibold">
            {view === v && <m.span layoutId="you-tab" className="absolute inset-0 rounded-xl bg-white shadow-float" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className={`relative ${view === v ? 'text-forest' : 'text-ink/55'}`}>{v === 'places' ? `Places (${places.length})` : `Journal (${journal.length})`}</span>
          </button>
        ))}
      </div>

      {view === 'places' ? (
        <>
          <div className="mb-2 flex gap-1.5">
            {(['all', 'want'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-forest text-white' : 'bg-white text-ink/60'}`}>
                {f === 'all' ? 'All' : 'Want to go'}
              </button>
            ))}
          </div>
          {sortedPlaces.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-ink/65">
              {filter === 'want' ? 'Nothing saved for later yet. Tap the bookmark on any suggestion.' : 'No places yet. Use Explore to find somewhere, or Check in where you are.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {sortedPlaces.map(({ place, count }) => {
                const style = KIND_STYLE[place.kind];
                const Icon = style.icon;
                return (
                  <li key={place.id}>
                    <button type="button" onClick={() => openPlace(place.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: gradient(style.from, style.to) }}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{place.name}</span>
                        <span className="text-xs text-ink/55">
                          {count} {count === 1 ? 'visit' : 'visits'}
                        </span>
                      </span>
                      <LevelBadge visits={count} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : entries.length === 0 ? (
        <p className="flex items-start gap-2 rounded-2xl bg-white p-4 text-sm leading-relaxed text-ink/65">
          <BookHeart size={18} className="mt-0.5 shrink-0 text-moss" aria-hidden="true" /> Your journal fills up as you check in and save memories.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((j) => (
            <JournalCard key={j.id} entry={j} showPlace />
          ))}
        </div>
      )}

      <AccountCard />

      <div className="mt-5 rounded-2xl bg-white p-3 text-xs leading-relaxed text-ink/60">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-forest">
          <ShieldCheck size={14} aria-hidden="true" /> Private by design
        </p>
        Everything here is encrypted on this phone. Only encrypted copies leave it (if you turn on sync), plus a note when you tap ✨ Polish.
        <PersonalizeToggle />
        <TelemetryToggle />
        {confirmWipe ? (
          <button
            type="button"
            onClick={() =>
              void wipe().then(() => {
                setConfirmWipe(false);
                showToast('All Ramble data deleted from this device');
              })
            }
            className="mt-2 flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 font-semibold text-white"
          >
            <Trash size={13} aria-hidden="true" /> Yes, delete everything on this device
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmWipe(true)} className="mt-2 flex items-center gap-1.5 font-semibold text-ember">
            <Trash size={13} aria-hidden="true" /> Delete all data
          </button>
        )}
      </div>
    </Sheet>
  );
}
