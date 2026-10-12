import clsx from 'clsx';
import { BookOpen, Bookmark, Droplet, Dumbbell, Flame, Home, LogOut, PersonStanding, ScanLine, Target, TrendingUp, UserRound, Utensils, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { formatNumber } from '@/lib/format';
import { SAVED_FOODS_PATH } from './MenuOverlay';
import { isLinkActive, prefetchHandlers } from './routes';
import { useTodayGlance } from './useTodayGlance';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Hằng ngày',
    items: [
      { to: '/', label: 'Hôm nay', icon: Home },
      { to: '/diary', label: 'Nhật ký ăn', icon: BookOpen },
      { to: SAVED_FOODS_PATH, label: 'Món của tôi', icon: Bookmark },
    ],
  },
  {
    title: 'Theo dõi',
    items: [
      { to: '/workout', label: 'Tập luyện', icon: Dumbbell },
      { to: '/progress', label: 'Tiến trình', icon: TrendingUp },
      { to: '/body', label: 'Cơ thể', icon: PersonStanding },
    ],
  },
  {
    title: 'Cá nhân',
    items: [
      { to: '/goals', label: 'Mục tiêu', icon: Target },
      { to: '/profile', label: 'Hồ sơ', icon: UserRound },
    ],
  },
];

function SideLink({ item }: { item: NavItem }) {
  const { pathname, search } = useLocation();
  const active = isLinkActive(item.to, pathname, search);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        // Already there: scroll back to the top instead of stacking a duplicate history entry.
        if (pathname + search !== item.to) return;
        e.preventDefault();
        document.querySelector<HTMLElement>('#fitora-app main')?.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      {...prefetchHandlers(item.to)}
      className={clsx(
        'group relative flex min-h-[44px] items-center gap-3 rounded-2xl px-3 text-[14px] font-semibold transition-colors',
        active ? 'bg-white/[0.07] text-gold' : 'text-muted hover:bg-white/[0.04] hover:text-text',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'absolute -left-4 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold shadow-[0_0_12px_rgba(237,180,11,0.9)] transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Today's three headline numbers, compact. */
function TodayGlanceCard() {
  const g = useTodayGlance();
  const rows = [
    { icon: Utensils, label: 'Đã nạp', value: g.kcalIn, unit: 'kcal', color: 'var(--gold)' },
    { icon: Flame, label: 'Tiêu hao', value: g.burned, unit: 'kcal', color: 'var(--burn)' },
    { icon: Droplet, label: 'Nước', value: g.waterMl, unit: 'ml', color: 'var(--water)' },
  ];
  return (
    <section className="glass-card px-4 py-3.5 [@media(max-height:859px)]:hidden" aria-label="Số liệu hôm nay">
      <p className="eyebrow !text-[10px]">Hôm nay</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13px]">
            <r.icon className="h-4 w-4 shrink-0" style={{ color: r.color }} aria-hidden="true" />
            <span className="flex-1 text-muted">{r.label}</span>
            <span className="tabular font-bold text-text">{r.value === null ? '—' : formatNumber(r.value)}</span>
            <span className="w-7 text-[11px] text-muted">{r.unit}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Laptop (≥1024px) navigation column: brand, gold "Quét món AI" call to action, grouped links,
 * today's numbers and the account row. Replaces BottomNav + MenuOverlay at that width.
 */
export function Sidebar({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { signOut, session } = useAuth();
  const { shared, displayName } = useProfile();
  const [busy, setBusy] = useState(false);
  const scanActive = pathname === '/scan';
  return (
    <aside
      aria-label="Thanh bên"
      className={clsx('flex-col border-r border-white/[0.06] bg-[rgba(12,6,4,0.55)] backdrop-blur-xl', className)}
    >
      <div className="flex items-center gap-2.5 px-6 pb-2 pt-6">
        <span className="display text-[26px] text-gradient">Fitora</span>
      </div>

      <div className="px-4 pt-5">
        <Link
          to="/scan"
          {...prefetchHandlers('/scan')}
          aria-current={scanActive ? 'page' : undefined}
          className={clsx(
            'flex min-h-[50px] items-center justify-center gap-2.5 rounded-full text-[15px] font-bold text-[#1a0e02] transition active:scale-[0.98]',
            'bg-[radial-gradient(circle_at_30%_25%,#ffe48a_0%,#edb40b_45%,#c27c06_100%)] shadow-[0_14px_30px_-10px_rgba(237,180,11,0.65),inset_0_1px_0_rgba(255,255,255,0.6)] hover:brightness-105',
            scanActive && 'ring-2 ring-gold/50 ring-offset-2 ring-offset-bg',
          )}
        >
          <ScanLine className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          Quét món AI
        </Link>
      </div>

      <nav aria-label="Điều hướng chính" className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-4">
            <p className="eyebrow mb-1.5 px-3 !text-[10px]">{g.title}</p>
            <div className="flex flex-col gap-0.5">
              {g.items.map((i) => (
                <SideLink key={i.to} item={i} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 px-4 pb-5">
        <TodayGlanceCard />
        <div className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
          <Link to="/profile" {...prefetchHandlers('/profile')} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl" aria-label="Hồ sơ của bạn">
            <Avatar src={shared?.avatar_url} name={displayName} size={38} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-text">{displayName}</span>
              <span className="block truncate text-[12px] text-muted">{session?.user.email}</span>
            </span>
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                setBusy(false);
              }
            }}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="glass circle !h-10 !w-10 text-muted hover:text-text disabled:opacity-60"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
