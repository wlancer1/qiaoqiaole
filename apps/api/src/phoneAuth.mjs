import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  codeHash,
  createSmsBodyHash,
  createReplayDigest,
  encryptIdentifier,
  generateCode,
  hashIdentifier,
  maskPhone,
  normalizePhoneE164,
  signSmsRequest,
  verifySmsSignature,
} from './authSecurity.mjs';
import { claimSmsAttempt, consumeSmsCode, incrementWithExpiry } from './redisStore.mjs';
import { loadAliyunPnvsConfig, sendAliyunPnvsSms, verifyAliyunPnvsSms } from './aliyunPnvs.mjs';
import { verifyTencentCaptcha } from './tencentCaptcha.mjs';

const ALLOWED_PLATFORMS = new Set(['web', 'android', 'ios']);
const SIGN_VERSION_BY_PLATFORM = { web: 'web-v1', android: 'mobile-v1', ios: 'mobile-v1' };
const DEFAULT_CONFIG = {
  codeLength: 6, codeTtl: 300, resendCooldown: 60, maxVerifyAttempts: 5,
  phoneHour: 5, phoneDay: 10, ip10m: 10, ipHour: 30, ipDay: 100,
  distinctPhones: 10, device10m: 5, deviceDay: 20, globalMinute: 100, globalDay: 1000,
  challengeTtl: 600, replayTtl: 1200, timestampSkew: 600, nonceBytes: 16,
};

export class AuthError extends Error {
  constructor(code, status, message, retryAfter = 0) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function configFromEnv(env) {
  const number = (name, fallback) => Number(env[name] || fallback);
  return {
    ...DEFAULT_CONFIG,
    codeTtl: number('AUTH_SMS_CODE_TTL_SECONDS', DEFAULT_CONFIG.codeTtl),
    resendCooldown: number('AUTH_SMS_RESEND_COOLDOWN_SECONDS', DEFAULT_CONFIG.resendCooldown),
    maxVerifyAttempts: number('AUTH_SMS_MAX_VERIFY_ATTEMPTS', DEFAULT_CONFIG.maxVerifyAttempts),
    phoneHour: number('AUTH_SMS_PHONE_MAX_HOUR', DEFAULT_CONFIG.phoneHour),
    phoneDay: number('AUTH_SMS_PHONE_MAX_DAY', DEFAULT_CONFIG.phoneDay),
    ip10m: number('AUTH_SMS_IP_MAX_10M', DEFAULT_CONFIG.ip10m),
    ipHour: number('AUTH_SMS_IP_MAX_HOUR', DEFAULT_CONFIG.ipHour),
    ipDay: number('AUTH_SMS_IP_MAX_DAY', DEFAULT_CONFIG.ipDay),
    distinctPhones: number('AUTH_SMS_IP_HARD_DISTINCT_PHONES', DEFAULT_CONFIG.distinctPhones),
    device10m: number('AUTH_SMS_DEVICE_MAX_10M', DEFAULT_CONFIG.device10m),
    deviceDay: number('AUTH_SMS_DEVICE_MAX_DAY', DEFAULT_CONFIG.deviceDay),
    globalMinute: number('AUTH_SMS_GLOBAL_MAX_MINUTE', DEFAULT_CONFIG.globalMinute),
    globalDay: number('AUTH_SMS_GLOBAL_MAX_DAY', DEFAULT_CONFIG.globalDay),
    challengeTtl: number('AUTH_REQUEST_CHALLENGE_TTL_SECONDS', DEFAULT_CONFIG.challengeTtl),
    replayTtl: number('AUTH_REQUEST_REPLAY_TTL_SECONDS', DEFAULT_CONFIG.replayTtl),
    timestampSkew: number('AUTH_REQUEST_TIMESTAMP_SKEW_SECONDS', DEFAULT_CONFIG.timestampSkew),
  };
}

function epochSeconds() { return Math.floor(Date.now() / 1000); }
function hashValue(value, pepper) { return hashIdentifier(value, pepper); }
function ipHash(ip, pepper) { return hashValue(ip || 'unknown', pepper); }
function deviceHash(deviceId, pepper) { return hashValue(deviceId || 'unknown', pepper); }
function nowIso() { return new Date().toISOString(); }
function ttlLeft(seconds, now = epochSeconds()) { return Math.max(1, seconds - now); }
function passwordDigest(password, salt) { return scryptSync(password, salt, 32).toString('hex'); }
function validPassword(password) { return password.length >= 8 && password.length <= 128; }

function jsonResponse(status, data, requestId, extra = {}) {
  return { status, body: { code: 'OK', message: 'success', data, requestId }, headers: extra };
}

function jwtEncode(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

function jwtDecode(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.exp > epochSeconds() ? payload : null;
  } catch { return null; }
}

export function verifyAccessToken(token, secret) {
  return jwtDecode(token, secret);
}

function parseCookie(value) {
  return Object.fromEntries(String(value || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

export function createPhoneAuthService({ db, getOne, getAll, persist, redis, env = process.env, smsSender = sendAliyunPnvsSms, smsVerifier = verifyAliyunPnvsSms, captchaVerifier = verifyTencentCaptcha }) {
  const config = configFromEnv(env);
  const pepper = String(env.AUTH_PHONE_PEPPER || '').trim();
  const jwtSecret = String(env.AUTH_JWT_SECRET || '').trim();
  const appId = String(env.AUTH_PUBLIC_APP_ID || 'qiaoqiaole-h5').trim();
  if (!pepper || !jwtSecret) throw new Error('AUTH_PHONE_PEPPER and AUTH_JWT_SECRET must be configured');
  const provider = env.AUTH_SMS_PROVIDER === 'mock'
    ? async () => ({ accepted: true, providerRequestId: `mock_${randomUUID()}`, providerCode: 'OK', remoteVerification: false })
    : smsSender;

  function redisKey(...parts) { return `auth:sms:${parts.join(':')}`; }
  function authUser(userId) {
    const user = getOne(`SELECT u.id, u.username, u.nickname, i.identifier_last4 AS phoneLast4, u.avatar_url AS avatarUrl, u.status, u.register_source AS registerSource,
      u.registered_at AS registeredAt, u.last_login_at AS lastLoginAt FROM users u LEFT JOIN user_identities i ON i.user_id = u.id AND i.provider = 'PHONE' WHERE u.id = ?`, [userId]);
    if (!user || user.status === 'DISABLED') return null;
    if (!user.nickname && user.phoneLast4) user.nickname = `用户${user.phoneLast4}`;
    return user;
  }
  function publicUser(user) {
    return { id: user.id, nickname: user.nickname || (user.phoneLast4 ? `用户${user.phoneLast4}` : user.username), avatarUrl: user.avatarUrl || null, status: user.status || 'ACTIVE' };
  }
  function accessToken(userId, sessionId, platform) {
    const iat = epochSeconds();
    return jwtEncode({ sub: userId, sid: sessionId, platform, iat, exp: iat + Number(env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 7200) }, jwtSecret);
  }
  function sessionTokens(userId, platform, deviceId, ip) {
    const sessionId = `ses_${randomUUID()}`;
    const familyId = `fam_${randomUUID()}`;
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshHash = hashValue(refreshToken, jwtSecret);
    const expiresAt = new Date(Date.now() + Number(env.AUTH_REFRESH_TOKEN_TTL_DAYS || 30) * 86400000).toISOString();
    db.run(`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, token_family_id, platform, device_id_hash, ip_hash, expires_at, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [sessionId, userId, refreshHash, familyId, platform, deviceHash(deviceId, pepper), ipHash(ip, pepper), expiresAt, nowIso(), nowIso()]);
    return { sessionId, familyId, refreshToken, expiresAt, accessToken: accessToken(userId, sessionId, platform) };
  }

  async function challenge(body, ip, requestId) {
    const platform = String(body.platform || '');
    const deviceId = String(body.deviceId || '').trim();
    if (!ALLOWED_PLATFORMS.has(platform) || !deviceId || deviceId.length > 256) throw new AuthError('AUTH_REQUEST_INVALID', 400, '请求无效，请刷新后重试');
    const ipKey = redisKey('challenge', ipHash(ip, pepper), '10m');
    const attempts = await incrementWithExpiry(redis, ipKey, 600);
    if (attempts > config.ip10m) throw new AuthError('AUTH_IP_LIMIT', 429, '操作过于频繁，请稍后再试', 600);
    const challengeId = `ch_${randomUUID()}`;
    const seed = randomBytes(32).toString('base64url');
    await redis.hSet(redisKey('challenge', challengeId), { seed, platform, signVersion: SIGN_VERSION_BY_PLATFORM[platform], issuedAt: String(epochSeconds()), ipHash: ipHash(ip, pepper), used: '0' });
    await redis.expire(redisKey('challenge', challengeId), config.challengeTtl);
    return jsonResponse(200, { challengeId, seed, signVersion: SIGN_VERSION_BY_PLATFORM[platform], serverTime: Date.now(), expiresIn: config.challengeTtl }, requestId);
  }

  async function send(body, headers, ip, requestId) {
    const normalizedPhone = normalizePhoneE164(body.phone);
    const scene = String(body.scene || '');
    if (scene !== 'REGISTER' || !String(body.deviceId || '').trim()) throw new AuthError('AUTH_REQUEST_INVALID', 400, '请求无效，请刷新后重试');
    const allowedFields = new Set(['phone', 'scene', 'captchaTicket', 'captchaRandstr', 'deviceId']);
    if (Object.keys(body).some((field) => !allowedFields.has(field))) throw new AuthError('AUTH_REQUEST_INVALID', 400, '请求无效，请刷新后重试');
    const platform = String(headers.platform || '');
    const signVersion = String(headers.signVersion || '');
    const clientRequestId = String(headers.requestId || '');
    const nonce = String(headers.nonce || '');
    const challengeId = String(headers.challengeId || '');
    const timestamp = Number(headers.timestamp);
    if (!ALLOWED_PLATFORMS.has(platform) || SIGN_VERSION_BY_PLATFORM[platform] !== signVersion || !/^[0-9a-f-]{36}$/i.test(clientRequestId) || !/^[A-Za-z0-9_-]{20,}$/.test(nonce) || !challengeId || !Number.isSafeInteger(timestamp)) {
      throw new AuthError('AUTH_REQUEST_INVALID', 400, '请求无效，请刷新后重试');
    }
    const serverTime = Date.now();
    if (Math.abs(serverTime - timestamp) > config.timestampSkew * 1000) throw new AuthError('AUTH_REQUEST_EXPIRED', 400, '请求已失效，请重新获取');
    const challengeKey = redisKey('challenge', challengeId);
    const challengeData = await redis.hGetAll(challengeKey);
    if (!challengeData.seed || challengeData.platform !== platform || challengeData.signVersion !== signVersion || challengeData.ipHash !== ipHash(ip, pepper)) throw new AuthError('AUTH_REQUEST_INVALID', 400, '请求无效，请刷新后重试');
    const signedHeaders = { platform, signVersion, timestamp, requestId: clientRequestId, nonce, challengeId };
    if (!verifySmsSignature(signedHeaders, { ...body, phone: normalizedPhone }, challengeData.seed, headers.signature, appId)) throw new AuthError('AUTH_REQUEST_INVALID', 400, '请求无效，请刷新后重试');
    const replayDigest = createReplayDigest({ platform, signVersion, requestId: clientRequestId, nonce, challengeId, signature: headers.signature });
    if (String(env.AUTH_CAPTCHA_REQUIRED || 'false').toLowerCase() === 'true') {
      const validCaptcha = await captchaVerifier({ ticket: String(body.captchaTicket || ''), randstr: String(body.captchaRandstr || ''), userIp: ip, env });
      if (!validCaptcha) throw new AuthError('AUTH_CAPTCHA_INVALID', 400, '请重新完成人机验证');
    }
    const phoneHash = hashValue(normalizedPhone, pepper);
    const existingPhoneUser = getOne(`SELECT u.id FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'PHONE' AND i.identifier_hash = ?`, [phoneHash]);
    if (existingPhoneUser) throw new AuthError('AUTH_PHONE_REGISTERED', 409, '该手机号已注册，请直接登录');
    const deviceId = String(body.deviceId).trim();
    const keys = [
      challengeKey,
      redisKey('replay', replayDigest),
      redisKey('idempotency', clientRequestId),
      redisKey('cooldown', scene, phoneHash),
      redisKey('ip', '10m', ipHash(ip, pepper), Math.floor(Date.now() / 600000)),
      redisKey('ip', 'hour', ipHash(ip, pepper), new Date().toISOString().slice(0, 13)),
      redisKey('ip', 'day', ipHash(ip, pepper), new Date().toISOString().slice(0, 10)),
      redisKey('ip', 'phones', ipHash(ip, pepper), Math.floor(Date.now() / 600000)),
      redisKey('device', '10m', deviceHash(deviceId, pepper), Math.floor(Date.now() / 600000)),
      redisKey('device', 'day', deviceHash(deviceId, pepper), new Date().toISOString().slice(0, 10)),
      redisKey('global', 'minute', Math.floor(Date.now() / 60000)),
      redisKey('idempotency-hash', clientRequestId),
      redisKey('phone', 'hour', scene, phoneHash, new Date().toISOString().slice(0, 13)),
      redisKey('phone', 'day', scene, phoneHash, new Date().toISOString().slice(0, 10)),
      redisKey('global', 'day', new Date().toISOString().slice(0, 10)),
      redisKey('nonce', platform, hashValue(nonce, pepper)),
    ];
    const claimed = await claimSmsAttempt(redis, keys, {
      ipShortTtl: 1200, ipMax10m: config.ip10m, ipHourTtl: 7200, ipMaxHour: config.ipHour,
      ipDayTtl: 172800, ipMaxDay: config.ipDay, phoneHash, distinctTtl: 1200, distinctMax: config.distinctPhones,
      deviceMax10m: config.device10m, deviceMaxDay: config.deviceDay, globalMinuteTtl: 300, globalMaxMinute: config.globalMinute,
      cooldownSeconds: config.resendCooldown, replayTtl: config.replayTtl, bodyHash: createSmsBodyHash({ ...body, phone: normalizedPhone }),
      phoneMaxHour: config.phoneHour, phoneMaxDay: config.phoneDay, globalMaxDay: config.globalDay, dayTtl: 172800,
    });
    const claimCode = String(claimed?.[0] || '');
    if (claimCode === 'IDEMPOTENCY_CONFLICT') throw new AuthError('AUTH_REQUEST_ID_CONFLICT', 409, '请求冲突，请重新操作');
    if (claimCode === 'IDEMPOTENT') {
      const saved = await redis.get(redisKey('idempotency', clientRequestId));
      if (saved && saved !== 'PROCESSING') return { status: 200, body: JSON.parse(saved) };
      throw new AuthError('AUTH_REQUEST_REPLAYED', 409, '请求已处理，请勿重复提交');
    }
    const mapped = { CHALLENGE_INVALID: ['AUTH_REQUEST_INVALID', 400], CHALLENGE_USED: ['AUTH_REQUEST_REPLAYED', 409], REPLAYED: ['AUTH_REQUEST_REPLAYED', 409], PHONE_COOLDOWN: ['AUTH_PHONE_COOLDOWN', 429], PHONE_HOURLY_LIMIT: ['AUTH_PHONE_HOURLY_LIMIT', 429], PHONE_DAILY_LIMIT: ['AUTH_PHONE_DAILY_LIMIT', 429], IP_LIMIT: ['AUTH_IP_LIMIT', 429], IP_DISTINCT_PHONE_LIMIT: ['AUTH_IP_LIMIT', 429], DEVICE_LIMIT: ['AUTH_DEVICE_LIMIT', 429], GLOBAL_LIMIT: ['AUTH_GLOBAL_LIMIT', 429] }[claimCode];
    if (mapped) throw new AuthError(mapped[0], mapped[1], mapped[1] === 429 ? '操作过于频繁，请稍后再试' : '请求已失效，请刷新后重试', Number(claimed?.[1] || 0));

    const smsRequestId = `sms_${randomUUID()}`;
    const code = /^\d{6}$/.test(String(env.AUTH_TEST_FIXED_CODE || '')) && env.NODE_ENV !== 'production'
      ? String(env.AUTH_TEST_FIXED_CODE)
      : generateCode(randomBytes(4));
    const providerConfig = loadAliyunPnvsConfig(env);
    let providerResult;
    const providerStartedAt = Date.now();
    try {
      providerResult = await provider({ config: providerConfig, phone: normalizedPhone, code, smsRequestId });
    } catch (error) {
      if (error?.message === 'ALIYUN_PNVS_NOT_CONFIGURED') {
        await redis.expire(redisKey('cooldown', scene, phoneHash), 10);
        await redis.multi().decr(keys[12]).decr(keys[13]).decr(keys[14]).exec();
        throw new AuthError('AUTH_SMS_PROVIDER_UNAVAILABLE', 503, '短信服务暂不可用，请稍后再试');
      }
      throw error;
    }
    const logBase = [clientRequestId, requestId, smsRequestId, phoneHash, maskPhone(normalizedPhone), ipHash(ip, pepper), platform, signVersion, scene, 'PASS', providerResult.accepted ? 'ACCEPTED' : 'FAILED', providerResult.providerRequestId, providerResult.providerCode, Date.now() - providerStartedAt];
    db.run(`INSERT INTO sms_send_logs (id, request_id, trace_id, sms_request_id, phone_hash, phone_masked, ip_hash, platform, sign_version, scene, risk_result, risk_reason, result, provider_request_id, provider_code, latency_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), ...logBase.slice(0, 10), '', ...logBase.slice(10), nowIso()]);
    if (!providerResult.accepted) {
      await redis.expire(redisKey('cooldown', scene, phoneHash), 10);
      await redis.multi().decr(keys[12]).decr(keys[13]).decr(keys[14]).exec();
      await redis.set(redisKey('idempotency', clientRequestId), JSON.stringify({ code: 'AUTH_SMS_PROVIDER_UNAVAILABLE', message: '短信服务暂不可用，请稍后再试', data: {}, requestId }), { EX: config.replayTtl });
      await persist();
      throw new AuthError('AUTH_SMS_PROVIDER_UNAVAILABLE', 503, '短信服务暂不可用，请稍后再试');
    }
    const storedCode = providerResult.remoteVerification ? 'PNVS_REMOTE' : code;
    await redis.hSet(redisKey('code', scene, phoneHash), { codeHash: codeHash({ pepper, scene, phone: normalizedPhone, smsRequestId, code: storedCode }), smsRequestId, sentAt: nowIso(), attempts: '0', providerRequestId: providerResult.providerRequestId, verificationMode: providerResult.remoteVerification ? 'PNVS' : 'LOCAL', status: 'ACTIVE' });
    await redis.expire(redisKey('code', scene, phoneHash), config.codeTtl);
    const result = jsonResponse(200, { smsRequestId, expiresIn: config.codeTtl, retryAfter: config.resendCooldown }, requestId, { 'retry-after': String(config.resendCooldown) });
    await redis.set(redisKey('idempotency', clientRequestId), JSON.stringify(result.body), { EX: config.replayTtl });
    await persist();
    return result;
  }

  async function register(body, ip, requestId) {
    const phone = normalizePhoneE164(body.phone);
    const smsRequestId = String(body.smsRequestId || '');
    const submittedCode = String(body.code || '');
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    const agreementVersion = String(body.agreementVersion || '');
    const device = body.device && typeof body.device === 'object' ? body.device : {};
    const platform = String(device.platform || 'web');
    if (!/^\d{6}$/.test(submittedCode) || !smsRequestId || !validPassword(password) || password !== confirmPassword || !agreementVersion || !ALLOWED_PLATFORMS.has(platform)) throw new AuthError('AUTH_REQUEST_INVALID', 400, password !== confirmPassword ? '两次密码输入不一致' : '密码长度需为 8-128 位');
    const phoneHash = hashValue(phone, pepper);
    const key = redisKey('code', 'REGISTER', phoneHash);
    const codeRecord = await redis.hGetAll(key);
    if (!codeRecord.codeHash || codeRecord.smsRequestId !== smsRequestId) throw new AuthError('AUTH_CODE_EXPIRED', 400, '验证码已过期，请重新获取');
    if (codeRecord.verificationMode === 'PNVS') {
      let verification;
      try {
        verification = await smsVerifier({ config: loadAliyunPnvsConfig(env), phone, code: submittedCode, smsRequestId });
      } catch (error) {
        if (error?.message === 'ALIYUN_PNVS_NOT_CONFIGURED') throw new AuthError('AUTH_SMS_PROVIDER_UNAVAILABLE', 503, '短信服务暂不可用，请稍后再试');
        throw error;
      }
      if (!verification.verified) {
        const attempts = await redis.hIncrBy(key, 'attempts', 1);
        if (attempts >= config.maxVerifyAttempts) {
          await redis.del(key);
          throw new AuthError('AUTH_CODE_ATTEMPTS_EXCEEDED', 429, '验证次数过多，请重新获取验证码');
        }
        throw new AuthError('AUTH_CODE_INVALID', 400, '验证码错误');
      }
    }
    const expected = codeHash({ pepper, scene: 'REGISTER', phone, smsRequestId, code: codeRecord.verificationMode === 'PNVS' ? 'PNVS_REMOTE' : submittedCode });
    const consumed = await consumeSmsCode(redis, key, smsRequestId, expected, config.maxVerifyAttempts);
    const result = String(consumed?.[0] || '');
    if (result === 'MISSING') throw new AuthError('AUTH_CODE_EXPIRED', 400, '验证码已过期，请重新获取');
    if (result === 'EXCEEDED') {
      await incrementWithExpiry(redis, redisKey('verifyfail', 'ip', ipHash(ip, pepper), new Date().toISOString().slice(0, 13)), 7200);
      throw new AuthError('AUTH_CODE_ATTEMPTS_EXCEEDED', 429, '验证次数过多，请重新获取验证码');
    }
    if (result !== 'OK') {
      const failed = await incrementWithExpiry(redis, redisKey('verifyfail', 'ip', ipHash(ip, pepper), new Date().toISOString().slice(0, 13)), 7200);
      if (failed > 50) throw new AuthError('AUTH_IP_LIMIT', 429, '操作过于频繁，请稍后再试', 3600);
      throw new AuthError('AUTH_CODE_INVALID', 400, '验证码错误');
    }
    let identity = getOne(`SELECT u.id, u.status, u.username, u.nickname, i.identifier_last4 AS phoneLast4, u.avatar_url AS avatarUrl FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'PHONE' AND i.identifier_hash = ?`, [phoneHash]);
    if (identity) throw new AuthError('AUTH_PHONE_REGISTERED', 409, '该手机号已注册，请直接登录');
    const isNewUser = true;
    const now = nowIso();
    db.run('BEGIN');
    try {
      if (!identity) {
        const userId = `usr_${randomUUID()}`;
        const username = `phone_${phoneHash.slice(0, 24)}`;
        const nickname = `用户${phone.slice(-4)}`;
        const salt = randomBytes(16).toString('hex');
        db.run(`INSERT INTO users (id, username, password_hash, salt, nickname, status, register_source, registered_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`, [userId, username, passwordDigest(password, salt), salt, nickname, platform, now, now, now]);
        db.run(`INSERT INTO user_identities (id, user_id, provider, identifier_hash, identifier_ciphertext, identifier_last4, verified_at, created_at) VALUES (?, ?, 'PHONE', ?, ?, ?, ?, ?)`, [randomUUID(), userId, phoneHash, encryptIdentifier(phone, pepper), phone.slice(-4), now, now]);
        identity = { id: userId, status: 'ACTIVE', username, nickname, avatarUrl: null };
        db.run(`INSERT INTO user_agreement_acceptances (id, user_id, agreement_version, accepted_at, ip_hash, platform) VALUES (?, ?, ?, ?, ?, ?)`, [randomUUID(), userId, agreementVersion, now, ipHash(ip, pepper), platform]);
      } else if (identity.status === 'DISABLED') {
        db.run('ROLLBACK');
        throw new AuthError('AUTH_USER_DISABLED', 403, '当前账号暂不可用');
      }
      db.run('UPDATE users SET last_login_at = ?, last_login_ip_hash = ?, updated_at = ? WHERE id = ?', [now, ipHash(ip, pepper), now, identity.id]);
      const tokens = sessionTokens(identity.id, platform, device.deviceId, ip);
      db.run('COMMIT');
      await persist();
      return jsonResponse(200, { isNewUser, user: publicUser(identity), accessToken: tokens.accessToken, expiresIn: Number(env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 7200) }, requestId, { 'set-cookie': `refresh_token=${encodeURIComponent(tokens.refreshToken)}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` });
    } catch (error) {
      try { db.run('ROLLBACK'); } catch {}
      throw error;
    }
  }

  async function login(body, ip, requestId) {
    const phone = normalizePhoneE164(body.phone);
    const password = String(body.password || '');
    const agreementVersion = String(body.agreementVersion || '');
    const device = body.device && typeof body.device === 'object' ? body.device : {};
    const platform = String(device.platform || 'web');
    if (!validPassword(password) || !agreementVersion || !ALLOWED_PLATFORMS.has(platform)) throw new AuthError('AUTH_REQUEST_INVALID', 400, '手机号或密码错误');
    const phoneHash = hashValue(phone, pepper);
    const identity = getOne(`SELECT u.id, u.status, u.username, u.nickname, i.identifier_last4 AS phoneLast4, u.password_hash AS passwordHash, u.salt, u.avatar_url AS avatarUrl FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'PHONE' AND i.identifier_hash = ?`, [phoneHash]);
    if (!identity || !identity.passwordHash || !identity.salt || passwordDigest(password, identity.salt) !== identity.passwordHash) throw new AuthError('AUTH_LOGIN_INVALID', 401, '手机号或密码错误');
    if (identity.status === 'DISABLED') throw new AuthError('AUTH_USER_DISABLED', 403, '当前账号暂不可用');
    const now = nowIso();
    if (!identity.nickname && identity.phoneLast4) {
      identity.nickname = `用户${identity.phoneLast4}`;
      db.run('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?', [identity.nickname, now, identity.id]);
    }
    db.run('UPDATE users SET last_login_at = ?, last_login_ip_hash = ?, updated_at = ? WHERE id = ?', [now, ipHash(ip, pepper), now, identity.id]);
    const tokens = sessionTokens(identity.id, platform, device.deviceId, ip);
    await persist();
    return jsonResponse(200, { isNewUser: false, user: publicUser(identity), accessToken: tokens.accessToken, expiresIn: Number(env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 7200) }, requestId, { 'set-cookie': `refresh_token=${encodeURIComponent(tokens.refreshToken)}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` });
  }

  async function refresh(refreshToken, requestId) {
    const token = String(refreshToken || '');
    const hash = hashValue(token, jwtSecret);
    const session = getOne('SELECT * FROM auth_sessions WHERE refresh_token_hash = ?', [hash]);
    if (!session) throw new AuthError('AUTH_REQUEST_INVALID', 401, '登录状态已失效，请重新登录');
    if (session.revoked_at) {
      db.run('UPDATE auth_sessions SET revoked_at = ? WHERE token_family_id = ?', [nowIso(), session.token_family_id]);
      await persist();
      throw new AuthError('AUTH_REQUEST_INVALID', 401, '登录状态已失效，请重新登录');
    }
    if (Date.parse(session.expires_at) <= Date.now()) throw new AuthError('AUTH_REQUEST_INVALID', 401, '登录状态已失效，请重新登录');
    const user = authUser(session.user_id);
    if (!user) throw new AuthError('AUTH_USER_DISABLED', 403, '当前账号暂不可用');
    db.run('UPDATE auth_sessions SET revoked_at = ?, last_used_at = ? WHERE id = ?', [nowIso(), nowIso(), session.id]);
    const tokens = sessionTokens(user.id, session.platform, '', 'unknown');
    await persist();
    return jsonResponse(200, { user: publicUser(user), accessToken: tokens.accessToken, expiresIn: Number(env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 7200) }, requestId, { 'set-cookie': `refresh_token=${encodeURIComponent(tokens.refreshToken)}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` });
  }

  async function logout(refreshToken, requestId) {
    const hash = hashValue(String(refreshToken || ''), jwtSecret);
    db.run('UPDATE auth_sessions SET revoked_at = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL', [nowIso(), hash]);
    await persist();
    return jsonResponse(200, {}, requestId, { 'set-cookie': 'refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=0' });
  }

  function authenticate(access) {
    const payload = jwtDecode(String(access || '').replace(/^Bearer\s+/i, ''), jwtSecret);
    if (!payload) return null;
    const user = authUser(payload.sub);
    return user ? { ...user, sessionId: payload.sid } : null;
  }

  function adminListUsers(url) {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const where = [];
    const params = [];
    const phone = String(url.searchParams.get('phone') || '').trim();
    const status = String(url.searchParams.get('status') || '').trim();
    const source = String(url.searchParams.get('source') || '').trim();
    if (phone) {
      try { where.push('i.identifier_hash = ?'); params.push(hashValue(normalizePhoneE164(phone), pepper)); } catch { throw new AuthError('AUTH_PHONE_INVALID', 400, '请输入正确的手机号'); }
    }
    if (['ACTIVE', 'DISABLED'].includes(status)) { where.push('u.status = ?'); params.push(status); }
    if (source) { where.push('u.register_source = ?'); params.push(source); }
    const rows = getAll(`SELECT u.id, u.nickname, u.status, u.register_source AS registerSource, u.registered_at AS registeredAt, u.last_login_at AS lastLoginAt,
      i.identifier_last4 AS phoneLast4 FROM users u LEFT JOIN user_identities i ON i.user_id = u.id AND i.provider = 'PHONE' ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return rows.map((row) => ({ ...row, phone: row.phoneLast4 ? `****${row.phoneLast4}` : null }));
  }

  async function adminSetUserStatus(userId, status, reason, adminId) {
    if (!['ACTIVE', 'DISABLED'].includes(status) || !String(reason || '').trim()) throw new AuthError('AUTH_REQUEST_INVALID', 400, '状态和原因不能为空');
    const user = getOne('SELECT id, status FROM users WHERE id = ?', [userId]);
    if (!user) throw new AuthError('NOT_FOUND', 404, '用户不存在');
    db.run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), userId]);
    if (status === 'DISABLED') db.run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), userId]);
    db.run('INSERT INTO admin_audit_logs (id, admin_user_id, action, target_user_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), adminId, `USER_${status}`, userId, reason.trim(), nowIso()]);
    await persist();
    return { status };
  }

  function adminSmsLogs(url) {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const where = [];
    const params = [];
    for (const [query, column] of [['result', 'result'], ['platform', 'platform'], ['requestId', 'request_id'], ['traceId', 'trace_id']]) {
      const value = String(url.searchParams.get(query) || '').trim();
      if (value) { where.push(`${column} = ?`); params.push(value); }
    }
    const phone = String(url.searchParams.get('phone') || '').trim();
    if (phone) {
      try { where.push('phone_hash = ?'); params.push(hashValue(normalizePhoneE164(phone), pepper)); } catch { throw new AuthError('AUTH_PHONE_INVALID', 400, '请输入正确的手机号'); }
    }
    return getAll(`SELECT id, request_id AS requestId, trace_id AS traceId, sms_request_id AS smsRequestId, phone_masked AS phone, ip_hash AS ipHash, platform, sign_version AS signVersion, result, provider_code AS providerCode, risk_result AS riskResult, risk_reason AS riskReason, created_at AS createdAt FROM sms_send_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, [...params, limit]);
  }

  return { challenge, send, register, login, refresh, logout, authenticate, adminListUsers, adminSetUserStatus, adminSmsLogs, config };
}
