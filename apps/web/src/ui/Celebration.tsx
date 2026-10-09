import { useEffect, useMemo } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { LEVELS, type LevelId } from '@ramble/shared';
import { useUserStore } from '../app/store/userStore';
import { LEVEL_ICONS } from './Level';

const CONFETTI_COLOURS = [...LEVELS.slice(1).map((l) => l.color), '#ffffff'];

/** Small seeded PRNG (mulberry32): each celebration gets its own confetti, and render stays pure. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Full-screen level-up moment: the badge springs in and confetti bursts out. */
export function Celebration() {
  const data = useUserStore((s) => s.celebration);
  const dismiss = useUserStore((s) => s.dismissCelebration);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(dismiss, 3200);
    return () => clearTimeout(t);
  }, [data, dismiss]);

  return <AnimatePresence>{data && <Burst key={data.key} seed={data.key} placeName={data.placeName} levelId={data.levelId} label={data.label} color={data.color} visits={data.visits} onDone={dismiss} />}</AnimatePresence>;
}

function Burst({ seed, placeName, levelId, label, color, visits, onDone }: { seed: number; placeName: string; levelId: string; label: string; color: string; visits: number; onDone: () => void }) {
  const Icon = LEVEL_ICONS[levelId as LevelId];
  const pieces = useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: 34 }, (_, i) => {
        const angle = (i / 34) * Math.PI * 2 + random() * 0.4;
        const dist = 120 + random() * 140;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 40,
          rotate: random() * 540 - 270,
          color: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
          w: 6 + random() * 6,
          h: 10 + random() * 8,
          round: random() > 0.6,
        };
    });
  }, [seed]);

  return (
    <m.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
      className="fixed inset-0 z-50 grid place-items-center bg-forest-deep/40 backdrop-blur-sm"
    >
      <div className="relative grid place-items-center">
        {pieces.map((p, i) => (
          <m.span
            key={i}
            aria-hidden="true"
            className="absolute"
            style={{ width: p.w, height: p.h, background: p.color, borderRadius: p.round ? 999 : 2 }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: p.x, y: p.y + 160, rotate: p.rotate, opacity: 0 }}
            transition={{ duration: 1.8, ease: [0.2, 0.8, 0.3, 1] }}
          />
        ))}
        <m.div
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          className="flex w-64 flex-col items-center rounded-[28px] bg-cream px-6 py-6 text-center shadow-sheet"
        >
          <span className="mb-3 grid size-16 place-items-center rounded-full text-white shadow-float" style={{ background: color }}>
            {Icon && <Icon size={30} strokeWidth={2.4} aria-hidden="true" />}
          </span>
          <p className="text-[11px] font-bold tracking-[0.14em] text-moss uppercase">Level up</p>
          <p className="font-display text-2xl font-semibold text-forest">{label}</p>
          <p className="mt-1 text-sm text-ink/65">
            {placeName} · {visits} {visits === 1 ? 'visit' : 'visits'}
          </p>
        </m.div>
      </div>
    </m.div>
  );
}
