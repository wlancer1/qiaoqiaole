import { createHash, createHmac } from 'node:crypto';

function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function hmac(key, value) { return createHmac('sha256', key).update(value, 'utf8').digest(); }

export async function verifyTencentCaptcha({ ticket, randstr, userIp, env = process.env, fetchImpl = fetch }) {
  if (env.AUTH_CAPTCHA_PROVIDER === 'mock') return true;
  const appId = String(env.TENCENT_CAPTCHA_APP_ID || '').trim();
  const appSecretKey = String(env.TENCENT_CAPTCHA_APP_SECRET_KEY || '').trim();
  if (!appId || !appSecretKey || !ticket || !randstr) return false;
  const service = 'captcha';
  const host = 'captcha.tencentcloudapi.com';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify({ CaptchaAppId: appId, Ticket: ticket, Randstr: randstr, UserIp: userIp });
  const canonical = ['POST', '/', '', `content-type:application/json; charset=utf-8\nhost:${host}\n`, 'content-type;host', hash(body)].join('\n');
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, hash(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(`TC3${appSecretKey}`, date), service), 'tc3_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const response = await fetchImpl(`https://${host}/`, {
    method: 'POST',
    headers: {
      Authorization: `TC3-HMAC-SHA256 Credential=${appId}/${date}/${service}/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`,
      'Content-Type': 'application/json; charset=utf-8', Host: host, 'X-TC-Action': 'DescribeCaptchaResult', 'X-TC-Version': '2019-07-22', 'X-TC-Timestamp': String(timestamp),
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && Number(payload?.Response?.CaptchaCode) === 1;
}
