import { AnimatePresence, m } from 'motion/react';
import { Bike, Camera, Car, ChevronRight, Footprints, Flag, LoaderCircle, PartyPopper, X } from 'lucide-react';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';
import { minutesFor, type TravelMode } from '../../lib/geo/route';

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const MODE_ICON: Record<TravelMode, typeof Footprints> = { walk: Footprints, bike: Bike, car: Car };
const MODE_VERB: Record<TravelMode, string> = { walk: 'Walking', bike: 'Cycling', car: 'Driving' };

/** Floating banner during a walk or trip: what's next, distance left, and the arrival prompt. */
export function WalkBanner() {
  const { status, plan, index, target, route, backRoute, remainingM, error, stop, next } = useWalkStore();
  const visible = status !== 'idle' && (target || status === 'done');
  const total = plan ? plan.stops.length + (plan.backMode ? 1 : 0) : 0;
  const isHome = !!plan && index >= plan.stops.length;
  const isLast = index + 1 >= total;
  const mode: TravelMode = (isHome || plan?.stops[index]?.leg === 'back' ? plan?.backMode : plan?.mode) ?? 'walk';
  const ModeIcon = MODE_ICON[mode];
  const straight = (isHome ? backRoute : route)?.source === 'straight';

  /** "Since you're here": check in, then write the memory; the trip carries on afterwards. */
  async function remember() {
    if (!target) return;
    const { places, savePlace, checkIn } = useUserStore.getState();
    const place =
      places.find((p) => p.id === target.placeId) ??
      (target.sourceId
        ? await savePlace({ id: target.sourceId, name: target.name, kind: target.kind, lon: target.lonLat[0], lat: target.lonLat[1] }, false)
        : await savePlace({ name: target.name, kind: target.kind, lonLat: target.lonLat }, false));
    const visit = await checkIn(place.id);
    next();
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
          className="absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-20 rounded-2xl bg-forest-deep/95 p-3 text-cream shadow-float backdrop-blur-xl md:right-4 md:left-auto md:w-[400px]"
        >
          {status === 'done' ? (
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunset">
                <PartyPopper size={18} aria-hidden="true" />
              </span>
              <p className="flex-1 text-sm font-bold">Trip complete. Nice one for getting outside!</p>
              <button type="button" onClick={stop} aria-label="Close" className="grid size-9 place-items-center rounded-xl bg-white/10">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          ) : status === 'arrived' && target ? (
            <div>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunset">
                  {isHome ? <Flag size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{isHome ? "You're home!" : `You're at ${target.name}!`}</p>
                  <p className="text-xs text-cream/75">
                    {isHome ? 'That was a good one.' : 'Since you are here, snap a few photos and add a note so you remember this place.'}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2">
                {!isHome && (
                  <button type="button" onClick={() => void remember()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cream py-2 text-sm font-bold text-forest">
                    <Camera size={15} aria-hidden="true" /> Check in & add a memory
                  </button>
                )}
                <button type="button" onClick={next} className="flex items-center justify-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">
                  {isLast ? 'Finish' : 'Next stop'} <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-moss">
                {status === 'planning' ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <ModeIcon size={18} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {isHome ? `${MODE_VERB[mode]} home` : `${MODE_VERB[mode]} to ${target?.name}`}
                  {total > 1 && <span className="font-medium text-cream/60"> · stop {Math.min(index + 1, total)} of {total}</span>}
                </p>
                <p className="text-xs text-cream/70">
                  {status === 'planning' && 'Planning the route…'}
                  {status === 'walking' &&
                    remainingM !== null &&
                    `${fmtDist(remainingM)} left · about ${minutesFor(remainingM, mode)} min${straight ? ' · straight line (offline)' : ''}`}
                  {status === 'error' && (error ?? "Couldn't start the trip.")}
                </p>
              </div>
              {status === 'walking' && total > 1 && (
                <button type="button" onClick={next} title="Skip to the next stop" className="rounded-xl bg-white/10 px-2.5 py-2 text-xs font-semibold">
                  Skip
                </button>
              )}
              <button type="button" onClick={stop} aria-label="End trip" className="grid size-9 place-items-center rounded-xl bg-white/10">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
