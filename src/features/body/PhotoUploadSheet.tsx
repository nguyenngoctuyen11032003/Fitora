import { CalendarDays, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { formatDayVi, isISODate, todayISO } from '@/lib/date';
import { formatKg } from '@/lib/format';
import { uploadProgressPhoto } from '@/services/body';
import type { BodyMeasurement, PhotoPose, ProgressPhoto } from '@/types/db';
import { POSE_LABELS, weightOn } from './lib';
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
  defaultPose,
  onClose,
  onUploaded,
}: {
  pending: PendingPhoto | null;
  rows: BodyMeasurement[];
  defaultPose: PhotoPose;
  onClose: () => void;
  onUploaded: (p: ProgressPhoto) => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [pose, setPose] = useState<PhotoPose>(defaultPose);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) return;
    setDate(todayISO());
    setPose(defaultPose);
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const dateOk = isISODate(date) && date <= todayISO();
  const w = dateOk ? weightOn(rows, date, 0) : null;

  const save = async () => {
    if (!pending || !dateOk) return;
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
            onChange={(e) => setDate(e.target.value)}
            error={!dateOk ? 'Chọn một ngày hợp lệ, không ở tương lai.' : undefined}
            hint={dateOk ? `${formatDayVi(date, 'long')}${w ? ` · cân ${formatKg(w.weight)}` : ''}` : undefined}
          />
          <div className="flex flex-col gap-1.5">
            <span className="pl-1 text-[13px] font-semibold text-muted">Tư thế</span>
            <Segmented options={POSES.map((p) => ({ value: p, label: POSE_LABELS[p] }))} value={pose} onChange={setPose} size="sm" ariaLabel="Tư thế chụp" />
            <p className="pl-1 text-[12px] text-muted">Mẹo: cùng tư thế, ánh sáng và khoảng cách mỗi lần để so sánh chính xác.</p>
          </div>
          <Input label="Ghi chú" placeholder="Không bắt buộc" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </BottomSheet>
  );
}
