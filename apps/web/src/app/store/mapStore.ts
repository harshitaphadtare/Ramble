import { create } from 'zustand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LonLat } from '../../lib/geo/geo';

export interface MapPin {
  id: string;
  rank: number;
  name: string;
  lonLat: LonLat;
  color: string;
}

interface MapState {
  map: MapLibreMap | null;
  /** Last position from the locate button; null until the user shares it. */
  userPos: LonLat | null;
  /** Asks the browser for the user's position (only ever on a tap). */
  locate: (() => void) | null;
  pins: MapPin[];
  selectedId: string | null;
  /** Where the last selection came from, so the map and the card rail don't fight. */
  selectedBy: 'map' | 'list' | null;
  setMap: (map: MapLibreMap | null) => void;
  setUserPos: (pos: LonLat | null) => void;
  setLocate: (fn: (() => void) | null) => void;
  setPins: (pins: MapPin[]) => void;
  select: (id: string | null, by: 'map' | 'list') => void;
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  userPos: null,
  locate: null,
  pins: [],
  selectedId: null,
  selectedBy: null,
  setMap: (map) => set({ map }),
  setUserPos: (userPos) => set({ userPos }),
  setLocate: (locate) => set({ locate }),
  setPins: (pins) => set({ pins, selectedId: null, selectedBy: null }),
  select: (selectedId, selectedBy) => set({ selectedId, selectedBy }),
}));
