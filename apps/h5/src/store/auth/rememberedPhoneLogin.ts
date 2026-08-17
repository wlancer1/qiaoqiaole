export const REMEMBERED_PHONE_LOGIN_KEY = 'qiaoqiaole.remembered-phone-login';

export type RememberedPhoneLogin = {
  phone: string;
  password: string;
};

function normalizeRememberedPhone(phone: string): string {
  const compact = phone.replace(/[\s-]/g, '');
  if (compact.startsWith('+86')) return compact.slice(3);
  if (compact.length === 13 && compact.startsWith('86')) return compact.slice(2);
  return compact;
}

function removeRecord(storage: Storage): void {
  try {
    storage.removeItem(REMEMBERED_PHONE_LOGIN_KEY);
  } catch {
    // Browser storage can be unavailable even when the Storage object exists.
  }
}

function normalizeRecord(value: unknown): RememberedPhoneLogin | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (record.remember !== undefined && record.remember !== true) return null;
  if (typeof record.phone !== 'string' || record.phone.trim() === '') return null;
  if (typeof record.password !== 'string' || record.password === '') return null;

  return { phone: normalizeRememberedPhone(record.phone), password: record.password };
}

export function readRememberedPhoneLogin(storage: Storage | undefined): RememberedPhoneLogin | null {
  if (!storage) return null;

  let rawValue: string | null;
  try {
    rawValue = storage.getItem(REMEMBERED_PHONE_LOGIN_KEY);
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

export function writeRememberedPhoneLogin(
  storage: Storage | undefined,
  record: RememberedPhoneLogin,
): void {
  if (!storage) return;

  try {
    storage.setItem(REMEMBERED_PHONE_LOGIN_KEY, JSON.stringify({
      phone: normalizeRememberedPhone(record.phone),
      password: record.password,
      remember: true,
    }));
  } catch {
    // Persistence failure must not prevent an in-memory login.
  }
}

export function clearRememberedPhoneLogin(storage: Storage | undefined): void {
  if (!storage) return;
  removeRecord(storage);
}
