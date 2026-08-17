import { createAsyncThunk } from '@reduxjs/toolkit';
import { sessionCleared } from './authEvents';
import { resolveRestoredDisplayName } from '../../utils/authDisplayName';
import type { AuthUser } from './authTypes';
import { type H5RootState } from '../store';

type MeResponse = {
  data?: {
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
};

type MeData = {
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

function normalizeRestoredUser(payload: MeData, storedUsername: string | undefined): AuthUser {
  const rawUser = payload.user;
  if (!rawUser || typeof rawUser.id !== 'string' || !rawUser.id.trim()) {
    throw new Error('登录状态响应无效');
  }
  const username = typeof rawUser.username === 'string' && rawUser.username.trim()
    ? rawUser.username.trim()
    : typeof rawUser.nickname === 'string' ? rawUser.nickname.trim() : '';
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

async function fetchCurrentUser(token: string, signal: AbortSignal): Promise<{ response: Response; payload: MeResponse | null }> {
  const response = await fetch('/api/v1/auth/me', {
    headers: { authorization: `Bearer ${token}` },
    signal,
  });
  return { response, payload: await response.json().catch(() => null) as MeResponse | null };
}

async function refreshAccessToken(signal: AbortSignal): Promise<string> {
  const response = await fetch('/api/v1/auth/token/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal,
  });
  const payload = await response.json().catch(() => null) as { data?: { accessToken?: unknown }; message?: unknown } | null;
  const token = payload?.data?.accessToken;
  if (!response.ok || typeof token !== 'string' || !token.trim()) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : '登录状态已失效');
  }
  return token;
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
      let activeToken = token;
      let current = await fetchCurrentUser(activeToken, thunkApi.signal);
      if (current.response.status === 401) {
        activeToken = await refreshAccessToken(thunkApi.signal);
        current = await fetchCurrentUser(activeToken, thunkApi.signal);
      }
      if (!current.response.ok || !current.payload?.data) {
        throw new Error(current.payload && typeof current.payload === 'object' && 'message' in current.payload
          ? String((current.payload as Record<string, unknown>).message)
          : '登录状态已失效');
      }
      return { token: activeToken, user: normalizeRestoredUser(current.payload.data, hint?.username) };
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

export const logoutSession = createAsyncThunk<void, void, { state: H5RootState }>(
  'auth/logout',
  async (_, thunkApi) => {
    const token = thunkApi.getState().auth.token;
    thunkApi.dispatch(sessionCleared());
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: '{}',
        signal: thunkApi.signal,
      });
    } catch {
      // Local logout is already complete; server cleanup is best effort.
    }
  },
);

export const logout = logoutSession;
