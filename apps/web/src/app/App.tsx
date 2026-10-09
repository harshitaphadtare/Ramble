import { useState } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { BookHeart, MapPinCheck } from 'lucide-react';
import { MapView } from '../features/map/MapView';
import { ExplorePanel } from '../features/explore/ExplorePanel';
import { TopBar } from './TopBar';
import { TabBar, type Tab } from './TabBar';

/** Placeholder sheets for the tabs that are still being built. */
function ComingSoon({ icon: Icon, title, text }: { icon: typeof MapPinCheck; title: string; text: string }) {
  return (
    <m.section
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="absolute inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-10 rounded-[28px] bg-cream/95 p-5 shadow-sheet backdrop-blur-xl"
    >
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-sage to-moss text-white">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h2 className="font-display text-2xl font-semibold text-forest">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink/65">{text}</p>
    </m.section>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('explore');

  return (
    <LazyMotion features={domMax} strict>
      <div className="relative h-full w-full overflow-hidden">
        <MapView />
        <TopBar />
        <AnimatePresence mode="wait">
          {tab === 'explore' && <ExplorePanel key="explore" />}
          {tab === 'checkin' && (
            <ComingSoon
              key="checkin"
              icon={MapPinCheck}
              title="Check in"
              text="Tap once when you arrive somewhere. Every visit levels a place up, from Want to go to Local legend."
            />
          )}
          {tab === 'you' && (
            <ComingSoon
              key="you"
              icon={BookHeart}
              title="Your map"
              text="Your places, your walks and a private journal, encrypted on this phone."
            />
          )}
        </AnimatePresence>
        <TabBar tab={tab} onChange={setTab} />
      </div>
    </LazyMotion>
  );
}
