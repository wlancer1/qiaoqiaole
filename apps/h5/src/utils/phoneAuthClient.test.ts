import { describe, expect, it } from 'vitest';
import { normalizePhone, signWebSmsRequest } from './phoneAuthClient';

describe('phone auth client', () => {
  it('normalizes mainland phone input and rejects invalid values', () => {
    expect(normalizePhone('138 0013 8000')).toBe('+8613800138000');
    expect(normalizePhone('+8613800138000')).toBe('+8613800138000');
    expect(() => normalizePhone('123')).toThrow('请输入正确的手机号');
  });

  it('uses the backend-compatible hexadecimal SHA-256 body hash for SMS signatures', async () => {
    const signature = await signWebSmsRequest(
      { phone: '138 0013 8000', scene: 'REGISTER', captchaTicket: '', captchaRandstr: '', deviceId: 'device-1' },
      { platform: 'web', signVersion: 'web-v1', timestamp: 1786089600000, requestId: '123e4567-e89b-12d3-a456-426614174000', nonce: 'nonce-12345678901234567890', challengeId: 'ch_test' },
      'seed-test',
    );
    expect(signature).toBe('_EEheXgNfRvB6kKXs4HmltoHthJ9uWgZiOryjLt0utI');
  });
});
