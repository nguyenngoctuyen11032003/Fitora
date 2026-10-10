// Rule-based coaching lines for the Today dashboard ("Nhận xét"). Pure; tested in insights.test.ts.
import { metKcal } from '@/lib/energy';
import { formatNumber } from '@/lib/format';

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
}

const n0 = (v: number) => formatNumber(v, 0);
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/** How much water should be drunk by `hour` (linear 07:00 → 21:00). */
export function expectedWaterByHour(target: number, hour: number): number {
  const ratio = Math.max(0, Math.min(1, (hour - 7) / 14));
  return target * ratio;
}

/** All applicable insights, highest priority first (always at least one). */
export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const add = (id: string, tone: InsightTone, priority: number, text: string) => out.push({ id, tone, priority, text });

  // Calories
  if (i.remaining < 0) {
    const over = -i.remaining;
    const walk = metKcal(3.5, i.weightKg, 30);
    add(
      'kcal-over',
      'warn',
      90,
      walk > 0
        ? `Đã vượt ${n0(over)} kcal. Đi bộ nhanh 30 phút đốt khoảng ${n0(walk)} kcal.`
        : `Đã vượt ${n0(over)} kcal so với mục tiêu hôm nay.`,
    );
  } else if (i.eaten > 0 && i.remaining <= 150 && i.hour >= 17) {
    add('kcal-close', 'good', 55, `Chỉ còn ${n0(i.remaining)} kcal — bạn đang bám sát mục tiêu calo.`);
  }

  // Nothing logged yet
  if (i.mealCount === 0) {
    if (i.hour >= 10) add('no-meals', 'info', 85, 'Chưa có bữa nào được ghi. Scan bữa gần nhất để AI tính calo giúp bạn.');
    else add('morning', 'info', 20, 'Ngày mới bắt đầu — uống một cốc nước và ghi bữa sáng nhé.');
  }

  // Protein
  const proteinGap = i.proteinTarget - i.protein;
  if (i.proteinTarget > 0 && i.mealCount > 0 && proteinGap > 0) {
    const ratio = i.protein / i.proteinTarget;
    const behind = (i.hour >= 14 && ratio < 0.6) || (i.hour >= 19 && ratio < 0.85);
    if (behind) add('protein-low', 'warn', 75, `Còn thiếu ${n0(proteinGap)} g đạm — thêm ức gà, trứng, cá hoặc đậu phụ vào bữa tới.`);
  }

  // Water
  if (i.waterTarget > 0) {
    if (i.water >= i.waterTarget) {
      add('water-done', 'good', 30, 'Đã uống đủ nước hôm nay. Giữ nhịp này nhé!');
    } else {
      const expected = expectedWaterByHour(i.waterTarget, i.hour);
      const gap = expected - i.water;
      if (gap >= 250) add('water-low', 'warn', 70, `Uống thêm ${n0(roundTo(gap, 250))} ml nước để bắt kịp mục tiêu.`);
    }
  }

  // Planned workouts
  if (i.plannedWorkouts.length > 0) {
    const first = i.plannedWorkouts[0];
    const more = i.plannedWorkouts.length > 1 ? ` và ${i.plannedWorkouts.length - 1} buổi khác` : '';
    add('workout-planned', 'info', i.hour >= 17 ? 65 : 45, `Buổi tập «${first}»${more} đang chờ bạn hôm nay.`);
  }

  // Steps (evening)
  if (i.stepTarget > 0 && i.hour >= 18 && i.steps < i.stepTarget * 0.5) {
    add('steps-low', 'info', 50, `Còn ${n0(i.stepTarget - i.steps)} bước nữa là đạt mục tiêu — một vòng đi dạo tối là đủ.`);
  } else if (i.stepTarget > 0 && i.steps >= i.stepTarget) {
    add('steps-done', 'good', 35, `Đã đạt ${n0(i.steps)} bước — vượt mục tiêu hôm nay!`);
  }

  // Fat
  if (i.fatTarget > 0 && i.fat > i.fatTarget * 1.15) {
    add('fat-high', 'warn', 60, `Chất béo đã vượt ${n0(i.fat - i.fatTarget)} g. Ưu tiên món luộc, hấp cho bữa còn lại.`);
  }

  // Fiber (evening)
  if (i.fiberTarget > 0 && i.mealCount > 0 && i.hour >= 18 && i.fiber < i.fiberTarget * 0.5) {
    add('fiber-low', 'info', 40, 'Chất xơ còn thấp — thêm rau xanh hoặc một phần trái cây nhé.');
  }

  // Streak-y praise
  if (i.proteinTarget > 0 && i.protein >= i.proteinTarget * 0.9 && i.water >= i.waterTarget && i.remaining >= 0) {
    add('all-good', 'good', 58, 'Tuyệt vời! Đạm và nước đều đạt, calo vẫn trong mức.');
  }
  if (i.doneWorkouts > 0 && !out.some((x) => x.tone === 'warn')) {
    add('workout-done', 'good', 25, 'Đã hoàn thành buổi tập hôm nay — nhớ nạp đủ đạm để phục hồi.');
  }

  if (!out.length) add('steady', 'good', 10, 'Mọi chỉ số đang ổn. Tiếp tục ghi bữa và uống nước đều nhé.');
  return out.sort((a, b) => b.priority - a.priority);
}
