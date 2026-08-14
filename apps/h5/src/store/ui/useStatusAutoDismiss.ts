import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks';
import { selectCurrentRouteScope, selectUiStatus, statusCleared } from './uiSlice';

const STATUS_VISIBLE_MS = 2800;
const STICKY_STATUS_PREFIX = '正在';

export function useStatusAutoDismiss(): void {
  const dispatch = useAppDispatch();
  const currentScope = useAppSelector(selectCurrentRouteScope);
  const status = useAppSelector(selectUiStatus);

  useEffect(() => {
    if (
      !status
      || status.scopeId === 'global'
      || status.scopeId !== currentScope
      || status.message.startsWith(STICKY_STATUS_PREFIX)
    ) return undefined;

    const capturedStatus = status;
    const timer = globalThis.setTimeout(() => {
      if (currentScope !== capturedStatus.scopeId) return;
      dispatch(statusCleared({ scopeId: capturedStatus.scopeId }));
    }, STATUS_VISIBLE_MS);

    return () => globalThis.clearTimeout(timer);
  }, [currentScope, dispatch, status]);
}
