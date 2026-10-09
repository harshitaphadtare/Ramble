/**
 * Content Security Policy and security headers. See docs/SECURITY.md §5.1–5.2.
 * Any host added to connect-src must also be added to the client's safeFetch allow-list.
 * AI calls (Workers AI), OSM places (Overpass), TabPFN, SerpApi and Atlas all go through our own API ('self').
 */
export const CONNECT_SRC = [
  "'self'",
  'https://tiles.openfreemap.org',
  'https://photon.komoot.io',
  'https://api.open-meteo.com',
  'https://routing.openstreetmap.de',
  'https://api.pwnedpasswords.com',
  'https://*.ingest.sentry.io',
];

export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    // 'wasm-unsafe-eval' is only for hash-wasm (Argon2id key derivation); no inline or eval'd JS.
    "script-src 'self' 'wasm-unsafe-eval'",
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
  'Content-Security-Policy': contentSecurityPolicy(),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=(), bluetooth=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
