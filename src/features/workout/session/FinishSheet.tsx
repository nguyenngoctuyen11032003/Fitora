import { Flame, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, Chip, ConfirmDialog, NumberField, useToast } from '@/components/ui';
import { metKcal } from '@/lib/energy';
import { notifyDataChanged } from '@/lib/events';
import { formatKg, formatNumber } from '@/lib/format';
import { addWorkout } from '@/services/workouts';
import { isSpeedBased } from '../lib';
import { useActiveSession, useSessionWeight } from './SessionContext';
import { clampMinutes, formatClock, MAX_SAVE_MINUTES, toWorkoutFields } from './timer';

export interface FinishSheetProps {
  open: boolean;
  onClose: () => void;
  /** After the row is saved (true) or the session was discarded (false). */
  onDone: (saved: boolean) => void;
}

/** "Kết thúc": confirm minutes (from the clock), intensity, optional km, then save the workout as done. */
export function FinishSheet({ open, onClose, onDone }: FinishSheetProps) {
  const s = useActiveSession();
  const toast = useToast();
  const current = useSessionWeight();
  const session = s.session;
  const summary = s.summary;

  const [minutes, setMinutes] = useState<number | null>(null);
  const [variant, setVariant] = useState('');
  const [km, setKm] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const guard = useRef(false);

  // Fresh form each time the sheet opens for a session.
  const sessionId = session?.id;
  const suggested = summary?.suggestedMinutes ?? 1;
  useEffect(() => {
    if (!open || !session) return;
    setMinutes(Math.max(1, suggested));
    setVariant(session.variant);
    setKm(null);
    setWeight(session.weightSource === 'fallback' ? current.kg : session.weightKg);
    setSaving(false);
    guard.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  if (!session || !summary) return null;

  const variants = s.activity?.variants ?? [];
  const met = variants.find((v) => v.id === variant)?.met ?? session.met;
  const weightEditable = session.weightSource === 'fallback';
  const kg = weightEditable ? weight : session.weightKg;
  const weightOk = kg !== null && kg >= 25 && kg <= 300;
  const mins = clampMinutes(minutes ?? 0);
  const minutesOk = minutes !== null && minutes >= 1 && minutes <= MAX_SAVE_MINUTES;
  const speed = isSpeedBased(session.activity);
  const kmOk = km === null || (km > 0 && km <= 1000);
  const kcal = weightOk ? metKcal(met, kg!, mins) : 0;
  const canSave = summary.canSave && minutesOk && weightOk && kmOk && !saving;

  const save = async () => {
    if (!canSave || guard.current) return;
    guard.current = true;
    setSaving(true);
    try {
      const fields = toWorkoutFields({ session, durationMin: mins, variantId: variant, weightKg: kg!, km: speed ? km : null, day: s.day });
      const row = await addWorkout(fields);
      s.clear();
      notifyDataChanged('workouts');
      toast.success(`Đã lưu “${row.title}” · +${formatNumber(row.kcal)} kcal. Tuyệt lắm!`);
      onDone(true);
    } catch (e) {
      toast.error(e);
      guard.current = false;
      setSaving(false);
    }
  };

  const discard = () => {
    s.clear();
    setConfirmDiscard(false);
    toast.info('Đã hủy buổi tập.');
    onDone(false);
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Kết thúc buổi tập"
        description={`${session.title} · đồng hồ ${formatClock(summary.elapsedMs)}`}
        footer={
          <div className="flex flex-col gap-2">
            <Button block size="lg" loading={saving} disabled={!canSave} onClick={() => void save()}>
              Lưu buổi tập
            </Button>
            <Button block variant="ghost" disabled={saving} onClick={() => setConfirmDiscard(true)}>
              Hủy buổi tập
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 text-text">
          {summary.forgotten && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl border border-[rgba(237,180,11,0.4)] bg-[rgba(237,180,11,0.08)] p-3 text-[13px] text-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              Có thể bạn quên bấm kết thúc — đã điền sẵn 60 phút, hãy sửa lại nếu cần.
            </p>
          )}
          {!summary.canSave && <p className="text-[13px] text-muted">Buổi tập chưa đủ 1 phút nên chưa thể lưu — hãy tiếp tục tập hoặc hủy buổi này.</p>}

          <NumberField label="Thời lượng" unit="phút" value={minutes} onChange={setMinutes} min={1} max={MAX_SAVE_MINUTES} decimals={0} stepper size="lg" error={minutes !== null && !minutesOk ? `Từ 1 đến ${MAX_SAVE_MINUTES} phút.` : undefined} />

          {variants.length > 1 && (
            <fieldset>
              <legend className="mb-2 pl-1 text-[13px] font-semibold text-muted">Cường độ</legend>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <Chip key={v.id} selected={v.id === variant} onClick={() => setVariant(v.id)}>
                    {v.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          {speed && <NumberField label="Quãng đường (tuỳ chọn)" unit="km" value={km} onChange={setKm} min={0} max={1000} decimals={1} placeholder="0" error={!kmOk ? 'Quãng đường chưa hợp lệ.' : undefined} />}

          {weightEditable ? (
            <NumberField label="Cân nặng" unit="kg" value={weight} onChange={setWeight} min={25} max={300} decimals={1} hint="Chưa có cân nặng trong hồ sơ — nhập để tính kcal chính xác hơn." error={!weightOk ? 'Từ 25 đến 300 kg.' : undefined} />
          ) : (
            <p className="text-[13px] text-muted">
              Tính theo cân nặng {formatKg(session.weightKg)} ({session.weightSource === 'measured' ? 'lần đo gần nhất' : 'hồ sơ'}).
            </p>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3">
            <Flame className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <div className="min-w-0">
              <p className="tabular text-[24px] font-bold leading-none text-gold">≈ {formatNumber(kcal)} kcal</p>
              <p className="mt-1 text-[12px] text-muted">Ước lượng, sai số khoảng ±20%.</p>
            </div>
          </div>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDiscard}
        danger
        title="Hủy buổi tập?"
        message="Thời gian và các hiệp đã tích sẽ không được lưu."
        confirmLabel="Hủy buổi tập"
        cancelLabel="Tiếp tục tập"
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
