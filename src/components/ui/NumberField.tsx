import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatNumber, parseDecimal } from '@/lib/format';
import { FieldShell } from './Input';

export interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: ReactNode;
  /** Unit shown at the end of the field ("kg", "g", "kcal"). */
  unit?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  min?: number;
  max?: number;
  /** Stepper increment (default 1). */
  step?: number;
  /** Max decimals kept (default 1; 0 = integers → inputMode numeric). */
  decimals?: number;
  /** Show − / + 44px stepper buttons. */
  stepper?: boolean;
  /** 'lg' = big display digits (onboarding style). */
  size?: 'md' | 'lg';
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  icon?: ReactNode;
  wrapperClassName?: string;
  /** Called on blur with the clamped value. */
  onBlur?: () => void;
}

const fmt = (v: number | null, decimals: number) =>
  v === null || !Number.isFinite(v) ? '' : formatNumber(v, Math.min(2, decimals) as 0 | 1 | 2).replace(/\./g, '');

/**
 * Numeric input that accepts "68,5" or "68.5" (vi keyboards), uses
 * inputMode="decimal", clamps to [min,max] on blur and optional steppers.
 */
export function NumberField({
  value,
  onChange,
  label,
  unit,
  hint,
  error,
  min,
  max,
  step = 1,
  decimals = 1,
  stepper,
  size = 'md',
  placeholder,
  id,
  name,
  disabled,
  autoFocus,
  icon,
  wrapperClassName,
  onBlur,
}: NumberFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [text, setText] = useState(() => fmt(value, decimals));
  const lastEmitted = useRef<number | null>(value);

  // External value changes (not caused by typing) re-sync the text.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(fmt(value, decimals));
      lastEmitted.current = value;
    }
  }, [value, decimals]);

  const clamp = (v: number) => {
    let x = v;
    if (min !== undefined) x = Math.max(min, x);
    if (max !== undefined) x = Math.min(max, x);
    const f = 10 ** decimals;
    return Math.round(x * f) / f;
  };

  const emit = (v: number | null) => {
    lastEmitted.current = v;
    onChange(v);
  };

  const handleText = (raw: string) => {
    const cleaned = raw.replace(decimals === 0 ? /[^\d]/g : /[^\d.,]/g, '');
    setText(cleaned);
    const n = parseDecimal(cleaned);
    emit(n === null ? null : n);
  };

  const handleBlur = () => {
    const n = parseDecimal(text);
    if (n !== null) {
      const c = clamp(n);
      setText(fmt(c, decimals));
      if (c !== value) emit(c);
    }
    onBlur?.();
  };

  const bump = (dir: 1 | -1) => {
    const base = value ?? min ?? 0;
    const c = clamp(base + dir * step);
    setText(fmt(c, decimals));
    emit(c);
  };

  const big = size === 'lg';
  const input = (
    <input
      id={fid}
      name={name}
      type="text"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      autoComplete="off"
      enterKeyHint="done"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-invalid={error ? true : undefined}
      onChange={(e) => handleText(e.target.value)}
      onBlur={handleBlur}
      className={clsx('tabular text-text', big && '!py-2 text-center !text-[44px] font-extrabold tracking-[-0.04em]')}
    />
  );

  if (!stepper) {
    return (
      <FieldShell id={fid} label={label} hint={hint} error={error} icon={icon} trailing={unit} wrapperClassName={wrapperClassName}>
        {input}
      </FieldShell>
    );
  }

  return (
    <FieldShell
      id={fid}
      label={label}
      hint={hint}
      error={error}
      icon={
        <button
          type="button"
          aria-label="Giảm"
          disabled={disabled || (min !== undefined && (value ?? min) <= min)}
          onClick={() => bump(-1)}
          className="glass circle -ml-2 !h-11 !w-11 text-text disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
      }
      trailing={
        <span className="flex items-center gap-2">
          {unit}
          <button
            type="button"
            aria-label="Tăng"
            disabled={disabled || (max !== undefined && (value ?? 0) >= max)}
            onClick={() => bump(1)}
            className="glass circle -mr-2 !h-11 !w-11 text-text disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
          </button>
        </span>
      }
      wrapperClassName={wrapperClassName}
    >
      <div className="flex-1 text-center [&>input]:w-full [&>input]:text-center">{input}</div>
    </FieldShell>
  );
}
