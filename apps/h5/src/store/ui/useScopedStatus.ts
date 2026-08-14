import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks';
import { selectCurrentRouteScope, statusRequested } from './uiSlice';

export function useScopedStatus(): (message: string) => void {
  const dispatch = useAppDispatch();
  const scopeId = useAppSelector(selectCurrentRouteScope);

  return useCallback((message: string) => {
    dispatch(statusRequested({ scopeId, message }));
  }, [dispatch, scopeId]);
}
