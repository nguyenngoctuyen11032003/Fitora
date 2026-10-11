// /onboarding — 5-step survey → BMI/BMR/TDEE → calorie & macro plan → save.
import clsx from 'clsx';
import { ArrowRight, ChevronLeft, LogOut, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { latestWeight, upsertMeasurement } from '@/services/body';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAsync } from '@/lib/hooks';
import { upsertFitProfile } from '@/services/profile';
import {
  EMPTY_DRAFT,
  applyPatch,
  computePlan,
  SEX_DEFAULTS,
  draftToPatch,
  firstInvalidStep,
  hasDefaultBody,
  hasErrors,
  profileToDraft,
  sanitizeDraft,
  validateActivity,
  validateBasics,
  validateBody,
  validateGoal,
  validatePlan,
  type GoalDraft,
  type StepErrors,
} from './logic';
import { ActivityStep, BasicsStep, BodyStep, GoalStep, PlanStep } from './steps';
import { isEnterAdvanceTarget } from './a11y';
import { ReviewSummary } from './review';

const DRAFT_KEY = 'fitora.onboarding.draft.';

const STEPS = [
  { eyebrow: 'Về bạn', title: 'Bắt đầu từ chính bạn', subtitle: 'Vài thông tin cơ bản để tính năng lượng cơ thể cần mỗi ngày.' },
  { eyebrow: 'Cơ thể', title: 'Chiều cao & cân nặng', subtitle: 'Kéo thanh trượt hoặc chạm vào số để nhập chính xác.' },
  { eyebrow: 'Vận động', title: 'Bạn vận động thế nào?', subtitle: 'Tính trung bình một tuần bình thường của bạn.' },
  { eyebrow: 'Mục tiêu', title: 'Bạn muốn đạt điều gì?', subtitle: 'Có thể đổi bất cứ lúc nào trong mục Mục tiêu.' },
  { eyebrow: 'Kế hoạch', title: 'Kế hoạch của bạn', subtitle: 'Tính theo Mifflin–St Jeor. Bạn có thể tự điều chỉnh.' },
] as const;

const VALIDATORS: ((d: GoalDraft) => StepErrors)[] = [
  (d) => validateBasics(d),
  validateBody,
  validateActivity,
  validateGoal,
  () => ({}),
];

function readDraft(uid: string): { draft: GoalDraft; step: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY + uid) || 'null') as { draft?: unknown; step?: number } | null;
    const draft = sanitizeDraft(raw?.draft);
    if (!draft) return null;
    // Never resume past a step whose data is (no longer) valid — e.g. a birthday
    // stored by an older version, or values dropped by sanitizeDraft.
    const wanted = Math.min(4, Math.max(0, Math.floor(Number(raw?.step) || 0)));
    const bad = firstInvalidStep(draft);
    return { draft, step: bad >= 0 ? Math.min(wanted, bad) : wanted };
  } catch {
    return null;
  }
}
function writeDraft(uid: string, v: { draft: GoalDraft; step: number } | null) {
  try {
    if (v) localStorage.setItem(DRAFT_KEY + uid, JSON.stringify(v));
    else localStorage.removeItem(DRAFT_KEY + uid);
  } catch {
    /* private mode */
  }
}

/**
 * Waits for the profile (and, when one exists, the latest weigh-in) before
 * building the first draft — otherwise a reload on /onboarding would start an
 * existing user from an empty form and overwrite their saved draft with it.
 */
export default function OnboardingPage() {
  const { user } = useAuth();
  const { fit, loading } = useProfile();
  const hasProfile = Boolean(fit?.sex);
  const weightQ = useAsync(() => (hasProfile ? latestWeight() : Promise.resolve(null)), [hasProfile]);
  const uid = user?.id;
  const ready = Boolean(uid) && !loading && !weightQ.loading;

  const initial = useMemo(() => {
    if (!ready || !uid) return null;
    const saved = readDraft(uid);
    if (saved) return saved;
    // Re-running onboarding with an existing profile: start from it (+ latest weight).
    const w = weightQ.data?.weight_kg != null ? Number(weightQ.data.weight_kg) : null;
    return { draft: hasProfile ? profileToDraft(fit, w) : { ...EMPTY_DRAFT }, step: 0 };
    // Computed once, when everything has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!initial || !uid) {
    return (
      <Page topBar={false} label="Thiết lập hồ sơ">
        <div className="flex flex-col gap-4 pt-6" aria-busy="true" aria-label="Đang tải">
          <Skeleton width="40%" height={14} />
          <Skeleton width="80%" height={84} />
          <Skeleton height={132} rounded="card" />
          <Skeleton height={64} rounded="card" />
        </div>
      </Page>
    );
  }
  return <OnboardingFlow uid={uid} initial={initial} />;
}

function OnboardingFlow({ uid, initial }: { uid: string; initial: { draft: GoalDraft; step: number } }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { signOut } = useAuth();
  const { fit, setFit, refresh, displayName } = useProfile();

  const [draft, setDraft] = useState<GoalDraft>(initial.draft);
  const [step, setStep] = useState(initial.step);
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStepRender = useRef(true);

  const plan = useMemo(() => computePlan(draft), [draft]);

  useEffect(() => writeDraft(uid, { draft, step }), [uid, draft, step]);

  // A restored draft may point at the result step without enough data.
  useEffect(() => {
    if (step === 4 && !plan) setStep(Math.max(0, firstInvalidStep(draft)));
  }, [step, plan, draft]);

  // Move focus to the new step's heading so screen readers announce it and Tab
  // starts from the top (no autofocus on inputs: it would pop the mobile keyboard).
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const update = useCallback((patch: Partial<GoalDraft>) => {
    setDraft((d) => {
      const next = applyPatch(d, patch);
      // Smart defaults: picking a sex moves untouched height/weight sliders to typical values.
      if (patch.sex && patch.sex !== d.sex && hasDefaultBody(d)) return { ...next, ...SEX_DEFAULTS[patch.sex] };
      return next;
    });
    // Clear messages for the fields being edited.
    setErrors({});
    setSaveError(null);
  }, []);

  /** Bring the first problem into view; focus it when it is a text field. */
  const revealFirstError = () => {
    requestAnimationFrame(() => {
      const root = pageRef.current;
      if (!root) return;
      const field = root.querySelector<HTMLElement>('input[aria-invalid="true"]');
      const alert = root.querySelector<HTMLElement>('[role="alert"]');
      (field ?? alert)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field?.focus({ preventScroll: true });
    });
  };

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setErrors({});
    setSaveError(null);
    pageRef.current?.scrollTo({ top: 0 });
  };

  const next = () => {
    if (saving) return;
    const e = VALIDATORS[step](draft);
    if (hasErrors(e)) {
      setErrors(e);
      revealFirstError();
      return;
    }
    if (step < 4) go(step + 1);
    else void save();
  };

  /** Enter in a text field = "Tiếp tục" (buttons keep their own Enter behaviour). */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || !isEnterAdvanceTarget(e.target)) return;
    e.preventDefault();
    // Let NumberField clamp/commit its text first (it does so on blur).
    (e.target as HTMLInputElement).blur();
    requestAnimationFrame(() => nextRef.current());
  };
  // Enter fires before React re-renders with the blurred (clamped) value → call the latest `next`.
  const nextRef = useRef(next);
  nextRef.current = next;

  const save = async () => {
    // Re-check every step: a restored draft may skip straight to the plan.
    const bad = firstInvalidStep(draft);
    if (bad >= 0) {
      go(bad);
      setErrors(VALIDATORS[bad](draft));
      revealFirstError();
      toast.error('Thông tin chưa đầy đủ, hãy kiểm tra lại bước này.');
      return;
    }
    const planErr = validatePlan(plan);
    if (hasErrors(planErr)) {
      setErrors(planErr);
      toast.error(planErr.plan ?? 'Kế hoạch chưa hợp lệ.');
      return;
    }
    if (!plan || !draft.weight_kg) {
      toast.error('Thông tin chưa đầy đủ, hãy kiểm tra lại các bước trước.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const weight = Math.round(draft.weight_kg * 10) / 10;
      // Re-running onboarding keeps the original baseline (progress is measured from it).
      const rerun = Boolean(fit?.onboarded_at);
      const saved = await upsertFitProfile({
        ...draftToPatch(draft, plan),
        start_weight_kg: rerun && fit?.start_weight_kg != null ? Number(fit.start_weight_kg) : weight,
        onboarded_at: rerun && fit?.onboarded_at ? fit.onboarded_at : new Date().toISOString(),
      });
      setFit(saved);
      try {
        await upsertMeasurement({ measured_on: todayISO(), weight_kg: weight });
        notifyDataChanged('body');
      } catch (err) {
        // Profile is saved — the first weigh-in can be added later from /body.
        toast.error(err);
      }
      writeDraft(uid, null);
      await refresh();
      toast.success('Đã lưu kế hoạch. Chào mừng đến với Fitora!');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err);
      // The draft is still stored locally — the user can simply tap again.
      setSaveError(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Bạn đang ngoại tuyến. Kết nối mạng rồi nhấn lại để lưu — thông tin đã nhập vẫn được giữ.'
          : 'Chưa lưu được kế hoạch. Nhấn lại để thử lần nữa — thông tin đã nhập vẫn được giữ.',
      );
      setSaving(false);
    }
  };

  const meta = STEPS[step];
  const isLast = step === 4;
  // A target pointing the wrong way is flagged as soon as it is typed (not only on "Tiếp tục").
  const liveGoalErrors = useMemo<StepErrors>(() => {
    const target = draft.target_weight_kg != null ? validateGoal(draft).target : undefined;
    return target && !errors.target ? { ...errors, target } : errors;
  }, [draft, errors]);

  const footer = (
    <div className="flex flex-col gap-2">
      {saveError && (
        <p role="alert" className="px-1 text-center text-[13px] font-medium leading-snug text-[var(--danger-text)]">
          {saveError}
        </p>
      )}
    <div className="flex items-center gap-3">
      {step > 0 && (
        <Button variant="secondary" size="lg" onClick={() => go(step - 1)} disabled={saving} aria-label="Quay lại bước trước" className="!px-0 w-14 shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}
      <Button
        size="lg"
        block
        onClick={next}
        loading={saving}
        icon={isLast ? <Sparkles className="h-5 w-5" /> : undefined}
        iconRight={isLast ? undefined : <ArrowRight className="h-5 w-5" />}
      >
        {isLast ? 'Bắt đầu với Fitora' : 'Tiếp tục'}
      </Button>
    </div>
    </div>
  );

  return (
    <Page ref={pageRef} topBar={false} footer={footer} label="Thiết lập hồ sơ">
      {/* Progress header */}
      <div className="pb-4 pt-1">
        <div className="flex min-h-[44px] items-center gap-3">
          <div
            className="flex flex-1 gap-1.5"
            role="progressbar"
            aria-label="Tiến độ thiết lập"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={step + 1}
            aria-valuetext={`Bước ${step + 1} trên 5`}
          >
            {STEPS.map((s, i) => (
              <span key={s.eyebrow} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className={clsx(
                    'block h-full rounded-full bg-gradient-to-r from-ember to-gold transition-[width] duration-500 ease-out',
                    i <= step ? 'w-full' : 'w-0',
                  )}
                />
              </span>
            ))}
          </div>
          <span className="tabular w-11 shrink-0 text-right text-[13px] font-bold text-muted">
            <span className="text-text">{step + 1}</span>/5
          </span>
        </div>
      </div>

      {/* Step heading — keyed so the speed-reveal replays */}
      <header key={`h${step}`} className="mb-7 mt-2">
        <p className="eyebrow mb-3 animate-fade-in text-[rgba(237,180,11,0.9)]">
          <span className="tabular">0{step + 1}</span> · {meta.eyebrow}
        </p>
        <h1 ref={headingRef} tabIndex={-1} className="display animate-speed-reveal text-[42px] text-text outline-none">
          {step === 0 && displayName !== 'bạn' ? (
            <>
              Chào {displayName.split(' ').slice(-1)[0]},<br />
              <span className="text-gradient-gold">bắt đầu nào</span>
            </>
          ) : (
            meta.title
          )}
        </h1>
        <p className="mt-3 animate-fade-in text-[15px] leading-relaxed text-muted animate-delay-200">{meta.subtitle}</p>
      </header>

      <div key={`s${step}`} onKeyDown={onKeyDown} className={clsx('flex-1', dir > 0 ? 'animate-fade-slide-left' : 'animate-fade-in')}>
        {step === 0 && <BasicsStep draft={draft} onChange={update} errors={errors} />}
        {step === 1 && <BodyStep draft={draft} onChange={update} errors={errors} />}
        {step === 2 && <ActivityStep draft={draft} onChange={update} errors={errors} />}
        {step === 3 && <GoalStep draft={draft} onChange={update} errors={liveGoalErrors} plan={plan} />}
        {step === 4 && plan && (
          <>
            <PlanStep draft={draft} plan={plan} onChange={update} error={errors.plan} />
            <ReviewSummary draft={draft} plan={plan} onEdit={go} disabled={saving} />
          </>
        )}
      </div>

      {step === 0 && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="mx-auto mt-8 inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-muted hover:text-text"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Không phải bạn? Đăng xuất
        </button>
      )}
    </Page>
  );
}
