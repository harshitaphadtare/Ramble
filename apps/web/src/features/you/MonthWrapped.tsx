import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useUserStore } from '../../app/store/userStore';

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** Ramble Wrapped (from Wander): a monthly recap worked out on the device. */
export function MonthWrapped() {
  const { places, visits, journal } = useUserStore();
  const [offset, setOffset] = useState(0);

  const w = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const inMonth = visits.filter((v) => v.at >= from.getTime() && v.at < to.getTime());
    const days = new Set(inMonth.map((v) => new Date(v.at).toDateString())).size;
    const perPlace = new Map<string, number>();
    for (const v of inMonth) perPlace.set(v.placeId, (perPlace.get(v.placeId) ?? 0) + 1);
    const top = [...perPlace].sort((a, b) => b[1] - a[1])[0];
    const firstVisit = new Map<string, number>();
    for (const v of visits) firstVisit.set(v.placeId, Math.min(firstVisit.get(v.placeId) ?? Infinity, v.at));
    const newPlaces = [...firstVisit.values()].filter((t) => t >= from.getTime() && t < to.getTime()).length;
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    for (const v of inMonth) byDay[new Date(v.at).getDay()]!++;
    const busiest = Math.max(...byDay) > 0 ? WEEKDAYS[byDay.indexOf(Math.max(...byDay))] : null;
    const memories = journal.filter((j) => j.createdAt >= from.getTime() && j.createdAt < to.getTime()).length;
    return {
      label: from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      visits: inMonth.length,
      days,
      newPlaces,
      memories,
      top: top ? { name: places.find((p) => p.id === top[0])?.name ?? 'A place', n: top[1] } : null,
      busiest,
    };
  }, [places, visits, journal, offset]);

  return (
    <section className="mb-4 rounded-2xl bg-white p-4" aria-label={`Your ${w.label} wrapped`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-moss uppercase">
          <Sparkles size={13} aria-hidden="true" /> {w.label} wrapped
        </p>
        <div className="flex gap-1">
          <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month" className="grid size-7 place-items-center rounded-lg bg-mist text-forest">
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Next month" className="grid size-7 place-items-center rounded-lg bg-mist text-forest disabled:opacity-40">
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {w.visits === 0 ? (
        <p className="text-sm text-ink/60">No check-ins this month yet. Your recap builds up as you get outside.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              [w.days, 'days out'],
              [w.visits, 'visits'],
              [w.newPlaces, 'new places'],
              [w.memories, 'memories'],
            ].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-mist py-2">
                <p className="font-display text-xl leading-none font-semibold text-forest">{n}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-ink/55">{l}</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-ink/70">
            {w.top && (
              <>
                Your spot was <b className="text-forest">{w.top.name}</b> ({w.top.n} visit{w.top.n === 1 ? '' : 's'}).{' '}
              </>
            )}
            {w.busiest && <>You got out most on {w.busiest}.</>}
          </p>
        </>
      )}
    </section>
  );
}
