import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassButton } from './GlassButton';

export interface ScreenHeaderProps {
  title: ReactNode;
  /** Small uppercase line above the title. */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  /** true = history back (fallback '/'), string = navigate to that path. */
  back?: boolean | string;
  /** Right-side actions (GlassButtons). */
  actions?: ReactNode;
  /** lg 44px title (default) · md 32px. */
  size?: 'md' | 'lg';
  /** Speed-reveal entrance (default true). */
  reveal?: boolean;
  className?: string;
}

/** Page heading: eyebrow + huge tight title (F1 display style). */
export function ScreenHeader({ title, eyebrow, subtitle, back, actions, size = 'lg', reveal = true, className }: ScreenHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <header className={clsx('flex flex-col gap-3', className)}>
      {(back || actions) && (
        <div className="flex min-h-[44px] items-center justify-between gap-2">
          {back ? (
            <GlassButton label="Quay lại" onClick={goBack}>
              <ChevronLeft className="h-5 w-5" />
            </GlassButton>
          ) : (
            <span />
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(reveal && 'animate-speed-reveal')}>
        {eyebrow && <p className="eyebrow mb-2 text-gold/90">{eyebrow}</p>}
        <h1 className={clsx('display text-text', size === 'lg' ? 'text-[44px]' : 'text-[32px]')}>{title}</h1>
        {subtitle && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}
