import clsx from 'clsx';
import type { CSSProperties } from 'react';

export interface SkeletonProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  /** 'md' 12px (default) · 'full' pill/circle · 'card' 24px. */
  rounded?: 'md' | 'full' | 'card';
  style?: CSSProperties;
}

/** Shimmering placeholder block. */
export function Skeleton({ className, width, height = 16, rounded = 'md', style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={clsx('skeleton', rounded === 'full' ? 'rounded-full' : rounded === 'card' ? 'rounded-card' : 'rounded-xl', className)}
      style={{ width, height, ...style }}
    />
  );
}

/** A few text lines. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

/** Generic page placeholder (header + cards) used while lazy pages load. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-[calc(var(--safe-top)+20px)]" role="status" aria-label="Đang tải">
      <Skeleton width={110} height={12} />
      <Skeleton width="70%" height={40} />
      <Skeleton height={180} rounded="card" className="mt-3" />
      <Skeleton height={96} rounded="card" />
      <Skeleton height={96} rounded="card" />
    </div>
  );
}
