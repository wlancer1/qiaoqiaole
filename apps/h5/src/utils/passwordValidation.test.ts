import { describe, expect, it } from 'vitest';
import { passwordValidationMessage, validatePasswordLength } from './passwordValidation';

describe('password validation', () => {
  it('requires at least eight characters', () => {
    expect(validatePasswordLength('1234567')).toBe(false);
    expect(passwordValidationMessage('1234567')).toBe('密码至少需要 8 位');
    expect(validatePasswordLength('12345678')).toBe(true);
    expect(passwordValidationMessage('12345678')).toBe('');
  });
});
