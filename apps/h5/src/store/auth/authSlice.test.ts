import { describe, expect, it } from 'vitest';
import {
  profileStatsUpdated,
  profileUpdated,
  sessionCleared,
  sessionEstablished,
  sessionInvalidated,
} from './authEvents';
import {
  authReducer,
  createAuthInitialState,
  selectAuthAvatarUrl,
  selectAuthDisplayName,
  selectAuthStats,
  selectAuthToken,
  selectAuthUserId,
  selectIsAuthenticated,
} from './authSlice';
import type { AuthState, AuthUser } from './authTypes';

const user: AuthUser = {
  id: 'user-a',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: 'https://example.com/alice.png',
  legacyDraftOwnerId: 'alice',
  likesCount: 3,
  followingCount: 4,
  followersCount: 5,
};

function establish(state = createAuthInitialState(null), token = 'token-a', nextUser = user): AuthState {
  return authReducer(state, sessionEstablished({ token, user: nextUser }));
}

describe('createAuthInitialState', () => {
  it('creates a restoring state from a stored token and identity hints', () => {
    expect(createAuthInitialState({ token: 'token-a', username: 'alice', userId: 'user-a' })).toEqual({
      status: 'restoring',
      token: 'token-a',
      user: null,
      restoreIdentityHint: { username: 'alice', userId: 'user-a' },
      restoreRequestId: null,
      sessionVersion: 0,
    });
  });

  it('creates an anonymous state without a stored record', () => {
    expect(createAuthInitialState(null)).toEqual({
      status: 'anonymous',
      token: '',
      user: null,
      restoreIdentityHint: null,
      restoreRequestId: null,
      sessionVersion: 0,
    });
  });
});

describe('auth reducer session events', () => {
  it('establishes a session atomically and increments the session generation', () => {
    const restoring = createAuthInitialState({ token: 'token-a', username: 'hint', userId: 'hint-id' });
    const restoringSnapshot = structuredClone(restoring);
    const established = authReducer(restoring, sessionEstablished({ token: 'token-a', user }));

    expect(established).toEqual({
      status: 'authenticated',
      token: 'token-a',
      user,
      restoreIdentityHint: null,
      restoreRequestId: null,
      sessionVersion: 1,
    });
    expect(restoring).toEqual(restoringSnapshot);
    expect(established).not.toBe(restoring);
  });

  it('accepts invalidation only for the current token and generation', () => {
    const authenticated = establish();
    const invalidated = authReducer(authenticated, sessionInvalidated({
      token: authenticated.token,
      sessionVersion: authenticated.sessionVersion,
    }));

    expect(invalidated).toEqual({
      status: 'anonymous',
      token: '',
      user: null,
      restoreIdentityHint: null,
      restoreRequestId: null,
      sessionVersion: authenticated.sessionVersion + 1,
    });
  });

  it('ignores invalidation carrying an old token or generation', () => {
    const authenticated = establish();

    expect(authReducer(authenticated, sessionInvalidated({
      token: 'old-token',
      sessionVersion: authenticated.sessionVersion,
    }))).toBe(authenticated);
    expect(authReducer(authenticated, sessionInvalidated({
      token: authenticated.token,
      sessionVersion: authenticated.sessionVersion - 1,
    }))).toBe(authenticated);
  });

  it('clears a session and increments the generation', () => {
    const restoring = createAuthInitialState({ token: 'token-a', username: 'hint' });
    const cleared = authReducer(restoring, sessionCleared());

    expect(cleared).toEqual({
      status: 'anonymous',
      token: '',
      user: null,
      restoreIdentityHint: null,
      restoreRequestId: null,
      sessionVersion: 1,
    });
  });
});

describe('auth reducer profile events', () => {
  it('updates profile fields without changing the session generation', () => {
    const authenticated = establish();
    const authenticatedSnapshot = structuredClone(authenticated);
    const originalUser = authenticated.user;
    const updated = authReducer(authenticated, profileUpdated({
      token: authenticated.token,
      sessionVersion: authenticated.sessionVersion,
      changes: { displayName: 'New name', avatarUrl: 'https://example.com/new.png' },
    }));

    expect(updated.sessionVersion).toBe(authenticated.sessionVersion);
    expect(updated.user).toEqual({
      ...user,
      displayName: 'New name',
      avatarUrl: 'https://example.com/new.png',
    });
    expect(authenticated).toEqual(authenticatedSnapshot);
    expect(updated).not.toBe(authenticated);
    expect(updated.user).not.toBe(originalUser);
  });

  it('updates profile stats without changing the session generation', () => {
    const authenticated = establish();
    const authenticatedSnapshot = structuredClone(authenticated);
    const originalUser = authenticated.user;
    const updated = authReducer(authenticated, profileStatsUpdated({
      token: authenticated.token,
      sessionVersion: authenticated.sessionVersion,
      changes: { likesCount: 30, followingCount: 40, followersCount: 50 },
    }));

    expect(updated.sessionVersion).toBe(authenticated.sessionVersion);
    expect(updated.user).toMatchObject({ likesCount: 30, followingCount: 40, followersCount: 50 });
    expect(authenticated).toEqual(authenticatedSnapshot);
    expect(updated).not.toBe(authenticated);
    expect(updated.user).not.toBe(originalUser);
  });

  it('ignores profile changes unless token and generation both match', () => {
    const authenticated = establish();
    const profileAction = (token: string, sessionVersion: number) => profileUpdated({
      token,
      sessionVersion,
      changes: { displayName: 'Stale', avatarUrl: 'stale.png' },
    });
    const statsAction = (token: string, sessionVersion: number) => profileStatsUpdated({
      token,
      sessionVersion,
      changes: { likesCount: 0, followingCount: 0, followersCount: 0 },
    });

    expect(authReducer(authenticated, profileAction('old-token', authenticated.sessionVersion))).toBe(authenticated);
    expect(authReducer(authenticated, profileAction(authenticated.token, 0))).toBe(authenticated);
    expect(authReducer(authenticated, statsAction('old-token', authenticated.sessionVersion))).toBe(authenticated);
    expect(authReducer(authenticated, statsAction(authenticated.token, 0))).toBe(authenticated);
  });
});

describe('auth selectors and serializability', () => {
  it('selects only the public auth values', () => {
    const auth = establish();
    const rootState = { auth };

    expect(selectAuthToken(rootState)).toBe('token-a');
    expect(selectAuthUserId(rootState)).toBe('user-a');
    expect(selectAuthDisplayName(rootState)).toBe('Alice');
    expect(selectAuthAvatarUrl(rootState)).toBe('https://example.com/alice.png');
    expect(selectAuthStats(rootState)).toEqual({ likesCount: 3, followingCount: 4, followersCount: 5 });
    expect(selectIsAuthenticated(rootState)).toBe(true);
    expect(selectIsAuthenticated({ auth: createAuthInitialState(null) })).toBe(false);
  });

  it('returns stable stats until the selected user changes', () => {
    const authenticated = establish();
    const rootState = { auth: authenticated };

    const first = selectAuthStats(rootState);
    expect(selectAuthStats(rootState)).toBe(first);

    const updatedAuth = authReducer(authenticated, profileStatsUpdated({
      token: authenticated.token,
      sessionVersion: authenticated.sessionVersion,
      changes: { likesCount: 30, followingCount: 40, followersCount: 50 },
    }));
    const updated = selectAuthStats({ auth: updatedAuth });

    expect(updated).not.toBe(first);
    expect(updated).toEqual({ likesCount: 30, followingCount: 40, followersCount: 50 });
    expect(selectAuthStats({ auth: updatedAuth })).toBe(updated);
  });

  it('contains only plain serializable state values', () => {
    const state = establish();
    const values: unknown[] = [];
    const visit = (value: unknown): void => {
      values.push(value);
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };

    visit(state);

    expect(() => JSON.stringify(state)).not.toThrow();
    expect(values.some((value) => typeof value === 'function')).toBe(false);
    expect(values.some((value) => value instanceof Set)).toBe(false);
    expect(values.every((value) => {
      if (!value || typeof value !== 'object') return true;
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === Array.prototype;
    })).toBe(true);
  });
});
