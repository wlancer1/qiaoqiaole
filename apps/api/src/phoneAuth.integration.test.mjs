import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { signSmsRequest } from './authSecurity.mjs';

const port = 3800 + Math.floor(Math.random() * 200);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-phone-auth-'));
const dbPath = path.join(root, 'auth.sqlite');
const redisUrl = 'redis://127.0.0.1:6380';
let serverProcess;
let adminToken;
let redisClient;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { response, body: await response.json().catch(() => ({})) };
}

async function challenge() {
  return request('/api/v1/auth/sms/challenge', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'web', deviceId: 'integration-device' }),
  });
}

async function signedSend(challengePayload, phone = '+8613800138000', requestId = randomUUID(), signedPhone = phone, providedNonce = '') {
  const body = { phone, scene: 'REGISTER', captchaTicket: '', deviceId: 'integration-device' };
  const headers = { platform: 'web', signVersion: 'web-v1', timestamp: challengePayload.data.serverTime, requestId, nonce: providedNonce || randomBytes(16).toString('base64url'), challengeId: challengePayload.data.challengeId };
  const signature = signSmsRequest(headers, { ...body, phone: signedPhone }, challengePayload.data.seed, 'qiaoqiaole-h5');
  return request('/api/v1/auth/sms/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-client-platform': headers.platform, 'x-sign-version': headers.signVersion,
      'x-request-id': headers.requestId, 'x-timestamp': String(headers.timestamp), 'x-nonce': headers.nonce,
      'x-challenge-id': headers.challengeId, 'x-signature': signature,
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  redisClient = createClient({ url: redisUrl });
  await redisClient.connect();
  await redisClient.flushDb();
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env, PORT: String(port), SQLITE_PATH: dbPath, REDIS_URL: redisUrl,
      QIAOQIAOLE_USERNAME: 'admin', QIAOQIAOLE_PASSWORD: 'admin-password',
      AUTH_PHONE_PEPPER: 'integration-phone-pepper', AUTH_JWT_SECRET: 'integration-jwt-secret', AUTH_SMS_PROVIDER: 'mock', AUTH_TEST_FIXED_CODE: '123456',
      TENCENT_COS_ENABLED: 'false', TENCENT_COS_SECRET_ID: '', TENCENT_COS_SECRET_KEY: '', TENCENT_COS_BUCKET: 'qiaoqiaole-test', TENCENT_COS_KEY_PREFIX: 'uploads/images',
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await request('/api/health');
      if (health.response.status === 200) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const admin = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin-password' }) });
  adminToken = admin.body.token;
});

afterAll(async () => {
  serverProcess?.kill();
  await redisClient?.quit();
  await rm(root, { recursive: true, force: true });
});

describe('phone SMS authentication', () => {
  it('requires a code for registration, then allows phone-and-password login and rotates refresh tokens', async () => {
    const obtained = await challenge();
    expect(obtained.response.status).toBe(200);
    const sent = await signedSend(obtained.body);
    expect(sent.response.status).toBe(200);
    expect(sent.body.data.smsRequestId).toMatch(/^sms_/);

    const registration = await request('/api/v1/auth/sms/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+8613800138000', password: 'test-password-123', confirmPassword: 'test-password-123', smsRequestId: sent.body.data.smsRequestId, code: '123456', agreementVersion: 'privacy-test', device: { platform: 'web', deviceId: 'integration-device', appVersion: 'test' } }),
    });
    expect(registration.response.status).toBe(200);
    expect(registration.body.data.isNewUser).toBe(true);
    expect(registration.body.data.accessToken).toBeTruthy();
    const refresh = registration.response.headers.get('set-cookie').match(/refresh_token=([^;]+)/)[1];

    const wrongPassword = await request('/api/v1/auth/sms/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+8613800138000', password: 'wrong-password', agreementVersion: 'privacy-test', device: { platform: 'web', deviceId: 'integration-device', appVersion: 'test' } }),
    });
    expect(wrongPassword.response.status).toBe(401);

    const login = await request('/api/v1/auth/sms/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+8613800138000', password: 'test-password-123', agreementVersion: 'privacy-test', device: { platform: 'web', deviceId: 'integration-device', appVersion: 'test' } }),
    });
    expect(login.response.status).toBe(200);
    expect(login.body.data.isNewUser).toBe(false);

    const reused = await request('/api/v1/auth/sms/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+8613800138000', password: 'test-password-123', confirmPassword: 'test-password-123', smsRequestId: sent.body.data.smsRequestId, code: '123456', agreementVersion: 'privacy-test', device: { platform: 'web', deviceId: 'integration-device', appVersion: 'test' } }),
    });
    expect(reused.body.code).toBe('AUTH_CODE_EXPIRED');

    const refreshed = await request('/api/v1/auth/token/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: decodeURIComponent(refresh) }) });
    expect(refreshed.response.status).toBe(200);
    const oldRefresh = await request('/api/v1/auth/token/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: decodeURIComponent(refresh) }) });
    expect(oldRefresh.response.status).toBe(401);
  });

  it('rejects modified signed bodies and allows at most one concurrent send per phone', async () => {
    const obtained = await challenge();
    const first = await signedSend(obtained.body, '+8613900138000');
    expect(first.response.status).toBe(200);
    const modified = await signedSend(obtained.body, '+8613900138001', randomUUID(), '+8613900138000');
    expect(modified.response.status).toBe(400);

    const concurrentChallenge = await challenge();
    const requestId = randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () => signedSend(concurrentChallenge.body, '+8613700138000', requestId)));
    expect(results.filter((result) => result.response.status === 200).length).toBeGreaterThan(0);
    const logs = await request('/api/admin/sms-logs?limit=100', { headers: { authorization: `Bearer ${adminToken}` } });
    expect(logs.body.logs.filter((log) => log.phone === '137****8000')).toHaveLength(1);
  });

  it('enforces request-id idempotency and nonce replay protection', async () => {
    const requestId = randomUUID();
    const firstChallenge = await challenge();
    const first = await signedSend(firstChallenge.body, '+8613600138000', requestId);
    expect(first.response.status).toBe(200);
    const retryChallenge = await challenge();
    const retry = await signedSend(retryChallenge.body, '+8613600138000', requestId);
    expect(retry.response.status, JSON.stringify(retry.body)).toBe(200);
    expect(retry.body.data.smsRequestId).toBe(first.body.data.smsRequestId);

    const conflictChallenge = await challenge();
    const conflict = await signedSend(conflictChallenge.body, '+8613500138000', requestId);
    expect(conflict.response.status).toBe(409);

    const nonceChallenge = await challenge();
    const nonce = randomBytes(16).toString('base64url');
    const nonceRequest = randomUUID();
    const firstNonce = await signedSend(nonceChallenge.body, '+8613400138000', nonceRequest, '+8613400138000', nonce);
    expect(firstNonce.response.status).toBe(200);
    const secondNonceChallenge = await challenge();
    const secondNonce = await signedSend(secondNonceChallenge.body, '+8613300138000', randomUUID(), '+8613300138000', nonce);
    expect(secondNonce.response.status).toBe(409);
    // A nonce is bound to its first request; a second request using it is rejected by Redis.
  });
});
