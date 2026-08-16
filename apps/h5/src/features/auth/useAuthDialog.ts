import { useCallback, useEffect, useRef, useState } from 'react';
import { createAuthAttemptGuard } from './authAttemptGuard';
import { clearRememberedPhoneLogin, readRememberedPhoneLogin, writeRememberedPhoneLogin } from '../../store/auth/rememberedPhoneLogin';
import { normalizePhone } from '../../utils/phoneAuthClient';
import { passwordValidationMessage, validatePasswordLength } from '../../utils/passwordValidation';

export type PhoneAuthMode = 'login' | 'register';
export type PhoneAuthResponse = { accessToken: string; user: { id: string; username?: string; nickname?: string; avatarUrl?: string | null } };
export type SmsCodeResponse = { smsRequestId: string; retryAfter: number };
export class SmsCodeError extends Error {
  constructor(message: string, readonly retryAfter?: number) { super(message); }
}

export type AuthDialogDependencies = {
  storage?: Storage;
  requestPhoneAuth: (mode: PhoneAuthMode, input: Record<string, unknown>) => Promise<PhoneAuthResponse>;
  requestSmsCode: (phone: string) => Promise<SmsCodeResponse>;
  establishSession: (response: PhoneAuthResponse, options: { gateRequestId?: string; legacyDraftOwnerId?: string }) => void;
  refreshAfterLogin: (token: string) => Promise<unknown>;
  cancelGate: () => void;
  getGateRequestId?: () => string | undefined;
  getLoginReturnTo?: () => string | undefined;
  onAuthenticated?: (returnTo: string | undefined) => void;
  onError?: (message: string) => void;
  onLogout?: () => void;
};

export type AuthDialogController = ReturnType<typeof useAuthDialog>;

export function useAuthDialog(dependencies: AuthDialogDependencies) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<PhoneAuthMode>('login');
  const [agreement, setAgreement] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [smsRequestId, setSmsRequestId] = useState('');
  const guard = useRef(createAuthAttemptGuard());
  const verifyingRef = useRef(false);
  const smsRequestSequence = useRef(0);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1_000);
    return () => clearInterval(timer);
  }, [countdown]);

  const switchMode = useCallback((nextMode: PhoneAuthMode) => {
    smsRequestSequence.current += 1;
    setSending(false);
    setMode(nextMode);
    setPhoneNumber('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setError('');
    setCountdown(0);
    setSmsRequestId('');
  }, []);

  const restoreRememberedLogin = useCallback(() => {
    if (mode !== 'login') return;
    const remembered = readRememberedPhoneLogin(dependencies.storage);
    if (!remembered) {
      setRememberPassword(false);
      return;
    }
    setPhoneNumber(remembered.phone);
    setPassword(remembered.password);
    setRememberPassword(true);
  }, [dependencies.storage, mode]);

  const sendCode = useCallback(async () => {
    if (sending || countdown > 0) return;
    setError('');
    let phone: string;
    try {
      phone = normalizePhone(phoneNumber);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请输入正确的手机号');
      return;
    }
    setSending(true);
    const sequence = ++smsRequestSequence.current;
    try {
      const result = await dependencies.requestSmsCode(phone);
      if (sequence !== smsRequestSequence.current) return;
      setSmsRequestId(result.smsRequestId);
      setCountdown(Number(result.retryAfter || 60));
    } catch (cause) {
      if (sequence !== smsRequestSequence.current) return;
      if (cause instanceof SmsCodeError && Number.isFinite(cause.retryAfter) && (cause.retryAfter ?? 0) > 0) setCountdown(cause.retryAfter!);
      setError(cause instanceof Error ? cause.message : '验证码发送失败');
    } finally {
      if (sequence === smsRequestSequence.current) setSending(false);
    }
  }, [countdown, dependencies, phoneNumber, sending]);

  const submitPhoneAuth = useCallback(async (submitMode: PhoneAuthMode) => {
    if (verifyingRef.current) return;
    if (!agreement) {
      setError('请先勾选用户协议和隐私政策');
      return;
    }
    let phone: string;
    try {
      phone = normalizePhone(phoneNumber);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请输入正确的手机号');
      return;
    }
    if (!validatePasswordLength(password)) {
      setError(passwordValidationMessage(password) || '密码至少需要 8 位');
      return;
    }
    if (submitMode === 'register' && (!smsRequestId || !/^\d{6}$/.test(code))) {
      setError('请输入6位验证码');
      return;
    }
    const attempt = guard.current.start('phone');
    const gateRequestId = dependencies.getGateRequestId?.();
    const returnTo = dependencies.getLoginReturnTo?.();
    verifyingRef.current = true;
    setVerifying(true);
    setError('');
    try {
      if (submitMode === 'register' && password !== confirmPassword) {
        setError('两次密码输入不一致');
        return;
      }
      const response = await dependencies.requestPhoneAuth(submitMode, {
        phone,
        password,
        ...(submitMode === 'register' ? { confirmPassword, smsRequestId, code } : {}),
      });
      if (!attempt.commitSuccess()) return;
      dependencies.establishSession(response, { gateRequestId, legacyDraftOwnerId: response.user.nickname || response.user.username || response.user.id });
      if (submitMode === 'login') {
        if (rememberPassword) writeRememberedPhoneLogin(dependencies.storage, { phone, password });
        else clearRememberedPhoneLogin(dependencies.storage);
      }
      setCode('');
      setPassword('');
      setConfirmPassword('');
      setSmsRequestId('');
      await dependencies.refreshAfterLogin(response.accessToken);
      if (attempt.isCurrent()) dependencies.onAuthenticated?.(returnTo);
    } catch (cause) {
      if (attempt.commitError(cause instanceof Error ? cause.message : '登录失败，请稍后重试')) {
        setError(cause instanceof Error ? cause.message : '登录失败，请稍后重试');
      }
    } finally {
      if (attempt.commitFinally()) {
        verifyingRef.current = false;
        setVerifying(false);
      }
    }
  }, [agreement, code, confirmPassword, dependencies, password, phoneNumber, rememberPassword, smsRequestId, verifying]);

  const close = useCallback(() => {
    smsRequestSequence.current += 1;
    guard.current.cancel();
    dependencies.cancelGate();
    verifyingRef.current = false;
    setVerifying(false);
    setSending(false);
    setCountdown(0);
  }, [dependencies]);

  const logout = useCallback(() => {
    close();
    dependencies.onLogout?.();
  }, [close, dependencies]);

  return {
    phoneNumber, setPhoneNumber,
    password, setPassword,
    confirmPassword, setConfirmPassword,
    code, setCode: (value: string) => setCode(value.replace(/\D/g, '').slice(0, 6)),
    mode, setMode: switchMode,
    agreement, setAgreement,
    rememberPassword, setRememberPassword,
    error, sending, verifying, countdown, setCountdown,
    restoreRememberedLogin, sendCode,
    submitPhoneLogin: () => submitPhoneAuth('login'),
    submitPhoneRegister: () => submitPhoneAuth('register'),
    close, logout,
  };
}
