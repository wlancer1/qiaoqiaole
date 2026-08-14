import type { H5RootState } from '../store';
import {
  loginRequestCancelled,
  loginRequestCompleted,
  loginRequestReconciled,
  loginRequestStarted,
} from './uiSlice';

export type AuthGateState = Pick<H5RootState, 'auth' | 'ui'> | {
  auth: Pick<H5RootState['auth'], 'status'>;
  ui: Pick<H5RootState['ui'], 'currentRouteScope' | 'loginRequest'>;
};

export type AuthGateDependencies = {
  getState: () => AuthGateState;
  dispatch: (action:
    | ReturnType<typeof loginRequestCancelled>
    | ReturnType<typeof loginRequestCompleted>
    | ReturnType<typeof loginRequestReconciled>
    | ReturnType<typeof loginRequestStarted>) => unknown;
};

export type AuthGateRequireOptions = {
  scopeId: string;
  returnTo?: string;
};

export type AuthGate = {
  require(options: AuthGateRequireOptions): Promise<boolean>;
  routeChanged(nextScope: string): void;
  completeLogin(requestId: string): void;
  cancelLogin(requestId: string): void;
  attach(ownerId: string): void;
  release(ownerId: string): void;
};

type Waiter = AuthGateRequireOptions & {
  resolve: (authenticated: boolean) => void;
};

function normalizeReturnTo(returnTo?: string): string | undefined {
  const normalized = returnTo?.trim();
  return normalized || undefined;
}

function createRequestId(sequence: number): string {
  return `login-${sequence}`;
}

export function createAuthGate({ getState, dispatch }: AuthGateDependencies): AuthGate {
  const waiters: Waiter[] = [];
  const owners = new Set<string>();
  let nextRequestNumber = 0;
  let activeRequestId: string | null = null;
  let releaseGeneration = 0;

  const settle = (result: boolean, predicate: (waiter: Waiter) => boolean): void => {
    const remaining: Waiter[] = [];
    for (const waiter of waiters) {
      if (predicate(waiter)) waiter.resolve(result);
      else remaining.push(waiter);
    }
    waiters.splice(0, waiters.length, ...remaining);
  };

  const cancelActiveRequest = (): void => {
    if (activeRequestId === null) return;
    dispatch(loginRequestCancelled({ id: activeRequestId }));
    activeRequestId = null;
  };

  const reconcile = (scopeId: string): void => {
    if (activeRequestId === null) return;
    const surviving = waiters.filter((waiter) => waiter.scopeId === scopeId);
    if (surviving.length === 0) {
      cancelActiveRequest();
      return;
    }
    const firstReturnTo = surviving
      .map((waiter) => normalizeReturnTo(waiter.returnTo))
      .find((returnTo): returnTo is string => Boolean(returnTo));
    dispatch(loginRequestReconciled({
      id: activeRequestId,
      scopeId,
      ...(firstReturnTo ? { returnTo: firstReturnTo } : {}),
    }));
  };

  return {
    require(options) {
      const returnTo = normalizeReturnTo(options.returnTo);
      const state = getState();
      if (state.auth.status === 'authenticated') return Promise.resolve(true);
      if (state.ui.currentRouteScope !== options.scopeId || owners.size === 0) {
        return Promise.resolve(false);
      }

      const promise = new Promise<boolean>((resolve) => {
        waiters.push({ scopeId: options.scopeId, ...(returnTo ? { returnTo } : {}), resolve });
      });
      const shouldAnnounce = activeRequestId === null || Boolean(returnTo);
      if (activeRequestId === null) {
        nextRequestNumber += 1;
        activeRequestId = createRequestId(nextRequestNumber);
      }
      if (!shouldAnnounce) return promise;
      dispatch(loginRequestStarted({
        id: activeRequestId,
        scopeId: options.scopeId,
        ...(returnTo ? { returnTo } : {}),
      }));
      return promise;
    },

    routeChanged(nextScope) {
      settle(false, (waiter) => waiter.scopeId !== nextScope);
      reconcile(nextScope);
    },

    completeLogin(requestId) {
      if (activeRequestId !== requestId) return;
      dispatch(loginRequestCompleted({ id: requestId }));
      activeRequestId = null;
      settle(true, () => true);
    },

    cancelLogin(requestId) {
      if (activeRequestId !== requestId) return;
      dispatch(loginRequestCancelled({ id: requestId }));
      activeRequestId = null;
      settle(false, () => true);
    },

    attach(ownerId) {
      releaseGeneration += 1;
      owners.add(ownerId);
    },

    release(ownerId) {
      if (!owners.delete(ownerId)) return;
      const generation = ++releaseGeneration;
      queueMicrotask(() => {
        if (generation !== releaseGeneration || owners.size > 0) return;
        cancelActiveRequest();
        settle(false, () => true);
      });
    },
  };
}
