import clsx from 'clsx';
import { Camera, Columns2, ImageOff, Lock, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDayVi, todayISO } from '@/lib/date';
import { formatKg } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import type { BodyMeasurement, ProgressPhoto } from '@/types/db';
import { groupByMonth, groupByWeek, POSE_LABELS, weightOn } from './lib';

type GroupBy = 'week' | 'month';

export interface PhotosTabProps {
  photos: ProgressPhoto[];
  urls: Record<string, string>;
  rows: BodyMeasurement[];
  loading: boolean;
  error: unknown;
  compare: boolean;
  selected: string[];
  onToggleCompare: () => void;
  onSelect: (p: ProgressPhoto) => void;
  onOpen: (p: ProgressPhoto) => void;
  onRetry: () => void;
  /** Signing the private image links failed (thumbnails stay blank). */
  urlError?: unknown;
  onRetryUrls?: () => void;
}

export function PhotosTab({ photos, urls, rows, loading, error, compare, selected, onToggleCompare, onSelect, onOpen, onRetry, urlError, onRetryUrls }: PhotosTabProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const groups = useMemo(
    () => (groupBy === 'week' ? groupByWeek(photos, (p) => p.taken_on, todayISO()) : groupByMonth(photos, (p) => p.taken_on)),
    [photos, groupBy],
  );

  const privacy = (
    <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-muted">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
      <span>
        <b className="font-semibold text-text/90">Riêng tư tuyệt đối.</b> Ảnh nằm trong kho lưu trữ riêng của bạn, không công khai; liên kết xem
        ảnh tự hết hạn sau 1 giờ.
      </span>
    </p>
  );

  if (loading && !photos.length) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Đang tải ảnh">
        <Skeleton height={56} rounded="card" />
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-5 lg:gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} rounded="md" className="aspect-[3/4] !h-auto" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !photos.length) {
    return (
      <EmptyState
        icon={ImageOff}
        title="Không tải được ảnh"
        description={errorMessage(error)}
        action={<Button variant="secondary" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>Thử lại</Button>}
      />
    );
  }

  if (!photos.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-card p-6 animate-fade-slide-up">
          <EmptyState
            icon={Camera}
            title="Ảnh kể câu chuyện số cân không kể"
            description="Chụp ảnh mỗi 1–2 tuần cùng tư thế, cùng ánh sáng. Sau vài tuần, chế độ so sánh sẽ cho bạn thấy khác biệt. Bấm Chụp ảnh hoặc chọn từ Thư viện bên dưới."
          />
        </div>
        {privacy}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {privacy}

      {urlError ? (
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-[rgba(255,107,94,0.3)] bg-[rgba(255,107,94,0.08)] px-3.5 py-2.5 text-[13px] text-text/90">
          <ImageOff className="h-4 w-4 shrink-0 text-[var(--danger-text)]" aria-hidden="true" />
          <span className="flex-1">Không tải được ảnh xem trước — kiểm tra kết nối rồi thử lại.</span>
          {onRetryUrls && (
            <Button variant="secondary" size="sm" onClick={onRetryUrls} icon={<RefreshCw className="h-4 w-4" />}>
              Thử lại
            </Button>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Segmented
          options={[
            { value: 'week', label: 'Tuần' },
            { value: 'month', label: 'Tháng' },
          ]}
          value={groupBy}
          onChange={setGroupBy}
          size="sm"
          ariaLabel="Nhóm ảnh theo"
          className="!w-[150px]"
        />
        <span className="flex-1" />
        <Chip
          onClick={onToggleCompare}
          selected={compare}
          icon={<Columns2 className="h-4 w-4" />}
          disabled={photos.length < 2}
          ariaLabel="Chế độ so sánh"
          className={compare ? '!border-[rgba(237,180,11,0.6)] !bg-[rgba(237,180,11,0.15)]' : undefined}
        >
          So sánh
        </Chip>
      </div>

      {compare && (
        <p className="animate-fade-slide-down rounded-2xl border border-[rgba(237,180,11,0.3)] bg-[rgba(237,180,11,0.08)] px-3.5 py-2.5 text-[13px] text-text/90" aria-live="polite">
          Chọn 2 ảnh để so sánh · đã chọn <b className="tabular text-gold">{selected.length}/2</b>
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between pl-1">
            <h3 className="eyebrow !text-[11px]">{g.label}</h3>
            <span className="text-[12px] text-muted">{g.items.length} ảnh</span>
          </div>
          <ul className="grid grid-cols-3 gap-2 lg:grid-cols-5 lg:gap-3">
            {g.items.map((p) => {
              const order = selected.indexOf(p.id);
              const sel = order >= 0;
              const url = urls[p.storage_path];
              const w = weightOn(rows, p.taken_on, 0);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => (compare ? onSelect(p) : onOpen(p))}
                    aria-pressed={compare ? sel : undefined}
                    aria-label={`${compare ? (sel ? 'Bỏ chọn' : 'Chọn') : 'Xem'} ảnh ${POSE_LABELS[p.pose].toLowerCase()} ${formatDayVi(p.taken_on, 'long')}`}
                    className={clsx(
                      'relative block aspect-[3/4] w-full overflow-hidden rounded-[16px] bg-white/[0.05] ring-1 transition-[transform,box-shadow] duration-200 active:scale-[0.97]',
                      sel ? 'ring-2 ring-[#EDB40B] shadow-[0_0_0_4px_rgba(237,180,11,0.18)]' : 'ring-white/10',
                    )}
                  >
                    {url ? (
                      <img src={url} alt="" loading="lazy" decoding="async" draggable={false} className={clsx('h-full w-full object-cover transition-opacity', compare && !sel && 'opacity-75')} />
                    ) : (
                      <span className="skeleton absolute inset-0" />
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 text-left">
                      <span className="block text-[12px] font-bold leading-tight text-white">{formatDayVi(p.taken_on, 'short')}</span>
                      <span className="block truncate text-[10px] leading-tight text-white/70">
                        {POSE_LABELS[p.pose]}
                        {w ? ` · ${formatKg(w.weight)}` : ''}
                      </span>
                    </span>
                    {compare && (
                      <span
                        className={clsx(
                          'absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border-2 text-[12px] font-extrabold',
                          sel ? 'border-[#EDB40B] bg-gold text-[#1a0e02]' : 'border-white/70 bg-black/30',
                        )}
                        aria-hidden="true"
                      >
                        {sel ? order + 1 : ''}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
