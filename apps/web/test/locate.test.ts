import { describe, expect, it, vi } from 'vitest';
import { LocateFailure, locateOnce } from '../src/lib/geo/locate';

const position = (lon: number, lat: number) => ({ coords: { longitude: lon, latitude: lat, accuracy: 25 } }) as GeolocationPosition;
const failure = (code: number) => ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;

function fakeGeo(...results: (GeolocationPosition | GeolocationPositionError)[]) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    const r = results.shift()!;
    if ('coords' in r) ok(r);
    else fail(r);
  });
  return { getCurrentPosition } as unknown as Geolocation & { getCurrentPosition: typeof getCurrentPosition };
}

describe('locateOnce', () => {
  it('returns the position from a quick coarse fix', async () => {
    const geo = fakeGeo(position(144.96, -37.81));
    await expect(locateOnce(geo, true)).resolves.toEqual({ lonLat: [144.96, -37.81], accuracyM: 25 });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('retries with high accuracy after a timeout', async () => {
    const geo = fakeGeo(failure(3), position(1, 2));
    await expect(locateOnce(geo, true)).resolves.toMatchObject({ lonLat: [1, 2] });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the user blocked location, and explains how to fix it', async () => {
    const geo = fakeGeo(failure(1));
    const err = await locateOnce(geo, true).catch((e: LocateFailure) => e);
    expect(err).toBeInstanceOf(LocateFailure);
    expect((err as LocateFailure).code).toBe('denied');
    expect((err as LocateFailure).message).toMatch(/site settings/);
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('refuses on insecure pages and when unsupported', async () => {
    await expect(locateOnce(fakeGeo(), false)).rejects.toMatchObject({ code: 'insecure' });
    await expect(locateOnce(undefined, true)).rejects.toMatchObject({ code: 'unsupported' });
  });
});
