import clsx from 'clsx';
import { Dumbbell, ScanLine, TrendingUp } from 'lucide-react';
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

const FEATURES = [
  { icon: ScanLine, title: 'Chụp món, AI đếm calo', text: 'Nhận diện món Việt và ước lượng khẩu phần trong vài giây.' },
  { icon: Dumbbell, title: 'Tập luyện & vận động', text: 'Lịch tập tuần, bước chân và năng lượng tiêu hao.' },
  { icon: TrendingUp, title: 'Tiến trình rõ ràng', text: 'Cân nặng, số đo và báo cáo tuần / tháng.' },
];

/** Laptop-only (≥1024px) brand half next to the form. */
function BrandHero() {
  return (
    <section className="relative hidden flex-col justify-center px-[clamp(40px,6vw,96px)] py-12 lg:flex" aria-hidden="true">
      <p className="eyebrow mb-4 animate-fade-slide-up text-gold">AI Nutrition &amp; Fitness Coach</p>
      <p className="display animate-speed-reveal text-[clamp(96px,10vw,140px)] leading-[0.82] text-gradient">Fitora</p>
      <p className="mt-6 max-w-[440px] animate-fade-slide-up text-[17px] leading-relaxed text-muted animate-delay-200">
        Huấn luyện viên dinh dưỡng &amp; thể hình bỏ túi — trên điện thoại lẫn laptop, cùng một tài khoản.
      </p>
      <ul className="mt-10 flex max-w-[460px] flex-col gap-3 animate-fade-slide-up animate-delay-400">
        {FEATURES.map((f) => (
          <li key={f.title} className="glass-card flex items-center gap-4 px-5 py-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--gold-soft)] text-gold">
              <f.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-text">{f.title}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Shared hero + glass form card for the auth screens. On laptop the page splits in two:
 * brand half on the left, the same form column on the right.
 * `main` is a size container, so the hero scales with the phone frame (cqw) and tightens when the screen is
 * short (`[@container(max-height:779px)]`, e.g. the desktop phone frame) — not with the browser window.
 * Its box comes from inset-0, so size containment doesn't collapse it.
 */
export function AuthLayout({ eyebrow, title, subtitle, children, footer, compact }: AuthLayoutProps) {
  return (
    <main className="no-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden [container-type:size]">
      {/* ember glow, centred behind the logo; clipped so it never adds scroll height */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-48 left-1/2 h-[440px] w-[440px] -translate-x-1/2 rounded-full bg-ember/30 blur-[110px]" />
        <div className="absolute -bottom-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-[rgba(237,180,11,0.07)] blur-[90px]" />
      </div>

      {/* Phone: display contents (no box, same layout as before). Laptop: two halves. */}
      <div className="contents lg:relative lg:grid lg:min-h-full lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <BrandHero />
        {/* my-auto centres the column vertically when there is room, and scrolls cleanly when there isn't */}
        <div className="relative mx-auto flex min-h-full w-full max-w-[420px] flex-col px-5 pb-[calc(var(--safe-bottom)+20px)] pt-[calc(var(--safe-top)+20px)] lg:max-w-[460px] lg:py-10">
          <div className="my-auto w-full">
            <header
              className={clsx(
                'flex flex-col items-center text-center [@container(max-height:779px)]:mb-4',
                compact ? 'mb-5' : 'mb-6',
              )}
            >
              <Logo
                size={compact ? 60 : 76}
                glow
                label="Fitora"
                className={clsx(
                  'animate-scale-in',
                  !compact && '[@container(max-height:779px)]:[&>span]:!h-[60px] [@container(max-height:779px)]:[&>span]:!w-[60px]',
                )}
              />
              <h1
                className={clsx(
                  'display mt-3 animate-speed-reveal text-gradient leading-[0.9] tracking-[-0.05em] [@container(max-height:779px)]:mt-2 lg:sr-only',
                  compact
                    ? 'text-[clamp(40px,14cqw,52px)]'
                    : 'text-[clamp(48px,17cqw,64px)] [@container(max-height:779px)]:text-[clamp(40px,14cqw,52px)]',
                )}
              >
                Fitora
              </h1>
              {!compact && (
                <p className="mt-2 animate-fade-slide-up text-[13px] font-medium text-muted animate-delay-200 [@container(max-height:779px)]:hidden lg:hidden">
                  Chụp món · Đếm calo · Theo dõi tiến trình
                </p>
              )}
            </header>

            <section className="glass-card animate-fade-slide-up p-5 animate-delay-300 min-[400px]:p-6" aria-labelledby="auth-title">
              <p className="eyebrow text-[rgba(237,180,11,0.9)]">{eyebrow}</p>
              <h2 id="auth-title" className="display mt-1.5 text-[28px] leading-tight text-text">
                {title}
              </h2>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
              <div className="mt-5">{children}</div>
            </section>

            {footer && <div className="mt-3 text-center text-sm text-muted [@container(max-height:779px)]:mt-1">{footer}</div>}
          </div>
        </div>
      </div>
    </main>
  );
}
