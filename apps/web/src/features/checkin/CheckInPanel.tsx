import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, MapPinPlus } from 'lucide-react';
import type { OutdoorPlace, Place } from '@ramble/shared';
import { useMapStore } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore, visitsFor } from '../../app/store/userStore';
import { distanceM, type LonLat } from '../../lib/geo/geo';
import { LevelBadge } from '../../ui/Level';
import { Eyebrow, Sheet, Title } from '../../ui/Sheet';
import { KIND_STYLE, gradient } from '../../ui/visuals';
import { LocationButton, LocationError } from '../map/LocationButton';
import { placesNear } from '../explore/explore';

/** Saved places within this distance are offered; public places only when you're right there. */
const SAVED_RADIUS_M = 2000;
const NEARBY_RADIUS_M = 400;

type Row = { key: string; name: string; kind: Place['kind']; distM: number; saved?: Place; outdoor?: OutdoorPlace };

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export function CheckInPanel() {
  const userPos = useMapStore((s) => s.userPos);
  const map = useMapStore((s) => s.map);
  const { places, visits, savePlace, checkIn } = useUserStore();
  const { openComposer, showToast } = useUiStore();
  // Results are tagged with the position they were fetched for, so 'loading' is derived, not stored.
  const posKey = userPos ? userPos.join(',') : null;
  const [fetched, setFetched] = useState<{ key: string; places: OutdoorPlace[] } | null>(null);
  const nearby = useMemo(() => (fetched && fetched.key === posKey ? fetched.places : []), [fetched, posKey]);
  const loading = posKey !== null && fetched?.key !== posKey;
  const [naming, setNaming] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!userPos || !posKey) return;
    const ctl = new AbortController();
    placesNear(userPos, map, ctl.signal)
      .then((places) => !ctl.signal.aborted && setFetched({ key: posKey, places }))
      .catch(() => !ctl.signal.aborted && setFetched({ key: posKey, places: [] }));
    return () => ctl.abort();
  }, [userPos, posKey, map]);

  const rows = useMemo<Row[]>(() => {
    if (!userPos) return [];
    const saved: Row[] = places
      .map((p) => ({ key: p.id, name: p.name, kind: p.kind, distM: distanceM(userPos, p.lonLat), saved: p }))
      .filter((r) => r.distM <= SAVED_RADIUS_M);
    const savedSources = new Set(places.map((p) => p.sourceId).filter(Boolean));
    const outdoor: Row[] = nearby
      .filter((o) => !savedSources.has(o.id))
      .map((o) => ({ key: o.id, name: o.name, kind: o.kind, distM: distanceM(userPos, [o.lon, o.lat]), outdoor: o }))
      .filter((r) => r.distM <= NEARBY_RADIUS_M);
    return [...saved, ...outdoor].sort((a, b) => a.distM - b.distM).slice(0, 12);
  }, [userPos, places, nearby]);

  async function checkInAt(row: Row) {
    setBusyKey(row.key);
    try {
      const place = row.saved ?? (await savePlace(row.outdoor!, false));
      const visit = await checkIn(place.id);
      showToast(`Checked in at ${place.name}`);
      openComposer({ placeId: place.id, visitId: visit.id });
    } finally {
      setBusyKey(null);
    }
  }

  async function nameSpot(name: string) {
    if (!userPos || !name.trim()) return;
    const place = await savePlace({ name: name.trim().slice(0, 80), kind: 'other', lonLat: userPos as LonLat }, false);
    setNaming(false);
    await checkInAt({ key: place.id, name: place.name, kind: place.kind, distM: 0, saved: place });
  }

  return (
    <Sheet label="Check in">
      <Eyebrow>Check in</Eyebrow>
      <div className="mb-3 flex items-end justify-between gap-3">
        <Title>Where are you?</Title>
        <LocationButton />
      </div>
      <LocationError />

      {!userPos ? (
        <p className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-ink/70">
          Share your location to see the places around you. Every check-in levels a place up, from <b>Visited</b> to <b>Local legend</b>.
        </p>
      ) : (
        <>
          {loading && rows.length === 0 && (
            <p className="flex items-center gap-2 py-3 text-sm text-ink/60">
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Looking around you…
            </p>
          )}
          <ul className="space-y-2">
            {rows.map((r) => {
              const style = KIND_STYLE[r.kind];
              const Icon = style.icon;
              return (
                <li key={r.key}>
                  <button type="button" onClick={() => void checkInAt(r)} disabled={busyKey !== null} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left disabled:opacity-60">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: gradient(style.from, style.to) }}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{r.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-ink/55">
                        {fmtDist(r.distM)} away
                        {r.saved && <LevelBadge visits={visitsFor(visits, r.saved.id)} />}
                      </span>
                    </span>
                    {busyKey === r.key ? <LoaderCircle size={18} className="animate-spin text-moss" aria-hidden="true" /> : <span className="text-sm font-bold text-moss">Check in</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {!loading && rows.length === 0 && <p className="py-2 text-sm text-ink/60">No saved or named places right here.</p>}

          {naming ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void nameSpot(String(new FormData(e.currentTarget).get('name') ?? ''));
              }}
            >
              <input name="name" autoFocus maxLength={80} placeholder="Name this spot" className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-moss focus:outline-none" />
              <button type="submit" className="rounded-xl bg-forest px-4 text-sm font-semibold text-white">
                Save
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setNaming(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/15 py-3 text-sm font-semibold text-ink/60">
              <MapPinPlus size={17} aria-hidden="true" /> Name this spot yourself
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
