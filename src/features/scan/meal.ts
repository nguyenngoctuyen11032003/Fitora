import { mealForHour } from '@/features/today/metrics';
import { isISODate, todayISO } from '@/lib/date';
import { MEAL_TYPES, type MealType } from '@/types/db';

/** `?meal=` → meal. Without it the clock decides, with the SAME table as Today / Diary / Search. */
export function parseMealParam(v: string | null, now = new Date()): MealType {
  return v && (MEAL_TYPES as string[]).includes(v) ? (v as MealType) : mealForHour(now.getHours(), now.getMinutes());
}

/**
 * `?date=` → ISO day. Invalid → today; a future day is clamped to today because the
 * review sheet only allows logging what was already eaten (its date picker has max=today).
 */
export function parseDateParam(v: string | null, today = todayISO()): string {
  if (!v || !isISODate(v)) return today;
  return v > today ? today : v;
}
