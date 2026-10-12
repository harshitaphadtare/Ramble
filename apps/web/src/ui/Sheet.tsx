import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import { useUiStore } from '../app/store/uiStore';

export const sheetMotion = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { type: 'spring', stiffness: 380, damping: 34 },
} as const;

/**
 * Where every panel sits: just above the tab bar, full width on phones and centred on wider
 * screens.
 */
export const PANEL_POSITION =
  'absolute inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-10 sm:left-1/2 sm:right-auto sm:w-[600px] sm:max-w-[calc(100%-1rem)] sm:-translate-x-1/2';

/** The panel body, capped so the map stays visible above it. */
export const PANEL_BODY = 'relative mx-3 max-h-[min(70vh,calc(100dvh-10rem))] overflow-y-auto rounded-[28px] bg-cream/95 px-4 pt-2 pb-4 shadow-sheet backdrop-blur-xl sm:px-5';

/** Map padding that keeps a point clear of the panel above the tab bar. */
export const mapPadding = () => ({ top: 80, bottom: 280, left: 40, right: 40 });

/** Minimise the open panel back to just the map; tapping its tab opens it again. */
export function MinimiseButton() {
  return (
    <button
      type="button"
      onClick={() => useUiStore.getState().closeTab()}
      aria-label="Minimise"
      title="Minimise"
      className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-mist text-ink/60 hover:text-ink"
    >
      <ChevronDown size={18} aria-hidden="true" />
    </button>
  );
}

export function Sheet({
  label,
  children,
  onClose,
  className = '',
  layer = 'z-10',
}: {
  label: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  /** Stacking: panels use z-10, sheets opened on top of them use z-30. */
  layer?: string;
}) {
  return (
    <div className={PANEL_POSITION.replace('z-10', layer)}>
      <m.section
        {...sheetMotion}
        aria-label={label}
        className={`${PANEL_BODY} ${className}`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-mist text-ink/60">
            <X size={16} aria-hidden="true" />
          </button>
        ) : (
          <MinimiseButton />
        )}
        {children}
      </m.section>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold tracking-[0.14em] text-moss uppercase">{children}</p>;
}

export function Title({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display text-[26px] leading-[1.1] font-semibold tracking-tight text-forest ${className}`}>{children}</h2>;
}

export function PrimaryButton({ children, onClick, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <m.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-forest to-moss py-3.5 text-base font-bold text-white shadow-float disabled:opacity-50"
    >
      {children}
    </m.button>
  );
}

export function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex items-center justify-center gap-1.5 rounded-xl bg-mist px-3.5 py-2.5 text-sm font-semibold text-forest disabled:opacity-50">
      {children}
    </button>
  );
}
