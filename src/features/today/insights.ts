// Rule-based coaching lines for the Today dashboard ("Nhận xét"). Pure; tested in insights.test.ts.
import { metKcal } from '@/lib/energy';
import { formatNumber } from '@/lib/format';
import type { MealType } from '@/types/db';

export type InsightTone = 'good' | 'warn' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
  /** Higher = shown first. */
  priority: number;
}

export interface InsightInput {
  /** Local hour 0–23. */
  hour: number;
  kcalTarget: number;
  eaten: number;
  /** target − eaten + burned */
  remaining: number;
  protein: number;
  proteinTarget: number;
  fat: number;
  fatTarget: number;
  fiber: number;
  fiberTarget: number;
  water: number;
  waterTarget: number;
  steps: number;
  stepTarget: number;
  /** Number of meal entries logged today. */
  mealCount: number;
  weightKg: number;
  /** Titles of workouts still planned today. */
  plannedWorkouts: string[];
  doneWorkouts: number;
  /** Meal slots that already have at least one entry today (optional). */
  loggedMeals?: MealType[];
  /**
   * Activity kcal still to burn before extra activity raises the budget (the part of the
   * activity level's built-in allowance not yet used up today). Optional, default 0.
   */
  uncreditedActivity?: number;
  /** Consecutive days with meals logged, today included once it has a meal (optional). */
  loggingStreak?: number;
  /** Consecutive days the water target was reached, today included once reached (optional). */
  waterStreak?: number;
}

const n0 = (v: number) => formatNumber(v, 0);
const roundUpTo = (v: number, step: number) => Math.max(step, Math.ceil(v / step) * step);
/** Gap between two displayed (rounded) values, so the text matches the macro cards. */
const shownGap = (a: number, b: number) => Math.round(a || 0) - Math.round(b || 0);
/** MET of brisk walking, used for "walk it off" suggestions. */
const BRISK_WALK_MET = 3.5;
/** Longest walk we would seriously suggest to compensate an overrun. */
const MAX_WALK_MIN = 60;
/** An overrun this small is within logging noise: no warning, no "walk it off". */
const SLIGHT_OVER_KCAL = 50;
/** Protein per gram of cooked chicken breast (≈ 31 g / 100 g), for a concrete suggestion. */
const CHICKEN_PROTEIN_PER_G = 0.31;
/** After this hour we stop suggesting walks / big amounts of water — it is time to rest. */
const LATE_HOUR = 21;
/** Streak lengths that get a celebratory line. */
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100];

/** True between 22:00 and 03:59. */
export const isLateNight = (hour: number) => hour >= 22 || hour < 4;

/** Grams of chicken breast that cover a protein gap (nearest 10 g, min 50). */
export function chickenGramsFor(proteinGap: number): number {
  if (!(proteinGap > 0)) return 0;
  return Math.max(50, Math.round(proteinGap / CHICKEN_PROTEIN_PER_G / 10) * 10);
}

/** How much water should be drunk by `hour` (linear 07:00 → 21:00). */
export function expectedWaterByHour(target: number, hour: number): number {
  const ratio = Math.max(0, Math.min(1, (hour - 7) / 14));
  return target * ratio;
}

/** Minutes of brisk walking needed to burn `kcal` (nearest 5, min 10); 0 if unknown. */
export function walkMinutesFor(kcal: number, weightKg: number): number {
  const perMin = metKcal(BRISK_WALK_MET, weightKg, 60) / 60;
  if (!(perMin > 0) || !(kcal > 0)) return 0;
  return Math.max(10, Math.round(kcal / perMin / 5) * 5);
}

/** All applicable insights, highest priority first (always at least one). */
export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const add = (id: string, tone: InsightTone, priority: number, text: string) => out.push({ id, tone, priority, text });
  const ws = Math.max(0, Math.floor(i.waterStreak ?? 0));

  // Calories
  if (i.remaining < 0 && -i.remaining <= SLIGHT_OVER_KCAL) {
    add('kcal-slight', 'info', 54, `Vượt nhẹ ${n0(-i.remaining)} kcal — gần như đúng mục tiêu, không cần bù gì thêm.`);
  } else if (i.remaining < 0) {
    const over = -i.remaining;
    // Extra activity only raises the budget once the activity already in the target is used up.
    const minutes = walkMinutesFor(over + Math.max(0, i.uncreditedActivity ?? 0), i.weightKg);
    let text: string;
    if (minutes > 0 && minutes <= MAX_WALK_MIN && i.hour < LATE_HOUR && !isLateNight(i.hour)) {
      text = `Đã vượt ${n0(over)} kcal. Đi bộ nhanh khoảng ${minutes} phút là bù lại được.`;
    } else if (i.hour < 17) {
      text = `Đã vượt ${n0(over)} kcal. Các bữa còn lại hãy ưu tiên rau xanh và đạm nạc, bớt cơm và đồ chiên.`;
    } else {
      text = `Đã vượt ${n0(over)} kcal so với mục tiêu. Không sao — mai quay lại nhịp, đừng nhịn bữa để bù.`;
    }
    add('kcal-over', 'warn', 90, text);
  } else if (i.eaten > 0 && i.remaining <= 150 && i.hour >= 17) {
    add(
      'kcal-close',
      'good',
      55,
      i.remaining <= 20
        ? 'Vừa chạm mục tiêu calo hôm nay — dừng ở đây là đẹp.'
        : `Chỉ còn ${n0(i.remaining)} kcal — bạn đang bám sát mục tiêu calo.`,
    );
  }

  // Meals logged / not logged
  if (i.mealCount === 0) {
    if (i.hour >= 10) add('no-meals', 'info', 85, 'Chưa có bữa nào được ghi. Scan bữa gần nhất để AI tính calo giúp bạn.');
    else if (i.hour >= 4) add('morning', 'info', 20, 'Ngày mới bắt đầu — uống một cốc nước và ghi bữa sáng nhé.');
  } else if (i.loggedMeals && i.hour >= 19 && !i.loggedMeals.includes('dinner') && i.remaining >= 300) {
    // Evening and dinner not logged yet: say how much room is left for it.
    add('dinner-open', 'info', 62, `Chưa ghi bữa tối — bạn còn ${n0(i.remaining)} kcal cho bữa tối.`);
  } else if (i.hour >= 20 && i.kcalTarget > 0 && i.eaten < i.kcalTarget * 0.5) {
    add(
      'kcal-low',
      'info',
      52,
      `Hôm nay mới nạp ${n0(i.eaten)} kcal, chưa tới một nửa mục tiêu. Ăn quá ít dễ mất cơ và khó duy trì lâu dài.`,
    );
  }

  // Protein
  const proteinGap = shownGap(i.proteinTarget, i.protein);
  if (i.proteinTarget > 0 && i.mealCount > 0 && proteinGap > 0) {
    const ratio = i.protein / i.proteinTarget;
    const behind = (i.hour >= 14 && ratio < 0.6) || (i.hour >= 19 && ratio < 0.85);
    if (behind) {
      const chicken = chickenGramsFor(proteinGap);
      const hint =
        proteinGap >= 15 && chicken <= 300
          ? `khoảng ${n0(chicken)} g ức gà, hoặc trứng, cá, đậu phụ`
          : 'ức gà, trứng, cá hoặc đậu phụ';
      add('protein-low', 'warn', 75, `Còn thiếu ${n0(proteinGap)} g đạm — thêm ${hint} vào bữa tới.`);
    }
  }

  // Water
  if (i.waterTarget > 0) {
    if (i.water >= i.waterTarget) {
      add(
        'water-done',
        'good',
        30,
        ws >= 3 ? `Đủ nước ${ws} ngày liên tiếp — cơ thể cảm ơn bạn!` : 'Đã uống đủ nước hôm nay. Giữ nhịp này nhé!',
      );
    } else {
      const expected = expectedWaterByHour(i.waterTarget, i.hour);
      const gap = expected - i.water;
      // Never ask for more than what is still missing to the daily target.
      const ask = Math.min(roundUpTo(gap, 250), Math.round(i.waterTarget - i.water));
      if (gap >= 250) {
        if (i.hour >= LATE_HOUR || isLateNight(i.hour)) {
          // Don't push a litre right before bed: one glass, the rest tomorrow.
          const sip = Math.min(ask, 500);
          add(
            'water-low',
            'info',
            48,
            sip < ask
              ? `Còn thiếu ${n0(ask)} ml nước. Uống từ từ ${n0(sip)} ml là được, mai uống đều hơn từ sáng nhé.`
              : `Còn thiếu ${n0(ask)} ml nước — uống từ từ trước khi ngủ là đạt.`,
          );
        } else {
          add('water-low', 'warn', 70, `Uống thêm ${n0(ask)} ml nước để bắt kịp mục tiêu.`);
        }
      }
    }
  }

  // Planned workouts
  if (i.plannedWorkouts.length > 0) {
    const first = i.plannedWorkouts[0];
    const more = i.plannedWorkouts.length > 1 ? ` và ${i.plannedWorkouts.length - 1} buổi khác` : '';
    add('workout-planned', 'info', i.hour >= 17 ? 65 : 45, `Buổi tập «${first}»${more} đang chờ bạn hôm nay.`);
  }

  // Steps (evening)
  if (i.stepTarget > 0 && i.hour >= 18 && i.hour <= LATE_HOUR && i.steps < i.stepTarget * 0.5) {
    const left = Math.round(i.stepTarget - i.steps);
    // A relaxed evening walk is ~100 steps/min; 30 minutes ≈ 3.000 steps.
    add(
      'steps-low',
      'info',
      50,
      left <= 3000
        ? `Còn ${n0(left)} bước nữa là đạt mục tiêu — một vòng đi dạo tối là đủ.`
        : `Còn ${n0(left)} bước nữa là đạt mục tiêu — đi dạo 30 phút sau bữa tối được khoảng 3.000 bước.`,
    );
  } else if (i.stepTarget > 0 && i.steps >= i.stepTarget) {
    add(
      'steps-done',
      'good',
      35,
      i.steps > i.stepTarget
        ? `Đã đi ${n0(i.steps)} bước — vượt mục tiêu hôm nay!`
        : `Đã đi ${n0(i.steps)} bước — vừa đạt mục tiêu hôm nay!`,
    );
  }

  // Fat
  if (i.fatTarget > 0 && i.fat > i.fatTarget * 1.15) {
    add('fat-high', 'warn', 60, `Chất béo đã vượt ${n0(shownGap(i.fat, i.fatTarget))} g. Ưu tiên món luộc, hấp cho bữa còn lại.`);
  }

  // Fiber (evening)
  if (i.fiberTarget > 0 && i.mealCount > 0 && i.hour >= 18 && i.fiber < i.fiberTarget * 0.5) {
    add('fiber-low', 'info', 40, 'Chất xơ còn thấp — thêm rau xanh hoặc một phần trái cây nhé.');
  }

  // Streaks (never shaming: a missing day is just "start again", an open day is a gentle nudge)
  const ls = Math.max(0, Math.floor(i.loggingStreak ?? 0));
  if (ls >= 2) {
    if (i.mealCount > 0) {
      const milestone = STREAK_MILESTONES.includes(ls);
      add(
        'streak-logging',
        'good',
        milestone ? 57 : 22,
        milestone ? `${ls} ngày liên tiếp ghi bữa — thói quen đang thành hình!` : `Chuỗi ${ls} ngày ghi bữa liên tiếp. Giữ nhịp nhé!`,
      );
    } else if (i.hour >= 12 && !isLateNight(i.hour)) {
      // Streak counts up to yesterday; today is still open.
      add('streak-keep', 'info', 64, `Bạn đang có chuỗi ${ls} ngày ghi bữa. Ghi một bữa hôm nay để giữ chuỗi nhé.`);
    }
  }

  // Praise
  if (
    i.proteinTarget > 0 &&
    i.mealCount > 0 &&
    i.protein >= i.proteinTarget * 0.9 &&
    i.waterTarget > 0 &&
    i.water >= i.waterTarget &&
    i.remaining >= 0
  ) {
    add('all-good', 'good', 58, 'Tuyệt vời! Đạm và nước đều đạt, calo vẫn trong mức.');
    // "all-good" already says water is done — don't repeat it.
    const k = out.findIndex((x) => x.id === 'water-done');
    if (k >= 0) out.splice(k, 1);
  }
  if (i.doneWorkouts > 0 && !out.some((x) => x.tone === 'warn')) {
    add('workout-done', 'good', 25, 'Đã hoàn thành buổi tập hôm nay — nhớ nạp đủ đạm để phục hồi.');
  }

  if (!out.length) add('steady', 'good', 10, 'Mọi chỉ số đang ổn. Tiếp tục ghi bữa và uống nước đều nhé.');
  return out.sort((a, b) => b.priority - a.priority);
}
