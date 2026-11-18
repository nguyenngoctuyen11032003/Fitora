import { ChevronRight, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { planDayFor } from '@/data/workoutPlan';
import { formatNumber } from '@/lib/format';
import { useActiveSession } from './SessionContext';
import { StartSessionSheet } from './StartSessionSheet';
import { SESSION_PATH } from './ActiveSessionBar';
import { formatClock } from './timer';

/** "Tập ngay" entry on the workout page: starts a session, or resumes the running one. */
export function StartCard() {
  const s = useActiveSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const today = planDayFor();
  const training = today && !today.isRestDay && today.exercises.length > 0 ? today : null;

  if (s.session) {
    return (
      <Link to={SESSION_PATH} className="glass-card flex min-h-[72px] items-center gap-3 border-[rgba(237,180,11,0.45)] p-4 transition-transform active:scale-[0.99]">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-[#1a0e02]">
          <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-text">{s.paused ? 'Tiếp tục buổi tập' : 'Đang tập'} · {s.session.title}</span>
          <span className="tabular block truncate text-[12.5px] text-muted">
            {formatClock(s.elapsedMs)} · ≈ {formatNumber(s.kcal)} kcal
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass-card flex min-h-[72px] w-full items-center gap-3 p-4 text-left transition-transform active:scale-[0.99]">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-[#1a0e02] shadow-[0_10px_30px_-10px_rgba(237,180,11,0.7)]">
          <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-bold text-text">Tập ngay</span>
          <span className="block truncate text-[12.5px] text-muted">
            {training ? `Hôm nay: ${training.title} · ${training.exercises.length} bài` : today?.isRestDay ? 'Hôm nay nghỉ phục hồi · chọn hoạt động nhẹ' : 'Chọn buổi tập hoặc hoạt động'}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <StartSessionSheet open={open} onClose={() => setOpen(false)} onStarted={() => navigate(SESSION_PATH)} />
    </>
  );
}
