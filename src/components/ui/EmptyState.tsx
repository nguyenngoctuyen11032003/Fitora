import clsx from 'clsx';
import type { ComponentType, ReactNode } from 'react';

export interface EmptyStateProps {
  /** lucide icon component (e.g. Utensils) or any node. */
  icon?: ComponentType<{ className?: string }> | ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** CTA (usually a <Button>). */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Friendly empty / error placeholder with a glowing icon tile. */
export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  const isComponent = typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in (icon as object));
  const Icon = isComponent ? (icon as ComponentType<{ className?: string }>) : null;
  return (
    <div className={clsx('flex flex-col items-center text-center', compact ? 'gap-2 py-6' : 'gap-3 px-4 py-10', className)}>
      {icon && (
        <div className="relative mb-1">
          <div className="absolute inset-0 rounded-[22px] bg-ember/30 blur-xl" aria-hidden="true" />
          <div className="glass relative grid h-16 w-16 place-items-center rounded-[22px] text-gold">
            {Icon ? <Icon className="h-7 w-7" /> : (icon as ReactNode)}
          </div>
        </div>
      )}
      <h3 className="display text-[22px] text-text">{title}</h3>
      {description && <p className="max-w-[280px] text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
