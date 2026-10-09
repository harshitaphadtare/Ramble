import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';

export const sheetMotion = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { type: 'spring', stiffness: 380, damping: 34 },
} as const;

/**
 * Where every panel sits: a bottom sheet above the tab bar on phones, a floating panel on the
 * left on wider screens.
 */
export const PANEL_POSITION =
  'absolute inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-10 md:right-auto md:left-4 md:w-[420px]';

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
        className={`relative mx-3 max-h-[70vh] overflow-y-auto rounded-[28px] bg-cream/95 px-4 pt-2 pb-4 shadow-sheet backdrop-blur-xl ${className}`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-mist text-ink/60">
            <X size={16} aria-hidden="true" />
          </button>
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
