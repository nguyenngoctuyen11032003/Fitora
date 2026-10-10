// /goals — edit body data, activity and goal; the plan recomputes live.
import clsx from 'clsx';
import { Check, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Page } from '@/components/shell/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/context/ProfileContext';
import { todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { latestWeight, upsertMeasurement } from '@/services/body';
import { upsertFitProfile } from '@/services/profile';
import {
  applyPatch,
  computePlan,
  draftToPatch,
  hasErrors,
  profileToDraft,
  validateActivity,
  validateBasics,
  validateBody,
  validateGoal,
  type GoalDraft,
  type StepErrors,
} from './logic';
import { ActivityStep, BasicsStep, BodyStep, GoalStep, PlanStep } from './steps';

function Section({ title, children, id }: { title: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-line pt-7">
      <h2 className="display text-[28px] text-text">{title}</h2>
      {children}
    </section>
  );
}

function GoalsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Đang tải">
      <Skeleton width="45%" height={14} />
      <Skeleton width="70%" height={72} />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton height={96} rounded="card" />
        <Skeleton height={96} rounded="card" />
      </div>
      <Skeleton height={150} rounded="card" />
      <Skeleton height={190} rounded="card" />
    </div>
  );
}

export default function GoalSettingsPage() {
  const toast = useToast();
  const { fit, loading: profileLoading, setFit } = useProfile();
  const weightQ = useAsync(() => latestWeight(), []);

  const [base, setBase] = useState<{ draft: GoalDraft; weight: number | null } | null>(null);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);

  // Build the editable draft once profile + latest weight are known.
  useEffect(() => {
    if (base || profileLoading || weightQ.loading || !fit) return;
    if (weightQ.error) toast.error(weightQ.error);
    const w = weightQ.data?.weight_kg ?? null;
    const d = profileToDraft(fit, w);
    setBase({ draft: d, weight: d.weight_kg });
    setDraft(d);
  }, [base, fit, profileLoading, weightQ.loading, weightQ.data, weightQ.error, toast]);

  const plan = useMemo(() => (draft ? computePlan(draft) : null), [draft]);
  const basePatch = useMemo(() => {
    if (!base) return null;
    const p = computePlan(base.draft);
    return p ? JSON.stringify(draftToPatch(base.draft, p)) : null;
  }, [base]);

  const weightChanged = Boolean(draft && base && draft.weight_kg !== base.weight);
  const dirty = Boolean(draft && plan && (weightChanged || JSON.stringify(draftToPatch(draft, plan)) !== basePatch));

  const update = useCallback((patch: Partial<GoalDraft>) => {
    setDraft((d) => (d ? applyPatch(d, patch) : d));
    setErrors({});
  }, []);

  const discard = () => {
    if (base) setDraft(base.draft);
    setErrors({});
  };

  const save = async () => {
    if (!draft || !plan) return;
    const e = { ...validateBasics(draft), ...validateBody(draft), ...validateActivity(draft), ...validateGoal(draft) };
    if (hasErrors(e)) {
      setErrors(e);
      toast.error('Vui lòng kiểm tra lại các trường được đánh dấu.');
      return;
    }
    setSaving(true);
    try {
      const patch = draftToPatch(draft, plan);
      const weight = draft.weight_kg != null ? Math.round(draft.weight_kg * 10) / 10 : null;
      const saved = await upsertFitProfile({
        ...patch,
        ...(fit?.start_weight_kg == null && weight ? { start_weight_kg: weight } : {}),
      });
      setFit(saved);
      if (weightChanged && weight) {
        try {
          await upsertMeasurement({ measured_on: todayISO(), weight_kg: weight });
          notifyDataChanged('body');
        } catch (err) {
          toast.error(err);
        }
      }
      notifyDataChanged('profile');
      setBase({ draft, weight: draft.weight_kg });
      toast.success('Đã cập nhật mục tiêu.');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const loading = !draft && (profileLoading || weightQ.loading);

  const footer =
    draft && plan && dirty ? (
      <div className="glass-strong flex items-center gap-3 rounded-[22px] p-2 pl-4 animate-fade-slide-up">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-semibold text-muted">Mục tiêu mới</span>
          <span className="tabular truncate text-[17px] font-extrabold tracking-[-0.03em] text-text">
            {formatNumber(plan.kcal)} <span className="text-[12px] font-semibold text-muted">kcal/ngày</span>
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={discard} disabled={saving} aria-label="Hoàn tác thay đổi" className="!px-3">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={save} loading={saving} icon={<Check className="h-4 w-4" />}>
          Lưu
        </Button>
      </div>
    ) : undefined;

  return (
    <Page topBar={false} footer={footer} label="Mục tiêu">
      <ScreenHeader back eyebrow="Mục tiêu & kế hoạch" title="Mục tiêu" subtitle="Thay đổi bên dưới — kế hoạch được tính lại ngay." className="mb-6" />

      {loading ? (
        <GoalsSkeleton />
      ) : !draft || !plan ? (
        <EmptyState
          title="Chưa có dữ liệu mục tiêu"
          description="Không tải được hồ sơ của bạn. Kiểm tra kết nối rồi thử lại."
          action={
            <Button variant="secondary" onClick={() => void weightQ.reload()}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <div className={clsx('flex flex-col gap-8', !dirty && 'pb-2')}>
          <PlanStep draft={draft} plan={plan} onChange={update} compact />

          <Section title="Mục tiêu chính">
            <GoalStep draft={draft} onChange={update} errors={errors} plan={plan} compact />
          </Section>

          <Section title="Cơ thể">
            <BodyStep draft={draft} onChange={update} errors={errors} compact />
            {weightChanged && (
              <p className="-mt-1 pl-1 text-[13px] text-[rgba(237,180,11,0.9)]">Khi lưu, cân nặng này được ghi nhận cho hôm nay.</p>
            )}
          </Section>

          <Section title="Mức vận động">
            <ActivityStep draft={draft} onChange={update} errors={errors} compact />
          </Section>

          <Section title="Về bạn">
            <BasicsStep draft={draft} onChange={update} errors={errors} compact />
          </Section>
        </div>
      )}
    </Page>
  );
}
