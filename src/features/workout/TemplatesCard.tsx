import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDayVi } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import type { WorkoutTemplate } from '@/types/db';
import { ActivityIcon } from './ActivityIcon';

interface Props {
  templates: WorkoutTemplate[] | undefined;
  loading: boolean;
  date: string;
  /** kcal estimate for a template at the current weight. */
  estimate: (t: WorkoutTemplate) => number;
  busyId: string | null;
  onApply: (t: WorkoutTemplate) => void;
  onCustomize: (t: WorkoutTemplate) => void;
  onDelete: (t: WorkoutTemplate) => Promise<void>;
}

/** Saved workout templates: "+" adds to the selected day in one tap, the row opens the sheet prefilled. */
export function TemplatesCard({ templates, loading, date, estimate, busyId, onApply, onCustomize, onDelete }: Props) {
  const [managing, setManaging] = useState(false);
  const [toDelete, setToDelete] = useState<WorkoutTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const list = templates ?? [];

  const confirm = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await onDelete(toDelete);
      setToDelete(null);
    } catch {
      /* caller toasts */
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section aria-labelledby="tpl-h" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Thêm nhanh vào {formatDayVi(date).toLowerCase()}</p>
          <h2 id="tpl-h" className="display mt-1.5 text-[26px] text-text">
            Mẫu bài tập
          </h2>
        </div>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => setManaging((m) => !m)}
            aria-pressed={managing}
            className="min-h-[44px] rounded-full px-3 text-[13px] font-bold text-gold hover:bg-white/[0.06]"
          >
            {managing ? 'Xong' : 'Quản lý'}
          </button>
        )}
      </div>

      {loading && !templates ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={64} rounded="card" />
          <Skeleton height={64} rounded="card" />
        </div>
      ) : list.length === 0 ? (
        <GlassCard padding="md" className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-gold/15 text-gold">
            <Bookmark className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-[13.5px] leading-relaxed text-muted">
            Chưa có mẫu. Khi ghi buổi tập, chạm <b className="font-semibold text-text">Lưu làm mẫu</b> để lần sau thêm chỉ bằng một chạm.
          </p>
        </GlassCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((t) => (
            <li key={t.id} className="glass-card flex items-center gap-1 p-1.5 pr-1.5">
              <button
                type="button"
                onClick={() => onCustomize(t)}
                className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-[18px] px-1.5 text-left hover:bg-white/[0.04]"
                aria-label={`Tùy chỉnh rồi thêm ${t.name}`}
              >
                <ActivityIcon activity={t.activity} category={t.category} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold tracking-[-0.01em] text-text">{t.name}</span>
                  <span className="block text-[12.5px] text-muted">
                    {t.duration_min} phút · ~{formatNumber(estimate(t))} kcal
                  </span>
                </span>
              </button>
              {managing ? (
                <button
                  type="button"
                  onClick={() => setToDelete(t)}
                  aria-label={`Xóa mẫu ${t.name}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--danger-text)] hover:bg-white/[0.06]"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onApply(t)}
                  disabled={busyId === t.id}
                  aria-label={`Thêm ${t.name} vào ${formatDayVi(date).toLowerCase()}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-[#1a0e02] shadow-[0_8px_20px_-10px_rgba(237,180,11,0.9)] transition-transform active:scale-90 disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.6} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Xóa mẫu này?"
        message={toDelete ? `Mẫu “${toDelete.name}” sẽ bị xóa. Các buổi tập đã ghi vẫn được giữ.` : undefined}
        confirmLabel="Xóa mẫu"
        danger
        loading={deleting}
        onConfirm={confirm}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
