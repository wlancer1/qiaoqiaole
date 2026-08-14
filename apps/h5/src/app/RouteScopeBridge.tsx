import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch } from '../store/hooks';
import { routeScopeChanged } from '../store/ui/uiSlice';

export function routeScopeId(location: { key: string; pathname: string; search: string }): string {
  return `${location.key}:${location.pathname}${location.search}`;
}

export function RouteScopeBridge(): null {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const scopeId = routeScopeId(location);

  useEffect(() => {
    dispatch(routeScopeChanged({ scopeId }));
  }, [dispatch, scopeId]);

  return null;
}
