import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Logo } from '@/components/ui/Logo';
import { useProfile } from '@/context/ProfileContext';
import { greetingVi } from '@/lib/date';
import { MenuOverlay } from './MenuOverlay';

export interface TopBarProps {
  /** Overrides the greeting line (small uppercase). */
  eyebrow?: ReactNode;
  /** Overrides the name line. */
  title?: ReactNode;
  /** Extra buttons placed before the menu button. */
  right?: ReactNode;
  className?: string;
}

/** Glass 2-bar menu button (hamburger with two bars). */
export function MenuButton({ onClick, open }: { onClick: () => void; open?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label="Mở menu" aria-expanded={open} aria-haspopup="dialog" className="glass circle">
      <span className="flex w-[18px] flex-col items-end gap-[5px]" aria-hidden="true">
        <span className="h-[2px] w-[18px] rounded-full bg-text" />
        <span className="h-[2px] w-[11px] rounded-full bg-gold" />
      </span>
    </button>
  );
}

/** Top bar: avatar (→ /profile) + greeting, logo, glass menu button opening MenuOverlay. */
export function TopBar({ eyebrow, title, right, className }: TopBarProps) {
  const { shared, displayName } = useProfile();
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className={clsx('flex min-h-[var(--topbar-h)] items-center gap-3', className)}>
        <Link to="/profile" aria-label="Hồ sơ của bạn" className="shrink-0 rounded-full transition active:scale-95">
          <Avatar src={shared?.avatar_url} name={displayName} size={44} />
        </Link>
        <div className="min-w-0 flex-1 animate-fade-slide-down">
          <p className="eyebrow truncate !text-[10px]">{eyebrow ?? greetingVi()}</p>
          <p className="mt-0.5 truncate text-[17px] font-bold tracking-[-0.02em] text-text">{title ?? displayName}</p>
        </div>
        <Logo size={28} className="mr-1 opacity-95" />
        {right}
        <MenuButton onClick={() => setMenu(true)} open={menu} />
      </div>
      <MenuOverlay open={menu} onClose={() => setMenu(false)} />
    </>
  );
}
