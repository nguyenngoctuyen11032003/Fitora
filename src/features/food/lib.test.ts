import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID, FOODS, POPULAR_FOOD_IDS } from '@/data/foods';
import { activityModel, energyBalance } from '@/features/today/metrics';
import type { CustomFood, FitProfile, MealEntry } from '@/types/db';
import {
  diaryBalance,
  computePortion,
  convertQuantity,
  copyEntries,
  entryToInsert,
  frequencyByKey,
  highlightParts,
  searchNorm,
  sortByLogged,
  editDistance,
  kcalMismatch,
  optionForEdit,
  servingProblem,
  withEntryUnit,
  defaultPortion,
  fromCustomFood,
  fromDbFood,
  fromEntry,
  groupByMeal,
  guessMeal,
  kcalFromMacros,
  normalizeVi,
  optionForEntry,
  parseMeal,
  per100FromServing,
  perServingFromPer100,
  recentFoods,
  scoreKey,
  searchFoods,
  servingUnit,
  sumNutrients,
  toNewEntry,
  unitOptions,
} from './lib';

const ALL = FOODS.map(fromDbFood);

const entry = (over: Partial<MealEntry>): MealEntry => ({
  id: 'e1',
  user_id: 'u',
  eaten_on: '2026-10-09',
  meal: 'lunch',
  name: 'Phở bò',
  quantity: 1,
  unit: 'bát',
  grams: 500,
  kcal: 450,
  protein_g: 27.5,
  carbs_g: 55,
  fat_g: 13,
  fiber_g: 2,
  source: 'search',
  custom_food_id: null,
  photo_path: null,
  ai_meta: null,
  created_at: '2026-10-09T05:00:00Z',
  updated_at: '2026-10-09T05:00:00Z',
  ...over,
});

const custom: CustomFood = {
  id: 'c1',
  user_id: 'u',
  name: 'Sữa chua nhà làm',
  brand: 'Mẹ làm',
  serving_label: '1 hũ',
  serving_grams: 120,
  kcal_100g: 80,
  protein_100g: 4,
  carbs_100g: 10,
  fat_100g: 2.5,
  fiber_100g: 0,
  source: 'manual',
  photo_path: null,
  use_count: 0,
  last_used_at: null,
  default_meal: null,
  created_at: '',
  updated_at: '',
};

describe('food database', () => {
  it('has ≥150 foods with unique ids and sane values', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(f.units.length).toBeGreaterThan(0);
      expect(f.units[0].unit).toBe(f.defaultUnit);
      for (const u of f.units) {
        expect(u.grams).toBeGreaterThan(0);
        expect(u.unit.length).toBeLessThanOrEqual(20);
      }
      expect(f.aliases[0]).toBe(normalizeVi(f.name));
      const { kcal, protein, carbs, fat, fiber } = f.per100g;
      for (const v of [kcal, protein, carbs, fat, fiber]) expect(v).toBeGreaterThanOrEqual(0);
      expect(protein + carbs + fat).toBeLessThanOrEqual(100.5);
    }
  });

  it('kcal roughly matches 4/4/9 macros (alcohol excluded)', () => {
    const off = FOODS.filter((f) => !['bia', 'ruou_vang'].includes(f.id) && f.per100g.kcal >= 20).filter((f) => {
      const m = kcalFromMacros(f.per100g.protein, f.per100g.carbs, f.per100g.fat);
      return Math.abs(m - f.per100g.kcal) / f.per100g.kcal > 0.15;
    });
    expect(off.map((f) => f.id)).toEqual([]);
  });

  it('popular ids exist', () => {
    for (const id of POPULAR_FOOD_IDS) expect(FOOD_BY_ID[id]).toBeDefined();
  });
});

describe('normalizeVi', () => {
  it('strips diacritics, đ and punctuation', () => {
    expect(normalizeVi('Phở  Bò (tái)')).toBe('pho bo tai');
    expect(normalizeVi('Đậu phụ')).toBe('dau phu');
    expect(normalizeVi('BÚN ĐẬU mắm-tôm')).toBe('bun dau mam tom');
    expect(normalizeVi(null)).toBe('');
  });
});

describe('search', () => {
  it('is diacritic-insensitive', () => {
    expect(searchFoods('pho bo', ALL)[0].name).toBe('Phở bò');
    expect(searchFoods('phở bò', ALL)[0].name).toBe('Phở bò');
    expect(searchFoods('dau phu', ALL)[0].name).toBe('Đậu phụ');
  });

  it('ranks prefix > word > contains', () => {
    expect(scoreKey('com tam', 'com')).toBeGreaterThan(scoreKey('banh com', 'com'));
    expect(scoreKey('banh com', 'com')).toBeGreaterThan(scoreKey('xcomx', 'com'));
    const res = searchFoods('com', ALL).map((o) => o.name);
    expect(res[0].startsWith('Cơm')).toBe(true);
  });

  it('matches aliases and tolerates typos', () => {
    expect(searchFoods('cha gio', ALL)[0].name).toBe('Nem rán (chả giò)');
    expect(searchFoods('banh mi tiht', ALL).some((o) => o.name === 'Bánh mì thịt')).toBe(true);
    expect(searchFoods('tra sua', ALL)[0].name).toBe('Trà sữa trân châu');
    expect(searchFoods('cafe sua da', ALL)[0].name).toBe('Cà phê sữa đá');
  });

  it('matches multi-token queries in any order', () => {
    expect(searchFoods('bo pho', ALL).some((o) => o.name === 'Phở bò')).toBe(true);
  });

  it('boosts recent and custom foods', () => {
    const plain = searchFoods('bun', ALL).map((o) => o.key);
    const boosted = searchFoods('bun', ALL, { recentKeys: ['db:bun_oc'] }).map((o) => o.key);
    expect(boosted.indexOf('db:bun_oc')).toBeLessThan(plain.indexOf('db:bun_oc'));
    const withCustom = searchFoods('sua chua', [...ALL, fromCustomFood(custom)]);
    expect(withCustom.some((o) => o.origin === 'custom')).toBe(true);
  });

  it('returns nothing for empty / unmatched queries', () => {
    expect(searchFoods('   ', ALL)).toEqual([]);
    expect(searchFoods('zzzzqqq', ALL)).toEqual([]);
  });

  it('editDistance', () => {
    expect(editDistance('thit', 'tiht')).toBe(1);
    expect(editDistance('pho', 'pho')).toBe(0);
    expect(editDistance('abc', 'abcdef', 2)).toBe(3);
  });
});

describe('nutrition math', () => {
  const pho = fromDbFood(FOOD_BY_ID.pho_bo);

  it('computes a portion from household units and grams', () => {
    const p = computePortion(pho, 1, 'bát');
    expect(p.grams).toBe(500);
    expect(p.kcal).toBe(450);
    expect(p.protein_g).toBe(27.5);
    expect(computePortion(pho, 1.5, 'bát').kcal).toBe(675);
    expect(computePortion(pho, 200, 'g').kcal).toBe(180);
  });

  it('adds g to unit options and converts quantities', () => {
    expect(unitOptions(pho).map((u) => u.unit)).toContain('g');
    expect(convertQuantity(pho, 1, 'bát', 'g')).toBe(500);
    // g → household keeps the weight (to ¼), household ↔ household restarts at 1.
    expect(convertQuantity(pho, 300, 'g', 'bát')).toBe(0.5);
    expect(convertQuantity(pho, 1000, 'g', 'bát')).toBe(2);
    expect(convertQuantity(pho, 10, 'g', 'bát')).toBe(0.25);
    expect(convertQuantity(pho, 2, 'bát', 'bát nhỏ')).toBe(1);
    const rice = fromDbFood(FOOD_BY_ID.com_trang);
    expect(convertQuantity(rice, 300, 'g', 'bát')).toBe(2);
  });

  it('builds an insert row', () => {
    const row = toNewEntry(pho, 2, 'bát', 'breakfast', '2026-10-09');
    expect(row).toMatchObject({ name: 'Phở bò', meal: 'breakfast', quantity: 2, unit: 'bát', grams: 1000, kcal: 900, source: 'search', custom_food_id: null });
    const cRow = toNewEntry(fromCustomFood(custom), 1, 'hũ', 'snack', '2026-10-09');
    expect(cRow).toMatchObject({ source: 'custom', custom_food_id: 'c1', grams: 120, kcal: 96 });
  });

  it('serving ↔ per-100 g conversion round-trips', () => {
    const per100 = per100FromServing({ kcal: 300, protein: 12, carbs: 30, fat: 15, fiber: 3 }, 200);
    expect(per100).toEqual({ kcal: 150, protein: 6, carbs: 15, fat: 7.5, fiber: 1.5 });
    expect(perServingFromPer100(per100, 200)).toEqual({ kcal: 300, protein: 12, carbs: 30, fat: 15, fiber: 3 });
    expect(servingUnit('1 hộp')).toBe('hộp');
    expect(servingUnit('')).toBe('phần');
  });

  it('sums and groups entries', () => {
    const rows = [entry({}), entry({ id: 'e2', meal: 'dinner', kcal: 100.25, protein_g: 1 })];
    expect(sumNutrients(rows).kcal).toBe(550.3);
    const g = groupByMeal(rows);
    expect(g.lunch).toHaveLength(1);
    expect(g.dinner).toHaveLength(1);
    expect(g.breakfast).toHaveLength(0);
  });
});

describe('entries → options', () => {
  it('derives per-100 g from an entry with grams', () => {
    const o = fromEntry(entry({ name: 'Món lạ', source: 'ai', grams: 250, kcal: 500, quantity: 1, unit: 'đĩa' }));
    expect(o.per100g.kcal).toBe(200);
    expect(computePortion(o, 2, 'đĩa').kcal).toBe(1000);
    expect(o.source).toBe('manual');
  });

  it('handles manual entries without grams', () => {
    const o = fromEntry(entry({ name: 'Nhập nhanh', source: 'manual', grams: 0, kcal: 320, quantity: 1, unit: 'phần' }));
    expect(o.gramsKnown).toBe(false);
    expect(unitOptions(o).map((u) => u.unit)).toEqual(['phần']);
    const p = computePortion(o, 1.5, 'phần');
    expect(p.kcal).toBe(480);
    expect(p.grams).toBe(0);
  });

  it('maps entries back to DB / custom foods', () => {
    expect(optionForEntry(entry({}), FOODS).key).toBe('db:pho_bo');
    expect(optionForEntry(entry({ custom_food_id: 'c1', name: 'x' }), FOODS, [custom]).key).toBe('custom:c1');
    expect(optionForEntry(entry({ source: 'ai' }), FOODS).origin).toBe('history');
  });

  it('lists distinct recent foods newest first with last portion', () => {
    const rows = [
      entry({ id: 'a', created_at: '2026-10-08T01:00:00Z', eaten_on: '2026-10-08' }),
      entry({ id: 'b', name: 'Chuối', unit: 'quả', quantity: 2, grams: 200, kcal: 194, created_at: '2026-10-09T01:00:00Z' }),
      entry({ id: 'c', quantity: 1.5, created_at: '2026-10-09T02:00:00Z' }),
    ];
    const r = recentFoods(rows, FOODS);
    expect(r.map((x) => x.option.name)).toEqual(['Phở bò', 'Chuối']);
    expect(r[0].quantity).toBe(1.5);
    expect(r[1]).toMatchObject({ quantity: 2, unit: 'quả' });
  });
});

describe('meal helpers', () => {
  it('parses and guesses meals', () => {
    expect(parseMeal('lunch')).toBe('lunch');
    expect(parseMeal('brunch')).toBeNull();
    expect(guessMeal(new Date(2026, 9, 9, 7, 0))).toBe('breakfast');
    expect(guessMeal(new Date(2026, 9, 9, 12, 0))).toBe('lunch');
    expect(guessMeal(new Date(2026, 9, 9, 15, 30))).toBe('snack');
    expect(guessMeal(new Date(2026, 9, 9, 19, 0))).toBe('dinner');
    expect(guessMeal(new Date(2026, 9, 9, 23, 0))).toBe('snack');
  });
});

describe('hardening regressions', () => {
  it('ranks whole-word matches above partial words', () => {
    expect(searchFoods('com ga', ALL)[0].name).toMatch(/^Cơm gà/);
    expect(searchFoods('com ga', ALL).slice(0, 2).map((o) => o.name)).not.toContain('Cơm gạo lứt');
    expect(searchFoods('mi', ALL)[0].name).toMatch(/^Mì/);
    expect(searchFoods('ca', ALL)[0].name).toMatch(/^C[àá] /);
  });

  it('handles words typed without spaces and spelling variants', () => {
    expect(searchFoods('banhmi', ALL)[0].name).toBe('Bánh mì thịt');
    expect(searchFoods('comtam', ALL)[0].name).toMatch(/^Cơm tấm/);
    expect(searchFoods('my quang', ALL)[0].name).toBe('Mì Quảng');
    expect(searchFoods('mỳ xào', ALL)[0].name).toBe('Mì xào bò');
    expect(searchFoods('hủ tíu xào', ALL)[0].name).toBe('Hủ tiếu xào');
    expect(searchFoods('my y', ALL)[0].name).toBe('Mỳ Ý sốt bò bằm');
  });

  it('first option with a key wins (personalised recent option over the DB one)', () => {
    const db = fromDbFood(FOOD_BY_ID.com_ga_xoi_mo);
    const mine = { ...db, units: [{ unit: 'đĩa', grams: 300 }] };
    const res = searchFoods('com ga xoi mo', [mine, db]);
    expect(res).toHaveLength(1);
    expect(res[0].units[0].grams).toBe(300);
  });

  it('stores quarter quantities exactly', () => {
    const pho = fromDbFood(FOOD_BY_ID.pho_bo);
    const row = toNewEntry(pho, 0.25, 'bát', 'lunch', '2026-10-09');
    expect(row.quantity).toBe(0.25);
    expect(row.grams).toBe(125);
    expect(toNewEntry(pho, 1.25, 'bát', 'lunch', '2026-10-09').quantity).toBe(1.25);
  });

  it('drinks measured in ml do not also offer grams', () => {
    const units = unitOptions(fromDbFood(FOOD_BY_ID.tra_sua)).map((u) => u.unit);
    expect(units).toContain('ml');
    expect(units).not.toContain('g');
    expect(unitOptions(fromDbFood(FOOD_BY_ID.pho_bo)).map((u) => u.unit)).toContain('g');
  });

  const comGa = (over: Partial<MealEntry>) =>
    entry({ name: 'Cơm gà xối mỡ', unit: 'đĩa', quantity: 1, grams: 400, kcal: 650, protein_g: 35, carbs_g: 70, fat_g: 24, fiber_g: 2, ...over });

  it('recent foods reuse the grams the user logged for a household unit', () => {
    const [r] = recentFoods([comGa({ grams: 300, kcal: 555 })], FOODS);
    expect(r.option.key).toBe('db:com_ga_xoi_mo');
    expect(r).toMatchObject({ quantity: 1, unit: 'đĩa' });
    expect(computePortion(r.option, r.quantity, r.unit)).toMatchObject({ grams: 300, kcal: 555 });
    // Same size as the database → unchanged option.
    const [same] = recentFoods([comGa({})], FOODS);
    expect(same.option.units.find((u) => u.unit === 'đĩa')?.grams).toBe(400);
    // A unit the food does not have (tô) is added with the logged grams.
    const [to] = recentFoods([entry({ unit: 'tô', grams: 600, quantity: 1 })], FOODS);
    expect(to.unit).toBe('tô');
    expect(computePortion(to.option, 1, 'tô').grams).toBe(600);
  });

  it('recent drinks logged in g are offered in ml with the same amount', () => {
    const [r] = recentFoods([entry({ name: 'Trà sữa trân châu', unit: 'g', quantity: 300, grams: 300, kcal: 270 })], FOODS);
    expect(r).toMatchObject({ unit: 'ml', quantity: 300 });
    expect(computePortion(r.option, r.quantity, r.unit).kcal).toBe(270);
  });

  it('editing keeps what was logged; changing quantity rescales it', () => {
    const e = comGa({});
    const opt = optionForEdit(e, FOODS);
    expect(opt.key).toBe('db:com_ga_xoi_mo');
    expect(computePortion(opt, 1, 'đĩa').kcal).toBe(650);
    expect(computePortion(opt, 2, 'đĩa').kcal).toBe(1300);
    expect(computePortion(opt, 0.5, 'đĩa').protein_g).toBe(17.5);
    // Consistent with the database → database values are used.
    const pho = optionForEdit(entry({}), FOODS);
    expect(pho.per100g).toEqual(FOOD_BY_ID.pho_bo.per100g);
    // User-sized unit survives editing.
    const small = optionForEdit(entry({ grams: 350, kcal: 315 }), FOODS);
    expect(computePortion(small, 2, 'bát')).toMatchObject({ grams: 700, kcal: 630 });
  });

  it('withEntryUnit ignores weight units and unknown grams', () => {
    const pho = fromDbFood(FOOD_BY_ID.pho_bo);
    expect(withEntryUnit(pho, { unit: 'g', quantity: 200, grams: 200 })).toBe(pho);
    expect(withEntryUnit(pho, { unit: 'bát', quantity: 1, grams: 0 })).toBe(pho);
    expect(withEntryUnit(pho, { unit: 'bát', quantity: 1, grams: 505 })).toBe(pho);
  });

  it('validates custom-food servings', () => {
    const n = (kcal: number, protein = 0, carbs = 0, fat = 0, fiber = 0) => ({ kcal, protein, carbs, fat, fiber });
    expect(servingProblem(n(150, 5, 20, 5), 100)).toBeNull();
    expect(servingProblem(n(150, 5, 20, 5), 20)).toMatch(/không thể nặng hơn/);
    expect(servingProblem(n(500), 10)).toMatch(/quá cao/);
    expect(servingProblem(n(90, 0, 0, 10), 10)).toBeNull();
    expect(kcalMismatch(500, 200)).toBe(true);
    expect(kcalMismatch(210, 200)).toBe(false);
    expect(kcalMismatch(null, 200)).toBe(false);
  });

  it('food database: no alias points to two foods, cơm gà xối mỡ is ~740 kcal', () => {
    const owner = new Map<string, string>();
    const dup: string[] = [];
    for (const f of FOODS) for (const a of f.aliases) {
      const o = owner.get(a);
      if (o && o !== f.id) dup.push(a + ": " + o + "/" + f.id);
      owner.set(a, f.id);
    }
    expect(dup).toEqual([]);
    expect(computePortion(fromDbFood(FOOD_BY_ID.com_ga_xoi_mo), 1, 'đĩa').kcal).toBe(740);
  });
});

describe('diaryBalance — same "Còn lại" as Today', () => {
  const fit = {
    sex: 'male', birth_date: '1996-01-01', height_cm: 172, activity_level: 'moderate',
    start_weight_kg: 80, calorie_target: 2000, protein_g: 156, carbs_g: 200, fat_g: 62,
  } as unknown as FitProfile;
  const date = '2026-10-08';

  it('matches energyBalance() used by Today for the same day', () => {
    const burn = { workout_kcal: 790, steps: 8700 };
    const b = diaryBalance(fit, 1520, burn, 76.6, date);
    const model = activityModel(fit, 76.6, date);
    expect(model).not.toBeNull();
    expect(b).toEqual(energyBalance({ kcal_in: 1520, ...burn }, 2000, 76.6, model));
    // Only burn above the activity already in the target is credited.
    expect(b.burned).toBe(790 + 381);
    expect(b.bonus).toBeLessThan(b.burned);
    expect(b.remaining).toBe(2000 - 1520 + b.bonus);
  });

  it('credits nothing when burn is below the built-in allowance', () => {
    const b = diaryBalance(fit, 1246, { workout_kcal: 0, steps: 3200 }, 76.6, '2026-10-11');
    expect(b.bonus).toBe(0);
    expect(b.remaining).toBe(754);
  });

  it('falls back to the default target, start weight, and no burn', () => {
    const b = diaryBalance(null, 2100, null, null, date);
    expect(b.target).toBe(2000);
    expect(b.remaining).toBe(-100);
    expect(b.over).toBe(true);
  });
});

describe('search intelligence', () => {
  it('folds synonyms and chat shorthand on both sides', () => {
    expect(searchNorm('Cafe ko đường')).toBe('ca phe khong duong');
    expect(searchNorm('thịt heo')).toBe(searchNorm('thịt lợn'));
    expect(searchNorm('đậu hũ')).toBe('dau phu');
    expect(searchNorm('Hồng chín')).toBe('hong chin'); // not "khong"
    expect(searchFoods('cafe sua da', ALL)[0].name).toBe('Cà phê sữa đá');
    expect(searchFoods('thit heo nuong', ALL)[0].name).toBe('Thịt lợn nướng');
    expect(searchFoods('cf ko duong', ALL)[0].name).toBe('Cà phê đen không đường');
  });

  it('finds Vietnamese names typed without diacritics', () => {
    expect(searchFoods('pho', ALL)[0].name.startsWith('Phở')).toBe(true);
    expect(searchFoods('banh mi', ALL).slice(0, 3).map((o) => o.name)).toContain('Bánh mì thịt');
    expect(searchFoods('banh mi thit', ALL)[0].name).toBe('Bánh mì thịt');
  });

  it('boosts frequently logged foods within the recent set', () => {
    const a = fromEntry(entry({ name: 'Bún cá' }));
    const b = fromEntry(entry({ name: 'Bún chả' }));
    const base = searchFoods('bun', [a, b], { recentKeys: [a.key, b.key] });
    expect(base[0].key).toBe(a.key);
    const freq = searchFoods('bun', [a, b], { recentKeys: [a.key, b.key], frequency: new Map([[b.key, 8]]) });
    expect(freq[0].key).toBe(b.key);
  });

  it('counts how often each recent food was logged', () => {
    const rows = [
      entry({ id: '1', created_at: '2026-10-09T01:00:00Z' }),
      entry({ id: '2', eaten_on: '2026-10-08', created_at: '2026-10-08T01:00:00Z' }),
      entry({ id: '3', name: 'Cơm trắng', unit: 'bát', grams: 150, kcal: 195 }),
    ];
    const r = recentFoods(rows, FOODS);
    const pho = r.find((x) => x.option.key === 'db:pho_bo')!;
    expect(pho.count).toBe(2);
    expect(frequencyByKey(r).get('db:com_trang')).toBe(1);
  });

  it('highlights query words at word starts, keeping original text', () => {
    const parts = highlightParts('Bánh mì thịt', 'banh thit');
    expect(parts.map((p) => p.text).join('')).toBe('Bánh mì thịt');
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['Bánh', 'thịt']);
    // Mid-word matches are not marked; đ folds to d.
    expect(highlightParts('Đậu phụ', 'dau').filter((p) => p.hit).map((p) => p.text)).toEqual(['Đậu']);
    expect(highlightParts('Cà phê', 'he').some((p) => p.hit)).toBe(false);
    expect(highlightParts('Phở', '')).toEqual([{ text: 'Phở', hit: false }]);
  });
});

describe('diary helpers', () => {
  it('entryToInsert drops id / owner / timestamps', () => {
    const ins = entryToInsert(entry({ photo_path: 'u/meals/x.webp' }));
    expect(ins).not.toHaveProperty('id');
    expect(ins).not.toHaveProperty('user_id');
    expect(ins).not.toHaveProperty('created_at');
    expect(ins.photo_path).toBe('u/meals/x.webp');
    expect(ins.kcal).toBe(450);
  });

  it('copyEntries re-dates (and optionally re-meals) in logged order', () => {
    const rows = [entry({ id: 'b', created_at: '2026-10-09T06:00:00Z', name: 'B' }), entry({ id: 'a', created_at: '2026-10-09T05:00:00Z', name: 'A' })];
    const out = copyEntries(rows, '2026-10-10', 'dinner');
    expect(out.map((x) => x.name)).toEqual(['A', 'B']);
    expect(out.every((x) => x.eaten_on === '2026-10-10' && x.meal === 'dinner')).toBe(true);
    expect(copyEntries(rows, '2026-10-10')[0].meal).toBe('lunch');
  });

  it('sortByLogged keeps an edited entry in place', () => {
    const rows = [entry({ id: 'x', created_at: '2026-10-09T07:00:00Z' }), entry({ id: 'y', created_at: '2026-10-09T05:00:00Z' })];
    expect(sortByLogged(rows).map((r) => r.id)).toEqual(['y', 'x']);
  });
});

describe('saved food serving labels', () => {
  const base: CustomFood = {
    id: 'cf1',
    user_id: 'u',
    name: 'Sữa tươi',
    brand: null,
    serving_label: '250 ml',
    serving_grams: 250,
    kcal_100g: 60,
    protein_100g: 3,
    carbs_100g: 5,
    fat_100g: 3,
    fiber_100g: 0,
    source: 'manual',
    photo_path: null,
    use_count: 0,
    last_used_at: null,
    default_meal: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

  it('a weight / volume label becomes unit g / ml with the serving as the quantity (not a unit called "100 g")', () => {
    const o = fromCustomFood(base);
    expect(o.defaultUnit).toBe('ml');
    expect(o.units).toEqual([{ unit: 'ml', grams: 1 }]);
    expect(defaultPortion(o)).toEqual({ quantity: 250, unit: 'ml' });
    const row = toNewEntry(o, 250, 'ml', 'snack', '2026-10-09');
    expect(row.unit).toBe('ml');
    expect(row.kcal).toBe(150);
    expect(unitOptions(o).map((u) => u.unit)).toEqual(['ml']);

    const g = fromCustomFood({ ...base, serving_label: '100 g', serving_grams: 100 });
    expect(g.defaultUnit).toBe('g');
    expect(defaultPortion(g)).toEqual({ quantity: 100, unit: 'g' });
    expect(fromCustomFood({ ...base, serving_label: '30gr', serving_grams: 30 }).defaultUnit).toBe('g');
  });

  it('a counted label keeps its count: "2 lát" = 2 lát, grams per lát', () => {
    const o = fromCustomFood({ ...base, serving_label: '2 lát', serving_grams: 60 });
    expect(o.units).toEqual([{ unit: 'lát', grams: 30 }]);
    expect(defaultPortion(o)).toEqual({ quantity: 2, unit: 'lát' });
    expect(toNewEntry(o, 2, 'lát', 'snack', '2026-10-09').grams).toBe(60);
    const bowl = fromCustomFood({ ...base, serving_label: '1 bát', serving_grams: 300 });
    expect(defaultPortion(bowl)).toEqual({ quantity: 1, unit: 'bát' });
    expect(defaultPortion(fromCustomFood({ ...base, serving_label: '1 phần', serving_grams: 300 }))).toEqual({ quantity: 1, unit: 'phần' });
  });

  it('opens on the amount usually eaten (default_servings) and keeps the usual meal', () => {
    const bowl = fromCustomFood({ ...base, serving_label: '1 bát', serving_grams: 300, default_servings: 2, default_meal: 'lunch' });
    expect(defaultPortion(bowl)).toEqual({ quantity: 2, unit: 'bát' });
    expect(bowl.defaultMeal).toBe('lunch');
    expect(toNewEntry(bowl, 2, 'bát', 'lunch', '2026-10-09').grams).toBe(600);
    const slices = fromCustomFood({ ...base, serving_label: '2 lát', serving_grams: 60, default_servings: 1.5 });
    expect(defaultPortion(slices)).toEqual({ quantity: 3, unit: 'lát' });
    const milk = fromCustomFood({ ...base, default_servings: 0.5 });
    expect(defaultPortion(milk)).toEqual({ quantity: 125, unit: 'ml' });
    // Unknown / invalid → one serving, as before.
    expect(defaultPortion(fromCustomFood({ ...base, serving_label: '1 bát', serving_grams: 300, default_servings: null }))).toEqual({ quantity: 1, unit: 'bát' });
  });

  it('per-100 g values keep 2 decimals so one serving re-logs as typed', () => {
    const per = per100FromServing({ kcal: 650, protein: 35, carbs: 70, fat: 20, fiber: 4 }, 450);
    expect(per.protein).toBe(7.78);
    const back = perServingFromPer100(per, 450);
    expect(back.kcal).toBe(650);
    expect(back.protein).toBe(35);
  });
});
