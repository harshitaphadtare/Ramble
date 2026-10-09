import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
// Serve MapLibre's worker from our own origin so the CSP can keep `worker-src 'self'` (no blob: workers).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection } from 'geojson';
import { useMapStore, type MapPin } from '../../app/store/mapStore';

maplibregl.setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Melbourne CBD until we know where the user is. */
const DEFAULT_CENTER: [number, number] = [144.9631, -37.8136];
const PINS = 'ramble-pins';

function pinsGeoJSON(pins: MapPin[], selectedId: string | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.rank,
      geometry: { type: 'Point', coordinates: p.lonLat },
      properties: { rank: String(p.rank), selected: p.id === selectedId },
    })),
  };
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const { setMap, setUserPos, select } = useMapStore.getState();
  const pins = useMapStore((s) => s.pins);
  const selectedId = useMapStore((s) => s.selectedId);
  const map = useMapStore((s) => s.map);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 13,
      attributionControl: false,
      // Pitch and rotation add little on a phone and make the map feel fiddly.
      pitchWithRotate: false,
      dragRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    // Top-right keeps the attribution clear of the bottom panels.
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

    // Location is only requested when the user taps the button (docs/SECURITY.md §5.8).
    const locate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 15_000 },
      trackUserLocation: false,
      showAccuracyCircle: true,
    });
    m.addControl(locate, 'top-left');
    locate.on('geolocate', (e) => setUserPos([e.coords.longitude, e.coords.latitude]));

    m.on('load', () => {
      m.addSource(PINS, { type: 'geojson', data: pinsGeoJSON([], null) });
      m.addLayer({
        id: `${PINS}-circle`,
        type: 'circle',
        source: PINS,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 17, 14],
          'circle-color': ['case', ['get', 'selected'], '#e8833a', '#1f3d2b'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      m.addLayer({
        id: `${PINS}-label`,
        type: 'symbol',
        source: PINS,
        layout: { 'text-field': ['get', 'rank'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      });
      setMap(m);
    });

    return () => {
      setMap(null);
      m.remove();
    };
  }, [setMap, setUserPos]);

  // Keep the pin layer in sync with the store.
  useEffect(() => {
    const source = map?.getSource(PINS) as maplibregl.GeoJSONSource | undefined;
    source?.setData(pinsGeoJSON(pins, selectedId));
  }, [map, pins, selectedId]);

  // Tapping a pin selects its card.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const rank = Number(e.features?.[0]?.properties?.rank);
      const pin = useMapStore.getState().pins.find((p) => p.rank === rank);
      if (pin) select(pin.id);
    };
    map.on('click', `${PINS}-circle`, onClick);
    return () => {
      map.off('click', `${PINS}-circle`, onClick);
    };
  }, [map, select]);

  // MapLibre's CSS forces `position: relative` on its container, so the sizing lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map" role="region" />
    </div>
  );
}
