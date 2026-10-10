import { Footprints } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { GlassCard } from '@/components/ui/GlassCard';
import { NumberField } from '@/components/ui/NumberField';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDayVi } from '@/lib/date';
import { stepsKcal } from '@/lib/energy';
import { formatNumber } from '@/lib/format';
import { stepRatio } from './lib';

interface Props {
  date: string;
  steps: number | undefined;
  target: number;
  weightKg: number;
  loading: boolean;
  onSave: (steps: number) => Promise<void>;
}

const QUICK = [1000, 2000, 5000];

/** Manual step entry for the selected day: progress vs target + kcal. */
export function StepsCard({ date, steps, target, weightKg, loading, onSave }: Props) {
  const saved = steps ?? 0;
  const [value, setValue] = useState<number | null>(saved);
  const [busy, setBusy] = useState(false);

  useEffect(() => setValue(steps ?? 0), [steps, date]);

  const dirty = value !== null && Math.round(value) !== saved;
  const shown = value ?? 0;
  const ratio = stepRatio(shown, target);

  const save = async () => {
    if (value === null) return;
    setBusy(true);
    try {
      await onSave(Math.round(value));
    } catch {
      /* caller toasts */
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard as="section" aria-label="Bước chân" padding="md" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            <Footprints className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> Bước chân · {formatDayVi(date).toLowerCase()}
          </p>
          {loading ? (
            <Skeleton width={150} height={44} className="mt-3" />
          ) : (
            <p className="mt-3 flex items-end gap-1.5">
              <span className="num text-[48px] text-gradient">{formatNumber(shown)}</span>
              <span className="mb-1 text-sm font-bold text-muted">/ {formatNumber(target)}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[26px] text-gradient-ember">{formatNumber(stepsKcal(shown, weightKg))}</p>
          <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">kcal</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <ProgressBar value={shown} max={Math.max(1, target)} color="var(--gold)" showOver={false} label="Tiến độ bước chân" />
        <p className="text-[12.5px] text-muted">
          {ratio >= 1 ? 'Đã đạt mục tiêu — tuyệt vời!' : `Còn ${formatNumber(Math.max(0, target - shown))} bước để đạt mục tiêu`}
        </p>
      </div>

      <div className="flex items-end gap-2">
        <NumberField
          label="Số bước"
          value={value}
          onChange={setValue}
          min={0}
          max={200000}
          decimals={0}
          wrapperClassName="min-w-0 flex-1"
          placeholder="0"
        />
        <Button onClick={save} loading={busy} disabled={!dirty} className="mb-0 shrink-0" variant={dirty ? 'primary' : 'secondary'}>
          Lưu
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cộng nhanh">
        {QUICK.map((q) => (
          <Chip key={q} onClick={() => setValue((v) => Math.min(200000, (v ?? 0) + q))}>
            +{formatNumber(q)}
          </Chip>
        ))}
        {target > shown && (
          <Chip onClick={() => setValue(target)} dot="var(--gold)">
            Đạt mục tiêu
          </Chip>
        )}
      </div>
    </GlassCard>
  );
}
