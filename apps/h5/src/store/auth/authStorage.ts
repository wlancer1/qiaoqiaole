import type { StoredAuthRecord } from './authTypes';

export const AUTH_STORAGE_KEY = 'qiaoqiaole.auth';

function removeRecord(storage: Storage): void {
  try {
    storage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable even when the Storage object exists.
  }
}

function normalizeRecord(value: unknown): StoredAuthRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.token !== 'string' || record.token.trim() === '') return null;
  if ('username' in record && typeof record.username !== 'string') return null;
  if ('userId' in record && typeof record.userId !== 'string') return null;

  return {
    token: record.token,
    ...('username' in record ? { username: record.username as string } : {}),
    ...('userId' in record ? { userId: record.userId as string } : {}),
  };
}

export function readStoredAuth(storage: Storage | undefined): StoredAuthRecord | null {
  if (!storage) return null;

  let rawValue: string | null;
  try {
    rawValue = storage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
  if (rawValue === null) return null;

  try {
    const record = normalizeRecord(JSON.parse(rawValue));
    if (record) return record;
  } catch {
    // Invalid records are removed below.
  }

  removeRecord(storage);
  return null;
}

export function writeStoredAuth(
  storage: Storage | undefined,
  record: StoredAuthRecord,
): void {
  if (!storage) return;

  const compatibleRecord: StoredAuthRecord = {
    token: record.token,
    ...(record.username !== undefined ? { username: record.username } : {}),
    ...(record.userId !== undefined ? { userId: record.userId } : {}),
  };

  try {
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(compatibleRecord));
  } catch {
    // Persistence failure must not prevent an in-memory login.
  }
}

export function clearStoredAuth(storage: Storage | undefined): void {
  if (!storage) return;
  removeRecord(storage);
}
