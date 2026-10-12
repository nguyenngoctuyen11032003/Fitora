import clsx from 'clsx';

/** URL of the official brand mark (public/logo.png) — works with Vite base './'. */
export const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

export interface LogoProps {
  /** Pixel size of the square mark (default 28). */
  size?: number;
  /** Soft blue/green halo behind the mark (hero / splash). */
  glow?: boolean;
  /** Show the "Fitora" wordmark next to the mark. */
  wordmark?: boolean;
  className?: string;
  /** Decorative by default (alt=""); pass a label when the logo stands alone. */
  label?: string;
}

/** Brand mark (fork + flame + leaf + progress ring). */
export function Logo({ size = 28, glow, wordmark, className, label }: LogoProps) {
  return (
    <span className={clsx('relative inline-flex shrink-0 items-center gap-2', className)}>
      <span className="relative inline-flex" style={{ width: size, height: size }}>
        {glow && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[45%] rounded-full opacity-70 blur-2xl"
            style={{
              background:
                'radial-gradient(circle at 35% 40%, rgba(94,200,242,0.45) 0%, transparent 55%), radial-gradient(circle at 65% 60%, rgba(127,209,139,0.38) 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(225,80,10,0.25) 0%, transparent 70%)',
            }}
          />
        )}
        <img
          src={LOGO_URL}
          width={size}
          height={size}
          alt={label ?? ''}
          aria-hidden={label ? undefined : true}
          decoding="async"
          draggable={false}
          className="relative h-full w-full select-none object-contain"
        />
      </span>
      {wordmark && <span className="display text-[20px] text-text">Fitora</span>}
    </span>
  );
}
