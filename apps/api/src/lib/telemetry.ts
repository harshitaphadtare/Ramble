import * as Sentry from '@sentry/node';

/**
 * Sentry, switched on only when SENTRY_DSN is set (docs/ARCHITECTURE.md §16).
 * Default integrations are OFF so nothing is captured automatically (no request URLs, query
 * strings, headers or bodies). We send only explicit spans with safe attributes: task, model,
 * timings, token counts, outcome. Never prompts, outputs, notes, names or coordinates.
 */
let enabled = false;

export function initTelemetry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || dsn === 'unset') return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RENDER_GIT_COMMIT?.slice(0, 12),
    defaultIntegrations: false,
    // Sentry v11 sends no personal data unless asked to; we never ask.
    tracesSampleRate: 1.0, // low traffic: keep every trace for the challenge write-up
    beforeSend: (event) => {
      // Belt and braces: strip anything request-shaped that might have slipped in.
      delete event.request;
      delete event.user;
      event.breadcrumbs = [];
      return event;
    },
  });
  enabled = true;
}

export const telemetryEnabled = () => enabled;

export type SpanAttrs = Record<string, string | number | boolean | undefined>;

/**
 * Runs `fn` inside a span (a no-op when Sentry is off). `fn` can add more safe attributes
 * through `set`, e.g. token counts once they're known.
 */
export function traced<T>(name: string, op: string, attrs: SpanAttrs, fn: (set: (a: SpanAttrs) => void) => Promise<T>): Promise<T> {
  if (!enabled) return fn(() => {});
  return Sentry.startSpan({ name, op, attributes: clean(attrs) }, async (span) => {
    try {
      return await fn((more) => span.setAttributes(clean(more)));
    } catch (e) {
      span.setAttribute('ramble.error', e instanceof Error ? e.name : 'error');
      throw e;
    }
  });
}

export function captureError(e: unknown) {
  if (enabled) Sentry.captureException(e);
}

function clean(a: SpanAttrs): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(a).filter((kv): kv is [string, string | number | boolean] => kv[1] !== undefined));
}
