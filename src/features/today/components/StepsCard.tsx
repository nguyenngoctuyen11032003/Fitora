import { Footprints, Pencil } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CountUp } from '@/components/ui/CountUp';
import { NumberField } from '@/components/ui/NumberField';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatNumber } from '@/lib/format';
import { progressPercent } from '../metrics';

interface Props {
  steps: number;
  target: number;
  kcal: number;
  onSave: (steps: number) => void;
  /** Optional controlled sheet state (the quick-action row opens it). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const QUICK = [1000, 2000, 5000];

/** Steps progress; tap to edit in a bottom sheet (manual entry — no wearable sync in v1). */
export const StepsCard = memo(function StepsCard({ steps, target, kcal, onSave, open: openProp, onOpenChange, className }: Props) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setOpenState(v);
    onOpenChange?.(v);
  };
  const [draft, setDraft] = useState<number | null>(steps);
  useEffect(() => {
    if (open) setDraft(steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pct = progressPercent(steps, target);
  const reached = target > 0 && steps >= target;

  const save = () => {
    if (draft === null) return;
    onSave(Math.max(0, Math.round(draft ?? 0)));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Bước chân: ${formatNumber(steps)} trên ${formatNumber(target)}. Chạm để sửa.`}
        className={`glass-card relative block w-full overflow-hidden p-5 text-left transition-transform active:scale-[0.985] ${className ?? ''}`}
      >
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
              <Footprints className="h-4 w-4 text-gold" aria-hidden="true" />
              Bước chân
            </span>
            <div className="mt-3 flex items-end gap-1.5">
              <span className="num text-gradient pb-[0.06em] text-[48px]">
                <CountUp value={steps} duration={1200} />
              </span>
              <span className="mb-1 text-[13px] font-semibold text-muted">/ {formatNumber(target)}</span>
            </div>
          </div>
          <span className="glass circle shrink-0 text-text" aria-hidden="true">
            <Pencil className="h-4 w-4" />
          </span>
        </div>
        <ProgressBar value={steps} max={target} height={8} showOver={false} className="relative mt-4" />
        <div className="relative mt-2.5 flex justify-between text-[12px] font-medium text-muted">
          <span>{reached ? 'Đã đạt mục tiêu' : `${pct}% mục tiêu`}</span>
          <span>
            ≈ <span className="tabular font-semibold text-burn">{formatNumber(kcal)}</span> kcal
          </span>
        </div>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Bước chân hôm nay"
        description="Nhập số bước từ điện thoại hoặc đồng hồ của bạn."
        footer={
          <Button block size="lg" onClick={save} disabled={draft === null}>
            Lưu số bước
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <NumberField
            value={draft}
            onChange={setDraft}
            decimals={0}
            min={0}
            max={200000}
            step={500}
            stepper
            size="lg"
            unit="bước"
            label="Tổng số bước"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <Chip key={q} onClick={() => setDraft((d) => Math.min(200000, (d ?? 0) + q))}>
                +{formatNumber(q)}
              </Chip>
            ))}
            {(draft ?? 0) < target && <Chip onClick={() => setDraft(target)}>Đạt mục tiêu</Chip>}
          </div>
        </div>
      </BottomSheet>
    </>
  );
});
