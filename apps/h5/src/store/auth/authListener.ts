import { createListenerMiddleware, type ListenerMiddlewareInstance } from '@reduxjs/toolkit';
import { apiSlice } from '../api/apiSlice';
import { clearStoredAuth, writeStoredAuth } from './authStorage';
import { sessionCleared, sessionEstablished, sessionInvalidated } from './authEvents';
import { restoreSession } from './authThunks';
import type { H5RootState } from '../store';
import type { AuthState } from './authTypes';

export type AuthListenerOptions = { storage?: Storage };

export const MAX_HANDLED_EVENTS = 128;

export function createAuthListenerMiddleware(
  options: AuthListenerOptions = {},
): ListenerMiddlewareInstance {
  const middleware = createListenerMiddleware();
  const handled = new Map<string, true>();
  const once = (key: string): boolean => {
    if (handled.has(key)) return false;
    handled.set(key, true);
    if (handled.size > MAX_HANDLED_EVENTS) {
      const oldest = handled.keys().next().value;
      if (oldest !== undefined) handled.delete(oldest);
    }
    return true;
  };
  const resetCache = (api: { dispatch: (action: unknown) => unknown }): void => {
    api.dispatch(apiSlice.util.resetApiState());
  };

  middleware.startListening({
    actionCreator: sessionEstablished,
    effect: async (action, api) => {
      const auth = (api.getState() as H5RootState).auth;
      if (!once(`established:${auth.sessionVersion}`)) return;
      writeStoredAuth(options.storage, {
        token: action.payload.token,
        username: action.payload.user.username,
        userId: action.payload.user.id,
      });
      resetCache(api);
    },
  });

  middleware.startListening({
    actionCreator: sessionCleared,
    effect: async (_action, api) => {
      const auth = (api.getState() as H5RootState).auth;
      if (!once(`cleared:${auth.sessionVersion}`)) return;
      clearStoredAuth(options.storage);
      resetCache(api);
    },
  });

  middleware.startListening({
    actionCreator: sessionInvalidated,
    effect: async (action, api) => {
      const original = (api.getOriginalState() as H5RootState).auth;
      if (action.payload.token !== original.token || action.payload.sessionVersion !== original.sessionVersion) return;
      if (!once(`invalidated:${original.sessionVersion}`)) return;
      clearStoredAuth(options.storage);
      resetCache(api);
    },
  });

  middleware.startListening({
    actionCreator: restoreSession.fulfilled,
    effect: async (action, api) => {
      const original = (api.getOriginalState() as H5RootState).auth;
      if (!isCurrentRestore(original, action.meta.requestId, action.meta.arg.sessionVersion)) return;
      if (!once(`restore:${action.meta.requestId}:fulfilled`)) return;
      writeStoredAuth(options.storage, {
        token: action.payload.token,
        username: action.payload.user.username,
        userId: action.payload.user.id,
      });
      resetCache(api);
    },
  });

  middleware.startListening({
    actionCreator: restoreSession.rejected,
    effect: async (action, api) => {
      const original = (api.getOriginalState() as H5RootState).auth;
      if (!isCurrentRestore(original, action.meta.requestId, action.meta.arg.sessionVersion)) return;
      if (!once(`restore:${action.meta.requestId}:rejected`)) return;
      clearStoredAuth(options.storage);
      resetCache(api);
    },
  });

  return middleware;
}

function isCurrentRestore(
  auth: AuthState,
  requestId: string,
  sessionVersion: number,
): boolean {
  return auth.restoreRequestId === requestId && auth.sessionVersion === sessionVersion;
}
