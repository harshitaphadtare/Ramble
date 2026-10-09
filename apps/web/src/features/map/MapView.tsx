import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
// Serve MapLibre's worker from our own origin so the CSP can keep `worker-src 'self'` (no blob: workers).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Melbourne CBD until we know where the user is. */
const DEFAULT_CENTER: [number, number] = [144.9631, -37.8136];

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 13,
      attributionControl: false,
      // Pitch and rotation add little on a phone and make the map feel fiddly.
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    // Top-right keeps the attribution clear of the bottom tab bar.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    return () => map.remove();
  }, []);

  // MapLibre's CSS forces `position: relative` on its container, so the sizing lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map" role="region" />
    </div>
  );
}
