import { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '../app/overlays/useBodyScrollLock';

export type ConfirmDialogRequest = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

type ConfirmDialogProps = ConfirmDialogRequest & {
  onCancel: () => void;
};

export function ConfirmDialog({ title, message, confirmText = '确认', cancelText = '取消', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  useBodyScrollLock(true);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onCancel]);

  const handleConfirm = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!isSubmitting) onCancel();
  };

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) handleCancel(); }} onTouchStart={(event) => event.stopPropagation()}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-dialog-icon" aria-hidden="true">!</div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" aria-label={`取消${title}`} onClick={handleCancel} disabled={isSubmitting}>{cancelText}</button>
          <button type="button" className={`confirm-dialog-confirm${danger ? ' is-danger' : ''}`} aria-label={`确认${title}`} onClick={() => { void handleConfirm(); }} disabled={isSubmitting}>{isSubmitting ? '提交中...' : confirmText}</button>
        </div>
      </section>
    </div>
  );
}
