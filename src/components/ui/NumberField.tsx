import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { parseDecimal } from '@/lib/format';
import { FieldShell } from './Input';
import { clampNumber, formatNumberInput as fmt, labelText, rangeMessage, sanitizeNumberInput, stepperAriaLabel } from './numberFieldLogic';

export interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: ReactNode;
  /** Plain-text name for the − / + buttons ("Giảm Đạm"); derived from `label` when omitted. */
  ariaLabel?: string;
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
  /**
   * Clamp an out-of-range value to [min, max] on blur (default false). By
   * default the typed value is kept, emitted as-is and flagged inline
   * ("Tối đa 300 kg") so a typo is never silently saved as a different number;
   * the parent form decides whether to block saving.
   */
  clampOnBlur?: boolean;
  /** Called on blur, after the value is committed. */
  onBlur?: () => void;
}

/**
 * Numeric input that accepts "68,5" or "68.5" (vi keyboards), uses
 * inputMode="decimal", flags values outside [min,max] (clamps on blur only with
 * clampOnBlur) and optional steppers (which always stay in range).
 * ArrowUp / ArrowDown step the value (Shift = ×10).
 */
export function NumberField({
  value,
  onChange,
  label,
  ariaLabel,
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
  clampOnBlur = false,
  onBlur,
}: NumberFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [text, setText] = useState(() => fmt(value, decimals));
  const lastEmitted = useRef<number | null>(value);
  const [focused, setFocused] = useState(false);

  // External value changes (not caused by typing) re-sync the text.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(fmt(value, decimals));
      lastEmitted.current = value;
    }
  }, [value, decimals]);

  const clamp = (v: number) => clampNumber(v, { min, max, decimals });
  // Opt-in: "-" is only accepted when the caller explicitly allows negatives.
  const allowNegative = min !== undefined && min < 0;

  const emit = (v: number | null) => {
    lastEmitted.current = v;
    onChange(v);
  };

  const handleText = (raw: string) => {
    const cleaned = sanitizeNumberInput(raw, decimals, allowNegative);
    setText(cleaned);
    const n = parseDecimal(cleaned);
    // "68" → "68," keeps the same number: skip the redundant parent update.
    if (n !== lastEmitted.current) emit(n);
  };

  const handleBlur = () => {
    const n = parseDecimal(text);
    setFocused(false);
    if (n !== null) {
      const c = clampOnBlur ? clamp(n) : clampNumber(n, { decimals });
      setText(fmt(c, decimals));
      if (c !== value) emit(c);
    } else if (text) {
      // Leftover junk ("," or "-") → empty field, consistent with the null value.
      setText('');
      if (value !== null) emit(null);
    }
    onBlur?.();
  };

  const bump = (dir: 1 | -1, mult = 1) => {
    const base = value !== null && Number.isFinite(value) ? value : (min ?? 0);
    const c = clamp(base + dir * step * mult);
    setText(fmt(c, decimals));
    if (c !== value) emit(c);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
  };

  // Parent errors win; otherwise flag an out-of-range value ourselves (min only once the user leaves the field).
  const shownError =
    error ?? rangeMessage(value, { min, max }, typeof unit === 'string' ? unit : undefined, !focused) ?? undefined;
  const describedBy = shownError ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  const stepName = ariaLabel ?? labelText(label);
  const atMin = min !== undefined && (value ?? min) <= min;
  const atMax = max !== undefined && value !== null && value >= max;

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
      aria-invalid={shownError ? true : undefined}
      aria-describedby={describedBy}
      onChange={(e) => handleText(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={clsx('tabular text-text', big && '!py-2 text-center !text-[44px] font-extrabold tracking-[-0.04em]')}
    />
  );

  if (!stepper) {
    return (
      <FieldShell id={fid} label={label} hint={hint} error={shownError} icon={icon} trailing={unit} wrapperClassName={wrapperClassName}>
        {input}
      </FieldShell>
    );
  }

  return (
    <FieldShell
      id={fid}
      label={label}
      hint={hint}
      error={shownError}
      icon={
        <button
          type="button"
          aria-label={stepperAriaLabel('Giảm', stepName)}
          aria-controls={fid}
          disabled={disabled || atMin}
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
            aria-label={stepperAriaLabel('Tăng', stepName)}
            aria-controls={fid}
            disabled={disabled || atMax}
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
