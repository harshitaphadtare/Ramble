import { useEffect } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useUiStore } from '../app/store/uiStore';

/** Small confirmation that floats above the tab bar for a few seconds. */
export function Toast() {
  const toast = useUiStore((s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useUiStore.setState({ toast: null }), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] z-40 flex justify-center">
      <AnimatePresence>
        {toast && (
          <m.p
            key={toast.key}
            role="status"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            className="rounded-full bg-forest-deep/95 px-4 py-2 text-sm font-semibold text-cream shadow-float"
          >
            {toast.text}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
