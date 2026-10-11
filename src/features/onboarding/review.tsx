// Review card on the last onboarding step: what the plan is based on, each row
// jumps back to the step that owns it (state is kept, so nothing is lost).
import { Pencil } from 'lucide-react';
import { formatKg, formatNumber } from '@/lib/format';
import type { Goal, GoalPace } from '@/types/db';
import { PACE_KG_WEEK, type GoalDraft, type Plan } from './logic';
import { SectionTitle } from './parts';
import { ACTIVITY_OPTIONS } from './steps';

const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Giảm cân',
  gain: 'Tăng cân',
  maintain: 'Giữ cân',
  recomp: 'Tăng cơ / Giảm mỡ',
};
const PACE_LABELS: Record<GoalPace, string> = { slow: 'chậm', medium: 'trung bình', fast: 'nhanh' };

export function ReviewSummary({
  draft,
  plan,
  onEdit,
  disabled,
}: {
  draft: GoalDraft;
  plan: Plan;
  onEdit: (step: number) => void;
  disabled?: boolean;
}) {
  const activity = ACTIVITY_OPTIONS.find((o) => o.value === draft.activity_level)?.label ?? '—';
  let goal = draft.goal ? GOAL_LABELS[draft.goal] : '—';
  if (draft.goal === 'lose') goal += ` · ${PACE_LABELS[draft.goal_pace]} (~${formatNumber(PACE_KG_WEEK[draft.goal_pace], 2)} kg/tuần)`;
  if (draft.goal && draft.goal !== 'maintain' && draft.target_weight_kg != null) goal += ` · đích ${formatKg(draft.target_weight_kg)}`;

  const rows: { label: string; value: string; step: number; edit: string }[] = [
    { label: 'Về bạn', value: `${draft.sex === 'female' ? 'Nữ' : 'Nam'} · ${plan.age} tuổi`, step: 0, edit: 'Sửa giới tính, ngày sinh' },
    {
      label: 'Cơ thể',
      value: `${formatNumber(draft.height_cm ?? 0)} cm · ${formatKg(draft.weight_kg)}`,
      step: 1,
      edit: 'Sửa chiều cao, cân nặng',
    },
    { label: 'Vận động', value: activity, step: 2, edit: 'Sửa mức vận động' },
    { label: 'Mục tiêu', value: goal, step: 3, edit: 'Sửa mục tiêu' },
  ];

  return (
    <section className="glass-card mt-4 p-5" aria-label="Thông tin của bạn">
      <SectionTitle>Dựa trên thông tin của bạn</SectionTitle>
      <ul className="-my-1 flex flex-col divide-y divide-[var(--line,rgba(255,255,255,0.08))]">
        {rows.map((r) => (
          <li key={r.step} className="flex min-w-0 items-center gap-3 py-1">
            <div className="flex min-w-0 flex-1 flex-col py-1.5">
              <span className="text-[12px] font-semibold text-muted">{r.label}</span>
              <span className="break-words text-[15px] font-semibold leading-snug text-text">{r.value}</span>
            </div>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              disabled={disabled}
              aria-label={r.edit}
              className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
