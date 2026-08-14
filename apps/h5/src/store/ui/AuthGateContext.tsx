import { createContext, useContext, useMemo, type ReactNode, type ReactElement } from 'react';
import { useStore } from 'react-redux';
import { createAuthGate, type AuthGate } from './authGate';
import type { H5Store } from '../store';

const AuthGateContext = createContext<AuthGate | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }): ReactElement {
  const store = useStore() as H5Store;
  const gate = useMemo(
    () => createAuthGate({ getState: store.getState, dispatch: store.dispatch }),
    [store],
  );
  return <AuthGateContext.Provider value={gate}>{children}</AuthGateContext.Provider>;
}

export function useAuthGate(): AuthGate {
  const gate = useContext(AuthGateContext);
  if (!gate) throw new Error('useAuthGate 必须在 AuthGateProvider 内使用');
  return gate;
}
