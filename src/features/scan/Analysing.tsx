import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Viewfinder } from './Viewfinder';

const STEPS = ['Đang gửi ảnh', 'Nhận diện món ăn', 'Ước lượng khẩu phần', 'Tính calo & macro'];

/** Asymptotic fake progress: fast at first, never reaching 100% until the answer arrives. */
function useCreep(active: boolean) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) return;
    setP(0);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setP(94 * (1 - Math.exp(-s / 3.2)));
    }, 120);
    return () => window.clearInterval(id);
  }, [active]);
  return p;
}

/** Full-screen "AI is looking at your photo" state over the captured image. */
export function Analysing({ photoUrl, onCancel }: { photoUrl: string | null; onCancel: () => void }) {
  const p = useCreep(true);
  const step = Math.min(STEPS.length - 1, Math.floor(p / 24));
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black" role="status" aria-live="polite" aria-busy="true">
      {photoUrl && <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-70 blur-[1px]" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/85" aria-hidden="true" />

      <div className="relative flex flex-1 items-center justify-center">
        <Viewfinder scanning />
      </div>

      <div className="relative px-5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        <div className="glass-strong animate-fade-slide-up rounded-[28px] p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[rgba(237,180,11,0.15)] text-gold">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow !text-[rgba(237,180,11,0.9)]">AI đang phân tích</p>
              <p key={step} className="mt-1 animate-fade-slide-up truncate text-[17px] font-bold text-text">
                {STEPS[step]}
                <span className="scan-dots ml-0.5" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </p>
            </div>
            <span className="num tabular text-[34px] text-gradient-gold" aria-hidden="true">
              {Math.round(p)}
              <span className="text-[16px]">%</span>
            </span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label="Tiến độ phân tích">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember via-gold to-[#ffe48a] transition-[width] duration-150 ease-linear"
              style={{ width: `${p}%` }}
            />
          </div>
          <Button variant="ghost" size="sm" block className="mt-3 text-muted" onClick={onCancel}>
            Hủy
          </Button>
        </div>
      </div>
    </div>
  );
}
