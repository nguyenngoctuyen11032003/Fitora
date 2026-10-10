import clsx from 'clsx';
import {
  Activity,
  Bike,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  HeartPulse,
  House,
  Mountain,
  Music,
  PersonStanding,
  Sailboat,
  Sprout,
  Swords,
  Target,
  Timer,
  Trophy,
  Volleyball,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { findActivity, type ActivityIconKey } from '@/data/activities';
import type { WorkoutCategory } from '@/types/db';

const ICONS: Record<ActivityIconKey, LucideIcon> = {
  dumbbell: Dumbbell,
  flame: Flame,
  heart: HeartPulse,
  zap: Zap,
  flower: Flower2,
  wind: Wind,
  run: PersonStanding,
  footprints: Footprints,
  waves: Waves,
  bike: Bike,
  trophy: Trophy,
  volleyball: Volleyball,
  target: Target,
  mountain: Mountain,
  music: Music,
  swords: Swords,
  sprout: Sprout,
  home: House,
  sailboat: Sailboat,
  timer: Timer,
  activity: Activity,
};

export const CATEGORY_ICON: Record<WorkoutCategory, LucideIcon> = {
  gym: Dumbbell,
  cardio: HeartPulse,
  yoga: Flower2,
  running: PersonStanding,
  swimming: Waves,
  cycling: Bike,
  team_sport: Trophy,
  walking: Footprints,
  other: Activity,
};

/** Accent colour per category (CSS value). */
export const CATEGORY_COLOR: Record<WorkoutCategory, string> = {
  gym: 'var(--gold)',
  cardio: 'var(--burn)',
  yoga: 'var(--fiber)',
  running: 'var(--ember)',
  swimming: 'var(--water)',
  cycling: 'var(--fat)',
  team_sport: 'var(--protein)',
  walking: '#c9a27a',
  other: 'rgba(235,220,205,0.75)',
};

export function iconFor(activity: string | null | undefined, category: WorkoutCategory): LucideIcon {
  const a = findActivity(activity);
  return a ? ICONS[a.icon] : CATEGORY_ICON[category] ?? Activity;
}

/** Rounded tile with the activity icon tinted by its category. */
export function ActivityIcon({
  activity,
  category,
  size = 44,
  muted,
  className,
}: {
  activity?: string | null;
  category: WorkoutCategory;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const Icon = iconFor(activity, category);
  const color = CATEGORY_COLOR[category] ?? 'var(--gold)';
  return (
    <span
      aria-hidden="true"
      className={clsx('grid shrink-0 place-items-center rounded-[14px] border', className)}
      style={{
        width: size,
        height: size,
        color: muted ? 'var(--muted)' : color,
        borderColor: muted ? 'var(--line)' : `color-mix(in srgb, ${color} 35%, transparent)`,
        background: muted ? 'rgba(255,255,255,0.03)' : `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={2.1} />
    </span>
  );
}
