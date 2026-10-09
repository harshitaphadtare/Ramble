import { Compass, MapPinCheck, Sprout, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { Tab } from './store/uiStore';

export type { Tab };

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'checkin', label: 'Check in', icon: MapPinCheck },
  { id: 'you', label: 'You', icon: Sprout },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Main"
      className="absolute left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full bg-forest-deep/95 p-1.5 shadow-float backdrop-blur-xl bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            className="relative flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
          >
            {active && (
              <m.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-full bg-cream"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <Icon size={19} className={`relative ${active ? 'text-forest' : 'text-cream/70'}`} aria-hidden="true" />
            {active && <span className="relative text-forest">{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
