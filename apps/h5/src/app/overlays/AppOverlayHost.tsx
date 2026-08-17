import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { useStatusAutoDismiss } from '../../store/ui/useStatusAutoDismiss';
import { useRouteScopedStatus } from '../useRouteScopedStatus';
import { appOverlaySlotNames, useAppOverlay, useAppOverlayState } from './AppOverlayContext';
import { useBodyScrollLock } from './useBodyScrollLock';

export function AppOverlayHost() {
  const status = useRouteScopedStatus();
  const statusToastIdRef = useRef<string | null>(null);
  const { confirmRequest, slots } = useAppOverlayState();
  const { closeConfirm } = useAppOverlay();
  useStatusAutoDismiss();
  useBodyScrollLock(Boolean(confirmRequest || appOverlaySlotNames.some((name) => slots[name])));

  useEffect(() => {
    if (!status) {
      if (statusToastIdRef.current !== null) toast.dismiss(statusToastIdRef.current);
      statusToastIdRef.current = null;
      return;
    }
    const id = `h5-status:${status.scopeId}`;
    statusToastIdRef.current = toast(status.message, {
      id,
      duration: 2800,
      ariaProps: { role: 'status', 'aria-live': 'polite' },
    });
  }, [status]);

  return (
    <div className="h5-app-overlays" data-testid="h5-app-overlay-host">
      <Toaster
        position="bottom-center"
        containerStyle={{ bottom: 'max(2.6032rem, calc(1.8413rem + env(safe-area-inset-bottom)))' }}
        toastOptions={{
          duration: 2800,
          style: {
            width: 'min(calc(100% - 1.5238rem), 8.9524rem)',
            maxWidth: 'calc(100% - 1.5238rem)',
            padding: '.3175rem .4444rem',
            borderRadius: '.4444rem',
            background: 'var(--ink)',
            color: '#fff',
            fontFamily: 'PingFangSC, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '.381rem',
            fontWeight: 600,
            lineHeight: 1.35,
            textAlign: 'center',
            boxShadow: '0 .254rem .5714rem rgba(14, 26, 44, .22)',
          },
        }}
      />
      {confirmRequest ? <ConfirmDialog
        {...confirmRequest.request}
        onCancel={() => closeConfirm(confirmRequest.id)}
        onConfirm={async () => {
          await confirmRequest.request.onConfirm();
          closeConfirm(confirmRequest.id);
        }}
      /> : null}
      {appOverlaySlotNames.map((name) => slots[name] ? <div key={name} data-overlay-slot={name}>{slots[name]}</div> : null)}
    </div>
  );
}
