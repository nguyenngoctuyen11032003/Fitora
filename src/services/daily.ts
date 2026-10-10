import { db } from '@/lib/supabase';
import type { DailyLog } from '@/types/db';
import { run } from './errors';
import { currentUserId } from './session';

const COLS = 'user_id, log_date, water_ml, steps, updated_at';

/** The day's water/steps row, or a zero row (not persisted) when none exists yet. */
export async function getDailyLog(date: string): Promise<DailyLog> {
  const uid = await currentUserId();
  const row = await run(
    db().from('fit_daily_logs').select(COLS).eq('log_date', date).maybeSingle<DailyLog>(),
    'Không tải được nước uống / bước chân.',
  );
  return row ?? { user_id: uid, log_date: date, water_ml: 0, steps: 0, updated_at: new Date().toISOString() };
}

async function upsertDaily(date: string, patch: Partial<Pick<DailyLog, 'water_ml' | 'steps'>>): Promise<DailyLog> {
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

export function setWater(date: string, ml: number): Promise<DailyLog> {
  return upsertDaily(date, { water_ml: Math.max(0, Math.min(20000, Math.round(ml || 0))) });
}

/** Adds (or subtracts) water; never goes below 0. */
export async function addWater(date: string, deltaMl: number): Promise<DailyLog> {
  const cur = await getDailyLog(date);
  return setWater(date, cur.water_ml + deltaMl);
}

export function setSteps(date: string, steps: number): Promise<DailyLog> {
  return upsertDaily(date, { steps: Math.max(0, Math.min(200000, Math.round(steps || 0))) });
}
