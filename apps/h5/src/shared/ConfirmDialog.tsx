import { useEffect } from 'react';

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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-dialog-icon" aria-hidden="true">!</div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>{cancelText}</button>
          <button type="button" className={`confirm-dialog-confirm${danger ? ' is-danger' : ''}`} onClick={() => void onConfirm()}>{confirmText}</button>
        </div>
      </section>
    </div>
  );
}
