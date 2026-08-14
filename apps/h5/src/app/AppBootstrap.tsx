import { useEffect, useId, type ReactNode, type ReactElement } from 'react';
import { useStore } from 'react-redux';
import { AuthGateProvider, useAuthGate } from '../store/ui/AuthGateContext';
import { restoreSession } from '../store/auth/authThunks';
import type { H5Store } from '../store/store';
import { RouteScopeBridge } from './RouteScopeBridge';

function BootstrapEffects({ children }: { children: ReactNode }): ReactElement {
  const store = useStore() as H5Store;
  const gate = useAuthGate();
  const ownerId = useId();

  useEffect(() => {
    gate.attach(ownerId);
    return () => gate.release(ownerId);
  }, [gate, ownerId]);

  useEffect(() => {
    const sessionVersion = store.getState().auth.sessionVersion;
    void store.dispatch(restoreSession({ sessionVersion }));
  }, [store]);

  return <>{children}</>;
}

export function AppBootstrap({ children }: { children: ReactNode }): ReactElement {
  return (
    <AuthGateProvider>
      <RouteScopeBridge />
      <BootstrapEffects>{children}</BootstrapEffects>
    </AuthGateProvider>
  );
}
