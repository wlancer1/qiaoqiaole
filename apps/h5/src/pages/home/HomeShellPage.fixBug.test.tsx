import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PhoneLoginModal } from './HomeShellPage';

const props = {
  phoneNumber: '', setPhoneNumber: vi.fn(), phonePassword: '1234567', setPhonePassword: vi.fn(), phoneConfirmPassword: '', setPhoneConfirmPassword: vi.fn(), phoneCode: '', setPhoneCode: vi.fn(), phoneAuthMode: 'login', setPhoneAuthMode: vi.fn(), phoneAgreement: true, setPhoneAgreement: vi.fn(), phoneAuthError: '', phoneSending: false, phoneVerifying: false, phoneCountdown: 0, sendPhoneCode: vi.fn(), submitPhoneLogin: vi.fn(), submitPhoneRegister: vi.fn(), closeLoginModal: vi.fn(), logoutPhone: vi.fn(),
};

describe('phone login bug fixes', () => {
  it('shows the short-password error and keeps the primary button branded', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLoginModal, props));
    expect(markup).toContain('密码至少需要 8 位');
    expect(markup).toContain('phone-login-submit');
    expect(markup).toContain('home-create-submit');
  });
});
