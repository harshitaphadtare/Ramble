import { useMemo } from 'react';
import { Flame, Pencil, Target } from 'lucide-react';
import { weeklyGoalProgress } from '@ramble/shared';
import { useUserStore } from '../../app/store/userStore';
import { useGoal } from '../../lib/goal';

/** Weekly goal ring + streak. Days out count once per day, however many check-ins. */
export function WeeklyGoal() {
  const visits = useUserStore((s) => s.visits);
  const goal = useGoal((s) => s.goal);
  const setGoal = useGoal((s) => s.setGoal);
  const target = typeof goal === 'number' ? goal : null;
  const p = useMemo(() => (target ? weeklyGoalProgress(visits.map((v) => v.at), target) : null), [visits, target]);

  if (!target || !p) {
    return (
      <button type="button" onClick={() => useGoal.setState({ goal: null })} className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left">
        <Target size={20} className="text-moss" aria-hidden="true" />
        <span className="flex-1 text-sm font-semibold text-forest">Set a weekly goal to start a streak</span>
      </button>
    );
  }

  const done = Math.min(p.thisWeek, target);
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className="mb-4 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-forest to-moss p-4 text-cream">
      <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="7" />
        <circle cx="32" cy="32" r={R} fill="none" stroke="#f9c06a" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(done / target) * C} ${C}`} />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-[0.12em] text-cream/70 uppercase">This week</p>
        <p className="font-display text-2xl leading-tight font-semibold">
          {p.thisWeek} of {target} days out
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-cream/85">
          <Flame size={13} aria-hidden="true" />
          {p.streak > 0 ? `${p.streak}-week streak` : 'Hit your goal to start a streak'}
          {p.met && ' · goal met 🎉'}
        </p>
      </div>
      <label className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-cream/70">
        <Pencil size={13} aria-hidden="true" />
        <select
          value={target}
          onChange={(e) => setGoal(Number(e.target.value))}
          aria-label="Days per week goal"
          className="rounded-md bg-white/15 px-1 py-0.5 text-xs font-bold text-cream"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n} className="text-ink">
              {n}/wk
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
