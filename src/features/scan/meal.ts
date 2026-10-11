import { isISODate, todayISO } from '@/lib/date';
import { MEAL_TYPES, type MealType } from '@/types/db';

/** <10h breakfast · <14h lunch · <17h snack · otherwise dinner. */
export function defaultMealForHour(hour: number): MealType {
  if (hour < 10) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'snack';
  return 'dinner';
}

export function parseMealParam(v: string | null, now = new Date()): MealType {
  return v && (MEAL_TYPES as string[]).includes(v) ? (v as MealType) : defaultMealForHour(now.getHours());
}

/**
 * `?date=` → ISO day. Invalid → today; a future day is clamped to today because the
 * review sheet only allows logging what was already eaten (its date picker has max=today).
 */
export function parseDateParam(v: string | null, today = todayISO()): string {
  if (!v || !isISODate(v)) return today;
  return v > today ? today : v;
}
