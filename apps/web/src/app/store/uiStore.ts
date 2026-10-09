import { create } from 'zustand';

/** App-wide UI state that isn't map or user data: which sheet is open, toasts. */
export type Tab = 'explore' | 'checkin' | 'you';

interface Toast {
  key: number;
  text: string;
}

interface UiState {
  tab: Tab;
  /** The saved place whose details sheet is open. */
  openPlaceId: string | null;
  /** The journal composer, opened right after a check-in or from a place. */
  composer: { placeId?: string; visitId?: string; entryId?: string } | null;
  toast: Toast | null;
  setTab: (tab: Tab) => void;
  openPlace: (id: string | null) => void;
  openComposer: (target: UiState['composer']) => void;
  showToast: (text: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tab: 'explore',
  openPlaceId: null,
  composer: null,
  toast: null,
  setTab: (tab) => set({ tab, openPlaceId: null }),
  openPlace: (openPlaceId) => set({ openPlaceId }),
  openComposer: (composer) => set({ composer }),
  showToast: (text) => set({ toast: { key: Date.now(), text } }),
}));
