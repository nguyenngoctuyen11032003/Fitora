// /onboarding — 5-step survey → BMI/BMR/TDEE → calorie & macro plan → save.
import clsx from 'clsx';
import { ArrowRight, ChevronLeft, LogOut, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { upsertMeasurement } from '@/services/body';
import { upsertFitProfile } from '@/services/profile';
import {
  EMPTY_DRAFT,
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
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY + uid) || 'null') as { draft?: GoalDraft; step?: number } | null;
    if (!raw?.draft) return null;
    return { draft: { ...EMPTY_DRAFT, ...raw.draft }, step: Math.min(4, Math.max(0, Number(raw.step) || 0)) };
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

export default function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { signOut, user } = useAuth();
  const uid = user?.id ?? 'anon';
  const { fit, setFit, refresh, displayName } = useProfile();

  const initial = useMemo(() => {
    const saved = readDraft(uid);
    if (saved) return saved;
    // Re-running onboarding with an existing profile: start from it.
    return { draft: fit?.sex ? profileToDraft(fit) : { ...EMPTY_DRAFT }, step: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState<GoalDraft>(initial.draft);
  const [step, setStep] = useState(initial.step);
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const pageRef = useRef<HTMLElement>(null);

  const plan = useMemo(() => computePlan(draft), [draft]);

  useEffect(() => writeDraft(uid, { draft, step }), [uid, draft, step]);

  // A restored draft may point at the result step without enough data.
  useEffect(() => {
    if (step === 4 && !plan) setStep(0);
  }, [step, plan]);

  const update = useCallback((patch: Partial<GoalDraft>) => {
    setDraft((d) => applyPatch(d, patch));
    // Clear messages for the fields being edited.
    setErrors({});
  }, []);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setErrors({});
    pageRef.current?.scrollTo({ top: 0 });
  };

  const next = () => {
    const e = VALIDATORS[step](draft);
    if (hasErrors(e)) {
      setErrors(e);
      return;
    }
    if (step < 4) go(step + 1);
    else void save();
  };

  const save = async () => {
    if (!plan || !draft.weight_kg) {
      toast.error('Thông tin chưa đầy đủ, hãy kiểm tra lại các bước trước.');
      return;
    }
    setSaving(true);
    try {
      const weight = Math.round(draft.weight_kg * 10) / 10;
      const saved = await upsertFitProfile({
        ...draftToPatch(draft, plan),
        start_weight_kg: weight,
        onboarded_at: new Date().toISOString(),
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
      setSaving(false);
    }
  };

  const meta = STEPS[step];
  const isLast = step === 4;

  const footer = (
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
        <h1 className="display animate-speed-reveal text-[42px] text-text">
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

      <div key={`s${step}`} className={clsx('flex-1', dir > 0 ? 'animate-fade-slide-left' : 'animate-fade-in')}>
        {step === 0 && <BasicsStep draft={draft} onChange={update} errors={errors} />}
        {step === 1 && <BodyStep draft={draft} onChange={update} errors={errors} />}
        {step === 2 && <ActivityStep draft={draft} onChange={update} errors={errors} />}
        {step === 3 && <GoalStep draft={draft} onChange={update} errors={errors} plan={plan} />}
        {step === 4 && plan && <PlanStep draft={draft} plan={plan} onChange={update} />}
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
