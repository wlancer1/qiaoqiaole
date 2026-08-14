import { describe, expect, it } from 'vitest';
import {
  AUTH_STORAGE_KEY,
  clearStoredAuth,
  readStoredAuth,
  writeStoredAuth,
} from './authStorage';

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

describe('authStorage', () => {
  it('reads a compatible stored auth record', () => {
    const storage = storageWith({ token: 'token-a', username: 'alice', userId: 'user-a' });

    expect(readStoredAuth(storage)).toEqual({
      token: 'token-a',
      username: 'alice',
      userId: 'user-a',
    });
  });

  it.each([
    {},
    { token: '' },
    { token: '   ' },
  ])('removes a record with a missing or blank token: %j', (record) => {
    const storage = storageWith(record);

    expect(readStoredAuth(storage)).toBeNull();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('removes invalid JSON without throwing', () => {
    const storage = storageWith('{not-json');

    expect(() => readStoredAuth(storage)).not.toThrow();
    expect(readStoredAuth(storage)).toBeNull();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it.each([
    { token: 123 },
    { token: 'token-a', username: null },
    { token: 'token-a', username: 123 },
    { token: 'token-a', userId: null },
    { token: 'token-a', userId: false },
  ])('removes a record with incompatible field types: %j', (record) => {
    const storage = storageWith(record);

    expect(readStoredAuth(storage)).toBeNull();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('writes only compatible serializable fields', () => {
    const storage = new MemoryStorage();
    const input = {
      token: 'token-a',
      username: 'alice',
      userId: 'user-a',
      user: { id: 'must-not-be-persisted' },
      sessionVersion: 42,
    };

    writeStoredAuth(storage, input);

    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!)).toEqual({
      token: 'token-a',
      username: 'alice',
      userId: 'user-a',
    });
  });

  it('clears stored auth idempotently', () => {
    const storage = storageWith({ token: 'token-a' });

    expect(() => {
      clearStoredAuth(storage);
      clearStoredAuth(storage);
    }).not.toThrow();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('is safe when browser storage is unavailable', () => {
    expect(readStoredAuth(undefined)).toBeNull();
    expect(() => writeStoredAuth(undefined, { token: 'token-a' })).not.toThrow();
    expect(() => clearStoredAuth(undefined)).not.toThrow();
  });
});
