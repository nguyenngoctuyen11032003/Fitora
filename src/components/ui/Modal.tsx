import clsx from 'clsx';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Portal } from './Portal';
import { useFocusTrap } from './useFocusTrap';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Allow closing via backdrop / Esc / ✕ (default true). */
  dismissible?: boolean;
  className?: string;
}

/** Centered dialog inside the phone frame (portal → #fitora-overlay-root). */
export function Modal({ open, onClose, title, children, footer, dismissible = true, className }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useFocusTrap(panel, open && mounted, dismissible ? onClose : undefined);
  if (!mounted) return null;

  return (
    <Portal>
      <div className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center p-5" role="presentation">
        <div
          aria-hidden="true"
          onClick={dismissible ? onClose : undefined}
          className={clsx('absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-200', closing ? 'opacity-0' : 'animate-fade-in')}
        />
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          className={clsx(
            'glass-strong relative w-full max-w-[360px] rounded-[28px] bg-[rgba(24,14,10,0.95)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none transition-[opacity,transform] duration-200',
            closing ? 'scale-95 opacity-0' : 'animate-scale-in',
            className,
          )}
        >
          {(title || dismissible) && (
            <div className="mb-3 flex items-start gap-3">
              {title && (
                <h2 id={titleId} className="display flex-1 pt-2 text-[22px] text-text">
                  {title}
                </h2>
              )}
              {dismissible && (
                <button type="button" onClick={onClose} aria-label="Đóng" className="glass circle ml-auto -mr-2 -mt-2 text-text">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          <div className="text-[15px] leading-relaxed text-muted">{children}</div>
          {footer && <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon (deletes). */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Yes/No confirmation (e.g. "Xóa món này?"). */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', danger, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      dismissible={!loading}
      title={
        <span className="flex items-center gap-2.5">
          {danger && <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--danger-text)]" aria-hidden="true" />}
          {title}
        </span>
      }
      footer={
        <>
          {/* Destructive dialogs focus "Hủy" first so a stray Enter / Space never deletes. */}
          <Button variant="secondary" onClick={onCancel} disabled={loading} block data-autofocus={danger ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} block data-autofocus={danger ? undefined : true}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
