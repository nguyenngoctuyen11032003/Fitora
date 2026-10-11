import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FACTORS,
  bmiCategory,
  calcAge,
  calcBMI,
  calcBMR,
  calcTDEE,
  goalCalories,
  isCalorieFloored,
  macroKcal,
  proteinReferenceKg,
  metKcal,
  remainingKcal,
  scalePer100,
  stepsKcal,
  suggestMacros,
} from './energy';
import { addDays, rangeDays, startOfWeek } from './date';
import { parseDecimal } from './format';

describe('calcAge', () => {
  it('counts whole years and respects birthdays not yet reached', () => {
    const on = new Date(2026, 9, 9); // 9 Oct 2026
    expect(calcAge('1996-10-09', on)).toBe(30);
    expect(calcAge('1996-10-10', on)).toBe(29);
    expect(calcAge('1996-01-01', on)).toBe(30);
    expect(calcAge('bad', on)).toBe(0);
  });
});

describe('BMI', () => {
  it('computes kg/m² with one decimal', () => {
    expect(calcBMI(70, 175)).toBe(22.9);
    expect(calcBMI(0, 175)).toBe(0);
  });
  it('uses Asian cut-offs', () => {
    expect(bmiCategory(18.4).key).toBe('underweight');
    expect(bmiCategory(18.5).key).toBe('normal');
    expect(bmiCategory(22.9).key).toBe('normal');
    expect(bmiCategory(23).key).toBe('overweight');
    expect(bmiCategory(24.9).key).toBe('overweight');
    expect(bmiCategory(25).key).toBe('obese');
    expect(bmiCategory(23).label).toBe('Thừa cân');
  });
});

describe('BMR / TDEE', () => {
  it('Mifflin–St Jeor', () => {
    // male 70 kg, 175 cm, 30 y: 700 + 1093.75 − 150 + 5 = 1648.75
    expect(calcBMR('male', 70, 175, 30)).toBe(1649);
    // female 60 kg, 165 cm, 25 y: 600 + 1031.25 − 125 − 161 = 1345.25
    expect(calcBMR('female', 60, 165, 25)).toBe(1345);
  });
  it('activity factors', () => {
    expect(ACTIVITY_FACTORS.sedentary).toBe(1.2);
    expect(ACTIVITY_FACTORS.very_active).toBe(1.9);
    expect(calcTDEE(1649, 'moderate')).toBe(Math.round(1649 * 1.55));
  });
});

describe('goalCalories', () => {
  it('applies deficits / surplus', () => {
    expect(goalCalories(2500, 'lose', 'slow', 'male')).toBe(2250);
    expect(goalCalories(2500, 'lose', 'medium', 'male')).toBe(2000);
    expect(goalCalories(2500, 'lose', 'fast', 'male')).toBe(1750);
    expect(goalCalories(2500, 'lose', null, 'male')).toBe(2000);
    expect(goalCalories(2500, 'gain', null, 'male')).toBe(2800);
    expect(goalCalories(2500, 'recomp', null, 'male')).toBe(2250);
    expect(goalCalories(2500, 'maintain', null, 'male')).toBe(2500);
  });
  it('never goes below the floor', () => {
    expect(goalCalories(1500, 'lose', 'fast', 'female')).toBe(1200);
    expect(goalCalories(1800, 'lose', 'fast', 'male')).toBe(1500);
  });
  it('a deficit goal never becomes a surplus when TDEE is below the floor', () => {
    // small, older, sedentary woman: TDEE 1014 < 1200 floor
    expect(goalCalories(1014, 'lose', 'medium', 'female')).toBe(1010);
    expect(goalCalories(1014, 'recomp', null, 'female')).toBe(1010);
    expect(goalCalories(1400, 'lose', 'medium', 'male')).toBe(1400);
    // non-deficit goals still respect the floor
    expect(goalCalories(1014, 'maintain', null, 'female')).toBe(1200);
    expect(goalCalories(1014, 'gain', null, 'female')).toBe(1310);
  });
  it('never proposes less than 800 kcal (DB bound), even for a tiny TDEE', () => {
    // 30 kg, 120 cm, 100 y, sedentary woman: BMR 389 → TDEE 467
    const tdee = calcTDEE(calcBMR('female', 30, 120, 100), 'sedentary');
    expect(tdee).toBeLessThan(800);
    for (const g of ['lose', 'recomp', 'maintain', 'gain'] as const) {
      expect(goalCalories(tdee, g, 'fast', 'female')).toBeGreaterThanOrEqual(800);
    }
    expect(isCalorieFloored(tdee, 'lose', 'medium', 'female')).toBe(true);
  });
  it('never proposes more than 6000 kcal (DB bound)', () => {
    const tdee = calcTDEE(calcBMR('male', 300, 230, 20), 'very_active');
    expect(tdee).toBeGreaterThan(6000);
    expect(goalCalories(tdee, 'gain', null, 'male')).toBe(6000);
    expect(goalCalories(tdee, 'maintain', null, 'male')).toBe(6000);
  });
  it('isCalorieFloored flags a shrunken deficit', () => {
    expect(isCalorieFloored(2500, 'lose', 'medium', 'male')).toBe(false);
    expect(isCalorieFloored(1800, 'lose', 'fast', 'male')).toBe(true);
    expect(isCalorieFloored(1300, 'recomp', null, 'female')).toBe(true);
    expect(isCalorieFloored(1000, 'gain', null, 'female')).toBe(false);
  });
});

describe('suggestMacros', () => {
  it('protein by g/kg, fat 25–30%, rest carbs', () => {
    const m = suggestMacros(2000, 'lose', 70);
    expect(m.protein_g).toBe(140);
    expect(m.fat_g).toBe(Math.round((2000 * 0.25) / 9));
    expect(m.carbs_g).toBe(Math.round((2000 - 140 * 4 - m.fat_g * 9) / 4));
    expect(Math.abs(macroKcal(m) - 2000)).toBeLessThan(10);
  });
  it('per-goal protein factors', () => {
    expect(suggestMacros(2500, 'recomp', 80).protein_g).toBe(176);
    expect(suggestMacros(2800, 'gain', 80).protein_g).toBe(144);
    expect(suggestMacros(2500, 'maintain', 80).protein_g).toBe(128);
    expect(suggestMacros(2500, 'maintain', 80).fat_g).toBe(Math.round(750 / 9));
  });
  it('macro kcal add up to the target (±2) across goals and sizes', () => {
    for (const goal of ['lose', 'gain', 'maintain', 'recomp'] as const) {
      for (const kcal of [1200, 1500, 1830, 2210, 3170]) {
        for (const kg of [45, 70, 95]) {
          const m = suggestMacros(kcal, goal, kg, 170);
          expect(Math.abs(macroKcal(m) - kcal)).toBeLessThanOrEqual(2);
        }
      }
    }
  });
  it('bases protein on the BMI-25 weight when overweight', () => {
    // 172 cm → BMI 25 at 73.96 kg
    expect(proteinReferenceKg(120, 172)).toBeCloseTo(73.96, 2);
    expect(proteinReferenceKg(60, 172)).toBe(60);
    expect(proteinReferenceKg(80, null)).toBe(80);
    expect(suggestMacros(2400, 'lose', 120, 172).protein_g).toBe(148);
    expect(suggestMacros(2400, 'lose', 60, 172).protein_g).toBe(120);
  });
  it('never returns negative carbs', () => {
    const m = suggestMacros(1200, 'recomp', 150);
    expect(m.carbs_g).toBeGreaterThanOrEqual(0);
    expect(macroKcal(m)).toBeLessThanOrEqual(1210);
  });
});

describe('activity energy', () => {
  it('metKcal = MET·3.5·kg/200·min', () => {
    expect(metKcal(8, 70, 30)).toBe(Math.round(((8 * 3.5 * 70) / 200) * 30)); // 294
    expect(metKcal(8, 70, 0)).toBe(0);
  });
  it('stepsKcal = steps·0.04·kg/70', () => {
    expect(stepsKcal(10000, 70)).toBe(400);
    expect(stepsKcal(8000, 56)).toBe(256);
    expect(stepsKcal(-5, 70)).toBe(0);
  });
  it('remainingKcal = target − eaten + burned', () => {
    expect(remainingKcal(2000, 1500, 300)).toBe(800);
    expect(remainingKcal(2000, 2600, 0)).toBe(-600);
  });
  it('scalePer100', () => {
    expect(scalePer100(130, 150)).toBe(195);
    expect(scalePer100(2.5, 150)).toBe(3.8);
  });
});

describe('date helpers', () => {
  it('startOfWeek is Monday', () => {
    expect(startOfWeek('2026-10-09')).toBe('2026-10-05'); // Fri → Mon
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // Sun → Mon
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });
  it('addDays crosses months / years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('rangeDays inclusive', () => {
    expect(rangeDays('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(rangeDays('2026-10-03', '2026-10-01')).toEqual([]);
  });
});

describe('parseDecimal', () => {
  it('accepts vi and en formats', () => {
    expect(parseDecimal('68,5')).toBe(68.5);
    expect(parseDecimal('68.5')).toBe(68.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
});
