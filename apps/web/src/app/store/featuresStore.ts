import { create } from 'zustand';
import { z } from 'zod';

/**
 * Optional, key-dependent features reported by the server (/api/features). Anything not
 * confirmed stays hidden, so a missing key never shows a broken button.
 */
const featuresSchema = z.object({ ai: z.boolean(), placeUpdates: z.boolean(), personalize: z.boolean(), accounts: z.boolean() }).partial();
type Features = { ai: boolean; placeUpdates: boolean; personalize: boolean; accounts: boolean };

interface FeaturesState extends Features {
  load: () => Promise<void>;
}

export const useFeatures = create<FeaturesState>((set) => ({
  ai: false,
  placeUpdates: false,
  personalize: false,
  accounts: false,
  load: async () => {
    try {
      const res = await fetch('/api/features', { credentials: 'same-origin', signal: AbortSignal.timeout(70_000) });
      if (res.ok) set({ ai: false, placeUpdates: false, personalize: false, accounts: false, ...featuresSchema.parse(await res.json()) });
    } catch {
      /* offline or asleep: optional features stay hidden */
    }
  },
}));
