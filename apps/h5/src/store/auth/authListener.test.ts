import { describe, expect, it } from 'vitest';
import { sessionCleared, sessionEstablished, sessionInvalidated } from './authEvents';
import { createH5Store } from '../store';
import { AUTH_STORAGE_KEY } from './authStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const user = { id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: '', legacyDraftOwnerId: 'alice', likesCount: 1, followingCount: 2, followersCount: 3 };

it('persists established sessions and clears the persisted record on session changes', async () => {
  const storage = new MemoryStorage();
  const store = createH5Store({ storage });
  store.dispatch(sessionEstablished({ token: 'token-a', user }));
  await Promise.resolve();
  expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!)).toMatchObject({ token: 'token-a', userId: 'user-a' });
  store.dispatch(sessionCleared());
  await Promise.resolve();
  expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
});

describe('auth listener factory', () => {
  it('is isolated per storage instance and removes auth on clear', async () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'token-a' }));
    const store = createH5Store({ storage });
    const configured = createH5Store({ storage });
    configured.dispatch(sessionCleared());
    expect(configured.getState().auth.status).toBe('anonymous');
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(store.getState().auth.token).toBe('token-a');
  });

  it('does not clear a newer session for an old invalidation payload', async () => {
    const storage = new MemoryStorage();
    const store = createH5Store({ storage });
    store.dispatch(sessionEstablished({ token: 'new-token', user }));
    store.dispatch(sessionInvalidated({ token: 'old-token', sessionVersion: 1 }));
    await Promise.resolve();
    expect(store.getState().auth.token).toBe('new-token');
  });
});
