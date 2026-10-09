import { useState } from 'react';
import { MapView } from '../features/map/MapView';
import { ExplorePanel } from '../features/explore/ExplorePanel';

type Tab = 'explore' | 'checkin' | 'you';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'explore', label: 'Explore', icon: '🧭' },
  { id: 'checkin', label: 'Check in', icon: '📍' },
  { id: 'you', label: 'You', icon: '🌿' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('explore');

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />
      {tab === 'explore' && <ExplorePanel />}

      <nav
        aria-label="Main"
        className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-around rounded-2xl bg-white/95 p-1.5 shadow-lg backdrop-blur"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-forest text-white' : 'text-ink/70'
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
