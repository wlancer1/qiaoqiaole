import { useLocation } from 'react-router-dom';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { useAppDispatch } from '../../store/hooks';
import { globalStatusCleared, statusCleared } from '../../store/ui/uiSlice';
import { useStatusAutoDismiss } from '../../store/ui/useStatusAutoDismiss';
import { routeScopeId } from '../RouteScopeBridge';
import { useRouteScopedStatus } from '../useRouteScopedStatus';
import { appOverlaySlotNames, useAppOverlay, useAppOverlayState } from './AppOverlayContext';
import { useBodyScrollLock } from './useBodyScrollLock';

export function AppOverlayHost() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const status = useRouteScopedStatus();
  const { confirmRequest, slots } = useAppOverlayState();
  const { closeConfirm } = useAppOverlay();
  useStatusAutoDismiss();
  useBodyScrollLock(Boolean(confirmRequest || appOverlaySlotNames.some((name) => slots[name])));

  const clearStatus = () => {
    if (!status) return;
    if (status.scopeId === 'global') {
      dispatch(globalStatusCleared());
      return;
    }
    dispatch(statusCleared({ scopeId: routeScopeId(location) }));
  };

  return (
    <div className="h5-app-overlays" data-testid="h5-app-overlay-host">
      {status ? <p className="app-status" role="status" aria-live="polite">{status.message}<button className="app-status-close" type="button" aria-label="关闭提示" onClick={clearStatus}>×</button></p> : null}
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
