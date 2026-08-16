import { createNonce, createRequestId, getPhoneDeviceId, showTencentCaptcha, signWebSmsRequest } from '../../utils/phoneAuthClient';
import { SmsCodeError, type PhoneAuthMode, type PhoneAuthResponse, type SmsCodeResponse } from './useAuthDialog';

export function createPhoneAuthTransport(apiBase: string, captchaAppId: string) {
  return {
    async requestPhoneAuth(mode: PhoneAuthMode, input: Record<string, unknown>): Promise<PhoneAuthResponse> {
      const response = await fetch(`${apiBase}/v1/auth/sms/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, agreementVersion: 'privacy-2026-08-01', device: { platform: 'web', deviceId: getPhoneDeviceId(), appVersion: '1.0.0' } }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || '登录失败，请稍后重试');
      return payload.data as PhoneAuthResponse;
    },
    async requestSmsCode(phone: string): Promise<SmsCodeResponse> {
      const deviceId = getPhoneDeviceId();
      const challengeResponse = await fetch(`${apiBase}/v1/auth/sms/challenge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: 'web', deviceId }) });
      const challengePayload = await challengeResponse.json().catch(() => ({}));
      if (!challengeResponse.ok) throw new Error(challengePayload.message || '请求已失效，请稍后重试');
      const challenge = challengePayload.data as { challengeId: string; seed: string; serverTime: number };
      const requestId = createRequestId(); const nonce = createNonce(); const captcha = await showTencentCaptcha(captchaAppId);
      const body = { phone, scene: 'REGISTER', captchaTicket: captcha.ticket, captchaRandstr: captcha.randstr, deviceId };
      const signature = await signWebSmsRequest(body, { platform: 'web', signVersion: 'web-v1', timestamp: challenge.serverTime, requestId, nonce, challengeId: challenge.challengeId }, challenge.seed);
      const sendResponse = await fetch(`${apiBase}/v1/auth/sms/send`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-platform': 'web', 'x-client-version': '1.0.0', 'x-sign-version': 'web-v1', 'x-request-id': requestId, 'x-timestamp': String(challenge.serverTime), 'x-nonce': nonce, 'x-challenge-id': challenge.challengeId, 'x-signature': signature }, body: JSON.stringify(body) });
      const sendPayload = await sendResponse.json().catch(() => ({}));
      if (!sendResponse.ok) throw new SmsCodeError(sendPayload.message || '操作过于频繁，请稍后再试', Number(sendResponse.headers.get('retry-after') || 0) || undefined);
      return { smsRequestId: sendPayload.data.smsRequestId, retryAfter: Number(sendPayload.data.retryAfter || 60) };
    },
  };
}
