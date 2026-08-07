import { describe, expect, it } from 'vitest';
import {
  buildSmsCanonicalString,
  createReplayDigest,
  normalizePhoneE164,
  signSmsRequest,
  verifySmsSignature,
} from './authSecurity.mjs';

describe('phone authentication request security', () => {
  it('normalizes mainland phone numbers to E.164', () => {
    expect(normalizePhoneE164('138 0013 8000')).toBe('+8613800138000');
    expect(normalizePhoneE164('+8613800138000')).toBe('+8613800138000');
    expect(() => normalizePhoneE164('123456')).toThrow();
  });

  it('canonicalizes the signed body independently of object insertion order', () => {
    const left = buildSmsCanonicalString({
      phone: '+8613800138000',
      scene: 'AUTH',
      deviceId: 'device-hash',
      captchaTicket: '',
    }, {
      platform: 'web',
      signVersion: 'web-v1',
      timestamp: 1786089600123,
      requestId: 'request-id',
      nonce: 'nonce',
      challengeId: 'challenge-id',
    });
    const right = buildSmsCanonicalString({
      deviceId: 'device-hash',
      captchaTicket: '',
      scene: 'AUTH',
      phone: '13800138000',
    }, {
      platform: 'web',
      signVersion: 'web-v1',
      timestamp: 1786089600123,
      requestId: 'request-id',
      nonce: 'nonce',
      challengeId: 'challenge-id',
    });
    expect(left).toBe(right);
    expect(left).toContain('/api/v1/auth/sms/send');
  });

  it('signs and verifies web-v1 using the one-time seed', () => {
    const headers = {
      platform: 'web',
      signVersion: 'web-v1',
      timestamp: 1786089600123,
      requestId: 'request-id',
      nonce: 'nonce-value',
      challengeId: 'challenge-id',
    };
    const body = { phone: '+8613800138000', scene: 'AUTH', captchaTicket: '', deviceId: 'device-hash' };
    const signature = signSmsRequest(headers, body, 'seed-value', 'public-app');
    expect(verifySmsSignature(headers, body, 'seed-value', signature, 'public-app')).toBe(true);
    expect(verifySmsSignature(headers, { ...body, phone: '+8613900138000' }, 'seed-value', signature, 'public-app')).toBe(false);
  });

  it('creates a replay digest that changes when any signed input changes', () => {
    const base = { platform: 'web', signVersion: 'web-v1', requestId: 'request-id', nonce: 'nonce', challengeId: 'challenge', signature: 'signature' };
    expect(createReplayDigest(base)).not.toBe(createReplayDigest({ ...base, requestId: 'other-request' }));
  });
});
