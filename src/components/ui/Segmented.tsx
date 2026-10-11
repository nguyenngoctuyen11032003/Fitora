import clsx from 'clsx';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible group name. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  /** Stretch segments to equal widths (default true). */
  block?: boolean;
  className?: string;
}

/** Pill segmented control with a sliding gold indicator (radiogroup, arrow-key navigation). */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, size = 'md', block = true, className }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;

  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    let i = idx;
    for (let k = 0; k < n; k++) {
      i = e.key === 'Home' ? k : e.key === 'End' ? n - 1 - k : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      if (!options[i].disabled) break;
    }
    onChange(options[i].value);
    refs.current[i]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={clsx(
        'relative isolate flex rounded-full border border-line bg-white/[0.04] p-1',
        block ? 'w-full' : 'inline-flex',
        className,
      )}
    >
      {block && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 top-1 -z-10 rounded-full bg-gold shadow-[0_6px_20px_-8px_rgba(237,180,11,0.8)] transition-[left] duration-300 ease-out"
          style={{ width: `calc((100% - 8px) / ${n})`, left: `calc(4px + (100% - 8px) / ${n} * ${idx})` }}
        />
      )}
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors duration-200 disabled:opacity-40',
              block && 'flex-1',
              size === 'sm' ? 'min-h-[44px] px-3 text-[13px]' : 'min-h-[44px] px-4 text-sm',
              on ? 'text-[#1a0e02]' : 'text-muted hover:text-text',
              !block && on && 'bg-gold',
            )}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
