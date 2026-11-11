import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Blue → violet "Pro" palette (ring + pill), distinct from the app's gold. */
const PRO_GRADIENT = 'conic-gradient(from 200deg, #3b82f6, #8b5cf6, #60a5fa, #6366f1, #3b82f6)';

/** Gradient glow ring around an avatar for paid accounts; renders the child untouched otherwise. */
export function ProRing({ pro, children, className }: { pro: boolean; children: ReactNode; className?: string }) {
  if (!pro) return <>{children}</>;
  return (
    <span
      className={clsx('relative inline-grid shrink-0 place-items-center rounded-full p-[3px]', className)}
      style={{ background: PRO_GRADIENT, boxShadow: '0 0 26px -4px rgba(99,102,241,0.65)' }}
    >
      <span className="grid place-items-center rounded-full bg-[#0c0806] p-[3px]">{children}</span>
    </span>
  );
}

/** "Pro" glowing pill, or a quiet "Thường" pill for free accounts. */
export function PlanPill({ pro, label, className }: { pro: boolean; label?: string; className?: string }) {
  if (pro) {
    return (
      <span
        className={clsx('inline-flex min-h-[32px] items-center justify-center rounded-full px-5 text-[15px] font-extrabold tracking-[-0.01em] text-white', className)}
        style={{
          border: '2px solid transparent',
          background: 'linear-gradient(#0d1020, #0d1020) padding-box, linear-gradient(120deg, #3b82f6, #8b5cf6 60%, #60a5fa) border-box',
          boxShadow: '0 0 20px rgba(99,102,241,0.5), inset 0 -8px 14px rgba(99,102,241,0.28)',
        }}
      >
        {label || 'Pro'}
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex min-h-[28px] items-center justify-center rounded-full border border-line bg-white/[0.05] px-4 text-[13px] font-bold text-muted', className)}>
      {label || 'Thường'}
    </span>
  );
}
