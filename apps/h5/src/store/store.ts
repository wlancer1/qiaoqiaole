import { configureStore } from '@reduxjs/toolkit';
import { apiSlice } from './api/apiSlice';
import { createAuthInitialState, authReducer } from './auth/authSlice';
import { readStoredAuth } from './auth/authStorage';
import { createAuthListenerMiddleware } from './auth/authListener';

export type H5StoreOptions = {
  storage?: Storage;
};

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createH5Store(options: H5StoreOptions = {}) {
  const storage = options.storage ?? getBrowserStorage();
  const storedAuth = readStoredAuth(storage);
  const authInitialState = createAuthInitialState(storedAuth);
  const authListener = createAuthListenerMiddleware({ storage });

  return configureStore({
    reducer: {
      api: apiSlice.reducer,
      auth: authReducer,
    },
    preloadedState: {
      auth: authInitialState,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware()
      .prepend(authListener.middleware)
      .concat(apiSlice.middleware),
  });
}

export type H5Store = ReturnType<typeof createH5Store>;
export type H5RootState = ReturnType<H5Store['getState']>;
export type H5Dispatch = H5Store['dispatch'];
