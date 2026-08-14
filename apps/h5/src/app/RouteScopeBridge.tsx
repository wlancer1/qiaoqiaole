import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch } from '../store/hooks';
import { routeScopeChanged } from '../store/ui/uiSlice';
import { useAuthGate } from '../store/ui/AuthGateContext';

export function routeScopeId(location: { key: string; pathname: string; search: string }): string {
  return `${location.key}:${location.pathname}${location.search}`;
}

export function RouteScopeBridge(): null {
  const dispatch = useAppDispatch();
  const gate = useAuthGate();
  const location = useLocation();
  const scopeId = routeScopeId(location);

  useEffect(() => {
    dispatch(routeScopeChanged({ scopeId }));
    gate.routeChanged(scopeId);
  }, [dispatch, gate, scopeId]);

  return null;
}
