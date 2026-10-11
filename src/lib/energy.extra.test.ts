import { describe, expect, it } from 'vitest';
import { calcBMR, exerciseBonus, metKcal } from './energy';
import { parseDecimal } from './format';
import { ACTIVITY_BY_KEY, ACTIVITIES } from '@/data/activities';
import { FOOD_BY_ID, FOODS } from '@/data/foods';

describe('calcBMR guards', () => {
  it('returns 0 instead of a nonsense value when weight/height is missing', () => {
    expect(calcBMR('male', 0, 175, 30)).toBe(0);
    expect(calcBMR('female', 60, NaN, 30)).toBe(0);
  });
  it('treats a negative / missing age as 0', () => {
    expect(calcBMR('male', 70, 175, -3)).toBe(calcBMR('male', 70, 175, 0));
  });
});

describe('exerciseBonus (PLAN §4)', () => {
  it('only counts burn beyond the activity already in the target', () => {
    // BMR 1600, moderate TDEE 2480 → allowance 560: 300 kcal of exercise earns nothing.
    expect(exerciseBonus(1600, 2480, 300)).toBe(0);
    expect(exerciseBonus(1600, 2480, 760)).toBe(200);
    // Sedentary: TDEE = BMR·1.2 → whole burn counts.
    expect(exerciseBonus(1600, 1920, 250)).toBe(250);
  });
  it('without a model the whole burn counts', () => {
    expect(exerciseBonus(null, null, 320)).toBe(320);
    expect(exerciseBonus(0, 2000, -5)).toBe(0);
  });
});

describe('MET data (Compendium of Physical Activities, 2024 update)', () => {
  const met = (key: string, id: string) => ACTIVITY_BY_KEY[key]?.variants.find((v) => v.id === id)?.met;
  it('reference values match the Compendium', () => {
    expect(met('running', '8kmh')).toBe(8.3); // 12030: 5 mph
    expect(met('walking', '5kmh')).toBe(3.5); // 17170: 3 mph
    expect(met('cycling_road', 'leisure')).toBe(5.8); // 2024 update (was 4.0 in 2011)
    expect(met('yoga_hatha', 'general')).toBe(2.5); // 02150
    expect(met('jump_rope', 'moderate')).toBe(11.8); // 15552
    expect(met('jump_rope', 'fast')).toBe(12.3); // 15550
    expect(met('swim_freestyle', 'moderate')).toBe(5.8); // 18250
    expect(met('swim_freestyle', 'fast')).toBe(9.8); // 18240
    expect(met('weight_training', 'moderate')).toBe(3.5); // 02054
  });
  it('every MET is in a physiologically plausible range (1.5–16)', () => {
    for (const a of ACTIVITIES)
      for (const v of a.variants) {
        expect(v.met, `${a.key}/${v.id}`).toBeGreaterThanOrEqual(1.5);
        expect(v.met, `${a.key}/${v.id}`).toBeLessThanOrEqual(16);
      }
  });
  it('speed-banded variants have monotonically increasing MET', () => {
    for (const key of ['running', 'walking', 'cycling_road'] as const) {
      const vs = ACTIVITY_BY_KEY[key].variants;
      for (let i = 1; i < vs.length; i++) expect(vs[i].met, `${key} ${vs[i].id}`).toBeGreaterThan(vs[i - 1].met);
    }
  });
  it('metKcal gives realistic burns (running 8 km/h, 70 kg, 30 min ≈ 305 kcal)', () => {
    expect(metKcal(8.3, 70, 30)).toBe(305);
    expect(metKcal(5.8, 70, 60)).toBe(426); // 1 h leisure cycling
  });
});

describe('food data sanity (Bảng TPTP Việt Nam / USDA)', () => {
  const kcalPerServing = (id: string) => {
    const f = FOOD_BY_ID[id];
    return (f.per100g.kcal * f.units[0].grams) / 100;
  };
  it('kcal ≈ 4·P + 4·C + 9·F for every food (±15 % or ±15 kcal — alcohol & fiber excepted)', () => {
    const ALCOHOL = new Set(['bia', 'ruou_vang']); // 7 kcal/g alcohol is not a macro
    for (const f of FOODS) {
      if (ALCOHOL.has(f.id)) continue;
      const { kcal, protein, carbs, fat } = f.per100g;
      const macro = protein * 4 + carbs * 4 + fat * 9;
      expect(Math.abs(macro - kcal), `${f.id}: macros ${macro} vs kcal ${kcal}`).toBeLessThanOrEqual(Math.max(15, kcal * 0.15));
    }
  });
  it('reference dishes land in realistic per-serving ranges', () => {
    expect(kcalPerServing('pho_bo')).toBeGreaterThanOrEqual(350); // tô ~350–450 kcal
    expect(kcalPerServing('pho_bo')).toBeLessThanOrEqual(500);
    expect(FOOD_BY_ID.com_trang.per100g.kcal).toBe(130); // cooked rice ~130 kcal/100 g
    expect(kcalPerServing('banh_mi_thit')).toBeGreaterThanOrEqual(400); // ổ ~400–500 kcal
    expect(kcalPerServing('banh_mi_thit')).toBeLessThanOrEqual(520);
    expect(FOOD_BY_ID.uc_ga.per100g.kcal).toBe(165); // USDA chicken breast
    expect(FOOD_BY_ID.trung_ga.per100g.kcal).toBe(155); // USDA boiled egg
    expect(FOOD_BY_ID.dau_an.per100g.kcal).toBeGreaterThanOrEqual(880); // pure fat ~884–900
  });
});

describe('parseDecimal strictness', () => {
  it('rejects hex, exponents and words that Number() would accept', () => {
    expect(parseDecimal('0x10')).toBeNull();
    expect(parseDecimal('1e3')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
    expect(parseDecimal('12abc')).toBeNull();
    expect(parseDecimal('-2,5')).toBe(-2.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('5.')).toBe(5);
  });
});
