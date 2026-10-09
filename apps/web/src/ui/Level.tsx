import { Crown, Heart, MapPin, Sparkles, Star, type LucideIcon } from 'lucide-react';
import { levelFor, type LevelId } from '@ramble/shared';

export const LEVEL_ICONS: Record<LevelId, LucideIcon> = {
  want: MapPin,
  visited: Star,
  favourite: Heart,
  regular: Sparkles,
  legend: Crown,
};

/** Small coloured pill: icon + level name. */
export function LevelBadge({ visits }: { visits: number }) {
  const level = levelFor(visits);
  const Icon = LEVEL_ICONS[level.id];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: level.color }}>
      <Icon size={11} strokeWidth={2.6} aria-hidden="true" />
      {level.label}
    </span>
  );
}

/** Ring that fills towards the next level, with the level icon in the middle. */
export function LevelRing({ visits, size = 48 }: { visits: number; size?: number }) {
  const level = levelFor(visits);
  const Icon = LEVEL_ICONS[level.id];
  const progress = level.next ? (visits - level.min) / (level.next.min - level.min) : 1;
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = level.next?.color ?? level.color;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(23 32 27 / 0.08)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <Icon size={size * 0.36} className="absolute" color={level.color} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}
