import { createHmac, randomUUID } from 'node:crypto';

const ENDPOINT = 'https://dypnsapi.aliyuncs.com/';
const VERSION = '2017-05-25';

function rpcEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function signRpcParams(params, secret) {
  const canonical = Object.keys(params).sort().map((key) => `${rpcEncode(key)}=${rpcEncode(params[key])}`).join('&');
  const stringToSign = `POST&%2F&${rpcEncode(canonical)}`;
  return createHmac('sha1', `${secret}&`).update(stringToSign, 'utf8').digest('base64');
}

function pnvsPhone(phone) {
  const value = String(phone || '').trim();
  if (value.startsWith('+86')) return { countryCode: '86', phoneNumber: value.slice(3) };
  return { countryCode: '86', phoneNumber: value.replace(/^86/, '') };
}

export function loadAliyunPnvsConfig(env = process.env) {
  return {
    enabled: String(env.ALIYUN_PNVS_ENABLED || 'false').toLowerCase() === 'true',
    accessKeyId: String(env.ALIYUN_PNVS_ACCESS_KEY_ID || '').trim(),
    accessKeySecret: String(env.ALIYUN_PNVS_ACCESS_KEY_SECRET || '').trim(),
    schemeName: String(env.ALIYUN_PNVS_SCHEME_NAME || '').trim(),
    signName: String(env.ALIYUN_PNVS_SIGN_NAME || '').trim(),
    templateCode: String(env.ALIYUN_PNVS_TEMPLATE_CODE || '').trim(),
    templateParam: String(env.ALIYUN_PNVS_TEMPLATE_PARAM || '{"code":"##code##","min":"5"}').trim(),
    codeLength: Number(env.ALIYUN_PNVS_CODE_LENGTH || 6),
    validTime: Number(env.ALIYUN_PNVS_VALID_TIME_SECONDS || 300),
    duplicatePolicy: Number(env.ALIYUN_PNVS_DUPLICATE_POLICY || 1),
    interval: Number(env.ALIYUN_PNVS_INTERVAL_SECONDS || 60),
    codeType: Number(env.ALIYUN_PNVS_CODE_TYPE || 1),
    endpoint: String(env.ALIYUN_PNVS_ENDPOINT || ENDPOINT).trim(),
  };
}

export function createAliyunPnvsRequest({ config, action, phone, code, smsRequestId, fetchImpl = fetch, now = Date.now, nonce = randomUUID() }) {
  if (!config.enabled || !config.accessKeyId || !config.accessKeySecret || !config.signName || !config.templateCode) {
    throw new Error('ALIYUN_PNVS_NOT_CONFIGURED');
  }
  const { countryCode, phoneNumber } = pnvsPhone(phone);
  const params = {
    AccessKeyId: config.accessKeyId,
    Action: action,
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: nonce,
    SignatureVersion: '1.0',
    Timestamp: new Date(now()).toISOString().replace('.000Z', 'Z'),
    Version: VERSION,
    CountryCode: countryCode,
    PhoneNumber: phoneNumber,
  };
  if (config.schemeName) params.SchemeName = config.schemeName;
  if (action === 'SendSmsVerifyCode') {
    params.SignName = config.signName;
    params.TemplateCode = config.templateCode;
    params.TemplateParam = config.templateParam.replace('##server_code##', String(code || ''));
    params.OutId = smsRequestId;
    params.CodeLength = config.codeLength;
    params.ValidTime = config.validTime;
    params.DuplicatePolicy = config.duplicatePolicy;
    params.Interval = config.interval;
    params.CodeType = config.codeType;
    params.ReturnVerifyCode = false;
    params.AutoRetry = 1;
  } else if (action === 'CheckSmsVerifyCode') {
    params.OutId = smsRequestId;
    params.VerifyCode = String(code || '');
    params.CaseAuthPolicy = 1;
  } else {
    throw new Error('ALIYUN_PNVS_ACTION_INVALID');
  }
  params.Signature = signRpcParams(params, config.accessKeySecret);
  return {
    url: config.endpoint,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString(),
    },
    fetchImpl,
  };
}

function parseResponse(payload, response) {
  const model = payload?.Model || {};
  return {
    accepted: response.ok && payload?.Success === true && payload?.Code === 'OK',
    providerRequestId: payload?.RequestId || model.RequestId || randomUUID(),
    providerCode: payload?.Code || `HTTP_${response.status}`,
    providerMessage: payload?.Message || '',
    providerOutId: model.OutId || payload?.OutId || '',
    verified: model.VerifyResult === 'PASS',
    remoteVerification: true,
  };
}

export async function sendAliyunPnvsSms(input) {
  const request = createAliyunPnvsRequest({ ...input, action: 'SendSmsVerifyCode' });
  const response = await request.fetchImpl(request.url, request.options);
  return parseResponse(await response.json().catch(() => ({})), response);
}

export async function verifyAliyunPnvsSms(input) {
  const request = createAliyunPnvsRequest({ ...input, action: 'CheckSmsVerifyCode' });
  const response = await request.fetchImpl(request.url, request.options);
  const result = parseResponse(await response.json().catch(() => ({})), response);
  return { ...result, verified: result.accepted && result.verified };
}
