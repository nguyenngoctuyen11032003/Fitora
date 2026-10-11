import { CalendarDays, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi, isISODate, todayISO } from '@/lib/date';
import { formatKg } from '@/lib/format';
import { uploadProgressPhoto } from '@/services/body';
import type { BodyMeasurement, PhotoPose, ProgressPhoto } from '@/types/db';
import { POSE_LABELS, suggestPose, weightOn } from './lib';
import { primePhotoUrl } from './usePhotoUrls';

export interface PendingPhoto {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

const POSES: PhotoPose[] = ['front', 'side', 'back', 'other'];

export function PhotoUploadSheet({
  pending,
  rows,
  photos,
  onClose,
  onUploaded,
}: {
  pending: PendingPhoto | null;
  rows: BodyMeasurement[];
  /** Existing photos — the pose defaults to the next one of the user's routine for that day. */
  photos: ProgressPhoto[];
  onClose: () => void;
  onUploaded: (p: ProgressPhoto) => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [pose, setPose] = useState<PhotoPose>('front');
  /** The user picked a pose themselves → stop auto-suggesting when the date changes. */
  const [poseTouched, setPoseTouched] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const d = todayISO();
    setDate(d);
    setPose(suggestPose(photos, d));
    setPoseTouched(false);
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const changeDate = (d: string) => {
    setDate(d);
    if (!poseTouched && isISODate(d)) setPose(suggestPose(photos, d));
  };

  const dateOk = isISODate(date) && date <= todayISO();
  const w = dateOk ? weightOn(rows, date, 0) : null;

  const save = async () => {
    if (!pending || !dateOk || busy) return;
    setBusy(true);
    try {
      const row = await uploadProgressPhoto(pending.blob, { taken_on: date, pose, note: note.trim() || null });
      primePhotoUrl(row.storage_path, pending.dataUrl);
      onUploaded(row);
      toast.success('Đã lưu ảnh tiến trình');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={!!pending}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      title="Lưu ảnh tiến trình"
      footer={
        <Button block onClick={save} loading={busy} disabled={!dateOk}>
          Lưu ảnh
        </Button>
      }
    >
      {pending && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3.5">
            <img
              src={pending.dataUrl}
              alt="Ảnh vừa chọn"
              className="h-[168px] w-[126px] shrink-0 rounded-[18px] object-cover ring-1 ring-white/15"
            />
            <div className="flex min-w-0 flex-col justify-end gap-2 pb-1">
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                Ảnh được lưu riêng tư, chỉ bạn xem được.
              </p>
              <p className="text-[12px] text-muted">
                {pending.width}×{pending.height} · {Math.max(1, Math.round(pending.blob.size / 1024))} KB
              </p>
            </div>
          </div>
          <Input
            type="date"
            label="Ngày chụp"
            icon={<CalendarDays />}
            value={date}
            max={todayISO()}
            onChange={(e) => changeDate(e.target.value)}
            error={!dateOk ? 'Chọn một ngày hợp lệ, không ở tương lai.' : undefined}
            hint={dateOk ? `${formatDayVi(date, 'long')}${w ? ` · cân ${formatKg(w.weight)}` : ''}` : undefined}
          />
          <div className="flex flex-col gap-1.5">
            <span className="pl-1 text-[13px] font-semibold text-muted">Tư thế</span>
            <div role="group" aria-label="Tư thế chụp" className="flex flex-wrap gap-2">
              {POSES.map((p) => (
                <Chip
                  key={p}
                  selected={pose === p}
                  onClick={() => (setPose(p), setPoseTouched(true))}
                  // Chip's border-gold/60 can't take an opacity on a var() colour → explicit rgba.
                  className={pose === p ? '!border-[rgba(237,180,11,0.6)] !bg-[rgba(237,180,11,0.15)]' : undefined}
                >
                  {POSE_LABELS[p]}
                </Chip>
              ))}
            </div>
            <p className="pl-1 text-[12px] text-muted">Mẹo: cùng tư thế, ánh sáng và khoảng cách mỗi lần để so sánh chính xác.</p>
          </div>
          <Input label="Ghi chú" placeholder="Không bắt buộc" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </BottomSheet>
  );
}
