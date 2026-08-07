import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PHONE_PATTERN = /^(?:\+86|86)?1[3-9]\d{9}$/;
const SEND_FIELDS = ['captchaRandstr', 'captchaTicket', 'deviceId', 'phone', 'scene'];

export function normalizePhoneE164(value) {
  const compact = String(value || '').replace(/[\s-]/g, '');
  if (!PHONE_PATTERN.test(compact)) throw new Error('AUTH_PHONE_INVALID');
  const digits = compact.startsWith('+86') ? compact.slice(3) : compact.startsWith('86') ? compact.slice(2) : compact;
  if (!/^1[3-9]\d{9}$/.test(digits)) throw new Error('AUTH_PHONE_INVALID');
  return `+86${digits}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildSmsCanonicalString(body, headers) {
  const bodyHash = createSmsBodyHash(body);
  return [
    'SMS_SEND',
    'POST',
    '/api/v1/auth/sms/send',
    headers.platform,
    headers.signVersion,
    String(headers.timestamp),
    headers.requestId,
    headers.nonce,
    headers.challengeId,
    bodyHash,
  ].join('\n');
}

export function createSmsBodyHash(body) {
  const normalizedBody = {};
  for (const field of SEND_FIELDS) {
    if (field === 'phone') normalizedBody[field] = normalizePhoneE164(body[field]);
    else normalizedBody[field] = body[field] ?? '';
  }
  return createHash('sha256').update(canonicalJson(normalizedBody), 'utf8').digest('hex');
}

function rotateLeft(value, amount) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length === 0) return '';
  const offset = amount % bytes.length;
  return Buffer.concat([bytes.subarray(offset), bytes.subarray(0, offset)]).toString('utf8');
}

export function signSmsRequest(headers, body, seed, publicAppId) {
  const canonical = buildSmsCanonicalString(body, headers);
  let keyMaterial;
  if (headers.signVersion === 'web-v1') {
    keyMaterial = `${seed}|${String(headers.nonce).split('').reverse().join('')}|W1|${publicAppId}`;
  } else if (headers.signVersion === 'mobile-v1') {
    keyMaterial = `${rotateLeft(seed, 7)}|${body.deviceId}|${String(headers.requestId).split('').reverse().join('')}|M1|${publicAppId}`;
  } else {
    throw new Error('AUTH_REQUEST_INVALID');
  }
  const key = createHash('sha256').update(keyMaterial, 'utf8').digest();
  return createHmac('sha256', key).update(canonical, 'utf8').digest('base64url');
}

export function verifySmsSignature(headers, body, seed, signature, publicAppId) {
  try {
    const expected = signSmsRequest(headers, body, seed, publicAppId);
    const actualBuffer = Buffer.from(String(signature || ''));
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function createReplayDigest({ platform, signVersion, requestId, nonce, challengeId, signature }) {
  return createHash('sha256')
    .update([platform, signVersion, requestId, nonce, challengeId, signature].join('|'), 'utf8')
    .digest('hex');
}

export function hashIdentifier(value, pepper) {
  return createHmac('sha256', pepper).update(String(value), 'utf8').digest('hex');
}

export function maskPhone(phone) {
  const digits = normalizePhoneE164(phone).slice(3);
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function generateCode(randomBytes) {
  const value = Number(randomBytes.readUInt32BE(0) % 1_000_000);
  return String(value).padStart(6, '0');
}

export function codeHash({ pepper, scene, phone, smsRequestId, code }) {
  return createHmac('sha256', pepper)
    .update(`${scene}|${phone}|${smsRequestId}|${code}`, 'utf8')
    .digest('hex');
}

export function encryptIdentifier(value, keyMaterial) {
  const key = createHash('sha256').update(String(keyMaterial), 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
