import { db } from '@/lib/supabase';
import type { DailyLog } from '@/types/db';
import { run, runRead, vDate } from './errors';
import { currentUserId } from './session';

const COLS = 'user_id, log_date, water_ml, steps, updated_at';

export const MAX_WATER_ML = 20000;
export const MAX_STEPS = 200000;

/** The day's water/steps row, or a zero row (not persisted) when none exists yet. */
export async function getDailyLog(date: string): Promise<DailyLog> {
  vDate(date);
  const uid = await currentUserId();
  const row = await runRead(
    (signal) => db().from('fit_daily_logs').select(COLS).eq('log_date', date).abortSignal(signal).maybeSingle<DailyLog>(),
    'Không tải được nước uống / bước chân.',
  );
  return row ?? { user_id: uid, log_date: date, water_ml: 0, steps: 0, updated_at: new Date().toISOString() };
}

async function upsertDaily(date: string, patch: Partial<Pick<DailyLog, 'water_ml' | 'steps'>>): Promise<DailyLog> {
  vDate(date);
  const uid = await currentUserId();
  return run(
    db()
      .from('fit_daily_logs')
      .upsert({ user_id: uid, log_date: date, ...patch }, { onConflict: 'user_id,log_date' })
      .select(COLS)
      .single<DailyLog>(),
    'Không lưu được nhật ký ngày.',
  );
}

/** Clamp to an integer in [0, max]; NaN / Infinity → 0. */
export function clampCount(v: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0;
}

export function setWater(date: string, ml: number): Promise<DailyLog> {
  return upsertDaily(date, { water_ml: clampCount(ml, MAX_WATER_ML) });
}

// addWater is read-modify-write: two quick taps on "+250 ml" would both read the same
// value and one glass would be lost. Calls for the same day are chained instead.
const waterQueue = new Map<string, Promise<unknown>>();

/** Adds (or subtracts) water; never goes below 0. Concurrent calls for one day are applied in order. */
export function addWater(date: string, deltaMl: number): Promise<DailyLog> {
  const prev = waterQueue.get(date) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const cur = await getDailyLog(date);
      return setWater(date, cur.water_ml + (Number(deltaMl) || 0));
    });
  waterQueue.set(date, next);
  const cleanup = () => {
    if (waterQueue.get(date) === next) waterQueue.delete(date);
  };
  next.then(cleanup, cleanup);
  return next;
}

export function setSteps(date: string, steps: number): Promise<DailyLog> {
  return upsertDaily(date, { steps: clampCount(steps, MAX_STEPS) });
}
