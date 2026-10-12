// Period-over-period comparison + short, encouraging Vietnamese insights (unit-tested in insights.test.ts).
// Pure: no React, no "today" lookups — everything comes from two ReportSummary objects.

import { parseISODate, weekdayLong } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import type { Goal } from '@/types/db';
import { ddmm, type Period, type ReportSummary } from './lib';

export interface PeriodComparison {
  /** Δ average intake kcal/day (complete days of both periods). */
  avgIn: number | null;
  /** Δ average protein g/day. */
  protein: number | null;
  /** Δ logging rate in percentage points. */
  loggingPts: number | null;
  /** Δ on-target rate in percentage points. */
  onTargetPts: number | null;
  /** Δ average steps/day. */
  avgSteps: number | null;
  /** Δ of the last weigh-in vs the previous period's last weigh-in (kg). */
  weight: number | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Current vs previous period. Each metric is null unless both periods have a basis for it. */
export function comparePeriods(cur: ReportSummary, prev: ReportSummary | null): PeriodComparison {
  const none: PeriodComparison = { avgIn: null, protein: null, loggingPts: null, onTargetPts: null, avgSteps: null, weight: null };
  if (!prev) return none;
  const bothCounted = cur.countedDays > 0 && prev.countedDays > 0;
  const bothElapsed = cur.elapsedDays > 0 && prev.elapsedDays > 0;
  return {
    avgIn: bothCounted ? cur.avgIn - prev.avgIn : null,
    protein: bothCounted ? r1(cur.avgMacros.protein_g - prev.avgMacros.protein_g) : null,
    loggingPts: bothElapsed ? Math.round((cur.loggingRate - prev.loggingRate) * 100) : null,
    onTargetPts: bothElapsed && cur.target != null ? Math.round((cur.onTargetRate - prev.onTargetRate) * 100) : null,
    avgSteps: cur.stepDays > 0 && prev.stepDays > 0 ? cur.avgSteps - prev.avgSteps : null,
    weight: cur.weightLast != null && prev.weightLast != null ? r1(cur.weightLast - prev.weightLast) : null,
  };
}

export type InsightKind = 'consistency' | 'best' | 'protein' | 'trend' | 'compare' | 'nudge';
export type InsightTone = 'good' | 'neutral' | 'info';
export interface Insight {
  kind: InsightKind;
  tone: InsightTone;
  text: string;
}

/** "Thứ Ba 7/10" */
export function dayName(day: string): string {
  const d = parseISODate(day);
  return `${weekdayLong(day)} ${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * How to call the comparison period: "tuần trước" / "tháng trước" only when the viewed period is the
 * current one (its predecessor is then really last week / month); for older periods the explicit range,
 * so "So với tuần trước" never appears on a screen that is itself captioned "Tuần trước".
 */
export function prevPeriodName(s: Pick<ReportSummary, 'days'>, prev: Pick<ReportSummary, 'from' | 'to'> | null, period: Period): string {
  const current = s.days.some((d) => d.isToday);
  if (current || !prev) return period === 'week' ? 'tuần trước' : 'tháng trước';
  return period === 'week' ? `tuần ${ddmm(prev.from)} – ${ddmm(prev.to)}` : `tháng ${parseISODate(prev.from).getMonth() + 1}`;
}

/** A report needs a few elapsed days before "very consistent" means anything (1/1 is not a habit yet). */
export const MIN_DAYS_FOR_CONSISTENCY = 3;

const kg1 = (n: number) => formatNumber(Math.abs(n), 1);
const int = (n: number) => formatNumber(Math.abs(Math.round(n)));

/** Slopes smaller than this (kg/week) read as "stable". */
export const STABLE_SLOPE = 0.1;

/**
 * Up to `max` short insights, most useful first. Tone is never negative: off-plan facts are worded as
 * neutral observations with a concrete next step.
 */
export function buildInsights(
  s: ReportSummary,
  opts: { period: Period; goal: Goal | null; proteinTarget: number | null; prev?: ReportSummary | null; max?: number },
): Insight[] {
  const { period, goal, proteinTarget, prev = null, max = 4 } = opts;
  const unit = period === 'week' ? 'tuần' : 'tháng';
  const out: Insight[] = [];
  if (s.elapsedDays === 0) return out;

  // 1. Consistency.
  if (s.loggedDays === 0) {
    // A past period cannot be "started" any more → plain statement instead of a call to action.
    const current = s.days.some((d) => d.isToday);
    out.push({
      kind: 'nudge',
      tone: 'info',
      text: current ? `Chưa có bữa nào được ghi trong ${unit} này — ghi một bữa để bắt đầu nhé.` : 'Không có bữa ăn nào được ghi trong kỳ này.',
    });
  } else {
    // The streak sentence only when it adds information: a streak equal to the logged-day
    // count just repeats the "N/M ngày" lead ("ghi 7/7 ngày. Chuỗi 7 ngày" reads twice).
    const streak =
      s.currentStreak >= 2 && s.currentStreak !== s.loggedDays
        ? ` Chuỗi hiện tại ${s.currentStreak} ngày liên tiếp.`
        : s.currentStreak < 2 && s.longestStreak >= 3 && s.longestStreak < s.loggedDays
          ? ` Chuỗi dài nhất ${s.longestStreak} ngày.`
          : '';
    const ratio = s.loggingRate;
    const lead =
      ratio >= 0.85 && s.elapsedDays >= MIN_DAYS_FOR_CONSISTENCY
        ? `Rất đều đặn: ghi nhật ký ${s.loggedDays}/${s.elapsedDays} ngày.`
        : ratio >= 0.5 || s.elapsedDays < MIN_DAYS_FOR_CONSISTENCY
          ? `Đã ghi nhật ký ${s.loggedDays}/${s.elapsedDays} ngày.`
          : `Đã ghi ${s.loggedDays}/${s.elapsedDays} ngày — ghi thêm vài ngày để báo cáo chính xác hơn.`;
    out.push({ kind: 'consistency', tone: ratio >= 0.85 && s.elapsedDays >= MIN_DAYS_FOR_CONSISTENCY ? 'good' : 'neutral', text: lead + streak });
  }

  // 2. Best day.
  if (s.bestDay && s.countedDays >= 2) {
    out.push({
      kind: 'best',
      tone: 'good',
      text: `Ngày sát ngân sách nhất: ${dayName(s.bestDay.day)} (${int(s.bestDay.kcalIn)} / ${int(s.bestDay.budget)} kcal).`,
    });
  }

  // 3. Protein vs target — only from finished days: judging a still-running day (first day of the
  // week/month, only today logged) would call a normal morning "47% of target".
  if (proteinTarget && proteinTarget > 0 && s.avgBasisDays > 0 && !s.avgBasisIncomplete) {
    const avg = s.avgMacros.protein_g;
    const pct = Math.round((avg / proteinTarget) * 100);
    out.push(
      pct >= 90
        ? { kind: 'protein', tone: 'good', text: `Đạm TB ${int(avg)} g/ngày — đạt ${pct}% mục tiêu ${int(proteinTarget)} g.` }
        : {
            kind: 'protein',
            tone: 'neutral',
            text: `Đạm TB ${int(avg)}/${int(proteinTarget)} g/ngày (${pct}%). Thêm trứng, cá, đậu phụ hoặc sữa chua để chạm mục tiêu.`,
          },
    );
  }

  // 4. Weight trend direction.
  if (s.weightTrend) {
    const k = s.weightTrend.slopeKgPerWeek;
    if (Math.abs(k) < STABLE_SLOPE) {
      out.push({ kind: 'trend', tone: goal === 'maintain' || goal === 'recomp' ? 'good' : 'neutral', text: 'Cân nặng đang ổn định trong kỳ.' });
    } else {
      const down = k < 0;
      const aligned = (goal === 'lose' && down) || (goal === 'gain' && !down);
      out.push({
        kind: 'trend',
        tone: aligned ? 'good' : 'neutral',
        text: `Xu hướng cân nặng: ${down ? 'giảm' : 'tăng'} ~${kg1(k)} kg/tuần${aligned ? ' — đúng hướng mục tiêu.' : '.'}`,
      });
    }
  }

  // 5. Versus previous period.
  const cmp = comparePeriods(s, prev);
  const prevName = prevPeriodName(s, prev, period);
  if (cmp.loggingPts != null && cmp.loggingPts >= 10) {
    out.push({ kind: 'compare', tone: 'good', text: `Ghi nhật ký đều hơn ${prevName} (tỉ lệ ngày có ghi +${cmp.loggingPts}%).` });
  } else if (cmp.avgIn != null && Math.abs(cmp.avgIn) >= 100) {
    out.push({
      kind: 'compare',
      tone: 'info',
      text: `Nạp TB ${cmp.avgIn < 0 ? 'thấp' : 'cao'} hơn ${prevName} ${int(cmp.avgIn)} kcal/ngày.`,
    });
  } else if (cmp.protein != null && cmp.protein >= 10) {
    out.push({ kind: 'compare', tone: 'good', text: `Đạm TB tăng ${int(cmp.protein)} g/ngày so với ${prevName}.` });
  }

  return out.slice(0, max);
}
