import { createSelector, createSlice } from '@reduxjs/toolkit';
import {
  profileStatsUpdated,
  profileUpdated,
  sessionCleared,
  sessionEstablished,
  sessionInvalidated,
} from './authEvents';
import type { AuthState, StoredAuthRecord } from './authTypes';

type AuthRootState = {
  auth: AuthState;
};

export function createAuthInitialState(storedRecord: StoredAuthRecord | null): AuthState {
  if (!storedRecord) {
    return {
      status: 'anonymous',
      token: '',
      user: null,
      restoreIdentityHint: null,
      restoreRequestId: null,
      sessionVersion: 0,
    };
  }

  return {
    status: 'restoring',
    token: storedRecord.token,
    user: null,
    restoreIdentityHint: {
      ...(storedRecord.username !== undefined ? { username: storedRecord.username } : {}),
      ...(storedRecord.userId !== undefined ? { userId: storedRecord.userId } : {}),
    },
    restoreRequestId: null,
    sessionVersion: 0,
  };
}

function clearSession(state: AuthState): void {
  state.status = 'anonymous';
  state.token = '';
  state.user = null;
  state.restoreIdentityHint = null;
  state.restoreRequestId = null;
  state.sessionVersion += 1;
}

const authSlice = createSlice({
  name: 'auth',
  initialState: createAuthInitialState(null),
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sessionEstablished, (state, action) => {
        state.status = 'authenticated';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.restoreIdentityHint = null;
        state.restoreRequestId = null;
        state.sessionVersion += 1;
      })
      .addCase(sessionInvalidated, (state, action) => {
        if (
          action.payload.token !== state.token
          || action.payload.sessionVersion !== state.sessionVersion
        ) return;
        clearSession(state);
      })
      .addCase(sessionCleared, (state) => {
        clearSession(state);
      })
      .addCase(profileUpdated, (state, action) => {
        if (
          !state.user
          || action.payload.token !== state.token
          || action.payload.sessionVersion !== state.sessionVersion
        ) return;
        Object.assign(state.user, action.payload.changes);
      })
      .addCase(profileStatsUpdated, (state, action) => {
        if (
          !state.user
          || action.payload.token !== state.token
          || action.payload.sessionVersion !== state.sessionVersion
        ) return;
        Object.assign(state.user, action.payload.changes);
      });
  },
});

export const authReducer = authSlice.reducer;

export const selectAuthToken = (state: AuthRootState): string => state.auth.token;
export const selectAuthUserId = (state: AuthRootState): string => state.auth.user?.id ?? '';
export const selectAuthDisplayName = (state: AuthRootState): string => state.auth.user?.displayName ?? '';
export const selectAuthAvatarUrl = (state: AuthRootState): string => state.auth.user?.avatarUrl ?? '';
export const selectAuthStats = createSelector(
  [(state: AuthRootState) => state.auth.user],
  (user): Pick<
  NonNullable<AuthState['user']>,
  'likesCount' | 'followingCount' | 'followersCount'
  > => ({
    likesCount: user?.likesCount ?? 0,
    followingCount: user?.followingCount ?? 0,
    followersCount: user?.followersCount ?? 0,
  }),
);
export const selectIsAuthenticated = (state: AuthRootState): boolean => (
  state.auth.status === 'authenticated'
);
