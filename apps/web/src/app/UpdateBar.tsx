import { AnimatePresence, m } from 'motion/react';
import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useUiStore } from './store/uiStore';
import { useWalkStore } from './store/walkStore';

/** "A new version of Ramble is ready." Never shown mid-trip, so a reload can't cut a walk short. */
export function UpdateBar() {
  const applyUpdate = useUiStore((s) => s.applyUpdate);
  const onTrip = useWalkStore((s) => s.status !== 'idle');
  const [dismissed, setDismissed] = useState(false);
  const show = !!applyUpdate && !onTrip && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <m.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          role="status"
          className="absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] left-1/2 z-40 flex w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-forest-deep/95 py-2 pr-2 pl-4 text-sm font-semibold text-cream shadow-float backdrop-blur-xl"
        >
          <span className="flex-1">A new version of Ramble is ready.</span>
          <button type="button" onClick={() => applyUpdate?.()} className="flex items-center gap-1.5 rounded-xl bg-cream px-3 py-1.5 font-bold text-forest">
            <RefreshCw size={14} aria-hidden="true" /> Update
          </button>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Later" className="grid size-8 place-items-center rounded-xl bg-white/10">
            <X size={15} aria-hidden="true" />
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
