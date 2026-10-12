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
 * Where every panel sits.
 * - Phones (and small tablets): a sheet above the tab bar, map on top.
 * - Laptops (md+): a sidebar on the right with the menu docked under it (TabBar), so the map on
 *   the left stays clear for routes and pins. Keep SIDEBAR_PX in step with the md:w-[420px] here
 *   and with TabBar's md:left (sidebar centre).
 */
export const SIDEBAR_PX = 420;
export const PANEL_POSITION =
  'absolute inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-10 sm:left-1/2 sm:right-auto sm:w-[600px] sm:max-w-[calc(100%-1rem)] sm:-translate-x-1/2 md:top-[4.25rem] md:right-1 md:bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] md:left-auto md:flex md:w-[420px] md:max-w-none md:translate-x-0 md:flex-col md:justify-end';

/** Same place; kept separate in case results ever need more room. */
export const PANEL_POSITION_WIDE = PANEL_POSITION;

/** The panel body: capped on phones so some map shows above it; the sidebar's full height on laptops. */
export const PANEL_BODY =
  'relative mx-3 max-h-[min(62vh,calc(100dvh-10rem))] overflow-y-auto rounded-[28px] bg-cream/95 px-4 pt-2 pb-4 shadow-sheet backdrop-blur-xl sm:px-5 md:max-h-full md:min-h-0 md:mx-2';

/** True when panels are the right-hand sidebar (keep in step with the md: classes above). */
export const isWide = () => window.matchMedia('(min-width: 768px)').matches;

/** Map padding that keeps routes and pins in the part of the map you can actually see. */
export const mapPadding = (under: 'cards' | 'sheet' | 'none' = 'cards'): Padding =>
  safePadding(
    isWide()
      ? { top: 90, bottom: 110, left: 60, right: under === 'none' ? 60 : SIDEBAR_PX + 50 }
      : { top: under === 'none' ? 150 : 80, bottom: under === 'sheet' ? Math.round(window.innerHeight * 0.62) + 40 : under === 'none' ? 120 : 290, left: 40, right: 40 },
  );

type Padding = { top: number; bottom: number; left: number; right: number };

/**
 * Padding bigger than the map makes MapLibre zoom out to the whole country. Always leave at
 * least a 160 px window to fit things into.
 */
export function safePadding(p: Padding): Padding {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const sx = Math.min(1, Math.max(0, w - 160) / Math.max(1, p.left + p.right));
  const sy = Math.min(1, Math.max(0, h - 160) / Math.max(1, p.top + p.bottom));
  return { top: Math.round(p.top * sy), bottom: Math.round(p.bottom * sy), left: Math.round(p.left * sx), right: Math.round(p.right * sx) };
}
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
