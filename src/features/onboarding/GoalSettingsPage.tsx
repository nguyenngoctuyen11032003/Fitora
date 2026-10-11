// /goals — edit body data, activity and goal; the plan recomputes live.
import clsx from 'clsx';
import { Check, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  previewPlan,
  profileToDraft,
  validateActivity,
  validateBasics,
  validateBody,
  validateGoal,
  validatePlan,
  patchDiff,
  savedPatch,
  type GoalDraft,
  type Plan,
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
  const { fit, loading: profileLoading, setFit, refresh } = useProfile();
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

  // Live preview only from in-range inputs; while a field is half-typed or invalid the
  // last good plan stays on screen (instead of absurd numbers or an empty page).
  const plan = useMemo(() => (draft ? previewPlan(draft) : null), [draft]);
  const lastPlan = useRef<Plan | null>(null);
  if (plan) lastPlan.current = plan;
  const shownPlan = plan ?? lastPlan.current ?? (draft ? computePlan(draft) : null);
  // Compare with what is actually SAVED (not with the initial draft): a suggested plan is
  // recomputed from the latest weigh-in, so it may already differ when the page opens.
  const saved = useMemo(() => savedPatch(fit), [fit]);
  const changedKeys = useMemo(() => (draft && plan ? patchDiff(draftToPatch(draft, plan), saved) : []), [draft, plan, saved]);
  const basePatch = useMemo(() => {
    const p = base ? computePlan(base.draft) : null;
    return base && p ? draftToPatch(base.draft, p) : null;
  }, [base]);
  const baseChangedKeys = useMemo(() => (basePatch ? patchDiff(basePatch, saved) : []), [basePatch, saved]);
  // Targets refreshed only because the inputs moved on (new weigh-in, birthday) since the last save.
  const refreshed = Boolean(base && draft === base.draft && baseChangedKeys.length > 0);

  const weightChanged = Boolean(draft && base && draft.weight_kg !== base.weight);
  // An invalid edit (no plan) still counts as a change, so the footer stays and Save explains what is wrong.
  const dirty = Boolean(draft && (plan ? weightChanged || changedKeys.length > 0 : base && draft !== base.draft));
  const pageRef = useRef<HTMLElement>(null);
  // Only edits the user made deserve a "leave without saving?" prompt — not a plan that
  // was merely refreshed from a newer weigh-in (the banner already explains that one).
  const userEdited = Boolean(
    draft &&
      base &&
      draft !== base.draft &&
      (!plan || !basePatch || weightChanged || patchDiff(draftToPatch(draft, plan), basePatch).length > 0),
  );

  // Dirty-state guard: reload / close tab, and in-app exits (header back button, links).
  useEffect(() => {
    if (!userEdited || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('a[href], button[aria-label="Quay lại"]');
      if (!el || (el instanceof HTMLAnchorElement && el.target === '_blank')) return;
      if (!window.confirm('Bạn có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [userEdited, saving]);

  // Live: a target pointing the wrong way for the goal is flagged while typing.
  const shownErrors = useMemo<StepErrors>(() => {
    const target = draft && draft.target_weight_kg != null ? validateGoal(draft).target : undefined;
    return target && !errors.target ? { ...errors, target } : errors;
  }, [draft, errors]);

  const update = useCallback((patch: Partial<GoalDraft>) => {
    setDraft((d) => (d ? applyPatch(d, patch) : d));
    setErrors({});
  }, []);

  const discard = () => {
    if (base) setDraft(base.draft);
    setErrors({});
  };

  const save = async () => {
    if (!draft || saving) return;
    const e = {
      ...validateBasics(draft),
      ...validateBody(draft),
      ...validateActivity(draft),
      ...validateGoal(draft),
      ...validatePlan(plan),
    };
    if (hasErrors(e) || !plan) {
      setErrors(e);
      toast.error(e.plan ?? 'Vui lòng kiểm tra lại các trường được đánh dấu.');
      // Bring the first message into view (sections are stacked on a long page).
      requestAnimationFrame(() => {
        const root = pageRef.current ?? document;
        const field = root.querySelector<HTMLElement>('input[aria-invalid="true"]');
        (field ?? root.querySelector<HTMLElement>('[role="alert"]'))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        field?.focus({ preventScroll: true });
      });
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
    draft && dirty ? (
      <div className="glass-strong flex items-center gap-3 rounded-[22px] p-2 pl-4 animate-fade-slide-up">
        <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
          <span className="text-[11px] font-semibold text-muted">Mục tiêu mới</span>
          {plan ? (
            <span className="tabular truncate text-[17px] font-extrabold tracking-[-0.03em] text-text">
              {formatNumber(plan.kcal)} <span className="text-[12px] font-semibold text-muted">kcal/ngày</span>
            </span>
          ) : (
            <span className="truncate text-[13px] font-semibold text-[var(--danger-text)]">Kiểm tra lại số liệu</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={discard} disabled={saving || Boolean(base && draft === base.draft)} aria-label="Hoàn tác thay đổi" className="!px-3 min-w-[44px]">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={save} loading={saving} icon={<Check className="h-4 w-4" />}>
          Lưu
        </Button>
      </div>
    ) : undefined;

  return (
    <Page ref={pageRef} topBar={false} footer={footer} label="Mục tiêu">
      <ScreenHeader back eyebrow="Mục tiêu & kế hoạch" title="Mục tiêu" subtitle="Thay đổi bên dưới — kế hoạch được tính lại ngay." className="mb-6" />

      {loading ? (
        <GoalsSkeleton />
      ) : !draft || !shownPlan ? (
        <EmptyState
          title="Chưa có dữ liệu mục tiêu"
          description="Không tải được hồ sơ của bạn. Kiểm tra kết nối rồi thử lại."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                if (!fit) void refresh();
                void weightQ.reload();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : (
        <div className={clsx('flex flex-col gap-8', !dirty && 'pb-2')}>
          {refreshed && (
            <p role="status" className="-mb-4 rounded-2xl border border-[rgba(237,180,11,0.35)] bg-[rgba(237,180,11,0.08)] px-4 py-3 text-[13px] leading-snug text-[rgba(237,228,216,0.9)]">
              Kế hoạch đã được tính lại theo số liệu mới nhất ({formatNumber(draft.weight_kg ?? 0, 1)} kg · {shownPlan.age} tuổi)
              {fit?.calorie_target ? <> — kế hoạch đã lưu là {formatNumber(fit.calorie_target)} kcal</> : null}. Nhấn <b>Lưu</b> để áp dụng.
            </p>
          )}
          {!plan && (
            <p role="status" className="-mb-4 rounded-2xl border border-line bg-white/[0.04] px-4 py-3 text-[13px] leading-snug text-muted">
              Đang hiển thị kế hoạch gần nhất — hoàn tất chiều cao, cân nặng và ngày sinh hợp lệ để tính lại.
            </p>
          )}
          <PlanStep draft={draft} plan={shownPlan} onChange={update} compact error={errors.plan} />

          <Section title="Mục tiêu chính">
            <GoalStep draft={draft} onChange={update} errors={shownErrors} plan={plan} compact />
          </Section>

          <Section title="Cơ thể">
            <BodyStep draft={draft} onChange={update} errors={shownErrors} compact />
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
