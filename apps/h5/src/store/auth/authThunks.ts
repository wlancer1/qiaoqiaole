import { createAsyncThunk } from '@reduxjs/toolkit';
import { sessionCleared } from './authEvents';
import { resolveRestoredDisplayName } from '../../utils/authDisplayName';
import type { AuthUser } from './authTypes';
import { type H5RootState } from '../store';

type MeResponse = {
  user?: {
    id?: unknown;
    username?: unknown;
    nickname?: unknown;
    avatarUrl?: unknown;
    likesCount?: unknown;
    followingCount?: unknown;
    followersCount?: unknown;
  };
  likesCount?: unknown;
  followingCount?: unknown;
  followersCount?: unknown;
};

export type RestorePayload = {
  token: string;
  user: AuthUser;
};

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeRestoredUser(payload: MeResponse, storedUsername: string | undefined): AuthUser {
  const rawUser = payload.user;
  if (!rawUser || typeof rawUser.id !== 'string' || !rawUser.id.trim() || typeof rawUser.username !== 'string') {
    throw new Error('登录状态响应无效');
  }
  const username = rawUser.username.trim();
  if (!username) throw new Error('登录状态响应无效');

  return {
    id: rawUser.id,
    username,
    displayName: resolveRestoredDisplayName(rawUser, storedUsername),
    avatarUrl: typeof rawUser.avatarUrl === 'string' ? rawUser.avatarUrl : '',
    legacyDraftOwnerId: storedUsername?.trim() || username,
    likesCount: count(payload.likesCount ?? rawUser.likesCount),
    followingCount: count(payload.followingCount ?? rawUser.followingCount),
    followersCount: count(payload.followersCount ?? rawUser.followersCount),
  };
}

export const restoreSession = createAsyncThunk<
  RestorePayload,
  { sessionVersion: number },
  { state: H5RootState; rejectValue: string }
>(
  'auth/restoreSession',
  async ({ sessionVersion: _sessionVersion }, thunkApi) => {
    const { auth } = thunkApi.getState();
    const token = auth.token;
    const hint = auth.restoreIdentityHint;
    if (!token) return thunkApi.rejectWithValue('登录状态已失效');

    try {
      const response = await fetch('/api/me', {
        headers: { authorization: `Bearer ${token}` },
        signal: thunkApi.signal,
      });
      const payload = await response.json().catch(() => null) as MeResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as Record<string, unknown>).message)
          : '登录状态已失效');
      }
      return { token, user: normalizeRestoredUser(payload, hint?.username) };
    } catch (error) {
      if (thunkApi.signal.aborted) throw error;
      return thunkApi.rejectWithValue(error instanceof Error ? error.message : '登录状态已失效');
    }
  },
  {
    condition: ({ sessionVersion }, { getState }) => {
      const { auth } = getState() as H5RootState;
      return auth.status === 'restoring'
        && auth.restoreRequestId === null
        && auth.sessionVersion === sessionVersion
        && auth.token.trim() !== '';
    },
  },
);

export const logout = createAsyncThunk<void, void, { state: H5RootState }>(
  'auth/logout',
  async (_, thunkApi) => {
    const token = thunkApi.getState().auth.token;
    thunkApi.dispatch(sessionCleared());
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        signal: thunkApi.signal,
      });
    } catch {
      // Local logout is already complete; server cleanup is best effort.
    }
  },
);
