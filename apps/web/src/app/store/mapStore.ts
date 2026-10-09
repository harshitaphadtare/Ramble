import { create } from 'zustand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LonLat } from '../../lib/geo/geo';

export interface MapPin {
  id: string;
  rank: number;
  name: string;
  lonLat: LonLat;
}

interface MapState {
  map: MapLibreMap | null;
  /** Last position from the locate button; null until the user shares it. */
  userPos: LonLat | null;
  pins: MapPin[];
  selectedId: string | null;
  setMap: (map: MapLibreMap | null) => void;
  setUserPos: (pos: LonLat | null) => void;
  setPins: (pins: MapPin[]) => void;
  select: (id: string | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  userPos: null,
  pins: [],
  selectedId: null,
  setMap: (map) => set({ map }),
  setUserPos: (userPos) => set({ userPos }),
  setPins: (pins) => set({ pins, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
}));
