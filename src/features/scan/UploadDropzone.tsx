import clsx from 'clsx';
import { ImagePlus } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';

/** Big tap/drop target for the "Tải ảnh" mode. */
export function UploadDropzone({ busy, dragOver, onPick }: { busy: boolean; dragOver: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      aria-busy={busy || undefined}
      className={clsx(
        'group flex aspect-[4/5] max-h-full w-full max-w-[300px] flex-col items-center justify-center gap-4 rounded-[32px] border-2 border-dashed p-6 text-center transition-colors',
        dragOver ? 'border-gold bg-[rgba(237,180,11,0.1)]' : 'border-white/20 bg-white/[0.03] hover:border-[rgba(237,180,11,0.6)]',
      )}
    >
      <span className="relative">
        <span className="absolute inset-0 rounded-[24px] bg-[rgba(225,80,10,0.4)] blur-xl" aria-hidden="true" />
        <span className="glass relative grid h-[72px] w-[72px] place-items-center rounded-[24px] text-gold">
          {busy ? <Spinner size={28} /> : <ImagePlus className="h-8 w-8" aria-hidden="true" />}
        </span>
      </span>
      <span className="display text-[28px]">{busy ? 'Đang xử lý ảnh' : 'Chọn ảnh món ăn'}</span>
      <span className="max-w-[220px] text-[14px] leading-relaxed text-muted">Ảnh rõ, đủ sáng, thấy trọn món cho kết quả chính xác nhất.</span>
    </button>
  );
}
