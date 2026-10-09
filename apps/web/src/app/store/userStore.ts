import { create } from 'zustand';
import { levelFor, type JournalEntry, type OutdoorPlace, type Place, type Visit } from '@ramble/shared';
import { vault } from '../../lib/db/instance';
import { downloadPhoto } from '../../lib/sync/account';
import type { LonLat } from '../../lib/geo/geo';

/**
 * The user's own data, decrypted in memory. Every change goes through the Vault (encrypted on
 * disk) first and only then into this store, so the UI never shows something that wasn't saved.
 */

export interface LevelUp {
  key: number;
  placeName: string;
  levelId: string;
  label: string;
  color: string;
  visits: number;
}

type Status = 'loading' | 'ready' | 'error';

interface UserState {
  status: Status;
  places: Place[];
  visits: Visit[];
  journal: JournalEntry[];
  celebration: LevelUp | null;
  init: () => Promise<void>;
  /** Re-reads everything from the encrypted store (after a sync brought in changes). */
  reload: () => Promise<void>;
  /** Saves a map place as one of yours (Want to go), or returns the existing one. */
  savePlace: (from: OutdoorPlace | { name: string; kind: Place['kind']; lonLat: LonLat }, wantToGo?: boolean) => Promise<Place>;
  toggleWantToGo: (placeId: string) => Promise<void>;
  renamePlace: (placeId: string, name: string) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  /** Records a visit; celebrates if the place levels up. */
  checkIn: (placeId: string) => Promise<Visit>;
  saveJournal: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<JournalEntry>;
  removeJournal: (id: string) => Promise<void>;
  putPhoto: (bytes: Uint8Array<ArrayBuffer>, mime: string) => Promise<string>;
  getPhoto: (id: string) => Promise<Blob | null>;
  dismissCelebration: () => void;
  /** "Delete all data": crypto-shreds this device's keys and clears everything. */
  wipe: () => Promise<void>;
}

const newId = () => crypto.randomUUID();

export const visitsFor = (visits: Visit[], placeId: string) => visits.filter((v) => v.placeId === placeId).length;

export const useUserStore = create<UserState>((set, get) => ({
  status: 'loading',
  places: [],
  visits: [],
  journal: [],
  celebration: null,

  init: async () => {
    try {
      await vault.unlock();
      const data = await vault.loadAll();
      set({ status: 'ready', places: data.place, visits: data.visit, journal: data.journal });
      // Ask the browser not to evict our data under storage pressure (best effort).
      void navigator.storage?.persist?.();
    } catch {
      set({ status: 'error' });
    }
  },

  reload: async () => {
    const data = await vault.loadAll();
    set({ places: data.place, visits: data.visit, journal: data.journal });
  },

  savePlace: async (from, wantToGo = true) => {
    const sourceId = 'id' in from ? from.id : undefined;
    const lonLat: LonLat = 'lonLat' in from ? from.lonLat : [from.lon, from.lat];
    const existing = get().places.find((p) => (sourceId && p.sourceId === sourceId) || (p.name === from.name && p.kind === from.kind));
    if (existing) return existing;
    const now = Date.now();
    const place: Place = { id: newId(), name: from.name, kind: from.kind, lonLat, sourceId, wantToGo, createdAt: now, updatedAt: now };
    await vault.put('place', place);
    set({ places: [...get().places, place] });
    return place;
  },

  toggleWantToGo: async (placeId) => {
    const p = get().places.find((x) => x.id === placeId);
    if (!p) return;
    const next = { ...p, wantToGo: !p.wantToGo, updatedAt: Date.now() };
    await vault.put('place', next);
    set({ places: get().places.map((x) => (x.id === placeId ? next : x)) });
  },

  renamePlace: async (placeId, name) => {
    const p = get().places.find((x) => x.id === placeId);
    const clean = name.trim().slice(0, 80);
    if (!p || !clean) return;
    const next = { ...p, name: clean, updatedAt: Date.now() };
    await vault.put('place', next);
    set({ places: get().places.map((x) => (x.id === placeId ? next : x)) });
  },

  removePlace: async (placeId) => {
    const { visits, journal } = get();
    const doomedVisits = visits.filter((v) => v.placeId === placeId);
    const doomedJournal = journal.filter((j) => j.placeId === placeId);
    await vault.remove('place', placeId);
    for (const v of doomedVisits) await vault.remove('visit', v.id);
    for (const j of doomedJournal) {
      await vault.remove('journal', j.id);
      if (j.photoId) await vault.removeMedia(j.photoId);
    }
    set({
      places: get().places.filter((p) => p.id !== placeId),
      visits: visits.filter((v) => v.placeId !== placeId),
      journal: journal.filter((j) => j.placeId !== placeId),
    });
  },

  checkIn: async (placeId) => {
    const place = get().places.find((p) => p.id === placeId);
    if (!place) throw new Error('Unknown place');
    const before = levelFor(visitsFor(get().visits, placeId));
    const now = Date.now();
    const visit: Visit = { id: newId(), placeId, at: now, updatedAt: now };
    await vault.put('visit', visit);
    // A visit means it's no longer just "want to go".
    if (place.wantToGo) {
      const next = { ...place, wantToGo: false, updatedAt: now };
      await vault.put('place', next);
      set({ places: get().places.map((x) => (x.id === placeId ? next : x)) });
    }
    const visits = [...get().visits, visit];
    const after = levelFor(visitsFor(visits, placeId));
    set({
      visits,
      celebration:
        after.id !== before.id
          ? { key: now, placeName: place.name, levelId: after.id, label: after.label, color: after.color, visits: visitsFor(visits, placeId) }
          : get().celebration,
    });
    return visit;
  },

  saveJournal: async (entry) => {
    const now = Date.now();
    const existing = entry.id ? get().journal.find((j) => j.id === entry.id) : undefined;
    const full: JournalEntry = { ...entry, id: entry.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now };
    await vault.put('journal', full);
    // A replaced or removed photo shouldn't linger in storage.
    if (existing?.photoId && existing.photoId !== full.photoId) await vault.removeMedia(existing.photoId);
    set({ journal: existing ? get().journal.map((j) => (j.id === full.id ? full : j)) : [...get().journal, full] });
    return full;
  },

  removeJournal: async (id) => {
    const entry = get().journal.find((j) => j.id === id);
    await vault.remove('journal', id);
    if (entry?.photoId) await vault.removeMedia(entry.photoId);
    set({ journal: get().journal.filter((j) => j.id !== id) });
  },

  putPhoto: async (bytes, mime) => {
    const id = newId();
    await vault.putMedia(id, bytes, mime);
    return id;
  },

  getPhoto: async (id) => {
    const local = await vault.getMedia(id);
    if (local || !navigator.onLine) return local;
    // Synced from another device but not downloaded yet: fetch the encrypted copy (signed-in only).
    return (await downloadPhoto(id)) ? vault.getMedia(id) : null;
  },

  dismissCelebration: () => set({ celebration: null }),

  wipe: async () => {
    await vault.wipe();
    set({ places: [], visits: [], journal: [], celebration: null });
    await vault.unlock(); // fresh keys for whatever the user does next
  },
}));
