import { create } from 'zustand';
import type { PlaceKind } from '@ramble/shared';
import { distanceM, type LonLat } from '../../lib/geo/geo';
import { fetchRoute, remainingAlongRoute, type TravelMode, type WalkRoute } from '../../lib/geo/route';
import { locateOnce } from '../../lib/geo/locate';
import { useMapStore } from './mapStore';
import { useUiStore } from './uiStore';

/** Within this distance of a stop (and a decent GPS fix), you've arrived. Driving gets more slack. */
const ARRIVED_M: Record<TravelMode, number> = { walk: 60, bike: 80, car: 150 };
const MIN_ACCURACY_M = 60;

export interface WalkTarget {
  name: string;
  kind: PlaceKind;
  lonLat: LonLat;
  /** Your saved place, if it is one. */
  placeId?: string;
  /** The map/OSM place, if it came from Explore or search. */
  sourceId?: string;
}

/** A stop on the trip; "back" stops are on the way home. */
export interface TripStop extends WalkTarget {
  leg: 'out' | 'back';
}

export interface TripPlan {
  /** In order; the last "out" stop is the destination. */
  stops: TripStop[];
  mode: TravelMode;
  /** How you're coming back, or null for one way. */
  backMode: TravelMode | null;
  /** Where the plan was made from: the start if your location isn't available. */
  from?: LonLat;
}

type Status = 'idle' | 'planning' | 'walking' | 'arrived' | 'done' | 'error';

interface WalkState {
  status: Status;
  plan: TripPlan | null;
  /** Where the trip started (and where "home" is for the way back). */
  home: LonLat | null;
  /** Index into plan.stops; equal to stops.length while heading home. */
  index: number;
  /** The stop you're heading to (or "Home"). */
  target: WalkTarget | null;
  route: WalkRoute | null;
  backRoute: WalkRoute | null;
  remainingM: number | null;
  startedAt: number | null;
  error: string | null;
  /** Location was unavailable, so the route starts from the map centre (no live tracking). */
  fromMap: boolean;
  /** One stop, walking, one way: what "Walk here" does. */
  start: (target: WalkTarget) => Promise<void>;
  startTrip: (plan: TripPlan) => Promise<void>;
  /** Move on from the stop you've arrived at. */
  next: () => void;
  stop: () => void;
}

let watchId: number | null = null;
let planning: AbortController | null = null;

function stopWatching() {
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

const HOME_KIND: PlaceKind = 'other';
const homeTarget = (lonLat: LonLat): WalkTarget => ({ name: 'Home', kind: HOME_KIND, lonLat });

/** Which stop is next, and with which mode. Heading home after the last stop when there's a way back. */
function targetAt(plan: TripPlan, home: LonLat, i: number): { target: WalkTarget; mode: TravelMode } | null {
  const s = plan.stops[i];
  if (s) return { target: s, mode: s.leg === 'back' ? (plan.backMode ?? plan.mode) : plan.mode };
  if (i === plan.stops.length && plan.backMode) return { target: homeTarget(home), mode: plan.backMode };
  return null;
}

/** "Since you're here…": a buzz, and a notification if Ramble is in the background and allowed. */
function pingArrival(name: string) {
  navigator.vibrate?.([120, 60, 120]);
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`You're at ${name}!`, { body: 'Snap a few photos and add a note so you remember it.', tag: 'ramble-arrival' });
    }
  } catch {
    /* notifications unavailable: the in-app banner still shows */
  }
}

/**
 * Walks and trips. Location is watched ONLY while one is active (docs/SECURITY.md §5.8) and the
 * watch is cleared the moment it ends.
 */
export const useWalkStore = create<WalkState>((set, get) => ({
  status: 'idle',
  plan: null,
  home: null,
  index: 0,
  target: null,
  route: null,
  backRoute: null,
  remainingM: null,
  startedAt: null,
  error: null,
  fromMap: false,

  start: (target) => get().startTrip({ stops: [{ ...target, leg: 'out' }], mode: 'walk', backMode: null }),

  startTrip: async (plan) => {
    get().stop();
    if (!plan.stops.length) return;
    planning = new AbortController();
    const signal = planning.signal;
    // Out of the way so the route is the whole screen; only this trip's stops stay on the map.
    useUiStore.setState({ tab: null, openPlaceId: null });
    useMapStore.getState().setPins(
      plan.stops.map((s, i) => ({ id: `trip-${i}`, rank: i + 1, name: s.name, lonLat: s.lonLat, color: s.leg === 'back' ? '#6fa36b' : '#1d3a2a' })),
    );
    set({ status: 'planning', plan, index: 0, target: plan.stops[0]!, route: null, backRoute: null, remainingM: null, error: null });
    try {
      // No location (blocked, or a laptop)? Still plan the route, from the middle of the map.
      let from = useMapStore.getState().userPos;
      let fromMap = false;
      if (!from) {
        const located = await locateOnce().catch(() => null);
        if (signal.aborted) return;
        if (located) {
          from = located.lonLat;
          useMapStore.setState({ userPos: from, locateStatus: 'located' });
        } else {
          const c = useMapStore.getState().map?.getCenter();
          from = plan.from ?? (c ? [c.lng, c.lat] : null);
          if (!from) throw new Error('Turn on location to start a trip.');
          fromMap = true;
        }
      }
      set({ fromMap });
      const out = plan.stops.filter((s) => s.leg === 'out');
      const back = plan.stops.filter((s) => s.leg === 'back');
      const lastOut = (out.at(-1) ?? plan.stops[0]!).lonLat;
      const [route, backRoute] = await Promise.all([
        fetchRoute([from, ...out.map((s) => s.lonLat)], plan.mode, signal),
        plan.backMode ? fetchRoute([lastOut, ...back.map((s) => s.lonLat), from], plan.backMode, signal) : Promise.resolve(null),
      ]);
      if (signal.aborted) return;
      set({ status: 'walking', home: from, route, backRoute, remainingM: route.distanceM + (backRoute?.distanceM ?? 0), startedAt: Date.now() });

      watchId =
        navigator.geolocation?.watchPosition(
          (p) => {
            const pos: LonLat = [p.coords.longitude, p.coords.latitude];
            useMapStore.setState({ userPos: pos });
            const s = get();
            if (s.status !== 'walking' || !s.plan || !s.home) return;
            const now = targetAt(s.plan, s.home, s.index);
            if (!now) return;
            const onBack = s.index >= out.length;
            const legRoute = onBack ? s.backRoute : s.route;
            const legLeft = legRoute?.source === 'osrm' ? remainingAlongRoute(legRoute.coords, pos) : distanceM(pos, now.target.lonLat);
            const remainingM = legLeft + (!onBack ? (s.backRoute?.distanceM ?? 0) : 0);
            const arrived = distanceM(pos, now.target.lonLat) <= ARRIVED_M[now.mode] && p.coords.accuracy <= MIN_ACCURACY_M;
            set({ remainingM, status: arrived ? 'arrived' : 'walking' });
            if (arrived) pingArrival(now.target.name);
          },
          () => {
            /* keep the last known position; the banner still shows the plan */
          },
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
        ) ?? null;
    } catch (e) {
      if (signal.aborted) return;
      set({ status: 'error', error: e instanceof Error ? e.message : "Couldn't start the trip." });
    }
  },

  next: () => {
    const { plan, home, index } = get();
    if (!plan || !home) return;
    const upcoming = targetAt(plan, home, index + 1);
    if (!upcoming) {
      stopWatching();
      set({ status: 'done', target: null });
      setTimeout(() => get().status === 'done' && get().stop(), 4000);
      return;
    }
    set({ index: index + 1, target: upcoming.target, status: 'walking' });
  },

  stop: () => {
    planning?.abort();
    stopWatching();
    if (get().status !== 'idle') useMapStore.getState().setPins([]);
    set({ status: 'idle', plan: null, home: null, index: 0, target: null, route: null, backRoute: null, remainingM: null, startedAt: null, error: null, fromMap: false });
  },
}));

// Stop tracking if the user leaves the app for a long time (no background tracking).
if (typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000 && useWalkStore.getState().status === 'walking') useWalkStore.getState().stop();
  });
}
