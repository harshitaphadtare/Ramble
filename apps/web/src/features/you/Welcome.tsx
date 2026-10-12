import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Sprout } from 'lucide-react';
import { useGoal } from '../../lib/goal';

const CHOICES = [1, 2, 3, 4, 5, 7];
const LABEL: Record<number, string> = { 1: 'Once', 2: 'Twice', 3: '3 days', 4: '4 days', 5: '5 days', 7: 'Every day' };

/** First open: one question that sets up the weekly goal and streak. Skippable; changeable later in You. */
export function Welcome() {
  const goal = useGoal((s) => s.goal);
  const setGoal = useGoal((s) => s.setGoal);
  const [pick, setPick] = useState(3);

  return (
    <AnimatePresence>
      {goal === null && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-forest-deep/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <m.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-md rounded-[28px] bg-cream p-6 shadow-sheet">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-forest to-moss text-cream">
              <Sprout size={24} aria-hidden="true" />
            </span>
            <p className="mt-4 text-[11px] font-bold tracking-[0.14em] text-moss uppercase">Welcome to Ramble</p>
            <h2 id="welcome-title" className="mt-1 font-display text-[26px] leading-tight font-semibold text-forest">
              How many days do you want to get outside each week?
            </h2>
            <p className="mt-2 text-sm text-ink/65">Ramble keeps a weekly streak for you. Small goals you actually hit beat big ones you don't.</p>
            <div role="radiogroup" aria-label="Days per week" className="mt-4 grid grid-cols-3 gap-2">
              {CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={pick === n}
                  onClick={() => setPick(n)}
                  className={`rounded-2xl py-3 text-sm font-bold transition-colors ${pick === n ? 'bg-forest text-cream shadow-float' : 'bg-white text-ink/70 hover:bg-mist'}`}
                >
                  {LABEL[n]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setGoal(pick)}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-forest to-moss py-3.5 text-base font-bold text-white shadow-float"
            >
              Let's go
            </button>
            <button type="button" onClick={() => setGoal('skipped')} className="mt-2 w-full py-2 text-sm font-semibold text-ink/50">
              Skip for now
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
