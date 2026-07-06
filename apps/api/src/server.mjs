import http from 'node:http';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.SQLITE_PATH || '/tmp/qiaoqiaole.sqlite';
const SESSION_DAYS = 30;
const MAX_EXTRACT_IMAGE_BYTES = 20 * 1024 * 1024;
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
  `);
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
    return register(request, response);
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    return login(request, response);
  }
  if (request.method === 'POST' && url.pathname === '/api/xiaohongshu/extract') {
    const useCookie = Boolean(process.env.XHS_COOKIE && getUserFromRequest(request));
    return extractXiaohongshu(request, response, { useCookie });
  }

  const user = requireUser(request, response);
  if (!user) return;

  if (request.method === 'GET' && url.pathname === '/api/me') {
    return sendJson(response, 200, { user });
  }
  if (request.method === 'GET' && url.pathname === '/api/warehouses') {
    return listWarehouses(response, user.id);
  }
  if (request.method === 'POST' && url.pathname === '/api/warehouses') {
    return createWarehouse(request, response, user.id);
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

async function register(request, response) {
  const body = await readJson(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username.length < 2 || password.length < 4) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '用户名至少2位，密码至少4位' });
  }
  if (getOne('SELECT id FROM users WHERE username = ?', [username])) {
    return sendJson(response, 409, { error: 'USER_EXISTS', message: '用户已存在' });
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const salt = randomUUID();
  db.run('INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    username,
    hashPassword(password, salt),
    salt,
    now,
  ]);
  const token = createSession(id);
  await persist();
  sendJson(response, 201, { token, user: { id, username } });
}

async function login(request, response) {
  const body = await readJson(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const row = getOne('SELECT * FROM users WHERE username = ?', [username]);
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
    return sendJson(response, 401, { error: 'INVALID_LOGIN', message: '用户名或密码错误' });
  }
  const token = createSession(row.id);
  await persist();
  sendJson(response, 200, { token, user: { id: row.id, username: row.username } });
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

    const images = [];
    for (const currentImageUrl of imageUrls) {
      try {
        images.push({
          imageUrl: currentImageUrl,
          imageDataUrl: await fetchImageDataUrl(currentImageUrl),
        });
      } catch (error) {
        logger.info('image_fetch_failed', {
          url: redactUrl(currentImageUrl),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (images.length === 0) {
      throw new Error('小红书图片读取失败');
    }
    const normalized = normalizeExtractedImagePayload({ imageUrl: images[0].imageUrl, imageDataUrl: images[0].imageDataUrl, title });
    const payload = {
      imageUrl: normalized.imageUrl,
      imageDataUrl: images[0].imageDataUrl,
      title: normalized.title,
      images,
    };

    logger.info('extract_success', { imageCount: imageUrls.length, url: payload.imageUrl });
    sendJson(response, 200, payload);
  } catch (error) {
    logger.error('extract_failed', { message: error instanceof Error ? error.message : String(error) });
    sendJson(response, 502, { error: 'EXTRACT_FAILED', message: error instanceof Error ? error.message : '小红书图片提取失败' });
  }
}

async function fetchImageDataUrl(imageUrl) {
  const imageResponse = await fetch(imageUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
    },
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
  return getOne(
    `SELECT users.id, users.username
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`,
    [token, new Date().toISOString()],
  );
}

function listWarehouses(response, userId) {
  const warehouses = getAll(
    'SELECT id, name, remark, color_system AS colorSystem, created_at AS createdAt, updated_at AS updatedAt FROM warehouses WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  sendJson(response, 200, { warehouses });
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
