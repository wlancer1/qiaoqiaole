import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from 'react-redux';
import { useAuthGate } from '../../store/ui/AuthGateContext';
import { useAppSelector } from '../../store/hooks';
import { selectAuthToken, selectIsAuthenticated } from '../../store/auth/authSlice';
import { useScopedStatus } from '../../store/ui/useScopedStatus';
import type { H5Store } from '../../store/store';

/** Shared login-gate commands. Domain controllers receive this narrow API instead of owning gate state. */
export function useAuthController() {
  const gate = useAuthGate();
  const location = useLocation();
  const store = useStore() as H5Store;
  const isLoggedIn = useAppSelector(selectIsAuthenticated);
  const token = useAppSelector(selectAuthToken);
  const scopeId = useAppSelector((state) => state.ui.currentRouteScope);
  const setStatus = useScopedStatus();
  const returnTo = `${location.pathname}${location.search}`;
  const openLogin = useCallback(() => {
    void gate.require({ scopeId, returnTo });
  }, [gate, returnTo, scopeId]);
  const requireLogin = useCallback((next: (nextToken: string) => void): Promise<boolean> => {
    if (isLoggedIn && token) {
      next(token);
      return Promise.resolve(true);
    }
    const pending = gate.require({ scopeId, returnTo }).then((authenticated) => {
      const nextToken = store.getState().auth.token;
      if (authenticated && nextToken) next(nextToken);
      return authenticated;
    });
    setStatus('请先登录后使用我的功能。');
    return pending;
  }, [gate, isLoggedIn, returnTo, scopeId, setStatus, store, token]);
  return { gate, openLogin, requireLogin };
}
