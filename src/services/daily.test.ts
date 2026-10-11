import { describe, expect, it, vi } from 'vitest';

// Fake fit_daily_logs with a slow network so two addWater calls overlap.
let water = 0;
const delay = () => new Promise((r) => setTimeout(r, 5));
const row = () => ({ user_id: 'u', log_date: '2026-10-11', water_ml: water, steps: 0, updated_at: '' });
function table() {
  return {
    select: () => ({
      eq: () => ({
        abortSignal: () => ({
          maybeSingle: async () => {
            const snapshot = row();
            await delay();
            return { data: snapshot, error: null };
          },
        }),
      }),
    }),
    upsert: (r: { water_ml?: number }) => ({
      select: () => ({
        single: async () => {
          await delay();
          if (r.water_ml !== undefined) water = r.water_ml;
          return { data: row(), error: null };
        },
      }),
    }),
  };
}
vi.mock('@/lib/supabase', () => ({ db: () => ({ from: () => table() }) }));
vi.mock('./session', () => ({ currentUserId: async () => 'u' }));

import { addWater, clampCount, setWater } from './daily';

describe('daily log', () => {
  it('two quick +250 ml taps both count', async () => {
    water = 0;
    await Promise.all([addWater('2026-10-11', 250), addWater('2026-10-11', 250)]);
    expect(water).toBe(500);
  });
  it('never goes below zero and rejects bad dates', async () => {
    water = 100;
    expect((await addWater('2026-10-11', -500)).water_ml).toBe(0);
    await expect(setWater('11/10/2026', 100)).rejects.toThrow('Ngày không hợp lệ.');
  });
  it('clampCount handles NaN / Infinity', () => {
    expect(clampCount(NaN, 10)).toBe(0);
    expect(clampCount(Infinity, 10)).toBe(0);
    expect(clampCount(12.6, 10)).toBe(10);
    expect(clampCount(3.4, 10)).toBe(3);
  });
});
