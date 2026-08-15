import { describe, expect, it } from 'vitest';
import {
  REMEMBERED_PHONE_LOGIN_KEY,
  clearRememberedPhoneLogin,
  readRememberedPhoneLogin,
  writeRememberedPhoneLogin,
} from './rememberedPhoneLogin';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class ThrowingStorage implements Storage {
  get length(): number { return 0; }
  clear(): void {}
  getItem(): string | null { throw new Error('storage unavailable'); }
  key(): string | null { return null; }
  removeItem(): void { throw new Error('storage unavailable'); }
  setItem(): void { throw new Error('storage unavailable'); }
}

function storageWith(value: unknown): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(REMEMBERED_PHONE_LOGIN_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return storage;
}

describe('rememberedPhoneLogin', () => {
  it('writes and reads a remembered phone login', () => {
    const storage = new MemoryStorage();

    writeRememberedPhoneLogin(storage, { phone: '13800138000', password: 'password-123' });

    expect(readRememberedPhoneLogin(storage)).toEqual({
      phone: '13800138000',
      password: 'password-123',
    });
  });

  it.each([
    {},
    { phone: '', password: 'password-123' },
    { phone: '13800138000', password: '' },
    { phone: 13800138000, password: 'password-123' },
    { phone: '13800138000', password: 12345678 },
    { phone: '13800138000', password: 'password-123', remember: false },
  ])('clears an invalid remembered record: %j', (record) => {
    const storage = storageWith(record);

    expect(readRememberedPhoneLogin(storage)).toBeNull();
    expect(storage.getItem(REMEMBERED_PHONE_LOGIN_KEY)).toBeNull();
  });

  it('clears a remembered phone login', () => {
    const storage = storageWith({ phone: '13800138000', password: 'password-123' });

    clearRememberedPhoneLogin(storage);

    expect(storage.getItem(REMEMBERED_PHONE_LOGIN_KEY)).toBeNull();
  });

  it('does not throw when browser storage is unavailable', () => {
    const storage = new ThrowingStorage();

    expect(() => readRememberedPhoneLogin(storage)).not.toThrow();
    expect(() => writeRememberedPhoneLogin(storage, { phone: '13800138000', password: 'password-123' })).not.toThrow();
    expect(() => clearRememberedPhoneLogin(storage)).not.toThrow();
  });
});
