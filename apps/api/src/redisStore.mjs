import { createClient } from 'redis';

export const CLAIM_SMS_SCRIPT = `
local idem = redis.call('GET', KEYS[3])
if idem then
  if redis.call('GET', KEYS[12]) ~= ARGV[16] then return {'IDEMPOTENCY_CONFLICT'} end
  return {'IDEMPOTENT', idem}
end
if redis.call('EXISTS', KEYS[1]) == 0 then return {'CHALLENGE_INVALID'} end
if redis.call('HGET', KEYS[1], 'used') == '1' then return {'CHALLENGE_USED'} end
if redis.call('EXISTS', KEYS[2]) == 1 then return {'REPLAYED'} end
if redis.call('EXISTS', KEYS[16]) == 1 then return {'REPLAYED'} end
if redis.call('EXISTS', KEYS[4]) == 1 then return {'PHONE_COOLDOWN', redis.call('TTL', KEYS[4])} end

local ip10 = redis.call('INCR', KEYS[5])
if ip10 == 1 then redis.call('EXPIRE', KEYS[5], ARGV[1]) end
if ip10 > tonumber(ARGV[2]) then return {'IP_LIMIT', redis.call('TTL', KEYS[5])} end
local ipHour = redis.call('INCR', KEYS[6])
if ipHour == 1 then redis.call('EXPIRE', KEYS[6], ARGV[3]) end
if ipHour > tonumber(ARGV[4]) then return {'IP_LIMIT', redis.call('TTL', KEYS[6])} end
local ipDay = redis.call('INCR', KEYS[7])
if ipDay == 1 then redis.call('EXPIRE', KEYS[7], ARGV[5]) end
if ipDay > tonumber(ARGV[6]) then return {'IP_LIMIT', redis.call('TTL', KEYS[7])} end

local distinct = redis.call('SADD', KEYS[8], ARGV[7])
if redis.call('SCARD', KEYS[8]) == 1 then redis.call('EXPIRE', KEYS[8], ARGV[8]) end
if redis.call('SCARD', KEYS[8]) > tonumber(ARGV[9]) then return {'IP_DISTINCT_PHONE_LIMIT', ARGV[8]} end

local device10 = redis.call('INCR', KEYS[9])
if device10 == 1 then redis.call('EXPIRE', KEYS[9], ARGV[1]) end
if device10 > tonumber(ARGV[10]) then return {'DEVICE_LIMIT', redis.call('TTL', KEYS[9])} end
local deviceDay = redis.call('INCR', KEYS[10])
if deviceDay == 1 then redis.call('EXPIRE', KEYS[10], ARGV[5]) end
if deviceDay > tonumber(ARGV[11]) then return {'DEVICE_LIMIT', redis.call('TTL', KEYS[10])} end

local globalMinute = redis.call('INCR', KEYS[11])
if globalMinute == 1 then redis.call('EXPIRE', KEYS[11], ARGV[12]) end
if globalMinute > tonumber(ARGV[13]) then return {'GLOBAL_LIMIT', redis.call('TTL', KEYS[11])} end

local phoneHour = redis.call('INCR', KEYS[13])
if phoneHour == 1 then redis.call('EXPIRE', KEYS[13], ARGV[20]) end
if phoneHour > tonumber(ARGV[17]) then redis.call('DECR', KEYS[13]); return {'PHONE_HOURLY_LIMIT', redis.call('TTL', KEYS[13])} end
local phoneDay = redis.call('INCR', KEYS[14])
if phoneDay == 1 then redis.call('EXPIRE', KEYS[14], ARGV[20]) end
if phoneDay > tonumber(ARGV[18]) then redis.call('DECR', KEYS[13]); redis.call('DECR', KEYS[14]); return {'PHONE_DAILY_LIMIT', redis.call('TTL', KEYS[14])} end
local globalDay = redis.call('INCR', KEYS[15])
if globalDay == 1 then redis.call('EXPIRE', KEYS[15], ARGV[20]) end
if globalDay > tonumber(ARGV[19]) then redis.call('DECR', KEYS[13]); redis.call('DECR', KEYS[14]); redis.call('DECR', KEYS[15]); return {'GLOBAL_LIMIT', redis.call('TTL', KEYS[15])} end

if redis.call('SET', KEYS[4], '1', 'NX', 'EX', ARGV[14]) == false then return {'PHONE_COOLDOWN', ARGV[14]} end
redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[15])
redis.call('SET', KEYS[16], '1', 'NX', 'EX', ARGV[15])
redis.call('HSET', KEYS[1], 'used', '1')
redis.call('SET', KEYS[3], 'PROCESSING', 'EX', ARGV[15])
redis.call('SET', KEYS[12], ARGV[16], 'EX', ARGV[15])
return {'CLAIMED'}
`;

export const CONSUME_CODE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return {'MISSING'} end
if redis.call('HGET', KEYS[1], 'smsRequestId') ~= ARGV[1] then return {'INVALID'} end
local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
if attempts >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1]); return {'EXCEEDED'} end
if redis.call('HGET', KEYS[1], 'codeHash') ~= ARGV[2] then
  attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
  if attempts >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1]); return {'EXCEEDED'} end
  return {'INVALID', tostring(attempts)}
end
redis.call('DEL', KEYS[1])
return {'OK'}
`;

let client;
let connectPromise;

export function redisConfigured(env = process.env) {
  return Boolean(String(env.REDIS_URL || '').trim());
}

export async function getRedisClient(env = process.env) {
  if (!redisConfigured(env)) throw new Error('REDIS_NOT_CONFIGURED');
  if (client?.isReady) return client;
  if (!client) {
    client = createClient({ url: env.REDIS_URL });
    client.on('error', (error) => console.error('redis error', error instanceof Error ? error.message : error));
  }
  connectPromise ||= client.connect();
  await connectPromise;
  return client;
}

export async function closeRedisClient() {
  connectPromise = undefined;
  if (client?.isOpen) await client.quit();
  client = undefined;
}

export async function claimSmsAttempt(redis, keys, config) {
  return redis.eval(CLAIM_SMS_SCRIPT, {
    keys,
    arguments: [
      String(config.ipShortTtl), String(config.ipMax10m), String(config.ipHourTtl), String(config.ipMaxHour),
      String(config.ipDayTtl), String(config.ipMaxDay), String(config.phoneHash), String(config.distinctTtl),
      String(config.distinctMax), String(config.deviceMax10m), String(config.deviceMaxDay), String(config.globalMinuteTtl),
      String(config.globalMaxMinute), String(config.cooldownSeconds), String(config.replayTtl), String(config.bodyHash),
      String(config.phoneMaxHour), String(config.phoneMaxDay), String(config.globalMaxDay), String(config.dayTtl),
    ],
  });
}

export async function consumeSmsCode(redis, key, smsRequestId, expectedHash, maxAttempts) {
  return redis.eval(CONSUME_CODE_SCRIPT, {
    keys: [key],
    arguments: [String(smsRequestId), String(expectedHash), String(maxAttempts)],
  });
}

export async function incrementWithExpiry(redis, key, ttl) {
  const result = await redis.multi().incr(key).expire(key, ttl, 'NX').exec();
  return Number(result?.[0] ?? 0);
}
