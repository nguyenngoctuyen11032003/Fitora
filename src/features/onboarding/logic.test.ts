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
