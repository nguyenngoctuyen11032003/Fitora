import clsx from 'clsx';
import { ArrowUpRight, LogOut, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Portal } from '@/components/ui/Portal';
import { useFocusTrap } from '@/components/ui/useFocusTrap';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { isLinkActive, prefetchHandlers } from './routes';

/** Food search opened on the "Món của tôi" tab (saved / scanned dishes). */
export const SAVED_FOODS_PATH = '/food/search?tab=mine';

export const MENU_LINKS: { to: string; label: string; hint: string }[] = [
  { to: '/', label: 'Hôm nay', hint: 'Calo, macro, nước, bước' },
  { to: '/diary', label: 'Nhật ký ăn', hint: 'Bữa sáng · trưa · tối · vặt' },
  { to: '/scan', label: 'Quét món AI', hint: 'Chụp ảnh, AI đếm calo' },
  { to: SAVED_FOODS_PATH, label: 'Món của tôi', hint: 'Món đã lưu · ghi lại chỉ 1 chạm' },
  { to: '/workout', label: 'Tập luyện', hint: 'Lịch tuần, buổi tập, bước chân' },
  { to: '/progress', label: 'Tiến trình', hint: 'Báo cáo tuần / tháng' },
  { to: '/body', label: 'Cơ thể', hint: 'Cân nặng, số đo, ảnh' },
  { to: '/goals', label: 'Mục tiêu', hint: 'Calo & macro mỗi ngày' },
  { to: '/profile', label: 'Hồ sơ', hint: 'Thông tin & cài đặt' },
];

export interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
}

/** Full-screen ember menu (inside the frame) with staggered links and sign-out. */
export function MenuOverlay({ open, onClose }: MenuOverlayProps) {
  const { signOut } = useAuth();
  const { displayName } = useProfile();
  const { pathname, search } = useLocation();
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
    } else if (mounted) {
      setLeaving(true);
      const t = window.setTimeout(() => setMounted(false), 280);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useFocusTrap(panel, open && mounted, onClose);
  if (!mounted) return null;

  return (
    <Portal>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className={clsx(
          'menu-ember absolute inset-0 z-[80] flex flex-col overflow-hidden outline-none transition-[opacity,transform] duration-300 ease-out',
          leaving ? 'pointer-events-none scale-[1.02] opacity-0' : 'pointer-events-auto animate-fade-in',
        )}
      >
        {/* glow + grain */}
        <div className="pointer-events-none absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-[rgba(237,180,11,0.25)] blur-[90px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-black/40 blur-[80px]" aria-hidden="true" />

        <div className="relative flex items-center justify-between px-5 pt-[calc(var(--safe-top)+12px)]">
          <span className="flex items-center">
            <span className="display text-[22px] text-white">Fitora</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Đóng menu" className="glass circle text-white" data-autofocus>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="relative mt-6 px-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-white/60">Xin chào, {displayName}</p>

        <nav className="no-scrollbar relative mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]" aria-label="Điều hướng chính">
          <ul className="flex flex-col">
            {MENU_LINKS.map((l, i) => {
              const isActive = isLinkActive(l.to, pathname, search);
              return (
                <li key={l.to} className="animate-fade-slide-left" style={{ animationDelay: `${80 + i * 55}ms` }}>
                  <Link
                    to={l.to}
                    aria-current={isActive ? 'page' : undefined}
                    // Already there: just close the menu instead of stacking a duplicate history entry.
                    onClick={(e) => {
                      if (pathname + search === l.to) e.preventDefault();
                      onClose();
                    }}
                    {...prefetchHandlers(l.to)}
                    className={clsx(
                      'group flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-black/10',
                      isActive ? 'text-gold' : 'text-white hover:text-gold',
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="display text-[30px] leading-[1]">{l.label}</span>
                      <span className={clsx('mt-1 truncate text-[12px] font-medium', isActive ? 'text-white/90' : 'text-white/80')}>{l.hint}</span>
                    </span>
                    <ArrowUpRight
                      className="h-5 w-5 shrink-0 opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="relative px-5 pb-[calc(var(--safe-bottom)+16px)] pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-black/20 text-[15px] font-bold text-white transition hover:bg-black/30 active:scale-[0.98] disabled:opacity-60"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </div>
    </Portal>
  );
}
