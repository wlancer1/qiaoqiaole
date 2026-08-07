import { describe, expect, it } from 'vitest';
import {
  createAliyunPnvsRequest,
  loadAliyunPnvsConfig,
  verifyAliyunPnvsSms,
} from './aliyunPnvs.mjs';

describe('Alibaba Cloud PNVS adapter', () => {
  it('builds a signed SendSmsVerifyCode RPC request without exposing the secret', () => {
    const config = loadAliyunPnvsConfig({
      ALIYUN_PNVS_ENABLED: 'true',
      ALIYUN_PNVS_ACCESS_KEY_ID: 'access-key-id',
      ALIYUN_PNVS_ACCESS_KEY_SECRET: 'access-key-secret',
      ALIYUN_PNVS_SCHEME_NAME: 'qiaoqiaole',
      ALIYUN_PNVS_SIGN_NAME: '系统签名',
      ALIYUN_PNVS_TEMPLATE_CODE: '100001',
    });
    const request = createAliyunPnvsRequest({
      config,
      action: 'SendSmsVerifyCode',
      phone: '+8613800138000',
      smsRequestId: 'sms_test',
      now: () => 1786089600000,
      nonce: 'nonce-test',
    });
    const body = new URLSearchParams(request.options.body);
    expect(body.get('PhoneNumber')).toBe('13800138000');
    expect(body.get('CountryCode')).toBe('86');
    expect(body.get('TemplateParam')).toBe('{"code":"##code##","min":"5"}');
    expect(body.get('OutId')).toBe('sms_test');
    expect(body.get('Action')).toBe('SendSmsVerifyCode');
    expect(body.get('Signature')).toBeTruthy();
    expect(body.get('Signature')).not.toContain('access-key-secret');
    expect(request.url).toBe('https://dypnsapi.aliyuncs.com/');
  });

  it('uses the same OutId to call CheckSmsVerifyCode', () => {
    const config = loadAliyunPnvsConfig({
      ALIYUN_PNVS_ENABLED: 'true',
      ALIYUN_PNVS_ACCESS_KEY_ID: 'id',
      ALIYUN_PNVS_ACCESS_KEY_SECRET: 'secret',
      ALIYUN_PNVS_SIGN_NAME: '系统签名',
      ALIYUN_PNVS_TEMPLATE_CODE: '100001',
    });
    const request = createAliyunPnvsRequest({ config, action: 'CheckSmsVerifyCode', phone: '+8613800138000', code: '123456', smsRequestId: 'sms_test', nonce: 'nonce-test' });
    const body = new URLSearchParams(request.options.body);
    expect(body.get('Action')).toBe('CheckSmsVerifyCode');
    expect(body.get('VerifyCode')).toBe('123456');
    expect(body.get('OutId')).toBe('sms_test');
  });

  it('only reports verified when Alibaba returns Model.VerifyResult=PASS', async () => {
    const config = loadAliyunPnvsConfig({
      ALIYUN_PNVS_ENABLED: 'true',
      ALIYUN_PNVS_ACCESS_KEY_ID: 'id',
      ALIYUN_PNVS_ACCESS_KEY_SECRET: 'secret',
      ALIYUN_PNVS_SIGN_NAME: '系统签名',
      ALIYUN_PNVS_TEMPLATE_CODE: '100001',
    });
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ Success: true, Code: 'OK', RequestId: 'req', Model: { VerifyResult: 'PASS' } }) });
    await expect(verifyAliyunPnvsSms({ config, phone: '+8613800138000', code: '123456', smsRequestId: 'sms_test', fetchImpl })).resolves.toMatchObject({ verified: true, providerCode: 'OK' });
  });
});
