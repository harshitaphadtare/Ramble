import { AnimatePresence, m } from 'motion/react';
import { MapPin, MapPinCheck, Navigation, Plus, X } from 'lucide-react';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';
import { useMapStore } from '../../app/store/mapStore';
import { distanceM } from '../../lib/geo/geo';
import { useTripDraft } from '../trip/tripDraft';

const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** A place tapped on the map (café, park…): walk there, add it to a trip, or check in. */
export function MapPickCard() {
  const pick = useUiStore((s) => s.mapPick);
  const userPos = useMapStore((s) => s.userPos);
  const close = () => useUiStore.setState({ mapPick: null });

  async function here() {
    if (!pick) return;
    try {
      const { savePlace, checkIn } = useUserStore.getState();
      const place = await savePlace({ name: pick.name, kind: pick.kind, lonLat: pick.lonLat }, false);
      const visit = await checkIn(place.id);
      close();
      useUiStore.getState().showToast(`Checked in at ${place.name}`);
      useUiStore.getState().openComposer({ placeId: place.id, visitId: visit.id });
    } catch {
      useUiStore.getState().showToast("Couldn't save that check-in on this device. Try again.");
    }
  }

  return (
    <AnimatePresence>
      {pick && (
        <m.div
          key={pick.id}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 12, opacity: 0 }}
          role="dialog"
          aria-label={pick.name}
          className="absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-30 rounded-2xl bg-cream/95 p-3 shadow-sheet backdrop-blur-xl md:top-auto md:right-auto md:bottom-3 md:left-3 md:w-[360px]"
        >
          <div className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mist text-forest">
              <MapPin size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px] leading-tight font-semibold text-ink">{pick.name}</p>
              <p className="text-xs font-medium text-ink/55 capitalize">
                {pick.type}
                {userPos && ` · ${fmtKm(distanceM(userPos, pick.lonLat))} away`}
              </p>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-mist text-ink/60">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                void useWalkStore.getState().start({ name: pick.name, kind: pick.kind, lonLat: pick.lonLat, sourceId: pick.id });
                close();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest py-2 text-[13px] font-semibold text-white"
            >
              <Navigation size={14} aria-hidden="true" /> Walk here
            </button>
            <button
              type="button"
              onClick={() => {
                useTripDraft.getState().add({ id: pick.id, name: pick.name, detail: pick.type, kind: pick.kind, lonLat: pick.lonLat });
                useUiStore.setState({ exploreMode: 'trip', tab: 'explore', mapPick: null });
                useUiStore.getState().showToast(`Added ${pick.name} to your trip`);
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-mist px-2.5 py-2 text-[13px] font-semibold text-forest"
            >
              <Plus size={14} aria-hidden="true" /> Add to trip
            </button>
            <button type="button" onClick={() => void here()} className="flex items-center justify-center gap-1 rounded-xl bg-mist px-2.5 py-2 text-[13px] font-semibold text-forest">
              <MapPinCheck size={14} aria-hidden="true" /> I'm here
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
