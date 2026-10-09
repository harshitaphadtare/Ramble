import { create } from 'zustand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LonLat } from '../../lib/geo/geo';
import { LOCATE_MESSAGES, LocateFailure, locateOnce } from '../../lib/geo/locate';

export interface MapPin {
  id: string;
  rank: number;
  name: string;
  lonLat: LonLat;
  color: string;
}

type LocateStatus = 'idle' | 'locating' | 'located' | 'error';

interface MapState {
  map: MapLibreMap | null;
  /** Last position the user shared; null until they tap "Use my location". */
  userPos: LonLat | null;
  locateStatus: LocateStatus;
  locateError: string | null;
  pins: MapPin[];
  selectedId: string | null;
  /** Where the last selection came from, so the map and the card rail don't fight. */
  selectedBy: 'map' | 'list' | null;
  setMap: (map: MapLibreMap | null) => void;
  /** Asks the browser for the position (only ever on a tap) and centres the map on it. */
  locate: () => Promise<void>;
  setPins: (pins: MapPin[]) => void;
  select: (id: string | null, by: 'map' | 'list') => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  userPos: null,
  locateStatus: 'idle',
  locateError: null,
  pins: [],
  selectedId: null,
  selectedBy: null,
  setMap: (map) => set({ map }),
  locate: async () => {
    if (get().locateStatus === 'locating') return;
    set({ locateStatus: 'locating', locateError: null });
    try {
      const { lonLat } = await locateOnce();
      set({ userPos: lonLat, locateStatus: 'located' });
      get().map?.flyTo({ center: lonLat, zoom: Math.max(get().map?.getZoom() ?? 14, 14.5), duration: 900 });
    } catch (e) {
      set({ locateStatus: 'error', locateError: e instanceof LocateFailure ? e.message : LOCATE_MESSAGES.unavailable });
    }
  },
  setPins: (pins) => set({ pins, selectedId: null, selectedBy: null }),
  select: (selectedId, selectedBy) => set({ selectedId, selectedBy }),
}));
