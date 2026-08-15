import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY } from './auth/authStorage';
import { apiSlice } from './api/apiSlice';
import { createH5Store } from './store';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function storageWith(value: unknown): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return storage;
}

describe('createH5Store', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hydrates restoring auth and consumes the stored identity hint once', () => {
    const storage = storageWith({ token: 'token-a', username: 'alice', userId: 'user-a' });

    const store = createH5Store({ storage });

    expect(store.getState().auth).toEqual({
      status: 'restoring',
      token: 'token-a',
      user: null,
      restoreIdentityHint: { username: 'alice', userId: 'user-a' },
      restoreRequestId: null,
      sessionVersion: 0,
    });
  });

  it.each([
    ['missing storage', null],
    ['corrupt storage', '{not-json'],
  ])('starts anonymous with %s', (_label, value) => {
    const storage = value === null ? new MemoryStorage() : storageWith(value);

    const store = createH5Store({ storage });

    expect(store.getState().auth).toEqual({
      status: 'anonymous',
      token: '',
      user: null,
      restoreIdentityHint: null,
      restoreRequestId: null,
      sessionVersion: 0,
    });
  });

  it('reads injected storage exactly once during factory creation', () => {
    const storage = storageWith({ token: 'token-a' });
    const getItem = vi.spyOn(storage, 'getItem');

    createH5Store({ storage });

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(AUTH_STORAGE_KEY);
  });

  it('installs the api reducer and middleware while keeping the chunk state shape exact', () => {
    const store = createH5Store({ storage: new MemoryStorage() });

    expect(Object.keys(store.getState()).sort()).toEqual(['api', 'auth', 'projects', 'ui']);
    expect(store.getState().api).toEqual(apiSlice.reducer(undefined, { type: '@@init' }));

    expect(() => store.dispatch(apiSlice.util.resetApiState())).not.toThrow();
  });

  it('exports a browser store with the same reducer shape', async () => {
    const { store } = await import('./store');

    expect(Object.keys(store.getState()).sort()).toEqual(['api', 'auth', 'projects', 'ui']);
  });

  it('keeps serializable checks enabled', () => {
    const store = createH5Store({ storage: new MemoryStorage() });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    store.dispatch({ type: 'test/nonSerializable', payload: new Map([['key', 'value']]) });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
