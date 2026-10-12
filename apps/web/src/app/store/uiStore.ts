import { create } from 'zustand';

/** App-wide UI state that isn't map or user data: which sheet is open, toasts. */
export type Tab = 'explore' | 'checkin' | 'you';

interface Toast {
  key: number;
  text: string;
}

interface UiState {
  /** The open panel; null means just the map (the app starts that way). */
  tab: Tab | null;
  /** The saved place whose details sheet is open. */
  openPlaceId: string | null;
  /** The journal composer, opened right after a check-in or from a place. */
  composer: { placeId?: string; visitId?: string; entryId?: string } | null;
  toast: Toast | null;
  /** Extra map view from Wander: where you go most (heat), or what you haven't explored (fog). */
  mapLayer: 'none' | 'heat' | 'fog';
  /** Where the fog of war is measured from (fixed when it's switched on, so panning doesn't move it). */
  fogCentre: [number, number] | null;
  setMapLayer: (layer: UiState['mapLayer'], fogCentre?: [number, number] | null) => void;
  /** Opens a panel; choosing the open one again minimises it. */
  setTab: (tab: Tab) => void;
  closeTab: () => void;
  openPlace: (id: string | null) => void;
  openComposer: (target: UiState['composer']) => void;
  showToast: (text: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: null,
  openPlaceId: null,
  composer: null,
  toast: null,
  mapLayer: 'none',
  fogCentre: null,
  setMapLayer: (mapLayer, fogCentre = null) => set({ mapLayer, fogCentre }),
  setTab: (tab) => set((s) => ({ tab: s.tab === tab ? null : tab, openPlaceId: null })),
  closeTab: () => set({ tab: null }),
  openPlace: (openPlaceId) => set({ openPlaceId }),
  openComposer: (composer) => set({ composer }),
  showToast: (text) => set({ toast: { key: Date.now(), text } }),
}));
