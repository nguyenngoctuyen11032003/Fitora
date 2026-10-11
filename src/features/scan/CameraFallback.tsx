import { Camera, CameraOff, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CameraStatus } from './useCamera';

const COPY: Partial<Record<CameraStatus, { title: string; body: string }>> = {
  denied: {
    title: 'Chưa có quyền camera',
    body: 'Hãy cho phép Camera trong cài đặt trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) rồi thử lại — hoặc dùng ảnh có sẵn.',
  },
  notfound: {
    title: 'Không tìm thấy camera',
    body: 'Thiết bị này không có camera hoặc camera đang bị tắt. Bạn vẫn có thể tải ảnh món ăn lên.',
  },
  unsupported: {
    title: 'Không hỗ trợ camera',
    body: 'Trình duyệt này không mở camera trực tiếp được. Bạn vẫn có thể chụp bằng máy ảnh của máy hoặc tải ảnh lên.',
  },
  error: {
    title: 'Không mở được camera',
    body: 'Camera có thể đang được ứng dụng khác dùng. Đóng ứng dụng đó rồi thử lại, hoặc tải ảnh lên.',
  },
};

export const isCameraUnavailable = (s: CameraStatus) => s === 'denied' || s === 'notfound' || s === 'unsupported' || s === 'error';

interface Props {
  status: CameraStatus;
  onUpload: () => void;
  onNativeCapture: () => void;
  onRetry: () => void;
}

/** Shown in place of the feed when the live camera can't be used — always offers the file picker. */
export function CameraFallback({ status, onUpload, onNativeCapture, onRetry }: Props) {
  const copy = COPY[status] ?? COPY.error!;
  // Without getUserMedia (or a webcam) the OS camera via <input capture> is the best way to shoot.
  const nativeCapture = status === 'unsupported' || status === 'notfound';
  return (
    <div className="glass-card animate-scale-in w-full max-w-[340px] p-6 text-center" role="alert">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] bg-gold/15 text-gold">
        <CameraOff className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="display text-[24px]">{copy.title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{copy.body}</p>
      <div className="mt-5 flex flex-col gap-2.5">
        <Button block icon={<Upload className="h-5 w-5" />} onClick={onUpload}>
          Tải ảnh lên
        </Button>
        {nativeCapture ? (
          <Button variant="secondary" block icon={<Camera className="h-5 w-5" />} onClick={onNativeCapture}>
            Chụp bằng máy ảnh
          </Button>
        ) : (
          <Button variant="secondary" block onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    </div>
  );
}
