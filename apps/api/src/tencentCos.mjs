import path from 'node:path';
import COS from 'cos-nodejs-sdk-v5';
import { randomUUID } from 'node:crypto';

export function loadTencentCosConfig(env = process.env) {
  const enabled = String(env.TENCENT_COS_ENABLED || '').toLowerCase() === 'true';
  const secretId = String(env.TENCENT_COS_SECRET_ID || '').trim();
  const secretKey = String(env.TENCENT_COS_SECRET_KEY || '').trim();
  const bucket = String(env.TENCENT_COS_BUCKET || '').trim();
  const region = String(env.TENCENT_COS_REGION || '').trim();
  const keyPrefix = String(env.TENCENT_COS_KEY_PREFIX || 'uploads/images').trim().replace(/^\/+|\/+$/g, '');
  const privateDomain = String(env.TENCENT_COS_PRIVATE_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const protocol = String(env.TENCENT_COS_PROTOCOL || 'https').trim().replace(':', '') || 'https';
  const configuredExpires = Number(env.TENCENT_COS_SIGN_EXPIRES || 900);
  const signExpires = Number.isFinite(configuredExpires) ? Math.max(1, configuredExpires) : 900;
  if (!enabled || !secretId || !secretKey || !bucket || !region) {
    throw new Error('腾讯云 COS 未配置，请检查 TENCENT_COS_ENABLED、TENCENT_COS_SECRET_ID、TENCENT_COS_SECRET_KEY、TENCENT_COS_BUCKET、TENCENT_COS_REGION');
  }
  return { secretId, secretKey, bucket, region, keyPrefix, privateDomain, protocol, signExpires };
}

function extractAssetKey(assetPath, bucket) {
  const value = String(assetPath || '').trim();
  const prefix = `cos://${bucket}/`;
  if (!value.startsWith(prefix) || value.length <= prefix.length) throw new Error('COS 资源路径无效');
  return value.slice(prefix.length);
}

export function createSignedCosUrl(assetPath, config) {
  const key = extractAssetKey(assetPath, config.bucket);
  const client = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
  return client.getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: key,
    Sign: true,
    Expires: config.signExpires,
    ...(config.privateDomain ? { Domain: config.privateDomain } : {}),
    Protocol: `${config.protocol}:`,
  });
}

export function resolveCosAssetUrl(value, config = loadTencentCosConfig()) {
  const assetPath = String(value || '').trim();
  if (!assetPath || !assetPath.startsWith('cos://')) return assetPath;
  return createSignedCosUrl(assetPath, config);
}

export function uploadToTencentCos({ buffer, filename, contentType, userId, kind }, config = loadTencentCosConfig()) {
  const safeName = path.basename(filename || `${kind}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${config.keyPrefix}/projects/${userId}/${randomUUID()}-${kind}-${safeName}`;
  const client = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
  return new Promise((resolve, reject) => {
    client.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }, (error) => {
      if (error) {
        reject(new Error(`腾讯云 COS 上传失败：${error.message || error.code || '未知错误'}`));
        return;
      }
      const assetPath = `cos://${config.bucket}/${key}`;
      resolve({ path: assetPath, url: createSignedCosUrl(assetPath, config) });
    });
  });
}
