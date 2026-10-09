/**
 * Browser telemetry (Sentry), only when VITE_SENTRY_DSN was set at build time and the user
 * hasn't turned it off (docs/ARCHITECTURE.md §16). The SDK is loaded lazily after start-up so it
 * never slows the first paint. No automatic integrations: no breadcrumbs, no URL or fetch
 * capture. Only explicit spans with safe attributes (timings, sources, counts), never content,
 * names or coordinates.
 */
import type * as SentryBrowser from '@sentry/browser';

type Sentry = typeof SentryBrowser;
type Attrs = Record<string, string | number | boolean | undefined>;

const OPT_OUT_KEY = 'ramble.telemetry';
let sdk: Sentry | null = null;

export function telemetryOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === 'off';
  } catch {
    return false;
  }
}

export function setTelemetryOptOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, 'off');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* storage blocked: nothing to persist */
  }
  if (off) void sdk?.close();
}

export const telemetryAvailable = () => !!import.meta.env.VITE_SENTRY_DSN;

export async function initTelemetry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || telemetryOptedOut()) return;
  sdk = await import('@sentry/browser');
  sdk.init({
    dsn,
    defaultIntegrations: false,
    tracesSampleRate: 1.0,
    beforeSend: (event) => {
      delete event.request;
      delete event.user;
      event.breadcrumbs = [];
      return event;
    },
  });
}

const clean = (a: Attrs) => Object.fromEntries(Object.entries(a).filter((kv): kv is [string, string | number | boolean] => kv[1] !== undefined));

/** Times one step of the user journey (e.g. "explore.places"); a no-op when telemetry is off. */
export async function traced<T>(name: string, attrs: Attrs, fn: (set: (a: Attrs) => void) => Promise<T>): Promise<T> {
  if (!sdk || telemetryOptedOut()) return fn(() => {});
  return sdk.startSpan({ name, op: 'ramble.step', attributes: clean(attrs) }, (span) => fn((more) => span.setAttributes(clean(more))));
}

/** Reports an unexpected error (type and stack only; Sentry's request/user data is stripped). */
export function reportError(error: unknown) {
  if (sdk && !telemetryOptedOut()) sdk.captureException(error);
}
