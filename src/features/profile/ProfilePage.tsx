import clsx from 'clsx';
import {
  BarChart3,
  Check,
  ChevronRight,
  Droplets,
  Footprints,
  Info,
  Link2,
  LogOut,
  Mail,
  Pencil,
  Scale,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { MacroBar } from '@/components/ui/MacroBar';
import { ConfirmDialog } from '@/components/ui/Modal';
import { NumberField } from '@/components/ui/NumberField';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { formatDayVi } from '@/lib/date';
import { bmiCategory, calcAge, calcBMI } from '@/lib/energy';
import { notifyDataChanged } from '@/lib/events';
import { formatKg, formatMl, formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { latestWeight } from '@/services/body';
import { upsertFitProfile } from '@/services/profile';
import { ACTIVITY_LABELS, GOAL_LABELS, type FitProfile } from '@/types/db';
import { version } from '../../../package.json';

const PACE_LABELS: Record<string, string> = { slow: 'chậm', medium: 'vừa', fast: 'nhanh' };

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { fit, shared, displayName, loading, setFit } = useProfile();
  const toast = useToast();
  const weight = useAsync(() => latestWeight(), []);
  const [askOut, setAskOut] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const saveTarget = async (patch: Pick<FitProfile, 'water_target_ml'> | Pick<FitProfile, 'step_target'>) => {
    const row = await upsertFitProfile(patch);
    setFit(row);
    notifyDataChanged('profile');
    toast.success('Đã cập nhật mục tiêu');
  };

  const doSignOut = async () => {
    setLeaving(true);
    try {
      await signOut();
    } catch (e) {
      toast.error(e);
      setLeaving(false);
    }
  };

  const w = weight.data?.weight_kg != null ? Number(weight.data.weight_kg) : fit?.start_weight_kg != null ? Number(fit.start_weight_kg) : null;
  const h = fit?.height_cm != null ? Number(fit.height_cm) : null;
  const bmi = w && h ? calcBMI(w, h) : null;
  const age = fit?.birth_date ? calcAge(fit.birth_date) : null;

  return (
    <Page label="Hồ sơ">
      <ScreenHeader eyebrow="Tài khoản" title="Hồ sơ" />

      {/* Shared account card */}
      <GlassCard padding="lg" className="mt-6 overflow-hidden animate-fade-slide-up">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(237,180,11,0.22),transparent_65%)]" />
        <div className="relative flex items-center gap-4">
          <Avatar src={shared?.avatar_url} name={displayName} size={72} className="ring-2 !ring-[rgba(237,180,11,0.5)]" />
          <div className="min-w-0 flex-1">
            {loading && !shared ? (
              <Skeleton width="70%" height={26} />
            ) : (
              <h2 className="display truncate text-[28px] text-text">{displayName}</h2>
            )}
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-[14px] text-muted">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{user?.email ?? '—'}</span>
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-muted">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <p>
            Tài khoản dùng chung với <b className="font-semibold text-text/90">Note_mytasks</b>. Tên hiển thị và ảnh đại diện chỉ đọc ở đây —{' '}
            <span className="text-text/90">Chỉnh sửa trong Note_mytasks</span>.
          </p>
        </div>
      </GlassCard>

      {/* Goal summary */}
      <SectionTitle>Mục tiêu hiện tại</SectionTitle>
      <GlassCard className="animate-fade-slide-up animate-delay-100">
        {fit?.calorie_target ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow !text-[10px] text-gold">
                  {fit.goal ? GOAL_LABELS[fit.goal] : 'Mục tiêu'}
                  {fit.goal === 'lose' && fit.goal_pace ? ` · ${PACE_LABELS[fit.goal_pace]}` : ''}
                </p>
                <p className="mt-2 flex items-end gap-1.5">
                  <span className="num text-[56px] text-gradient-gold">{formatNumber(fit.calorie_target)}</span>
                  <span className="mb-1.5 text-[15px] font-bold text-muted">kcal/ngày</span>
                </p>
              </div>
              <Link to="/goals" className="glass pill shrink-0 text-sm font-semibold" aria-label="Điều chỉnh mục tiêu">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Điều chỉnh
              </Link>
            </div>
            <MacroBar
              variant="stacked"
              protein_g={fit.protein_g ?? 0}
              carbs_g={fit.carbs_g ?? 0}
              fat_g={fit.fat_g ?? 0}
              className="mt-4"
            />
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
              <Stat label="Hiện tại" value={w ? formatKg(w) : '—'} />
              <Stat label="Mục tiêu" value={fit.target_weight_kg ? formatKg(Number(fit.target_weight_kg)) : '—'} />
              <Stat
                label="BMI"
                value={bmi ? formatNumber(bmi, 1) : '—'}
                sub={bmi ? bmiCategory(bmi).label : undefined}
              />
            </dl>
            {(h || age || fit.activity_level) && (
              <p className="mt-3 text-center text-[12px] text-muted">
                {[h ? `${formatNumber(h)} cm` : null, age ? `${age} tuổi` : null, fit.activity_level ? ACTIVITY_LABELS[fit.activity_level] : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </>
        ) : loading ? (
          <Skeleton height={160} rounded="card" />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">Bạn chưa đặt mục tiêu calo.</p>
            <Link to="/goals" className="glass pill text-sm font-semibold">
              Đặt mục tiêu
            </Link>
          </div>
        )}
      </GlassCard>

      {/* Daily targets, inline editable */}
      <SectionTitle>Mục tiêu mỗi ngày</SectionTitle>
      <GlassCard padding="none" className="divide-y divide-white/[0.08] animate-fade-slide-up animate-delay-200">
        <TargetRow
          icon={Droplets}
          color="var(--water)"
          label="Nước uống"
          value={fit?.water_target_ml ?? 2000}
          display={(v) => formatMl(v)}
          unit="ml"
          min={500}
          max={8000}
          step={250}
          presets={[1500, 2000, 2500, 3000]}
          onSave={(v) => saveTarget({ water_target_ml: v })}
        />
        <TargetRow
          icon={Footprints}
          color="var(--gold)"
          label="Bước chân"
          value={fit?.step_target ?? 8000}
          display={(v) => `${formatNumber(v)} bước`}
          unit="bước"
          min={1000}
          max={50000}
          step={500}
          presets={[6000, 8000, 10000, 12000]}
          onSave={(v) => saveTarget({ step_target: v })}
        />
      </GlassCard>

      {/* Links */}
      <SectionTitle>Theo dõi</SectionTitle>
      <GlassCard padding="none" className="divide-y divide-white/[0.08] animate-fade-slide-up animate-delay-300">
        <NavRow to="/body" icon={Scale} label="Cơ thể" hint={weight.data ? `Lần cân gần nhất ${formatDayVi(weight.data.measured_on)}` : 'Cân nặng, số đo, ảnh tiến trình'} />
        <NavRow to="/progress" icon={BarChart3} label="Báo cáo tiến trình" hint="Tuần / tháng: calo, cân nặng, BMI" />
        <NavRow to="/goals" icon={Target} label="Mục tiêu & macro" hint="Tính lại TDEE, chỉnh macro" />
      </GlassCard>

      <Button variant="secondary" block size="lg" className="mt-8" icon={<LogOut className="h-5 w-5 text-[var(--danger-text)]" />} onClick={() => setAskOut(true)}>
        Đăng xuất
      </Button>

      {/* About */}
      <footer className="mt-10 flex flex-col items-center gap-2 text-center">
        <Logo size={36} />
        <p className="display text-[22px] text-text">Fitora</p>
        <p className="text-[13px] text-muted">Huấn luyện viên dinh dưỡng & thể hình AI</p>
        <p className="tabular flex items-center gap-1.5 text-[12px] text-muted">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Phiên bản {version}
        </p>
        <p className="max-w-[300px] text-[11px] leading-relaxed text-muted">
          Ước tính calo & dinh dưỡng chỉ mang tính tham khảo, không thay thế tư vấn y tế.
        </p>
      </footer>

      <ConfirmDialog
        open={askOut}
        title="Đăng xuất khỏi Fitora?"
        message="Bạn vẫn đăng nhập ở Note_mytasks. Dữ liệu được lưu an toàn trên máy chủ."
        confirmLabel="Đăng xuất"
        danger
        loading={leaving}
        onConfirm={doSignOut}
        onCancel={() => setAskOut(false)}
      />
    </Page>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="eyebrow mb-2.5 mt-8 pl-1 !text-[11px]">{children}</h2>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="tabular text-[16px] font-extrabold tracking-[-0.02em] text-text">{value}</dd>
      {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}

function NavRow({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <Link to={to} className="flex min-h-[64px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-gold">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-text">{label}</span>
        <span className="block truncate text-[12px] text-muted">{hint}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

function TargetRow({
  icon: Icon,
  color,
  label,
  value,
  display,
  unit,
  min,
  max,
  step,
  presets,
  onSave,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: number;
  display: (v: number) => string;
  unit: string;
  min: number;
  max: number;
  step: number;
  presets: number[];
  onSave: (v: number) => Promise<void>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);
  const [busy, setBusy] = useState(false);
  const invalid = draft === null || draft < min || draft > max;

  const open = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = async () => {
    if (invalid || draft === null) return;
    if (draft === value) return setEditing(false);
    setBusy(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex min-h-[44px] items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06]" style={{ color }}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-muted">{label}</span>
          <span className="tabular block text-[18px] font-extrabold tracking-[-0.02em] text-text">{display(value)}</span>
        </span>
        {!editing && (
          <button type="button" onClick={open} className="glass pill text-sm font-semibold" aria-label={`Sửa mục tiêu ${label.toLowerCase()}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Sửa
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 flex flex-col gap-3 animate-fade-slide-down">
          <NumberField
            label={`Mục tiêu ${label.toLowerCase()}`}
            value={draft}
            onChange={setDraft}
            unit={unit}
            min={min}
            max={max}
            step={step}
            decimals={0}
            stepper
            error={draft !== null && (draft < min || draft > max) ? `Từ ${formatNumber(min)} đến ${formatNumber(max)}` : undefined}
            autoFocus
          />
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft(p)}
                aria-pressed={draft === p}
                className={clsx(
                  'tabular min-h-[40px] shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                  draft === p ? 'border-[rgba(237,180,11,0.6)] bg-[rgba(237,180,11,0.15)] text-gold' : 'border-line bg-white/[0.04] text-text/85',
                )}
              >
                {formatNumber(p)}
              </button>
            ))}
          </div>
          <div className="flex gap-2.5">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={busy} icon={<X className="h-4 w-4" />}>
              Hủy
            </Button>
            <Button size="sm" block onClick={save} loading={busy} disabled={invalid} icon={<Check className="h-4 w-4" />}>
              Lưu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
