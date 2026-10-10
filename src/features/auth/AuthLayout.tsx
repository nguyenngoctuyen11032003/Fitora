import { Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

interface AuthLayoutProps {
  /** Small gold line above the form title. */
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Links under the card. */
  footer?: ReactNode;
  /** Compact hero (secondary screens). */
  compact?: boolean;
}

/** Shared hero + glass form card for the auth screens. */
export function AuthLayout({ eyebrow, title, subtitle, children, footer, compact }: AuthLayoutProps) {
  return (
    <main className="no-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden">
      {/* ember glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[520px] -translate-x-1/2 rounded-full bg-ember/35 blur-[110px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 top-40 h-60 w-60 rounded-full bg-gold/10 blur-[80px]" aria-hidden="true" />
      {/* speed lines */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+150px)] flex flex-col gap-2 opacity-40" aria-hidden="true">
        {[72, 48, 88].map((w, i) => (
          <span
            key={i}
            className="h-px animate-fade-slide-left bg-gradient-to-l from-gold/70 to-transparent"
            style={{ width: `${w}%`, marginLeft: 'auto', animationDelay: `${300 + i * 120}ms` }}
          />
        ))}
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-[460px] flex-col px-5 pb-[calc(var(--safe-bottom)+28px)] pt-[calc(var(--safe-top)+28px)]">
        <header className={compact ? 'mb-7' : 'mb-9'}>
          <Logo size={compact ? 72 : 104} glow label="Fitora" className="mb-5 animate-scale-in" />
          <h1
            className={`display animate-speed-reveal text-gradient ${compact ? 'text-[72px]' : 'text-[96px]'} leading-[0.82] tracking-[-0.06em]`}
          >
            Fitora
          </h1>
          <p className="mt-4 max-w-[320px] animate-fade-slide-up text-[15px] leading-relaxed text-muted animate-delay-200">
            Huấn luyện viên dinh dưỡng &amp; thể hình AI — chụp món, đếm calo, theo dõi tiến trình.
          </p>
        </header>

        <section className="glass-card animate-fade-slide-up p-6 animate-delay-300" aria-labelledby="auth-title">
          <p className="eyebrow text-gold/90">{eyebrow}</p>
          <h2 id="auth-title" className="display mt-2 text-[32px] text-text">
            {title}
          </h2>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>

        <div className="mt-5 flex animate-fade-slide-up items-start gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 animate-delay-500">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-muted">
            <strong className="font-semibold text-text">Dùng chung tài khoản với Note_mytasks.</strong> Đã có tài khoản Note_mytasks? Đăng nhập bằng
            đúng email &amp; mật khẩu đó — không cần đăng ký lại.
          </p>
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
