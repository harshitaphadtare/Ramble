import { useEffect } from 'react';
import { AnimatePresence, LazyMotion, domMax } from 'motion/react';
import { MapView } from '../features/map/MapView';
import { ExplorePanel } from '../features/explore/ExplorePanel';
import { CheckInPanel } from '../features/checkin/CheckInPanel';
import { YouPanel } from '../features/you/YouPanel';
import { PlaceSheet } from '../features/places/PlaceSheet';
import { MemoryComposer } from '../features/journal/MemoryComposer';
import { Celebration } from '../ui/Celebration';
import { Toast } from '../ui/Toast';
import { WalkBanner } from '../features/walk/WalkBanner';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { useUiStore } from './store/uiStore';
import { useUserStore } from './store/userStore';
import { useFeatures } from './store/featuresStore';

export function App() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const status = useUserStore((s) => s.status);

  // Unlock the encrypted on-device store and learn which optional features are on, once at start-up.
  useEffect(() => {
    void useUserStore.getState().init();
    void useFeatures.getState().load();
  }, []);

  return (
    <LazyMotion features={domMax} strict>
      <div className="relative h-full w-full overflow-hidden">
        <MapView />
        <TopBar />
        <WalkBanner />
        {status === 'error' && (
          <p role="alert" className="absolute inset-x-3 top-20 z-40 rounded-2xl bg-ember px-4 py-3 text-sm font-semibold text-white shadow-float">
            Your saved places couldn't be opened on this device. Private browsing can block storage; try a normal window.
          </p>
        )}
        <AnimatePresence mode="wait">
          {tab === 'explore' && <ExplorePanel key="explore" />}
          {tab === 'checkin' && <CheckInPanel key="checkin" />}
          {tab === 'you' && <YouPanel key="you" />}
        </AnimatePresence>
        <PlaceSheet />
        <MemoryComposer />
        <TabBar tab={tab} onChange={setTab} />
        <Toast />
        <Celebration />
      </div>
    </LazyMotion>
  );
}
