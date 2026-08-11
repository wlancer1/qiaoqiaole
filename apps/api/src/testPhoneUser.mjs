import { randomBytes, randomUUID } from 'node:crypto';
import { signSmsRequest } from './authSecurity.mjs';

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json().catch(() => ({})) };
}

export async function createMockPhoneUser(baseUrl, {
  phone = `+8613${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`,
  password = 'test-phone-password-123',
  deviceId = `community-device-${randomUUID()}`,
  code = '123456',
} = {}) {
  const challengeResult = await request(baseUrl, '/api/v1/auth/sms/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'web', deviceId }),
  });
  if (!challengeResult.response.ok) throw new Error(`phone challenge failed: ${JSON.stringify(challengeResult.body)}`);
  const challenge = challengeResult.body.data;
  const requestId = randomUUID();
  const nonce = randomBytes(16).toString('base64url');
  const body = { phone, scene: 'REGISTER', captchaTicket: '', deviceId };
  const signedHeaders = {
    platform: 'web',
    signVersion: 'web-v1',
    timestamp: challenge.serverTime,
    requestId,
    nonce,
    challengeId: challenge.challengeId,
  };
  const signature = signSmsRequest(
    signedHeaders,
    body,
    challenge.seed,
    'qiaoqiaole-h5',
  );
  const sendResult = await request(baseUrl, '/api/v1/auth/sms/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-platform': signedHeaders.platform,
      'x-sign-version': signedHeaders.signVersion,
      'x-request-id': signedHeaders.requestId,
      'x-timestamp': String(signedHeaders.timestamp),
      'x-nonce': signedHeaders.nonce,
      'x-challenge-id': signedHeaders.challengeId,
      'x-signature': signature,
    },
    body: JSON.stringify(body),
  });
  if (!sendResult.response.ok) throw new Error(`phone code send failed: ${JSON.stringify(sendResult.body)}`);
  const registerResult = await request(baseUrl, '/api/v1/auth/sms/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      phone,
      password,
      confirmPassword: password,
      smsRequestId: sendResult.body.data.smsRequestId,
      code,
      agreementVersion: 'community-test',
      device: { platform: 'web', deviceId, appVersion: 'test' },
    }),
  });
  if (!registerResult.response.ok) throw new Error(`phone registration failed: ${JSON.stringify(registerResult.body)}`);
  return {
    token: registerResult.body.data.accessToken,
    user: registerResult.body.data.user,
    phone,
  };
}
