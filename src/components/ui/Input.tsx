import clsx from 'clsx';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface FieldChrome {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Leading icon (lucide element). */
  icon?: ReactNode;
  /** Trailing element (unit, button…). */
  trailing?: ReactNode;
  wrapperClassName?: string;
}

/** Label + field shell + hint/error. Used by Input, Textarea and NumberField. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  icon,
  trailing,
  wrapperClassName,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', wrapperClassName)}>
      {label && (
        <label htmlFor={id} className="pl-1 text-[13px] font-semibold text-muted">
          {label}
        </label>
      )}
      <div className="field" data-invalid={error ? 'true' : undefined}>
        {icon && <span className="shrink-0 text-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
        {children}
        {trailing && <span className="shrink-0 text-sm font-semibold text-muted">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="pl-1 text-[13px] font-medium text-[var(--danger-text)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="pl-1 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, FieldChrome {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, trailing, wrapperClassName, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} icon={icon} trailing={trailing} wrapperClassName={wrapperClassName}>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={clsx('text-text', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Omit<FieldChrome, 'icon' | 'trailing'> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, wrapperClassName, id, className, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} wrapperClassName={wrapperClassName}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        className={clsx('resize-none text-text', className)}
        {...rest}
      />
    </FieldShell>
  );
});
