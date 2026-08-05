import http from 'node:http';
import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import {
  decodeHtml,
  extractUrlFromText,
  findMetaContent,
  findTitle,
  createXhsLogger,
  inspectNoteExtraction,
  inspectImageCandidates,
  isSupportedXiaohongshuUrl,
  mobileHeaders,
  normalizeExtractedImagePayload,
  redactUrl,
} from './xiaohongshu.mjs';
import { loadEnvFile } from './env.mjs';
import { loadTencentCosConfig, resolveCosAssetUrl, uploadToTencentCos } from './tencentCos.mjs';

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.SQLITE_PATH || '/tmp/qiaoqiaole.sqlite';
const AUTH_USERNAME = requiredEnv('QIAOQIAOLE_USERNAME');
const AUTH_PASSWORD = requiredEnv('QIAOQIAOLE_PASSWORD');
const SESSION_DAYS = 30;
const MAX_EXTRACT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PROJECT_IMAGE_BYTES = 20 * 1024 * 1024;
const PROJECT_ASSET_ACCESS_SECONDS = 15 * 60;
const MARD_COLOR_RANGES = {
  A: 26,
  B: 32,
  C: 29,
  D: 26,
  E: 24,
  F: 25,
  G: 21,
  H: 23,
  M: 15,
};

const SQL = await initSqlJs();
const db = await openDatabase(DB_PATH);
initSchema();
let persistQueue = Promise.resolve();

const server = http.createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    if (error?.code === 'INVALID_JSON') {
      return sendJson(response, 400, { error: 'INVALID_INPUT', message: '请求 JSON 格式错误' });
    }
    console.error(error);
    sendJson(response, 500, { error: 'INTERNAL_ERROR', message: '服务端错误' });
  }
});

server.listen(PORT, () => {
  console.log(`qiaoqiaole api listening on :${PORT}`);
});

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

async function openDatabase(filename) {
  try {
    const data = await readFile(filename);
    return new SQL.Database(data);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new SQL.Database();
    }
    throw error;
  }
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      color_system TEXT NOT NULL DEFAULT 'MARD_221',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      warehouse_id TEXT NOT NULL,
      color_code TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (warehouse_id, color_code),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      warehouse_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      color_code TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      input_unit TEXT NOT NULL,
      input_value REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      tone TEXT NOT NULL DEFAULT 'recent-flower',
      source_image TEXT,
      thumbnail_image TEXT,
      canvas_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_likes (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  for (const column of ['source_image', 'thumbnail_image', 'canvas_data']) {
    try {
      db.run(`ALTER TABLE projects ADD COLUMN ${column} TEXT`);
    } catch {
      // Existing databases already contain the column.
    }
  }
  for (const statement of [
    'ALTER TABLE projects ADD COLUMN shared_to_community INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE projects ADD COLUMN shared_at TEXT',
    'ALTER TABLE projects ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0',
  ]) {
    try {
      db.run(statement);
    } catch {
      // Existing databases already contain the column.
    }
  }
}

async function persist() {
  const operation = persistQueue.catch(() => {}).then(async () => {
    await mkdir(path.dirname(DB_PATH), { recursive: true });
    await writeFile(DB_PATH, Buffer.from(db.export()));
  });
  persistQueue = operation;
  return operation;
}

async function route(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS') return sendCors(response);
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    return sendJson(response, 410, { error: 'REGISTER_DISABLED', message: '注册功能已下线，请使用管理员提供的账号登录' });
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    return login(request, response);
  }
  if (request.method === 'POST' && url.pathname === '/api/xiaohongshu/extract') {
    const user = requireUser(request, response);
    if (!user) return;
    const useCookie = Boolean(process.env.XHS_COOKIE);
    return extractXiaohongshu(request, response, { useCookie });
  }
  if (request.method === 'POST' && url.pathname === '/api/xiaohongshu/image') {
    const user = requireUser(request, response);
    if (!user) return;
    return downloadXiaohongshuImage(request, response);
  }
  if (request.method === 'GET' && url.pathname === '/api/xiaohongshu/proxy') {
    return proxyXiaohongshuImage(url, response);
  }
  if (request.method === 'GET' && url.pathname === '/api/project-assets') {
    return redirectProjectAsset(request, url, response);
  }

  if (request.method === 'GET' && url.pathname === '/api/community/posts') {
    const optionalUser = getOptionalUser(request);
    return listCommunityPosts(response, optionalUser?.id || '', url.searchParams.get('sort') || 'hot', parsePagination(url.searchParams));
  }
  const publicCommunityCommentsMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments$/);
  if (publicCommunityCommentsMatch && request.method === 'GET') {
    const optionalUser = getOptionalUser(request);
    return listProjectComments(response, optionalUser?.id || '', publicCommunityCommentsMatch[1], parsePagination(url.searchParams));
  }

  const user = requireUser(request, response);
  if (!user) return;

  if (request.method === 'GET' && url.pathname === '/api/me') {
    return sendJson(response, 200, { user });
  }
  if (request.method === 'GET' && url.pathname === '/api/warehouses') {
    return listWarehouses(response, user.id);
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return listProjects(response, user.id);
  }
  if (request.method === 'POST' && url.pathname === '/api/uploads/projects') {
    return uploadProjectImages(request, response, user.id);
  }
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    return createProject(request, response, user.id);
  }
  const communityCommentsMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments$/);
  if (communityCommentsMatch && request.method === 'POST') {
    return createProjectComment(request, response, user.id, communityCommentsMatch[1]);
  }
  const communityLikeMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/like$/);
  if (communityLikeMatch && request.method === 'POST') {
    return likeCommunityPost(response, user.id, communityLikeMatch[1]);
  }
  const projectShareMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/share$/);
  if (projectShareMatch && request.method === 'POST') {
    return shareProject(response, user.id, projectShareMatch[1]);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && request.method === 'PUT') {
    return updateProject(request, response, user.id, projectMatch[1]);
  }
  if (request.method === 'POST' && url.pathname === '/api/warehouses') {
    return createWarehouse(request, response, user.id);
  }

  const warehouseMatch = url.pathname.match(/^\/api\/warehouses\/([^/]+)$/);
  if (request.method === 'DELETE' && warehouseMatch) {
    return deleteWarehouse(response, user.id, warehouseMatch[1]);
  }

  const inventoryMatch = url.pathname.match(/^\/api\/warehouses\/([^/]+)\/inventory$/);
  if (request.method === 'GET' && inventoryMatch) {
    return getInventory(response, user.id, inventoryMatch[1]);
  }
  if (request.method === 'POST' && inventoryMatch) {
    return mutateInventory(request, response, user.id, inventoryMatch[1]);
  }

  sendJson(response, 404, { error: 'NOT_FOUND', message: '接口不存在' });
}

async function login(request, response) {
  const body = await readJson(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    return sendJson(response, 401, { error: 'INVALID_LOGIN', message: '用户名或密码错误' });
  }
  const { row, resetAdminSessions } = ensureEnvUser(username, password);
  migrateLegacyOwnership(row.id, { resetAdminSessions });
  const token = createSession(row.id);
  await persist();
  sendJson(response, 200, { token, user: { id: row.id, username: row.username } });
}

function ensureEnvUser(username, password) {
  const now = new Date().toISOString();
  const salt = randomUUID();
  const passwordHash = hashPassword(password, salt);
  const existing = getOne('SELECT * FROM users WHERE username = ?', [username]);
  if (existing) {
    if (verifyPassword(password, existing.salt, existing.password_hash)) {
      return { row: existing, resetAdminSessions: false };
    }
    db.run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [passwordHash, salt, existing.id]);
    return { row: { ...existing, password_hash: passwordHash, salt }, resetAdminSessions: true };
  }
  const id = randomUUID();
  db.run('INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    username,
    passwordHash,
    salt,
    now,
  ]);
  return { row: { id, username }, resetAdminSessions: false };
}

function migrateLegacyOwnership(adminUserId, { resetAdminSessions = false } = {}) {
  db.run('UPDATE warehouses SET user_id = ? WHERE user_id != ?', [adminUserId, adminUserId]);
  db.run('UPDATE inventory_transactions SET user_id = ? WHERE user_id != ?', [adminUserId, adminUserId]);
  db.run('DELETE FROM sessions WHERE user_id != ?', [adminUserId]);
  if (resetAdminSessions) db.run('DELETE FROM sessions WHERE user_id = ?', [adminUserId]);
}

async function extractXiaohongshu(request, response, { useCookie = false } = {}) {
  const requestId = randomUUID().slice(0, 8);
  const logger = createXhsLogger(`xhs:${requestId}`);
  const body = await readJson(request);
  const noteUrl = extractUrlFromText(String(body.url || ''));
  logger.info('request_received', {
    url: redactUrl(noteUrl),
    cookieConfigured: Boolean(process.env.XHS_COOKIE),
    cookieUsed: useCookie,
    cookieLength: process.env.XHS_COOKIE?.length ?? 0,
  });
  if (!noteUrl || !isSupportedXiaohongshuUrl(noteUrl)) {
    logger.info('request_rejected', { reason: 'invalid_url' });
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '请输入有效的小红书链接' });
  }

  try {
    logger.info('page_fetch_start', { url: redactUrl(noteUrl) });
    const pageResponse = await fetchXiaohongshuPage(noteUrl, logger, { useCookie });
    logger.info('page_fetch_response', {
      status: pageResponse.status,
      ok: pageResponse.ok,
      finalUrl: redactUrl(pageResponse.url),
      contentType: pageResponse.headers.get('content-type') || '',
    });
    if (!isSupportedXiaohongshuUrl(pageResponse.url)) {
      logger.info('request_rejected', {
        reason: 'unsupported_redirect_host',
        finalUrl: redactUrl(pageResponse.url),
      });
      return sendJson(response, 400, { error: 'INVALID_INPUT', message: '仅支持小红书链接' });
    }
    if (!pageResponse.ok) {
      return sendJson(response, 502, { error: 'EXTRACT_FAILED', message: '小红书链接读取失败' });
    }
    const html = await pageResponse.text();
    logger.info('page_body_loaded', {
      bytes: Buffer.byteLength(html),
      hasOgImage: html.includes('og:image'),
      hasTitle: /<title[^>]*>/i.test(html),
    });
    const imageInspection = inspectImageCandidates(html, pageResponse.url);
    const noteExtraction = inspectNoteExtraction(html, pageResponse.url);
    const imageUrls = noteExtraction.images.slice(0, 9);
    const imageUrl = imageUrls[0] || '';
    const title = decodeHtml(findMetaContent(html, 'og:title') || findTitle(html) || '小红书图纸');
    logger.info('page_parsed', {
      imageFound: Boolean(imageUrl),
      imageUrl: redactUrl(imageUrl),
      extractionStrategy: noteExtraction.strategy,
      extractionDiagnostics: {
        noteId: noteExtraction.noteId,
        initialState: noteExtraction.initialState,
        setupServerState: noteExtraction.setupServerState,
        scopedInitialState: noteExtraction.scopedInitialState,
        renderedNoteImages: noteExtraction.renderedNoteImages,
      },
      selectedSource: imageInspection.selected?.source || '',
      selectedScore: imageInspection.selected?.score ?? null,
      imageCount: imageUrls.length,
      candidates: imageUrl ? [] : imageInspection.candidates.slice(0, 3).map((candidate) => ({
        source: candidate.source,
        score: candidate.score,
        rejected: candidate.rejected,
        url: redactUrl(candidate.url),
      })),
      titleLength: title.length,
    });
    if (!imageUrl && noteExtraction.setupServerState?.noteFound) {
      logger.info('note_structure_probe', {
        noteKeys: noteExtraction.setupServerState.noteKeys || [],
        imageLikePaths: (noteExtraction.setupServerState.imageLikePaths || []).map((item) => (
          `${item.path}: ${redactUrl(item.sample)}`
        )),
      });
    }
    if (!imageUrl) {
      return sendJson(response, 422, { error: 'IMAGE_NOT_FOUND', message: '未找到可提取的图片' });
    }

    const reachableImageUrls = await filterReachableImageUrls(imageUrls, logger);
    if (reachableImageUrls.length === 0) {
      throw new Error('小红书图片读取失败');
    }

    const images = reachableImageUrls.map((currentImageUrl) => ({ imageUrl: currentImageUrl }));
    const normalized = normalizeExtractedImagePayload({ imageUrl: images[0].imageUrl, title });
    const payload = {
      imageUrl: normalized.imageUrl,
      title: normalized.title,
      images,
    };

    logger.info('extract_success', { imageCount: reachableImageUrls.length, rejectedImageCount: imageUrls.length - reachableImageUrls.length, url: payload.imageUrl });
    sendJson(response, 200, payload);
  } catch (error) {
    logger.error('extract_failed', { message: error instanceof Error ? error.message : String(error) });
    sendJson(response, 502, { error: 'EXTRACT_FAILED', message: error instanceof Error ? error.message : '小红书图片提取失败' });
  }
}

async function filterReachableImageUrls(imageUrls, logger) {
  const checks = await Promise.all(imageUrls.map(async (imageUrl) => {
    const reachable = await isFetchableImageUrl(imageUrl);
    if (!reachable) logger.info('image_probe_failed', { url: redactUrl(imageUrl) });
    return reachable ? imageUrl : '';
  }));
  return checks.filter(Boolean);
}

async function isFetchableImageUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl, {
      headers: imageRequestHeaders(),
    });
    if (!response.ok) return false;
    const reader = response.body?.getReader?.();
    if (reader) {
      await reader.read();
      await reader.cancel();
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadXiaohongshuImage(request, response) {
  const body = await readJson(request);
  const imageUrl = String(body.imageUrl || '').trim();
  if (!isSupportedXiaohongshuImageUrl(imageUrl)) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '图片链接无效' });
  }
  try {
    const imageDataUrl = await fetchImageDataUrl(imageUrl);
    return sendJson(response, 200, { imageDataUrl });
  } catch (error) {
    return sendJson(response, 502, {
      error: 'EXTRACT_FAILED',
      message: error instanceof Error ? error.message : '小红书图片读取失败',
    });
  }
}

async function proxyXiaohongshuImage(url, response) {
  const imageUrl = String(url.searchParams.get('url') || '').trim();
  if (!isSupportedXiaohongshuImageUrl(imageUrl)) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '图片链接无效' });
  }
  try {
    const imageResponse = await fetch(imageUrl, {
      headers: imageRequestHeaders(),
    });
    if (!imageResponse.ok) {
      return sendJson(response, 502, { error: 'EXTRACT_FAILED', message: `小红书图片读取失败: ${imageResponse.status}` });
    }
    const contentLength = Number(imageResponse.headers.get('content-length') || 0);
    if (contentLength > MAX_EXTRACT_IMAGE_BYTES) {
      return sendJson(response, 413, { error: 'IMAGE_TOO_LARGE', message: '小红书图片超过大小限制' });
    }
    const contentType = normalizeImageContentType(imageResponse.headers.get('content-type') || 'image/webp');
    response.writeHead(200, {
      ...corsHeaders(),
      'content-type': contentType,
      'cache-control': 'public, max-age=86400',
    });

    let totalBytes = 0;
    for await (const chunk of imageResponse.body) {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > MAX_EXTRACT_IMAGE_BYTES) {
        response.destroy(new Error('小红书图片超过大小限制'));
        return;
      }
      response.write(buffer);
    }
    response.end();
  } catch {
    if (!response.headersSent) {
      return sendJson(response, 502, { error: 'EXTRACT_FAILED', message: '小红书图片读取失败' });
    }
    response.destroy();
  }
}

async function fetchImageDataUrl(imageUrl) {
  const imageResponse = await fetch(imageUrl, {
    headers: imageRequestHeaders(),
  });
  if (!imageResponse.ok) {
    throw new Error(`小红书图片读取失败: ${imageResponse.status}`);
  }
  const contentLength = Number(imageResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_EXTRACT_IMAGE_BYTES) {
    throw new Error('小红书图片超过大小限制');
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of imageResponse.body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_EXTRACT_IMAGE_BYTES) {
      throw new Error('小红书图片超过大小限制');
    }
    chunks.push(buffer);
  }
  const contentType = normalizeImageContentType(imageResponse.headers.get('content-type') || 'image/webp');
  return `data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`;
}

function imageRequestHeaders() {
  return {
    accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
    referer: 'https://www.xiaohongshu.com/',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  };
}

function isSupportedXiaohongshuImageUrl(imageUrl) {
  try {
    const hostname = new URL(imageUrl).hostname;
    return hostname === 'ci.xiaohongshu.com' || /(?:^|\.)xhscdn\.com$/i.test(hostname);
  } catch {
    return false;
  }
}

function normalizeImageContentType(contentType) {
  const value = String(contentType).split(';')[0].trim().toLowerCase();
  return /^image\/(?:png|jpe?g|webp|avif)$/.test(value) ? value : 'image/webp';
}

async function fetchXiaohongshuPage(noteUrl, logger, { useCookie = false } = {}) {
  if (isXhsLinkUrl(noteUrl)) {
    return fetchWithValidatedRedirects(noteUrl, logger, { useCookie, includeCookieForFirstRequest: false });
  }

  return fetchWithValidatedRedirects(noteUrl, logger, { useCookie, includeCookieForFirstRequest: useCookie });
}

async function fetchWithValidatedRedirects(startUrl, logger, { useCookie = false, includeCookieForFirstRequest = false } = {}) {
  let currentUrl = startUrl;
  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: mobileHeaders(currentUrl, { includeCookie: redirectCount === 0 ? includeCookieForFirstRequest : useCookie }),
    });
    const location = response.headers.get('location') || '';
    if (!isRedirectStatus(response.status) || !location) return response;

    const resolvedUrl = new URL(location, currentUrl).toString();
    logger.info('redirect_response', {
      status: response.status,
      from: redactUrl(currentUrl),
      location: redactUrl(resolvedUrl),
    });
    if (!isSupportedXiaohongshuUrl(resolvedUrl)) {
      logger.info('request_rejected', {
        reason: 'unsupported_redirect_host',
        finalUrl: redactUrl(resolvedUrl),
      });
      return createRejectedUpstreamResponse(resolvedUrl);
    }
    currentUrl = resolvedUrl;
  }

  return createRejectedUpstreamResponse(currentUrl, 508);
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function createRejectedUpstreamResponse(url, status = 400) {
  return {
    ok: false,
    status,
    url,
    headers: new Headers(),
    text: async () => '',
  };
}

function isXhsLinkUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'xhslink.com' || hostname.endsWith('.xhslink.com');
  } catch {
    return false;
  }
}

function createSession(userId) {
  const token = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    now.toISOString(),
    expires.toISOString(),
  ]);
  return token;
}

function requireUser(request, response) {
  const row = getUserFromRequest(request);
  if (!row) {
    sendJson(response, 401, { error: 'UNAUTHORIZED', message: '请先登录' });
    return null;
  }
  return { id: row.id, username: row.username };
}

function getUserFromRequest(request) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  return getOne(
    `SELECT users.id, users.username
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ? AND users.username = ?`,
    [token, new Date().toISOString(), AUTH_USERNAME],
  );
}

function getOptionalUser(request) {
  const row = getUserFromRequest(request);
  return row ? { id: row.id, username: row.username } : null;
}

function listWarehouses(response, userId) {
  const warehouses = getAll(
    `SELECT w.id, w.name, w.remark, w.color_system AS colorSystem,
            w.created_at AS createdAt, w.updated_at AS updatedAt,
            COUNT(CASE WHEN i.quantity > 0 THEN 1 END) AS stockedColorCount,
            COALESCE(SUM(i.quantity), 0) AS totalWarehouseStock
     FROM warehouses w
     LEFT JOIN inventory i ON i.warehouse_id = w.id
     WHERE w.user_id = ?
     GROUP BY w.id
     ORDER BY w.created_at DESC`,
    [userId],
  );
  sendJson(response, 200, { warehouses });
}

function resolveProjectImage(value, accessUserId = '') {
  const image = String(value || '').trim();
  if (!image || !image.startsWith('cos://')) return image;
  const params = new URLSearchParams({ path: image });
  if (accessUserId) {
    const expiresAt = Math.floor(Date.now() / 1000) + PROJECT_ASSET_ACCESS_SECONDS;
    params.set('expires', String(expiresAt));
    params.set('access', signProjectAssetAccess(image, accessUserId, expiresAt));
  }
  return `/api/project-assets?${params.toString()}`;
}

function signProjectAssetAccess(assetPath, userId, expiresAt) {
  return createHmac('sha256', AUTH_PASSWORD)
    .update(`${userId}\0${assetPath}\0${expiresAt}`)
    .digest('base64url');
}

function verifyProjectAssetAccess(assetPath, userId, signature, expiresAt) {
  const parsedExpiresAt = Number(expiresAt);
  if (!Number.isInteger(parsedExpiresAt) || parsedExpiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = signProjectAssetAccess(assetPath, userId, parsedExpiresAt);
  const actualBuffer = Buffer.from(String(signature || ''));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function expectedProjectCosPrefix(userId) {
  const bucket = String(process.env.TENCENT_COS_BUCKET || '').trim();
  const keyPrefix = String(process.env.TENCENT_COS_KEY_PREFIX || 'uploads/images').trim().replace(/^\/+|\/+$/g, '');
  if (!bucket || !keyPrefix) return '';
  return `cos://${bucket}/${keyPrefix}/projects/${userId}/`;
}

function normalizeProjectImagePath(value, userId, kind) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (image.startsWith('data:')) {
    if (kind !== 'thumbnail') {
      throw new Error('原图必须先通过项目图片上传接口上传');
    }
    parseDataUrl(image, '缩略图');
    return image;
  }
  if (!image.startsWith('cos://')) {
    throw new Error('项目图片路径无效');
  }
  const ownedPrefix = expectedProjectCosPrefix(userId);
  const filenameMarker = `-${kind}-`;
  if (!ownedPrefix || !image.startsWith(ownedPrefix) || !path.basename(image).includes(filenameMarker)) {
    throw new Error('项目图片路径无效');
  }
  return image;
}

function redirectProjectAsset(request, url, response) {
  const assetPath = String(url.searchParams.get('path') || '').trim();
  if (!assetPath.startsWith('cos://')) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '项目图片路径无效' });
  }
  const project = getOne(
    `SELECT user_id AS userId, shared_to_community AS sharedToCommunity
     FROM projects
     WHERE source_image = ? OR thumbnail_image = ?
     LIMIT 1`,
    [assetPath, assetPath],
  );
  if (!project) return sendJson(response, 404, { error: 'NOT_FOUND', message: '项目图片不存在' });
  if (!project.sharedToCommunity) {
    const access = String(url.searchParams.get('access') || '');
    const expires = String(url.searchParams.get('expires') || '');
    if (verifyProjectAssetAccess(assetPath, project.userId, access, expires)) {
      return redirectToCosAsset(response, assetPath);
    }
    const user = getUserFromRequest(request);
    if (!user) return sendJson(response, 401, { error: 'UNAUTHORIZED', message: '请先登录' });
    if (user.id !== project.userId) return sendJson(response, 404, { error: 'NOT_FOUND', message: '项目图片不存在' });
  }
  return redirectToCosAsset(response, assetPath);
}

function redirectToCosAsset(response, assetPath) {
  try {
    response.writeHead(302, {
      Location: resolveCosAssetUrl(assetPath, loadTencentCosConfig()),
      'Cache-Control': 'no-store',
    });
    response.end();
  } catch {
    sendJson(response, 404, { error: 'NOT_FOUND', message: '项目图片不可用' });
  }
}

function parseDataUrl(value, kind) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error(`${kind} 图片格式无效`);
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PROJECT_IMAGE_BYTES) {
    throw new Error(`${kind} 图片大小无效，不能超过 20MB`);
  }
  return { buffer, contentType: match[1] };
}

async function uploadProjectImages(request, response, userId) {
  try {
    const body = await readJson(request);
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0 || images.length > 2) {
      return sendJson(response, 400, { error: 'INVALID_INPUT', message: '至少需要上传一张项目图片' });
    }
    const uploaded = {};
    for (const image of images) {
      const kind = image?.kind === 'source' ? 'source' : image?.kind === 'thumbnail' ? 'thumbnail' : '';
      if (!kind) return sendJson(response, 400, { error: 'INVALID_INPUT', message: '项目图片类型无效' });
      const parsed = parseDataUrl(image.dataUrl, kind === 'source' ? '原图' : '缩略图');
      const result = await uploadProjectImage({
        ...parsed,
        filename: image.filename || `${kind}.webp`,
        userId,
        kind,
      });
      uploaded[`${kind}ImagePath`] = result.path;
      uploaded[`${kind}ImageUrl`] = result.url;
    }
    sendJson(response, 201, uploaded);
  } catch (error) {
    const message = error instanceof Error ? error.message : '腾讯云 COS 上传失败';
    if (message.includes('图片格式无效') || message.includes('图片大小无效')) {
      return sendJson(response, 400, { error: 'INVALID_INPUT', message });
    }
    sendJson(response, 503, { error: 'COS_UPLOAD_FAILED', message });
  }
}

async function uploadProjectImage(input) {
  try {
    const config = loadTencentCosConfig();
    return await uploadToTencentCos(input, config);
  } catch (error) {
    if (!String(error?.message || '').includes('COS 未配置')) throw error;
    if (input.kind === 'source') return { path: '', url: '' };
    const dataUrl = `data:${input.contentType || 'application/octet-stream'};base64,${input.buffer.toString('base64')}`;
    return { path: dataUrl, url: dataUrl };
  }
}

function listProjects(response, userId) {
  const projects = getAll(
    `SELECT id, name, rows, cols, tone, source_image AS sourceImage, thumbnail_image AS thumbnailImage, canvas_data AS canvasData,
            shared_to_community AS sharedToCommunity, shared_at AS sharedAt, likes_count AS likesCount,
            created_at AS createdAt, updated_at AS updatedAt
     FROM projects
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [userId],
  );
  sendJson(response, 200, {
    projects: projects.map((project) => ({
      ...project,
      sourceImage: resolveProjectImage(project.sourceImage, userId),
      thumbnailImage: resolveProjectImage(project.thumbnailImage, userId),
    })),
  });
}

async function createProject(request, response, userId) {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const rows = Math.round(Number(body.rows));
  const cols = Math.round(Number(body.cols));
  const tone = /^recent-(?:dog|bear|flower|house)$/.test(String(body.tone)) ? String(body.tone) : 'recent-flower';
  let sourceImage = '';
  let thumbnailImage = '';
  try {
    sourceImage = normalizeProjectImagePath(body.sourceImagePath, userId, 'source');
    thumbnailImage = normalizeProjectImagePath(body.thumbnailImagePath, userId, 'thumbnail');
  } catch (error) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: error instanceof Error ? error.message : '项目图片路径无效' });
  }
  const canvasData = String(body.canvasData || '').trim();
  if (!name || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '项目名称和画布尺寸无效' });
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  db.run(
    'INSERT INTO projects (id, user_id, name, rows, cols, tone, source_image, thumbnail_image, canvas_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, name, rows, cols, tone, sourceImage, thumbnailImage, canvasData, now, now],
  );
  await persist();
  sendJson(response, 201, { project: {
    id, name, rows, cols, tone,
    sourceImage: resolveProjectImage(sourceImage, userId),
    thumbnailImage: resolveProjectImage(thumbnailImage, userId),
    canvasData,
    createdAt: now,
    updatedAt: now,
    sharedToCommunity: false,
    sharedAt: null,
    likesCount: 0,
  } });
}

async function updateProject(request, response, userId, projectId) {
  const existing = getOne(
    `SELECT id, user_id, source_image AS sourceImage, thumbnail_image AS thumbnailImage,
            shared_to_community AS sharedToCommunity, shared_at AS sharedAt, likes_count AS likesCount,
            created_at AS createdAt
     FROM projects WHERE id = ?`,
    [projectId],
  );
  if (!existing || existing.user_id !== userId) return sendJson(response, 404, { error: 'NOT_FOUND', message: '作品不存在' });
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const rows = Math.round(Number(body.rows));
  const cols = Math.round(Number(body.cols));
  const tone = /^recent-(?:dog|bear|flower|house)$/.test(String(body.tone)) ? String(body.tone) : 'recent-flower';
  let sourceImage = existing.sourceImage;
  let thumbnailImage = existing.thumbnailImage;
  try {
    if (Object.hasOwn(body, 'sourceImagePath')) sourceImage = normalizeProjectImagePath(body.sourceImagePath, userId, 'source');
    if (Object.hasOwn(body, 'thumbnailImagePath')) thumbnailImage = normalizeProjectImagePath(body.thumbnailImagePath, userId, 'thumbnail');
  } catch (error) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: error instanceof Error ? error.message : '项目图片路径无效' });
  }
  const canvasData = String(body.canvasData || '').trim();
  if (!name || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '项目名称和画布尺寸无效' });
  }
  const now = new Date().toISOString();
  db.run(
    `UPDATE projects
     SET name = ?, rows = ?, cols = ?, tone = ?, source_image = ?, thumbnail_image = ?, canvas_data = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [name, rows, cols, tone, sourceImage, thumbnailImage, canvasData, now, projectId, userId],
  );
  await persist();
  sendJson(response, 200, { project: {
    id: projectId,
    name,
    rows,
    cols,
    tone,
    sourceImage: resolveProjectImage(sourceImage, userId),
    thumbnailImage: resolveProjectImage(thumbnailImage, userId),
    canvasData,
    createdAt: existing.createdAt,
    updatedAt: now,
    sharedToCommunity: Boolean(existing.sharedToCommunity),
    sharedAt: existing.sharedAt,
    likesCount: Number(existing.likesCount || 0),
  } });
}

function getCommunityPost(userId, projectId) {
  return getOne(
    `SELECT p.id, p.name, p.rows, p.cols, p.tone,
            p.source_image AS sourceImage, p.thumbnail_image AS thumbnailImage,
            p.shared_at AS sharedAt, p.likes_count AS likesCount,
            u.username AS author,
            COUNT(DISTINCT c.id) AS commentsCount,
            CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS likedByMe
     FROM projects p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN project_comments c ON c.project_id = p.id
     LEFT JOIN project_likes l ON l.project_id = p.id AND l.user_id = ?
     WHERE p.id = ? AND p.shared_to_community = 1
     GROUP BY p.id, l.user_id`,
    [userId, projectId],
  );
}

function formatCommunityPost(post) {
  return {
    ...post,
    sourceImage: resolveProjectImage(post.sourceImage),
    thumbnailImage: resolveProjectImage(post.thumbnailImage),
    rows: Number(post.rows),
    cols: Number(post.cols),
    likesCount: Number(post.likesCount || 0),
    commentsCount: Number(post.commentsCount || 0),
    likedByMe: Boolean(post.likedByMe),
  };
}

function parsePagination(searchParams) {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSizeInput = Number.parseInt(searchParams.get('pageSize') || '20', 10) || 20;
  const pageSize = Math.max(1, Math.min(50, pageSizeInput));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function listCommunityPosts(response, userId, sort, pagination = { page: 1, pageSize: 20, offset: 0 }) {
  const orderBy = sort === 'latest' ? 'p.shared_at DESC, p.id DESC' : 'p.likes_count DESC, p.shared_at DESC, p.id DESC';
  const posts = getAll(
    `SELECT p.id, p.name, p.rows, p.cols, p.tone,
            p.source_image AS sourceImage, p.thumbnail_image AS thumbnailImage,
            p.shared_at AS sharedAt, p.likes_count AS likesCount,
            u.username AS author,
            COUNT(DISTINCT c.id) AS commentsCount,
            CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS likedByMe
     FROM projects p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN project_comments c ON c.project_id = p.id
     LEFT JOIN project_likes l ON l.project_id = p.id AND l.user_id = ?
     WHERE p.shared_to_community = 1
     GROUP BY p.id, l.user_id
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [userId, pagination.pageSize, pagination.offset],
  );
  sendJson(response, 200, { posts: posts.map(formatCommunityPost), page: pagination.page, pageSize: pagination.pageSize });
}

function assertSharedProject(response, userId, projectId) {
  const post = getCommunityPost(userId, projectId);
  if (!post) {
    sendJson(response, 404, { error: 'NOT_FOUND', message: '社区稿件不存在' });
    return null;
  }
  return post;
}

async function shareProject(response, userId, projectId) {
  const project = getOne('SELECT id, user_id, thumbnail_image AS thumbnailImage, source_image AS sourceImage, shared_to_community AS sharedToCommunity, shared_at AS sharedAt FROM projects WHERE id = ?', [projectId]);
  if (!project || project.user_id !== userId) return sendJson(response, 404, { error: 'NOT_FOUND', message: '作品不存在' });
  if (!String(project.thumbnailImage || project.sourceImage || '').trim()) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '作品缺少有效预览图，无法分享到社区' });
  }
  if (!project.sharedToCommunity) {
    const now = new Date().toISOString();
    db.run('UPDATE projects SET shared_to_community = 1, shared_at = ?, updated_at = ? WHERE id = ?', [now, now, projectId]);
    await persist();
    return sendJson(response, 200, { shared: true, sharedAt: now, projectId });
  }
  sendJson(response, 200, { shared: true, sharedAt: project.sharedAt, projectId });
}

function listProjectComments(response, userId, projectId, pagination = { page: 1, pageSize: 20, offset: 0 }) {
  if (!assertSharedProject(response, userId, projectId)) return;
  const comments = getAll(
    `SELECT c.id, c.project_id AS projectId, c.content, c.created_at AS createdAt, u.username AS author
     FROM project_comments c JOIN users u ON u.id = c.user_id
     WHERE c.project_id = ? ORDER BY c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [projectId, pagination.pageSize, pagination.offset],
  );
  sendJson(response, 200, { comments, page: pagination.page, pageSize: pagination.pageSize });
}

async function createProjectComment(request, response, userId, projectId) {
  if (!assertSharedProject(response, userId, projectId)) return;
  const body = await readJson(request);
  const content = String(body.content || '').trim();
  if (!content || [...content].length > 300) return sendJson(response, 400, { error: 'INVALID_INPUT', message: '评论内容不能为空且不能超过 300 个字' });
  const comment = { id: randomUUID(), projectId, author: getOne('SELECT username FROM users WHERE id = ?', [userId]).username, content, createdAt: new Date().toISOString() };
  db.run('INSERT INTO project_comments (id, project_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [comment.id, projectId, userId, comment.content, comment.createdAt]);
  await persist();
  sendJson(response, 201, { comment });
}

async function likeCommunityPost(response, userId, projectId) {
  const post = assertSharedProject(response, userId, projectId);
  if (!post) return;
  const existing = getOne('SELECT project_id FROM project_likes WHERE project_id = ? AND user_id = ?', [projectId, userId]);
  if (!existing) {
    db.run('INSERT INTO project_likes (project_id, user_id, created_at) VALUES (?, ?, ?)', [projectId, userId, new Date().toISOString()]);
    db.run('UPDATE projects SET likes_count = likes_count + 1 WHERE id = ?', [projectId]);
    await persist();
  }
  const latest = getCommunityPost(userId, projectId);
  sendJson(response, 200, { liked: true, likesCount: Number(latest.likesCount || 0) });
}

async function createWarehouse(request, response, userId) {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const remark = String(body.remark || '').trim();
  if (!name) return sendJson(response, 400, { error: 'INVALID_INPUT', message: '仓库名称不能为空' });
  const now = new Date().toISOString();
  const id = randomUUID();
  db.run(
    'INSERT INTO warehouses (id, user_id, name, remark, color_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, userId, name, remark, 'MARD_221', now, now],
  );
  await persist();
  sendJson(response, 201, { warehouse: { id, name, remark, colorSystem: 'MARD_221', createdAt: now, updatedAt: now } });
}

async function deleteWarehouse(response, userId, warehouseId) {
  if (!assertWarehouseOwner(userId, warehouseId)) {
    return sendJson(response, 404, { error: 'NOT_FOUND', message: '仓库不存在' });
  }
  db.run('DELETE FROM inventory_transactions WHERE warehouse_id = ? AND user_id = ?', [warehouseId, userId]);
  db.run('DELETE FROM inventory WHERE warehouse_id = ?', [warehouseId]);
  db.run('DELETE FROM warehouses WHERE id = ? AND user_id = ?', [warehouseId, userId]);
  await persist();
  sendJson(response, 200, { deleted: true, warehouseId });
}

function assertWarehouseOwner(userId, warehouseId) {
  return getOne('SELECT id FROM warehouses WHERE id = ? AND user_id = ?', [warehouseId, userId]);
}

function getInventory(response, userId, warehouseId) {
  if (!assertWarehouseOwner(userId, warehouseId)) {
    return sendJson(response, 404, { error: 'NOT_FOUND', message: '仓库不存在' });
  }
  const rows = getAll('SELECT color_code AS colorCode, quantity FROM inventory WHERE warehouse_id = ?', [warehouseId]);
  const inventory = {};
  for (const row of rows) inventory[row.colorCode] = row.quantity;
  sendJson(response, 200, { inventory });
}

async function mutateInventory(request, response, userId, warehouseId) {
  if (!assertWarehouseOwner(userId, warehouseId)) {
    return sendJson(response, 404, { error: 'NOT_FOUND', message: '仓库不存在' });
  }
  const body = await readJson(request);
  const codes = Array.isArray(body.codes)
    ? [...new Set(body.codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean))]
    : [];
  const type = body.type;
  const rawQuantity = Number(body.quantity);
  const quantity = Math.round(rawQuantity);
  const inputUnit = body.inputUnit === 'gram' ? 'gram' : 'count';
  const inputValue = Number(body.inputValue || quantity);
  if (type !== 'in' && type !== 'out') {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '库存操作类型无效' });
  }
  if (codes.length === 0 || !Number.isFinite(rawQuantity) || quantity <= 0) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '请选择色号并输入数量' });
  }
  if (codes.some((code) => !isMardColorCode(code))) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '包含无效色号' });
  }

  const currentQuantities = new Map();
  for (const code of codes) {
    const current = getOne('SELECT quantity FROM inventory WHERE warehouse_id = ? AND color_code = ?', [warehouseId, code]);
    const currentQuantity = current?.quantity ?? 0;
    currentQuantities.set(code, currentQuantity);
    if (type === 'out' && currentQuantity < quantity) {
      return sendJson(response, 400, { error: 'INSUFFICIENT_STOCK', message: `${code} 库存不足` });
    }
  }

  const now = new Date().toISOString();
  for (const code of codes) {
    const currentQuantity = currentQuantities.get(code) ?? 0;
    const nextQuantity = type === 'in'
      ? currentQuantity + quantity
      : currentQuantity - quantity;
    db.run(
      `INSERT INTO inventory (warehouse_id, color_code, quantity)
       VALUES (?, ?, ?)
       ON CONFLICT(warehouse_id, color_code) DO UPDATE SET quantity = excluded.quantity`,
      [warehouseId, code, nextQuantity],
    );
    db.run(
      'INSERT INTO inventory_transactions (id, warehouse_id, user_id, color_code, type, quantity, input_unit, input_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), warehouseId, userId, code, type, quantity, inputUnit, inputValue, now],
    );
  }
  db.run('UPDATE warehouses SET updated_at = ? WHERE id = ?', [now, warehouseId]);
  await persist();
  getInventory(response, userId, warehouseId);
}

function isMardColorCode(code) {
  const match = /^([A-Z])(\d+)$/.exec(code);
  if (!match) return false;
  const max = MARD_COLOR_RANGES[match[1]];
  const value = Number(match[2]);
  return Number.isInteger(value) && value >= 1 && value <= max;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('hex');
}

function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? stmt.getAsObject() : null;
  } finally {
    stmt.free();
  }
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function sendCors(response) {
  response.writeHead(204, corsHeaders());
  response.end();
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    ...corsHeaders(),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
}
