import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
// Serve MapLibre's worker from our own origin so the CSP can keep `worker-src 'self'` (no blob: workers).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection } from 'geojson';
import { levelFor, type Place, type Visit } from '@ramble/shared';
import { useMapStore, type MapPin } from '../../app/store/mapStore';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import type { LonLat } from '../../lib/geo/geo';

maplibregl.setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Melbourne CBD until we know where the user is. */
const DEFAULT_CENTER: LonLat = [144.9631, -37.8136];
const PINS = 'ramble-pins';
const ME = 'ramble-me';
const SAVED = 'ramble-saved';

function pinsGeoJSON(pins: MapPin[], selectedId: string | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.rank,
      geometry: { type: 'Point', coordinates: p.lonLat },
      properties: { rank: String(p.rank), selected: p.id === selectedId, color: p.color },
    })),
  };
}

function meGeoJSON(pos: LonLat | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pos ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: pos }, properties: {} }] : [],
  };
}

/** The user's places, coloured by level. */
function savedGeoJSON(places: Place[], visits: Visit[]): FeatureCollection {
  const counts = new Map<string, number>();
  for (const v of visits) counts.set(v.placeId, (counts.get(v.placeId) ?? 0) + 1);
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p.lonLat },
      properties: { id: p.id, name: p.name, color: levelFor(counts.get(p.id) ?? 0).color },
    })),
  };
}

/** Our own layers, bottom to top: saved places, the user's position, suggestion pins. */
function addRambleLayers(m: maplibregl.Map) {
  m.addSource(SAVED, { type: 'geojson', data: savedGeoJSON([], []) });
  m.addLayer({
    id: `${SAVED}-dot`,
    type: 'circle',
    source: SAVED,
    paint: { 'circle-radius': 9, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
  });
  m.addLayer({
    id: `${SAVED}-label`,
    type: 'symbol',
    source: SAVED,
    minzoom: 14,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#1d3a2a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  });

  m.addSource(ME, { type: 'geojson', data: meGeoJSON(null) });
  m.addLayer({
    id: `${ME}-halo`,
    type: 'circle',
    source: ME,
    paint: { 'circle-radius': 22, 'circle-color': '#3b82f6', 'circle-opacity': 0.16 },
  });
  m.addLayer({
    id: `${ME}-dot`,
    type: 'circle',
    source: ME,
    paint: { 'circle-radius': 8, 'circle-color': '#2563eb', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
  });

  m.addSource(PINS, { type: 'geojson', data: pinsGeoJSON([], null) });
  m.addLayer({
    id: `${PINS}-halo`,
    type: 'circle',
    source: PINS,
    filter: ['==', ['get', 'selected'], true],
    paint: { 'circle-radius': 30, 'circle-color': '#ee8a3f', 'circle-opacity': 0.22, 'circle-blur': 0.4 },
  });
  m.addLayer({
    id: `${PINS}-circle`,
    type: 'circle',
    source: PINS,
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 18, 14],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': ['case', ['get', 'selected'], '#ee8a3f', '#ffffff'],
      'circle-stroke-width': ['case', ['get', 'selected'], 4, 3],
    },
  });
  m.addLayer({
    id: `${PINS}-label`,
    type: 'symbol',
    source: PINS,
    layout: { 'text-field': ['get', 'rank'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  });
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const map = useMapStore((s) => s.map);
  const pins = useMapStore((s) => s.pins);
  const selectedId = useMapStore((s) => s.selectedId);
  const userPos = useMapStore((s) => s.userPos);
  const places = useUserStore((s) => s.places);
  const visits = useUserStore((s) => s.visits);

  useEffect(() => {
    if (!container.current) return;
    const { setMap } = useMapStore.getState();
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
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

    m.on('load', () => {
      // MapLibre opens the compact attribution on first load; start it collapsed (still one tap away).
      container.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
      addRambleLayers(m);
      setMap(m);
    });

    return () => {
      setMap(null);
      m.remove();
    };
  }, []);

  useEffect(() => {
    (map?.getSource(PINS) as maplibregl.GeoJSONSource | undefined)?.setData(pinsGeoJSON(pins, selectedId));
  }, [map, pins, selectedId]);

  useEffect(() => {
    (map?.getSource(ME) as maplibregl.GeoJSONSource | undefined)?.setData(meGeoJSON(userPos));
  }, [map, userPos]);

  useEffect(() => {
    (map?.getSource(SAVED) as maplibregl.GeoJSONSource | undefined)?.setData(savedGeoJSON(places, visits));
  }, [map, places, visits]);

  // Tapping one of your places opens its details.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') useUiStore.getState().openPlace(id);
    };
    map.on('click', `${SAVED}-dot`, onClick);
    return () => {
      map.off('click', `${SAVED}-dot`, onClick);
    };
  }, [map]);

  // Tapping a pin selects its card.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const rank = Number(e.features?.[0]?.properties?.rank);
      const { pins: current, select } = useMapStore.getState();
      const pin = current.find((p) => p.rank === rank);
      if (pin) select(pin.id, 'map');
    };
    map.on('click', `${PINS}-circle`, onClick);
    return () => {
      map.off('click', `${PINS}-circle`, onClick);
    };
  }, [map]);

  // MapLibre's CSS forces `position: relative` on its container, so the sizing lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map" role="region" />
    </div>
  );
}
