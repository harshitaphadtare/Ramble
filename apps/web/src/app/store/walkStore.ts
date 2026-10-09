import { create } from 'zustand';
import type { PlaceKind } from '@ramble/shared';
import { distanceM, type LonLat } from '../../lib/geo/geo';
import { fetchWalkingRoute, remainingAlongRoute, type WalkRoute } from '../../lib/geo/route';
import { locateOnce } from '../../lib/geo/locate';
import { useMapStore } from './mapStore';

/** Within this distance of the destination (and a decent GPS fix), you've arrived. */
const ARRIVED_M = 40;
const MIN_ACCURACY_M = 50;

export interface WalkTarget {
  name: string;
  kind: PlaceKind;
  lonLat: LonLat;
  /** Your saved place, if it is one. */
  placeId?: string;
  /** The map/OSM place, if it came from Explore. */
  sourceId?: string;
}

type Status = 'idle' | 'planning' | 'walking' | 'arrived' | 'error';

interface WalkState {
  status: Status;
  target: WalkTarget | null;
  route: WalkRoute | null;
  remainingM: number | null;
  startedAt: number | null;
  error: string | null;
  start: (target: WalkTarget) => Promise<void>;
  stop: () => void;
}

let watchId: number | null = null;
let planning: AbortController | null = null;

function stopWatching() {
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

/**
 * Walk mode. Location is watched ONLY while a walk is active (docs/SECURITY.md §5.8) and the
 * watch is cleared the moment it ends.
 */
export const useWalkStore = create<WalkState>((set, get) => ({
  status: 'idle',
  target: null,
  route: null,
  remainingM: null,
  startedAt: null,
  error: null,

  start: async (target) => {
    get().stop();
    planning = new AbortController();
    const signal = planning.signal;
    set({ status: 'planning', target, route: null, remainingM: null, error: null });
    try {
      const from = useMapStore.getState().userPos ?? (await locateOnce()).lonLat;
      useMapStore.setState({ userPos: from, locateStatus: 'located' });
      const route = await fetchWalkingRoute(from, target.lonLat, signal);
      if (signal.aborted) return;
      set({ status: 'walking', route, remainingM: route.distanceM, startedAt: Date.now() });

      watchId =
        navigator.geolocation?.watchPosition(
          (p) => {
            const pos: LonLat = [p.coords.longitude, p.coords.latitude];
            useMapStore.setState({ userPos: pos });
            const { route: r, status } = get();
            if (!r || status !== 'walking') return;
            const remainingM = r.source === 'osrm' ? remainingAlongRoute(r.coords, pos) : distanceM(pos, target.lonLat);
            const arrived = distanceM(pos, target.lonLat) <= ARRIVED_M && p.coords.accuracy <= MIN_ACCURACY_M;
            set({ remainingM, status: arrived ? 'arrived' : 'walking' });
            if (arrived) stopWatching();
          },
          () => {
            /* keep the last known position; the banner still shows the plan */
          },
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
        ) ?? null;
    } catch (e) {
      if (signal.aborted) return;
      set({ status: 'error', error: e instanceof Error ? e.message : "Couldn't start the walk." });
    }
  },

  stop: () => {
    planning?.abort();
    stopWatching();
    set({ status: 'idle', target: null, route: null, remainingM: null, startedAt: null, error: null });
  },
}));

// Stop tracking if the user leaves the app for a long time (no background tracking).
if (typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000 && useWalkStore.getState().status === 'walking') useWalkStore.getState().stop();
  });
}
