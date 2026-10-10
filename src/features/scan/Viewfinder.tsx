import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Square framing guide with gold corner brackets and an optional sweeping scan line. */
export function Viewfinder({ scanning, tone = 'gold', children, className }: { scanning?: boolean; tone?: 'gold' | 'ok' | 'muted'; children?: ReactNode; className?: string }) {
  const color = tone === 'ok' ? 'border-ok' : tone === 'muted' ? 'border-white/50' : 'border-gold';
  const corner = clsx('absolute h-9 w-9 transition-colors duration-300', color);
  return (
    <div
      className={clsx('relative aspect-square w-[74%] max-w-[300px]', scanning && 'scan-frame', className)}
      aria-hidden="true"
    >
      <span className={clsx(corner, 'left-0 top-0 rounded-tl-[22px] border-l-[3px] border-t-[3px]')} />
      <span className={clsx(corner, 'right-0 top-0 rounded-tr-[22px] border-r-[3px] border-t-[3px]')} />
      <span className={clsx(corner, 'bottom-0 left-0 rounded-bl-[22px] border-b-[3px] border-l-[3px]')} />
      <span className={clsx(corner, 'bottom-0 right-0 rounded-br-[22px] border-b-[3px] border-r-[3px]')} />
      {scanning && (
        <div className="absolute inset-2 overflow-hidden rounded-[18px]">
          <div className="scan-sweep" />
        </div>
      )}
      {children}
    </div>
  );
}
