import { describe, expect, it } from 'vitest';
import { macroKcal } from '@/lib/energy';
import type { FitProfile } from '@/types/db';
import {
  EMPTY_DRAFT,
  applyPatch,
  PACE_KG_WEEK,
  bmiGaugePos,
  computePlan,
  draftToPatch,
  hasErrors,
  kgPerWeek,
  macroPercents,
  profileToDraft,
  scaleMacrosToKcal,
  setMacro,
  suggestSteps,
  suggestWater,
  validateBasics,
  validateBody,
  validateGoal,
  validatePlan,
  birthDateBounds,
  goalWarnings,
  patchDiff,
  savedPatch,
  MAX_ETA_WEEKS,
  SEX_DEFAULTS,
  firstInvalidStep,
  hasDefaultBody,
  previewPlan,
  sanitizeDraft,
  targetDateLabel,
  suggestTargetWeight,
  type GoalDraft,
} from './logic';

const TODAY = new Date(2026, 9, 9);
const draft: GoalDraft = {
  ...EMPTY_DRAFT,
  sex: 'male',
  birth_date: '1996-01-15',
  height_cm: 175,
  weight_kg: 80,
  activity_level: 'moderate',
  goal: 'lose',
  goal_pace: 'medium',
  target_weight_kg: 72,
};

describe('computePlan', () => {
  it('returns null for incomplete drafts', () => {
    expect(computePlan(EMPTY_DRAFT, TODAY)).toBeNull();
  });

  it('computes BMI, BMR, TDEE and target', () => {
    const p = computePlan(draft, TODAY)!;
    expect(p.age).toBe(30);
    expect(p.bmi).toBe(26.1);
    expect(p.bmiKey).toBe('obese');
    // 10*80 + 6.25*175 - 5*30 + 5 = 1748.75 → 1749
    expect(p.bmr).toBe(1749);
    expect(p.tdee).toBe(Math.round(1749 * 1.55));
    expect(p.kcal).toBe(Math.round((p.tdee - 500) / 10) * 10);
    expect(p.custom).toBe(false);
    expect(p.delta).toBeLessThan(0);
    expect(p.weeksToTarget).toBeGreaterThan(0);
  });

  it('uses the manual override when present', () => {
    const p = computePlan({ ...draft, custom: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 } }, TODAY)!;
    expect(p.kcal).toBe(2000);
    expect(p.custom).toBe(true);
    expect(p.macros.protein_g).toBe(150);
  });

  it('no ETA when the balance points away from the target', () => {
    const p = computePlan({ ...draft, goal: 'gain', target_weight_kg: 70 }, TODAY)!;
    expect(p.weeksToTarget).toBeNull();
  });
});

describe('macro editing', () => {
  it('scaleMacrosToKcal keeps 4/4/9 consistent', () => {
    const s = scaleMacrosToKcal({ protein_g: 160, carbs_g: 200, fat_g: 60 }, 2400);
    expect(s.kcal).toBe(2400);
    expect(Math.abs(macroKcal(s) - 2400)).toBeLessThanOrEqual(4);
  });

  it('scaleMacrosToKcal clamps to DB range', () => {
    expect(scaleMacrosToKcal({ protein_g: 100, carbs_g: 100, fat_g: 50 }, 100).kcal).toBe(800);
  });

  it('setMacro recomputes kcal', () => {
    const s = setMacro({ protein_g: 100, carbs_g: 200, fat_g: 50 }, 'fat_g', 60);
    expect(s.fat_g).toBe(60);
    expect(s.kcal).toBe(100 * 4 + 200 * 4 + 60 * 9);
  });

  it('macroPercents sums to ~100', () => {
    const p = macroPercents({ protein_g: 150, carbs_g: 200, fat_g: 60 });
    expect(p.protein_g + p.carbs_g + p.fat_g).toBeGreaterThanOrEqual(99);
    expect(p.protein_g + p.carbs_g + p.fat_g).toBeLessThanOrEqual(101);
  });
  it('macroPercents always totals exactly 100 (largest remainder)', () => {
    // 36.6 / 38.6 / 24.7 would round to 37 + 39 + 25 = 101
    const p = macroPercents({ protein_g: 110, carbs_g: 116, fat_g: 33 });
    expect(p.protein_g + p.carbs_g + p.fat_g).toBe(100);
    for (let pr = 20; pr <= 200; pr += 7)
      for (let c = 20; c <= 400; c += 13)
        for (let f = 10; f <= 120; f += 5) {
          const q = macroPercents({ protein_g: pr, carbs_g: c, fat_g: f });
          expect(q.protein_g + q.carbs_g + q.fat_g).toBe(100);
        }
    expect(macroPercents({ protein_g: 0, carbs_g: 0, fat_g: 0 })).toEqual({ protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('helpers', () => {
  it('kg per week', () => {
    expect(kgPerWeek(500)).toBe(0.45);
    expect(PACE_KG_WEEK.slow).toBeLessThan(PACE_KG_WEEK.fast);
  });
  it('water and steps', () => {
    expect(suggestWater(60, 'light')).toBe(2100);
    expect(suggestWater(200, 'active')).toBe(4000);
    expect(suggestSteps('moderate', 'lose')).toBe(10000);
  });
  it('bmi gauge position is clamped', () => {
    expect(bmiGaugePos(10)).toBe(0);
    expect(bmiGaugePos(25)).toBe(0.5);
    expect(bmiGaugePos(50)).toBe(1);
  });
});

describe('validation', () => {
  it('basics', () => {
    expect(hasErrors(validateBasics(EMPTY_DRAFT, TODAY))).toBe(true);
    expect(validateBasics({ ...draft, birth_date: '2020-01-01' }, TODAY).birth_date).toBeTruthy();
    expect(hasErrors(validateBasics(draft, TODAY))).toBe(false);
  });
  it('body', () => {
    expect(validateBody({ ...draft, height_cm: 50 }).height).toBeTruthy();
    expect(hasErrors(validateBody(draft))).toBe(false);
  });
  it('goal target direction', () => {
    expect(validateGoal({ ...draft, target_weight_kg: 85 }).target).toBeTruthy();
    expect(validateGoal({ ...draft, goal: 'gain', target_weight_kg: 75 }).target).toBeTruthy();
    expect(hasErrors(validateGoal({ ...draft, goal: 'maintain', target_weight_kg: 999 }))).toBe(false);
  });
});

describe('profile round-trip', () => {
  it('draftToPatch → profileToDraft keeps suggestion mode', () => {
    const plan = computePlan(draft, TODAY)!;
    const patch = draftToPatch(draft, plan);
    expect(patch.goal_pace).toBe('medium');
    expect(patch.macro_custom).toBe(false);
    const row = { ...patch, user_id: 'u', start_weight_kg: 80, onboarded_at: 'x', created_at: '', updated_at: '' } as FitProfile;
    const back = profileToDraft(row, 80);
    expect(back.custom).toBeNull();
    expect(back.weight_kg).toBe(80);
  });
  it('maintain drops pace and target', () => {
    const d = { ...draft, goal: 'maintain' as const };
    const patch = draftToPatch(d, computePlan(d, TODAY)!);
    expect(patch.goal_pace).toBeNull();
    expect(patch.target_weight_kg).toBeNull();
  });
});

describe('applyPatch', () => {
  const custom = { ...draft, custom: { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 }, water_ml: 3000, steps: 5000 };
  it('drops overrides when an input changes', () => {
    const n = applyPatch(custom, { goal: 'gain' });
    expect(n.custom).toBeNull();
    expect(n.water_ml).toBeNull();
    expect(n.steps).toBeNull();
  });
  it('keeps overrides for unrelated or identical changes', () => {
    expect(applyPatch(custom, { target_weight_kg: 70 }).custom).not.toBeNull();
    expect(applyPatch(custom, { goal: 'lose' }).custom).not.toBeNull();
  });
});

describe('hardening (release audit)', () => {
  it('protein for an overweight user is based on the BMI-25 weight', () => {
    const p = computePlan({ ...draft, weight_kg: 120 }, TODAY)!;
    // 175 cm → BMI 25 at 76.56 kg → 2.0 g/kg = 153 g (not 240 g)
    expect(p.suggested.protein_g).toBe(153);
    expect(Math.abs(macroKcal(p.suggested) - p.suggested.kcal)).toBeLessThanOrEqual(2);
  });

  it('a "lose" plan for a tiny, sedentary body never becomes a surplus', () => {
    const tiny: GoalDraft = { ...draft, sex: 'female', birth_date: '1955-01-01', height_cm: 145, weight_kg: 45, activity_level: 'sedentary', target_weight_kg: null };
    const p = computePlan(tiny, TODAY)!;
    expect(p.kcal).toBeLessThanOrEqual(p.tdee + 5);
    expect(p.floored).toBe(true);
    expect(p.minKcal).toBe(1200);
  });

  it('floored is false for a normal deficit and for custom plans', () => {
    expect(computePlan(draft, TODAY)!.floored).toBe(false);
    const c = computePlan({ ...draft, activity_level: 'sedentary', goal_pace: 'fast', weight_kg: 55, height_cm: 160, custom: { kcal: 1500, protein_g: 110, carbs_g: 170, fat_g: 42 } }, TODAY)!;
    expect(c.floored).toBe(false);
  });

  it('setMacro keeps kcal equal to the 4/4/9 total and validatePlan blocks out-of-range totals', () => {
    const s = setMacro({ protein_g: 20, carbs_g: 50, fat_g: 10 }, 'fat_g', 5);
    expect(s.kcal).toBe(macroKcal(s));
    const p = computePlan({ ...draft, custom: s }, TODAY)!;
    expect(validatePlan(p).plan).toMatch(/800/);
    expect(validatePlan(computePlan(draft, TODAY))).toEqual({});
  });

  it('scaleMacrosToKcal respects the 1000 g per-macro cap', () => {
    const s = scaleMacrosToKcal({ protein_g: 50, carbs_g: 400, fat_g: 10 }, 6000);
    expect(s.carbs_g).toBeLessThanOrEqual(1000);
    expect(s.kcal).toBe(macroKcal(s));
  });

  it('draftToPatch clamps water / steps to the allowed range', () => {
    const d = { ...draft, water_ml: 2, steps: 999999 };
    const patch = draftToPatch(d, computePlan(d, TODAY)!);
    expect(patch.water_target_ml).toBe(500);
    expect(patch.step_target).toBe(50000);
  });

  it('a suggested (non-custom) saved plan is recomputed from the latest weight', () => {
    const row = {
      user_id: 'u', sex: 'male', birth_date: '1996-01-15', height_cm: 175, activity_level: 'moderate', goal: 'lose', goal_pace: 'medium',
      start_weight_kg: 80, target_weight_kg: 72, calorie_target: 2000, protein_g: 156, carbs_g: 200, fat_g: 62, macro_custom: false,
      water_target_ml: 2800, step_target: 10000, onboarded_at: 'x', created_at: '', updated_at: '',
    } as FitProfile;
    const d = profileToDraft(row, 76, TODAY);
    expect(d.custom).toBeNull();
    expect(d.weight_kg).toBe(76);
    const plan = computePlan(d, TODAY)!;
    const diff = patchDiff(draftToPatch(d, plan), savedPatch(row));
    expect(diff).toContain('calorie_target');
    // A manual plan is kept as-is.
    const m = profileToDraft({ ...row, macro_custom: true }, 76, TODAY);
    expect(m.custom).toEqual({ kcal: 2000, protein_g: 156, carbs_g: 200, fat_g: 62 });
  });

  it('round-trip of a freshly saved profile has no diff', () => {
    const plan = computePlan(draft, TODAY)!;
    const patch = draftToPatch(draft, plan);
    const row = { ...patch, user_id: 'u', start_weight_kg: 80, onboarded_at: 'x', created_at: '', updated_at: '' } as FitProfile;
    const back = profileToDraft(row, 80, TODAY);
    expect(patchDiff(draftToPatch(back, computePlan(back, TODAY)!), savedPatch(row))).toEqual([]);
  });

  it('switching goal drops a contradicting target', () => {
    expect(applyPatch(draft, { goal: 'gain' }).target_weight_kg).toBeNull(); // 72 < 80
    expect(applyPatch({ ...draft, goal: 'gain', target_weight_kg: 85 }, { goal: 'lose' }).target_weight_kg).toBeNull();
    expect(applyPatch(draft, { goal: 'recomp' }).target_weight_kg).toBe(72);
  });

  it('target direction messages tell the user what to do', () => {
    expect(validateGoal({ ...draft, target_weight_kg: 85 }).target).toMatch(/Giữ cân/);
  });

  it('birth date: future / impossible dates and bounds', () => {
    expect(validateBasics({ ...draft, birth_date: '2027-01-01' }, TODAY).birth_date).toMatch(/tương lai/);
    expect(validateBasics({ ...draft, birth_date: '2000-02-31' }, TODAY).birth_date).toBeTruthy();
    const b = birthDateBounds(TODAY);
    expect(b.max).toBe('2013-10-09');
    expect(hasErrors(validateBasics({ ...draft, birth_date: b.max }, TODAY))).toBe(false);
    expect(hasErrors(validateBasics({ ...draft, birth_date: b.min }, TODAY))).toBe(false);
    expect(hasErrors(validateBasics({ ...draft, birth_date: addDaysIso(b.min, -1) }, TODAY))).toBe(true);
  });

  it('health warnings for underweight losing / too-low targets', () => {
    expect(goalWarnings({ ...draft, weight_kg: 50, target_weight_kg: 48 })).toHaveLength(1); // BMI 16.3
    expect(goalWarnings({ ...draft, target_weight_kg: 52 })[0]).toMatch(/dưới ngưỡng/); // BMI 17
    expect(goalWarnings(draft)).toEqual([]);
  });
});

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

describe('formula reference values (Mifflin–St Jeor, Harris activity factors)', () => {
  it('male 30y 175 cm 80 kg moderate: BMR 1749, TDEE 2711, lose medium 2210', () => {
    // 10·80 + 6.25·175 − 5·30 + 5 = 1748.75 → 1749 ; ×1.55 = 2710.95 → 2711
    const p = computePlan({ ...draft, birth_date: '1996-01-15' }, TODAY)!;
    expect(p.age).toBe(30);
    expect(p.bmr).toBe(1749);
    expect(p.tdee).toBe(2711);
    expect(p.kcal).toBe(2210);
    expect(macroKcal(p.macros)).toBeGreaterThanOrEqual(p.kcal - 4);
    expect(macroKcal(p.macros)).toBeLessThanOrEqual(p.kcal + 4);
  });

  it('female floor 1200 / male floor 1500 on a fast cut', () => {
    const f = computePlan({ ...draft, sex: 'female', height_cm: 155, weight_kg: 55, activity_level: 'light', goal_pace: 'fast', target_weight_kg: 50 }, TODAY)!;
    expect(f.kcal).toBe(1200);
    expect(f.floored).toBe(true);
    expect(f.minKcal).toBe(1200);
    const m = computePlan({ ...draft, height_cm: 160, weight_kg: 60, activity_level: 'sedentary', goal_pace: 'fast', target_weight_kg: 55 }, TODAY)!;
    expect(m.kcal).toBe(1500);
    expect(m.minKcal).toBe(1500);
  });

  it('pace labels match 7700 kcal/kg', () => {
    expect(PACE_KG_WEEK).toEqual({ slow: 0.25, medium: 0.45, fast: 0.7 });
  });
});

describe('target ETA', () => {
  it('weeks to target = |Δkg| / (deficit·7/7700), rounded up', () => {
    const p = computePlan(draft, TODAY)!; // deficit 501 kcal, 8 kg
    expect(p.weeksToTarget).toBe(Math.ceil(8 / ((501 * 7) / 7700)));
  });
  it('hides absurd ETAs (> 5 years)', () => {
    // Tiny (60 kcal) deficit vs a 40 kg gap → ~733 weeks.
    const base = { ...draft, sex: 'female' as const, height_cm: 150, weight_kg: 90, activity_level: 'sedentary' as const, target_weight_kg: 50 };
    const tdee = computePlan(base, TODAY)!.tdee;
    const p = computePlan({ ...base, custom: { kcal: tdee - 60, protein_g: 120, carbs_g: 160, fat_g: 54 } }, TODAY)!;
    expect(Math.abs(p.delta)).toBeLessThan(100);
    expect(p.weeksToTarget).toBeNull();
    expect(MAX_ETA_WEEKS).toBe(260);
  });
  it('targetDateLabel formats a month/year', () => {
    expect(targetDateLabel(4, new Date(2026, 9, 9))).toBe('tháng 11/2026');
    expect(targetDateLabel(13, new Date(2026, 11, 1))).toBe('tháng 3/2027');
    expect(targetDateLabel(null)).toBeNull();
    expect(targetDateLabel(0)).toBeNull();
  });
});

describe('live preview & restore', () => {
  it('previewPlan ignores half-typed / out-of-range inputs', () => {
    expect(previewPlan({ ...draft, height_cm: 17 }, TODAY)).toBeNull();
    expect(previewPlan({ ...draft, weight_kg: null }, TODAY)).toBeNull();
    expect(previewPlan({ ...draft, birth_date: '2030-01-01' }, TODAY)).toBeNull();
    expect(previewPlan(draft, TODAY)?.kcal).toBe(computePlan(draft, TODAY)?.kcal);
  });

  it('sanitizeDraft keeps valid fields and drops garbage', () => {
    expect(sanitizeDraft(null)).toBeNull();
    expect(sanitizeDraft('x')).toBeNull();
    expect(sanitizeDraft([])).toBeNull();
    expect(sanitizeDraft(draft)).toEqual(draft);
    const bad = sanitizeDraft({ sex: 'other', birth_date: '2020-02-31', height_cm: 9999, weight_kg: '70', activity_level: 'x', goal: 'lose', goal_pace: 'turbo', target_weight_kg: -3, custom: { kcal: 2000 }, water_ml: 2500, steps: 1 })!;
    expect(bad).toEqual({
      ...EMPTY_DRAFT,
      goal: 'lose',
      water_ml: 2500,
    });
  });

  it('firstInvalidStep points at the earliest broken step', () => {
    expect(firstInvalidStep(draft, TODAY)).toBe(-1);
    expect(firstInvalidStep({ ...draft, sex: null }, TODAY)).toBe(0);
    expect(firstInvalidStep({ ...draft, weight_kg: 10 }, TODAY)).toBe(1);
    expect(firstInvalidStep({ ...draft, activity_level: null }, TODAY)).toBe(2);
    expect(firstInvalidStep({ ...draft, target_weight_kg: 85 }, TODAY)).toBe(3);
  });

  it('sex defaults only replace untouched body values', () => {
    expect(hasDefaultBody(EMPTY_DRAFT)).toBe(true);
    expect(hasDefaultBody({ ...EMPTY_DRAFT, ...SEX_DEFAULTS.female })).toBe(true);
    expect(hasDefaultBody(draft)).toBe(false);
  });

  it('target contradicting the goal is reported in plain Vietnamese', () => {
    expect(validateGoal({ ...draft, goal: 'gain', target_weight_kg: 70 }).target).toMatch(/cao hơn hiện tại/);
    expect(validateGoal({ ...draft, goal: 'maintain', target_weight_kg: 50 })).toEqual({});
    expect(validateGoal({ ...draft, target_weight_kg: 20 }).target).toMatch(/từ 30 đến 300/);
  });
});

describe('suggestTargetWeight (one-tap target)', () => {
  const base = { ...draft, target_weight_kg: null };
  it('lose with a high BMI: first milestone −10 %, or BMI 22,9 when that is closer', () => {
    // 172 cm, 76,6 kg (BMI 25,9): −10 % = 68,94 > BMI-22,9 weight 67,75 → 69
    expect(suggestTargetWeight({ ...base, height_cm: 172, weight_kg: 76.6 })).toMatchObject({ kg: 69 });
    // 175 cm, 74 kg (BMI 24,2): −10 % = 66,6 < 70,13 → BMI 22,9 → 70
    expect(suggestTargetWeight({ ...base, height_cm: 175, weight_kg: 74 })).toMatchObject({ kg: 70 });
  });
  it('lose with a normal BMI: −3 kg but never under BMI 18,5', () => {
    expect(suggestTargetWeight({ ...base, height_cm: 160, weight_kg: 55 })).toMatchObject({ kg: 52 });
    // 160 cm → BMI 18,5 = 47,36 kg; 49 − 3 = 46 → 47,5
    expect(suggestTargetWeight({ ...base, height_cm: 160, weight_kg: 49 })).toMatchObject({ kg: 47.5 });
  });
  it('no suggestion to lose when already underweight', () => {
    expect(suggestTargetWeight({ ...base, height_cm: 170, weight_kg: 52 })).toBeNull();
  });
  it('gain: towards BMI 18,5 when underweight, else +3 kg below BMI 25', () => {
    // 170 cm, 48 kg: +10 % = 52,8 < 53,47 → 53
    expect(suggestTargetWeight({ ...base, goal: 'gain', height_cm: 170, weight_kg: 48 })).toMatchObject({ kg: 53 });
    // 170 cm, 52 kg: +10 % = 57,2 ≥ 53,47 → BMI 18,5 = 53,5
    expect(suggestTargetWeight({ ...base, goal: 'gain', height_cm: 170, weight_kg: 52 })).toMatchObject({ kg: 53.5 });
    expect(suggestTargetWeight({ ...base, goal: 'gain', height_cm: 170, weight_kg: 62 })).toMatchObject({ kg: 65 });
    // already obese → nothing sensible to suggest
    expect(suggestTargetWeight({ ...base, goal: 'gain', height_cm: 170, weight_kg: 80 })).toBeNull();
  });
  it('only for lose / gain, and the suggestion always passes validation', () => {
    expect(suggestTargetWeight({ ...base, goal: 'maintain' })).toBeNull();
    expect(suggestTargetWeight({ ...base, goal: 'recomp' })).toBeNull();
    for (const goal of ['lose', 'gain'] as const)
      for (let h = 120; h <= 230; h += 7)
        for (let w = 30; w <= 300; w += 3.5) {
          const d = { ...base, goal, height_cm: h, weight_kg: w };
          const s = suggestTargetWeight(d);
          if (s) expect(validateGoal({ ...d, target_weight_kg: s.kg })).toEqual({});
        }
  });
});

describe('plan invariants over the whole input range', () => {
  it('suggested macros always add up to the target (±2 kcal) and the target is savable', () => {
    for (const sex of ['male', 'female'] as const)
      for (const goal of ['lose', 'gain', 'maintain', 'recomp'] as const)
        for (const activity_level of ['sedentary', 'moderate', 'very_active'] as const)
          for (let h = 120; h <= 230; h += 22)
            for (let w = 30; w <= 300; w += 27)
              for (const birth_date of ['2012-01-01', '1990-06-15', '1927-01-01']) {
                const p = computePlan({ ...draft, sex, goal, activity_level, height_cm: h, weight_kg: w, birth_date, target_weight_kg: null }, TODAY)!;
                expect(p).not.toBeNull();
                expect(Math.abs(macroKcal(p.macros) - p.kcal)).toBeLessThanOrEqual(2);
                expect(p.kcal).toBeGreaterThanOrEqual(800);
                expect(p.kcal).toBeLessThanOrEqual(6000);
                expect(validatePlan(p)).toEqual({});
                // a deficit goal is never a surplus unless TDEE is under the 800 kcal hard minimum
                if ((goal === 'lose' || goal === 'recomp') && p.tdee >= 800) expect(p.kcal).toBeLessThanOrEqual(Math.round(p.tdee / 10) * 10);
              }
  });
});
