import { create } from 'zustand';
import type { LonLat } from '../../lib/geo/geo';
import type { FoundPlace } from '../../lib/places/search';
import type { TripStop } from '../../app/store/walkStore';

/** A stop in the planner: what you asked for, the real places that match, and which one you chose. */
export type PlanStop = TripStop & {
  /** What you asked for ("coffee", "Comm Bank"), when Gemma planned it. */
  asked?: string;
  /** Real places that match, best first; you choose one. */
  options?: FoundPlace[];
  /** Where on the way this stop fits (to show how far each option is from it). */
  near?: LonLat;
  /** False until you've picked from the options: Ramble doesn't guess for you. */
  chosen: boolean;
};

export const fromFound = (f: FoundPlace, leg: TripStop['leg']): TripStop => ({ name: f.name, kind: f.kind, lonLat: f.lonLat, sourceId: f.id, leg });

interface TripDraft {
  stops: PlanStop[];
  setStops: (next: PlanStop[] | ((prev: PlanStop[]) => PlanStop[])) => void;
  /**
   * Add a place you picked (search or the map). The first one is where you're going; later ones
   * are stops on the way there, just before the destination.
   */
  add: (f: FoundPlace) => void;
}

/** The trip being planned, shared so a place tapped on the map can be added to it. */
export const useTripDraft = create<TripDraft>((set) => ({
  stops: [],
  setStops: (next) => set((s) => ({ stops: typeof next === 'function' ? next(s.stops) : next })),
  add: (f) =>
    set(({ stops }) => {
      const s: PlanStop = { ...fromFound(f, 'out'), chosen: true };
      const dest = stops.map((p) => p.leg).lastIndexOf('out');
      return { stops: dest < 0 ? [s, ...stops] : [...stops.slice(0, dest), s, ...stops.slice(dest)] };
    }),
}));
