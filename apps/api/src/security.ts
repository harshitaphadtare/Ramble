/**
 * Content Security Policy and security headers. See docs/SECURITY.md §5.1–5.2.
 * Any host added to connect-src must also be added to the client's safeFetch allow-list.
 */
export const CONNECT_SRC = [
  "'self'",
  'https://tiles.openfreemap.org',
  'https://overpass-api.de',
  'https://overpass.kumi.systems',
  'https://photon.komoot.io',
  'https://api.open-meteo.com',
  'https://routing.openstreetmap.de',
  'https://api.pwnedpasswords.com',
  'https://huggingface.co',
  'https://*.hf.co',
  'https://*.ingest.sentry.io',
];

export interface CspOptions {
  /**
   * Transformers.js turns ONNX Runtime's loader into a blob: URL before importing it, so the
   * 270M fallback needs blob: scripts. Only the device-test page gets this until we fix it upstream
   * or move the fallback (docs/SECURITY.md §5.1).
   */
  allowBlobScripts?: boolean;
}

export function contentSecurityPolicy({ allowBlobScripts = false }: CspOptions = {}): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'wasm-unsafe-eval'${allowBlobScripts ? ' blob:' : ''}`,
    "worker-src 'self'",
    `connect-src ${CONNECT_SRC.join(' ')}`,
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "style-src 'self'",
    "font-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=(), bluetooth=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
