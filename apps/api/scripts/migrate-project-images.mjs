#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../src/env.mjs';
import { openSqliteDatabase } from '../src/sqliteStore.mjs';
import { loadTencentCosConfig, uploadToTencentCos } from '../src/tencentCos.mjs';

loadEnvFile();

const MAX_PROJECT_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i;

export function isImageDataUrl(value) {
  return IMAGE_DATA_URL_RE.test(String(value || '').trim());
}

export function parseImageDataUrl(value) {
  const match = String(value || '').trim().match(IMAGE_DATA_URL_RE);
  if (!match) throw new Error('图片格式无效，仅支持 PNG、JPEG、WebP Base64 图片');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PROJECT_IMAGE_BYTES) {
    throw new Error('图片大小无效，不能超过 20MB');
  }
  return { contentType: match[1].toLowerCase(), buffer };
}

export function findLegacyProjectImages(rows) {
  const result = [];
  for (const row of rows) {
    for (const field of ['source_image', 'thumbnail_image']) {
      const dataUrl = String(row[field] || '').trim();
      if (!isImageDataUrl(dataUrl)) continue;
      result.push({
        projectId: String(row.id),
        userId: String(row.user_id),
        name: String(row.name || ''),
        field,
        dataUrl,
      });
    }
  }
  return result;
}

export function shouldExecuteMigration(args) {
  return args.includes('--execute');
}

function getArg(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function printUsage() {
  console.log(`用法：
  node apps/api/scripts/migrate-project-images.mjs --dry-run
  node apps/api/scripts/migrate-project-images.mjs --execute

可选参数：
  --db <路径>       SQLite 数据库路径，默认读取 SQLITE_PATH 或 /tmp/qiaoqiaole.sqlite
  --backup-dir <路径> 备份目录，默认数据库同目录
  --limit <数量>    本次最多迁移多少个图片字段
`);
}

function rowsFromQuery(db) {
  return db.prepare('SELECT id, user_id, name, source_image, thumbnail_image FROM projects ORDER BY created_at ASC, id ASC').all();
}

async function backupDatabase(db, dbPath, backupDir) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(dbPath)}.before-project-image-migration.${timestamp}.bak`);
  await copyFile(dbPath, backupPath);
  return backupPath;
}

async function migrate() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const execute = shouldExecuteMigration(args);
  const dbPath = path.resolve(getArg(args, '--db', process.env.SQLITE_PATH || '/tmp/qiaoqiaole.sqlite'));
  const backupDir = path.resolve(getArg(args, '--backup-dir', path.dirname(dbPath)));
  const parsedLimit = Number(getArg(args, '--limit', '0'));
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : Number.POSITIVE_INFINITY;

  const db = openSqliteDatabase(dbPath);
  const candidates = findLegacyProjectImages(rowsFromQuery(db)).slice(0, limit);
  const allCandidates = findLegacyProjectImages(rowsFromQuery(db));

  console.log(`数据库：${dbPath}`);
  console.log(`发现旧项目图片：${allCandidates.length} 个字段`);
  console.log(`其中原图：${allCandidates.filter((item) => item.field === 'source_image').length} 个`);
  console.log(`其中缩略图：${allCandidates.filter((item) => item.field === 'thumbnail_image').length} 个`);
  console.log(`预计占用：${candidates.reduce((sum, item) => sum + parseImageDataUrl(item.dataUrl).buffer.length, 0)} bytes`);

  if (!execute) {
    console.log('当前为预览模式，数据库未修改。确认无误后追加 --execute 执行迁移。');
    db.close();
    return;
  }
  if (candidates.length === 0) {
    console.log('没有需要迁移的 Base64 项目图片。');
    db.close();
    return;
  }

  const backupPath = await backupDatabase(db, dbPath, backupDir);
  console.log(`数据库备份：${backupPath}`);
  const config = loadTencentCosConfig();
  let success = 0;
  let failed = 0;
  for (const item of candidates) {
    try {
      const { contentType, buffer } = parseImageDataUrl(item.dataUrl);
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length);
      const uploaded = await uploadToTencentCos({
        buffer,
        contentType,
        filename: `legacy-${item.projectId}.${extension}`,
        userId: item.userId,
        kind: item.field === 'source_image' ? 'source' : 'thumbnail',
      }, config);
      db.run(`UPDATE projects SET ${item.field} = ?, updated_at = ? WHERE id = ? AND user_id = ? AND ${item.field} = ?`, [uploaded.path, new Date().toISOString(), item.projectId, item.userId, item.dataUrl]);
      success += 1;
      console.log(`[成功] ${item.projectId} ${item.field} -> ${uploaded.path}`);
    } catch (error) {
      failed += 1;
      console.error(`[失败] ${item.projectId} ${item.field}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  console.log(`迁移完成：成功 ${success}，失败 ${failed}，未处理 ${Math.max(0, allCandidates.length - candidates.length)}`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
