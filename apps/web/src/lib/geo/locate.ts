import type { LonLat } from './geo';

export type LocateError = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export const LOCATE_MESSAGES: Record<LocateError, string> = {
  unsupported: "This browser can't share your location.",
  insecure: 'Location only works on a secure (https) page.',
  denied: "Location is blocked for Ramble. Allow it in your browser's site settings, then try again.",
  unavailable: "Couldn't find your position. Check that location services are on.",
  timeout: 'Finding your position took too long. Try again outdoors or with Wi-Fi on.',
};

export class LocateFailure extends Error {
  constructor(readonly code: LocateError) {
    super(LOCATE_MESSAGES[code]);
  }
}

export interface Located {
  lonLat: LonLat;
  accuracyM: number;
}

/**
 * One-off position request, only ever triggered by a tap (docs/SECURITY.md §5.8).
 * Tries a quick, coarse fix first (fast on laptops and indoors), then a precise one.
 */
export async function locateOnce(geo: Geolocation | undefined = navigator.geolocation, secure = window.isSecureContext): Promise<Located> {
  if (!secure) throw new LocateFailure('insecure');
  if (!geo) throw new LocateFailure('unsupported');

  const ask = (options: PositionOptions) =>
    new Promise<Located>((resolve, reject) =>
      geo.getCurrentPosition(
        (p) => resolve({ lonLat: [p.coords.longitude, p.coords.latitude], accuracyM: p.coords.accuracy }),
        (e) => reject(new LocateFailure(e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable')),
        options,
      ),
    );

  try {
    return await ask({ enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 });
  } catch (e) {
    if (e instanceof LocateFailure && e.code === 'denied') throw e;
    return ask({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  }
}
