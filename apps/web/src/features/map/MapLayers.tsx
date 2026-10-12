import { useMemo } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { CloudFog, Flame } from 'lucide-react';
import { useMapStore } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';
import { exploredPercent, FOG_RADIUS_M } from '../../lib/geo/explored';

/** Heat map (where you go most) and fog of war (how much of your area you've explored). */
export function MapLayers() {
  const layer = useUiStore((s) => s.mapLayer);
  const fogCentre = useUiStore((s) => s.fogCentre);
  const setMapLayer = useUiStore((s) => s.setMapLayer);
  const places = useUserStore((s) => s.places);
  const visits = useUserStore((s) => s.visits);

  const visited = useMemo(() => places.filter((p) => visits.some((v) => v.placeId === p.id)).map((p) => p.lonLat), [places, visits]);
  const pct = useMemo(() => (layer === 'fog' && fogCentre ? exploredPercent(fogCentre, visited) : 0), [layer, fogCentre, visited]);
  // The trip banner uses this corner; the map views can wait until the trip is over.
  const onTrip = useWalkStore((s) => s.status !== 'idle');
  const panelOpen = useUiStore((s) => s.tab !== null);
  if (onTrip) return null;

  function toggle(next: 'heat' | 'fog') {
    if (layer === next) return setMapLayer('none');
    const { userPos, map } = useMapStore.getState();
    const c = map?.getCenter();
    const centre: [number, number] = userPos ?? (c ? [c.lng, c.lat] : [144.9631, -37.8136]);
    setMapLayer(next, next === 'fog' ? centre : null);
    if (next === 'fog') map?.easeTo({ center: centre, zoom: 13.6, duration: 700 });
  }

  const btn = (id: 'heat' | 'fog', Icon: typeof Flame, label: string) => (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-pressed={layer === id}
      title={label}
      aria-label={label}
      className={`grid size-10 place-items-center rounded-full shadow-float backdrop-blur-xl transition-colors ${layer === id ? 'bg-forest text-cream' : 'bg-cream/90 text-forest'}`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );

  return (
    <div className={`pointer-events-none absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+5.5rem)] right-3 z-10 flex flex-col items-end gap-2 ${panelOpen ? 'max-sm:hidden' : ''}`}>
      <div className="pointer-events-auto flex flex-col gap-2">
        {btn('heat', Flame, 'Heat map: where you go most')}
        {btn('fog', CloudFog, 'Fog of war: how much of your area you have explored')}
      </div>
      <AnimatePresence>
        {layer !== 'none' && (
          <m.p
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="max-w-[200px] rounded-2xl bg-forest-deep/90 px-3 py-2 text-right text-xs font-semibold text-cream shadow-float backdrop-blur-xl"
          >
            {layer === 'fog' ? (
              <>
                <span className="block font-display text-xl leading-none">{pct}% explored</span>
                within {FOG_RADIUS_M / 1000} km. Check in somewhere new to clear the mist.
              </>
            ) : visits.length ? (
              `${visits.length} visit${visits.length === 1 ? '' : 's'} at ${visited.length} place${visited.length === 1 ? '' : 's'}`
            ) : (
              'Check in at places to warm up your map.'
            )}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
