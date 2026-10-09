import { useState } from 'react';
import { TriangleAlert, ExternalLink, Info, LoaderCircle, Newspaper, OctagonX, Sparkles } from 'lucide-react';
import { placeUpdatesResponseSchema, type Place, type PlaceUpdatesResponse, type UpdateSeverity } from '@ramble/shared';
import { useFeatures } from '../../app/store/featuresStore';

const SEVERITY: Record<UpdateSeverity, { icon: typeof Info; tone: string; label: string }> = {
  closed: { icon: OctagonX, tone: 'bg-ember/10 text-ember', label: 'Closure reported' },
  caution: { icon: TriangleAlert, tone: 'bg-sunset/15 text-[#a8571d]', label: 'Heads-up' },
  info: { icon: Info, tone: 'bg-sky/15 text-[#2f5f8a]', label: 'Worth knowing' },
  none: { icon: Info, tone: 'bg-mist text-forest', label: 'All quiet' },
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Recent closures, works and events for a PUBLIC place (SerpApi + a one-line Gemma summary).
 * Only shown when the server has it switched on, and never for spots the user named themselves,
 * because their names could be private.
 */
export function PlaceUpdates({ place }: { place: Place }) {
  const enabled = useFeatures((s) => s.placeUpdates);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'error'; data?: PlaceUpdatesResponse; error?: string }>({ status: 'idle' });
  if (!enabled || !place.sourceId) return null;

  async function check() {
    setState({ status: 'loading' });
    try {
      const params = new URLSearchParams({ name: place.name, kind: place.kind });
      const res = await fetch(`/api/place-updates?${params}`, { credentials: 'same-origin', signal: AbortSignal.timeout(70_000) });
      if (res.status === 429) return setState({ status: 'error', error: 'Lots of lookups today. Try again tomorrow.' });
      if (!res.ok) return setState({ status: 'error', error: "Couldn't check right now." });
      setState({ status: 'idle', data: placeUpdatesResponseSchema.parse(await res.json()) });
    } catch {
      setState({ status: 'error', error: navigator.onLine ? "Couldn't check right now." : "You're offline." });
    }
  }

  const data = state.data;
  if (!data) {
    return (
      <div className="mb-4">
        <button type="button" onClick={() => void check()} disabled={state.status === 'loading'} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-forest disabled:opacity-60">
          {state.status === 'loading' ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Newspaper size={16} aria-hidden="true" />}
          {state.status === 'loading' ? 'Checking the news…' : 'Check for closures & events'}
        </button>
        {state.error && <p className="mt-1.5 text-center text-xs text-ember">{state.error}</p>}
      </div>
    );
  }

  const sev = SEVERITY[data.summary.severity];
  const Icon = sev.icon;
  return (
    <div className="mb-4 rounded-2xl bg-white p-3">
      <p className={`flex items-start gap-2 rounded-xl p-2.5 text-sm font-semibold ${sev.tone}`}>
        <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="block text-[11px] font-bold tracking-wide uppercase opacity-80">{sev.label}</span>
          {data.summary.headline}
        </span>
      </p>
      {data.items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {data.items.slice(0, 3).map((i) => (
            <li key={i.url}>
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 rounded-lg px-1 py-1 text-xs text-ink/70 hover:bg-mist">
                <ExternalLink size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="line-clamp-1 font-semibold text-ink/80">{i.title}</span>
                  <span className="text-ink/45">
                    {host(i.url)}
                    {i.date ? ` · ${i.date}` : ''}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center gap-1 text-[11px] text-ink/45">
        {data.summary.source === 'gemma' && <Sparkles size={11} aria-hidden="true" />}
        From the web{data.summary.source === 'gemma' ? ', summarised by Gemma' : ''}. May be out of date; check official sources.
      </p>
    </div>
  );
}
