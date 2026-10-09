import { AnimatePresence, m } from 'motion/react';
import { Footprints, LoaderCircle, MapPinCheck, X } from 'lucide-react';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const minutesFor = (m: number) => Math.max(1, Math.round(m / 80));

/** Floating banner during a walk: distance left, arrival, and check-in on arrival. */
export function WalkBanner() {
  const { status, target, route, remainingM, error, stop } = useWalkStore();
  const visible = status !== 'idle' && target;

  async function checkInHere() {
    if (!target) return;
    const { places, savePlace, checkIn } = useUserStore.getState();
    const place =
      places.find((p) => p.id === target.placeId) ??
      (target.sourceId
        ? await savePlace({ id: target.sourceId, name: target.name, kind: target.kind, lon: target.lonLat[0], lat: target.lonLat[1] }, false)
        : await savePlace({ name: target.name, kind: target.kind, lonLat: target.lonLat }, false));
    const visit = await checkIn(place.id);
    stop();
    useUiStore.getState().showToast(`Checked in at ${place.name}`);
    useUiStore.getState().openComposer({ placeId: place.id, visitId: visit.id });
  }

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          role="status"
          aria-live="polite"
          className="absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-20 rounded-2xl bg-forest-deep/95 p-3 text-cream shadow-float backdrop-blur-xl md:right-auto md:w-[420px]"
        >
          <div className="flex items-center gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${status === 'arrived' ? 'bg-sunset' : 'bg-moss'}`}>
              {status === 'planning' ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Footprints size={18} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{status === 'arrived' ? `You've arrived at ${target.name}` : `Walking to ${target.name}`}</p>
              <p className="text-xs text-cream/70">
                {status === 'planning' && 'Planning the route…'}
                {status === 'walking' &&
                  remainingM !== null &&
                  `${fmtDist(remainingM)} · about ${minutesFor(remainingM)} min${route?.source === 'straight' ? ' · straight line (offline)' : ''}`}
                {status === 'arrived' && 'Check in to level it up.'}
                {status === 'error' && (error ?? "Couldn't start the walk.")}
              </p>
            </div>
            {status === 'arrived' ? (
              <button type="button" onClick={() => void checkInHere()} className="flex items-center gap-1.5 rounded-xl bg-cream px-3 py-2 text-sm font-bold text-forest">
                <MapPinCheck size={15} aria-hidden="true" /> Check in
              </button>
            ) : (
              <button type="button" onClick={stop} aria-label="End walk" className="grid size-9 place-items-center rounded-xl bg-white/10">
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
