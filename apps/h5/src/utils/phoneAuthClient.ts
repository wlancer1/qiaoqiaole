const DEVICE_STORAGE_KEY = 'qiaoqiaole.phone-device';
const PUBLIC_APP_ID = 'qiaoqiaole-h5';

declare global {
  interface Window {
    TencentCaptcha?: new (appId: string, callback: (result: { ret: number; ticket?: string; randstr?: string; errorMessage?: string }) => void, options?: Record<string, unknown>) => { show: () => void };
  }
}

type Platform = 'web' | 'android' | 'ios';

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function getPhoneDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) return existing;
  const next = base64Url(randomBytes(24));
  window.localStorage.setItem(DEVICE_STORAGE_KEY, next);
  return next;
}

export function normalizePhone(phone: string) {
  const compact = phone.replace(/[\s-]/g, '');
  const digits = compact.startsWith('+86') ? compact.slice(3) : compact.startsWith('86') ? compact.slice(2) : compact;
  if (!/^1[3-9]\d{9}$/.test(digits)) throw new Error('请输入正确的手机号');
  return `+86${digits}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer, value: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value))));
}

export function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createNonce() {
  return base64Url(randomBytes(16));
}

let captchaScriptPromise: Promise<void> | undefined;

async function loadTencentCaptchaScript() {
  if (window.TencentCaptcha) return;
  captchaScriptPromise ||= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tencent-captcha]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('人机验证加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://turing.captcha.qcloud.com/TJCaptcha.js';
    script.async = true;
    script.dataset.tencentCaptcha = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('人机验证加载失败'));
    document.head.appendChild(script);
  });
  await captchaScriptPromise;
}

export async function showTencentCaptcha(appId: string) {
  if (!appId) return { ticket: '', randstr: '' };
  await loadTencentCaptchaScript();
  return new Promise<{ ticket: string; randstr: string }>((resolve, reject) => {
    if (!window.TencentCaptcha) return reject(new Error('人机验证不可用'));
    const captcha = new window.TencentCaptcha(appId, (result) => {
      if (result.ret === 0 && result.ticket && result.randstr) resolve({ ticket: result.ticket, randstr: result.randstr });
      else reject(new Error(result.errorMessage || '请完成人机验证'));
    }, {});
    captcha.show();
  });
}

export async function signWebSmsRequest(body: { phone: string; scene: string; captchaTicket: string; captchaRandstr?: string; deviceId: string }, headers: { platform: Platform; signVersion: string; timestamp: number; requestId: string; nonce: string; challengeId: string }, seed: string) {
  const normalizedBody = { captchaRandstr: body.captchaRandstr || '', captchaTicket: body.captchaTicket || '', deviceId: body.deviceId, phone: normalizePhone(body.phone), scene: body.scene };
  const bodyHash = await sha256(canonicalJson(normalizedBody));
  const canonical = ['SMS_SEND', 'POST', '/api/v1/auth/sms/send', headers.platform, headers.signVersion, String(headers.timestamp), headers.requestId, headers.nonce, headers.challengeId, bodyHash].join('\n');
  const keyMaterial = `${seed}|${headers.nonce.split('').reverse().join('')}|W1|${PUBLIC_APP_ID}`;
  const keyDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial));
  return hmac(keyDigest, canonical);
}
