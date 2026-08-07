import { describe, expect, it, vi } from 'vitest';
import { normalizePhone, signWebSmsRequest } from './phoneAuthClient';

describe('phone auth client', () => {
  it('normalizes mainland phone input and rejects invalid values', () => {
    expect(normalizePhone('138 0013 8000')).toBe('+8613800138000');
    expect(normalizePhone('+8613800138000')).toBe('+8613800138000');
    expect(() => normalizePhone('123')).toThrow('请输入正确的手机号');
  });

  it('creates a UUID-shaped request id for older browsers', async () => {
    const { createRequestId } = await import('./phoneAuthClient');
    expect(createRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('uses the backend-compatible hexadecimal SHA-256 body hash for SMS signatures', async () => {
    vi.stubGlobal('isSecureContext', true);
    const signature = await signWebSmsRequest(
      { phone: '138 0013 8000', scene: 'REGISTER', captchaTicket: '', captchaRandstr: '', deviceId: 'device-1' },
      { platform: 'web', signVersion: 'web-v1', timestamp: 1786089600000, requestId: '123e4567-e89b-12d3-a456-426614174000', nonce: 'nonce-12345678901234567890', challengeId: 'ch_test' },
      'seed-test',
    );
    expect(signature).toBe('_EEheXgNfRvB6kKXs4HmltoHthJ9uWgZiOryjLt0utI');
  });

  it('keeps signing in the temporary HTTP compatibility mode', async () => {
    vi.stubGlobal('isSecureContext', false);
    const signature = await signWebSmsRequest(
      { phone: '138 0013 8000', scene: 'REGISTER', captchaTicket: '', captchaRandstr: '', deviceId: 'device-1' },
      { platform: 'web', signVersion: 'web-v1', timestamp: 1786089600000, requestId: '123e4567-e89b-12d3-a456-426614174000', nonce: 'nonce-12345678901234567890', challengeId: 'ch_test' },
      'seed-test',
    );
    expect(signature).toBe('_EEheXgNfRvB6kKXs4HmltoHthJ9uWgZiOryjLt0utI');
    vi.unstubAllGlobals();
  });
});
