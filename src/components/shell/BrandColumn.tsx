import { Droplet, Flame, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/context/AuthContext';
import { todayISO } from '@/lib/date';
import { onDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { getDaySummary } from '@/services/summary';
import type { DaySummary } from '@/types/db';

/** Desktop-only (≥1100px) left column: logo, huge wordmark, tagline and 3 of today's numbers. */
export function BrandColumn() {
  const { session } = useAuth();
  const [sum, setSum] = useState<DaySummary | null>(null);

  useEffect(() => {
    if (!session) {
      setSum(null);
      return;
    }
    if (!window.matchMedia('(min-width: 1100px)').matches) return;
    let alive = true;
    const load = () =>
      getDaySummary(todayISO())
        .then((s) => alive && setSum(s))
        .catch(() => {});
    void load();
    const off = onDataChanged(() => void load());
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      off();
      window.removeEventListener('focus', onFocus);
    };
  }, [session]);

  const stats = [
    { icon: Utensils, label: 'Đã nạp', value: sum ? formatNumber(sum.kcal_in) : '—', unit: 'kcal', color: 'var(--gold)' },
    { icon: Flame, label: 'Tiêu hao', value: sum ? formatNumber(sum.workout_kcal) : '—', unit: 'kcal', color: 'var(--burn)' },
    { icon: Droplet, label: 'Nước', value: sum ? formatNumber(sum.water_ml) : '—', unit: 'ml', color: 'var(--water)' },
  ];

  return (
    <aside className="hidden w-[min(440px,34vw)] shrink-0 flex-col justify-center desk:flex" aria-label="Fitora">
      <Logo size={88} glow className="mb-8 animate-scale-in" />
      <p className="eyebrow mb-4 animate-fade-slide-up text-gold">AI Nutrition &amp; Fitness Coach</p>
      <h1 className="display animate-speed-reveal text-[128px] leading-[0.82] text-gradient">Fitora</h1>
      <p className="mt-6 max-w-[360px] animate-fade-slide-up text-[17px] leading-relaxed text-muted animate-delay-200">
        Chụp món ăn, AI đếm calo. Theo dõi tập luyện, cân nặng và tiến trình — tất cả trong một chiếc điện thoại.
      </p>
      <div className="mt-10 grid max-w-[400px] grid-cols-3 gap-3 animate-fade-slide-up animate-delay-400">
        {stats.map((s) => (
          <div key={s.label} className="glass-card px-4 py-4">
            <s.icon className="mb-3 h-4 w-4" style={{ color: s.color }} aria-hidden="true" />
            <div className="num text-[28px] text-text">{s.value}</div>
            <div className="mt-2 text-[12px] font-semibold text-muted">
              {s.label} · {s.unit}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-muted/80">{session ? 'Số liệu hôm nay' : 'Đăng nhập để xem số liệu hôm nay'}</p>
    </aside>
  );
}
