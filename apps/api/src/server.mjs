import http from 'node:http';
import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { openSqliteDatabase } from './sqliteStore.mjs';
import path from 'node:path';
import {
  decodeHtml,
  extractUrlFromText,
  findMetaContent,
  findTitle,
  createXhsLogger,
  inspectNoteExtraction,
  inspectImageCandidates,
  isSupportedXiaohongshuUrl,
  normalizeExtractedImagePayload,
  redactUrl,
  summarizeXhsError,
  summarizeXhsUpstreamResponse,
} from './xiaohongshu.mjs';
import { fetchXiaohongshuPage } from './xhsRedirects.mjs';
import { loadEnvFile } from './env.mjs';
import { loadTencentCosConfig, resolveCosAssetUrl, uploadToTencentCos } from './tencentCos.mjs';
import { createPhoneAuthService, AuthError, verifyAccessToken } from './phoneAuth.mjs';
import { getRedisClient, closeRedisClient } from './redisStore.mjs';
import { createBeadingSessionService, BeadingError } from './beadingSessionService.mjs';

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.SQLITE_PATH || '/tmp/qiaoqiaole.sqlite';
const AUTH_USERNAME = requiredEnv('QIAOQIAOLE_USERNAME');
const AUTH_PASSWORD = requiredEnv('QIAOQIAOLE_PASSWORD');
const SESSION_DAYS = 30;
const MAX_EXTRACT_IMAGE_BYTES = 20 * 1024 * 1024;
const XHS_UPSTREAM_TIMEOUT_MS = 15 * 1000;
const MAX_PROJECT_IMAGE_BYTES = 20 * 1024 * 1024;
const PROJECT_ASSET_ACCESS_SECONDS = 15 * 60;
const COMMUNITY_TAGS = ['动物', '人物', '植物', '食物', '风景', '动漫', '游戏', '节日', '文字', '新手', '其他'];
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

const db = openSqliteDatabase(DB_PATH);
initSchema();
let communityTagCountsCache = null;
let phoneAuthService;
let beadingService;

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

const shutdown = () => {
  void closeRedisClient().finally(() => {
    db.close();
    server.close();
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      register_source TEXT,
      registered_at TEXT,
      last_login_at TEXT,
      last_login_ip_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      identifier_hash TEXT NOT NULL,
      identifier_ciphertext TEXT NOT NULL,
      identifier_last4 TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(provider, identifier_hash),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      token_family_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      device_id_hash TEXT,
      ip_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      last_used_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_agreement_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agreement_version TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      platform TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sms_send_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      sms_request_id TEXT NOT NULL,
      phone_hash TEXT NOT NULL,
      phone_masked TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      platform TEXT NOT NULL,
      sign_version TEXT NOT NULL,
      scene TEXT NOT NULL,
      risk_result TEXT NOT NULL,
      risk_reason TEXT,
      result TEXT NOT NULL,
      provider_request_id TEXT,
      provider_code TEXT,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
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
      project_id TEXT,
      beading_session_id TEXT,
      project_name_snapshot TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
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
      folder_id TEXT,
      name TEXT NOT NULL,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      tone TEXT NOT NULL DEFAULT 'recent-flower',
      source_image TEXT,
      thumbnail_image TEXT,
      canvas_data TEXT,
      bead_list TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_tags (
      project_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(project_id, tag),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS beading_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      project_name_snapshot TEXT NOT NULL,
      project_snapshot_json TEXT NOT NULL,
      requirements_json TEXT NOT NULL,
      warehouse_id TEXT,
      warehouse_name_snapshot TEXT,
      status TEXT NOT NULL,
      active_key TEXT UNIQUE,
      completed_color_codes_json TEXT NOT NULL DEFAULT '[]',
      timer_started_at TEXT,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      inventory_deducted INTEGER NOT NULL DEFAULT 0,
      inventory_deduction_idempotency_key TEXT,
      idempotency_key TEXT,
      completed_at TEXT,
      abandoned_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS beading_idempotency_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      first_response_summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, session_id, idempotency_key)
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
      parent_id TEXT,
      reply_to_user_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES project_comments(id),
      FOREIGN KEY (reply_to_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT NOT NULL,
      following_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id),
      FOREIGN KEY (following_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      receiver_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      comment_id TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (receiver_id) REFERENCES users(id),
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (comment_id) REFERENCES project_comments(id)
    );
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_notifications_receiver_created ON notifications(receiver_id, created_at DESC)');
  for (const column of ['source_image', 'thumbnail_image', 'canvas_data', 'bead_list']) {
    try {
      db.run(`ALTER TABLE projects ADD COLUMN ${column} TEXT`);
    } catch {
      // Existing databases already contain the column.
    }
  }
  try { db.run('ALTER TABLE projects ADD COLUMN folder_id TEXT'); } catch {}
  db.run('CREATE INDEX IF NOT EXISTS idx_projects_user_folder_updated ON projects(user_id, folder_id, updated_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_tags_tag_project ON project_tags(tag, project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_project_tags_project_tag ON project_tags(project_id, tag)');
  try { db.run('ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1'); } catch {}
  for (const [column, definition] of [['parent_id', 'TEXT'], ['reply_to_user_id', 'TEXT']]) {
    try { db.run(`ALTER TABLE project_comments ADD COLUMN ${column} ${definition}`); } catch {}
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_project_comments_project_parent_created ON project_comments(project_id, parent_id, created_at DESC)');
  for (const [column, definition] of [
    ['project_id', 'TEXT'],
    ['beading_session_id', 'TEXT'],
    ['project_name_snapshot', 'TEXT'],
    ['source', "TEXT NOT NULL DEFAULT 'manual'"],
  ]) {
    try { db.run(`ALTER TABLE inventory_transactions ADD COLUMN ${column} ${definition}`); } catch {}
  }
  for (const [column, definition] of [
    ['nickname', 'TEXT'], ['avatar_url', 'TEXT'], ['status', "TEXT NOT NULL DEFAULT 'ACTIVE'"],
    ['register_source', 'TEXT'], ['registered_at', 'TEXT'], ['last_login_at', 'TEXT'],
    ['last_login_ip_hash', 'TEXT'], ['updated_at', 'TEXT'],
  ]) {
    try { db.run(`ALTER TABLE users ADD COLUMN ${column} ${definition}`); } catch {}
  }
  try { db.run('ALTER TABLE sms_send_logs ADD COLUMN risk_reason TEXT'); } catch {}
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
  db.run('CREATE INDEX IF NOT EXISTS idx_projects_community_hot ON projects(shared_to_community, likes_count DESC, shared_at DESC, id DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_projects_community_latest ON projects(shared_to_community, shared_at DESC, id DESC)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_beading_sessions_active_key ON beading_sessions(active_key)');
  const activeSessions = getAll("SELECT id, user_id, project_id FROM beading_sessions WHERE status IN ('in_progress', 'paused', 'pending_completion') ORDER BY updated_at DESC, id DESC");
  const retained = new Set();
  for (const session of activeSessions) {
    const key = session.project_id ? `${session.user_id}:${session.project_id}` : null;
    if (!key || retained.has(key)) {
      db.run("UPDATE beading_sessions SET status = 'abandoned', active_key = NULL, abandoned_at = COALESCE(abandoned_at, ?) WHERE id = ?", [new Date().toISOString(), session.id]);
      continue;
    }
    retained.add(key);
    db.run('UPDATE beading_sessions SET active_key = ? WHERE id = ?', [key, session.id]);
  }
  const legacyPhoneNames = getAll(
    `SELECT u.id, i.identifier_last4 AS phoneLast4
     FROM users u JOIN user_identities i ON i.user_id = u.id AND i.provider = 'PHONE'
     WHERE u.nickname IS NULL OR trim(u.nickname) = '' OR u.nickname LIKE 'phone_%'`,
  );
  for (const user of legacyPhoneNames) {
    if (user.phoneLast4) db.run('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?', [`用户${user.phoneLast4}`, new Date().toISOString(), user.id]);
  }
}

async function persist() {
  // better-sqlite3 commits writes directly to the database file. Keep this
  // compatibility hook because existing services await persist() after writes.
}

async function withTransaction(work) {
  db.run('BEGIN IMMEDIATE');
  try {
    const result = await work();
    db.run('COMMIT');
    await persist();
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch {}
    throw error;
  }
}

function getBeadingService() {
  if (!beadingService) beadingService = createBeadingSessionService({ db, getOne, getAll, persist, withTransaction });
  return beadingService;
}

async function handleBeadingCall(response, work) {
  try {
    return sendJson(response, 200, await work());
  } catch (error) {
    if (error instanceof BeadingError) return sendJson(response, error.status, { error: error.code, code: error.code, message: error.message, ...error.details });
    throw error;
  }
}

async function route(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS') return sendCors(response);
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true });
  }
  if (url.pathname.startsWith('/api/v1/auth/')) {
    return handlePhoneAuthRoute(request, response, url);
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
  const publicAvatarMatch = url.pathname.match(/^\/api\/community\/users\/([^/]+)\/avatar$/);
  if (publicAvatarMatch && request.method === 'GET') {
    return servePublicAvatar(publicAvatarMatch[1], response);
  }

  if (request.method === 'GET' && url.pathname === '/api/community/posts') {
    const optionalUser = getOptionalUser(request);
    return listCommunityPosts(response, optionalUser?.id || '', url.searchParams.get('sort') || 'hot', parsePagination(url.searchParams), {
      q: url.searchParams.get('q') || '',
      tags: url.searchParams.get('tags') || '',
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/community/tags') {
    return sendJson(response, 200, { tags: COMMUNITY_TAGS });
  }
  const publicCommunityCommentsMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments$/);
  if (publicCommunityCommentsMatch && request.method === 'GET') {
    const optionalUser = getOptionalUser(request);
    return listProjectComments(response, optionalUser?.id || '', publicCommunityCommentsMatch[1], parsePagination(url.searchParams));
  }
  const publicCommunityPostMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
  if (publicCommunityPostMatch && request.method === 'GET') {
    const optionalUser = getOptionalUser(request);
    const post = getCommunityPost(optionalUser?.id || '', publicCommunityPostMatch[1]);
    if (!post) return sendJson(response, 404, { error: 'NOT_FOUND', message: '社区稿件不存在' });
    return sendJson(response, 200, { post: formatCommunityPost(post) });
  }
  const publicAuthorProfileMatch = url.pathname.match(/^\/api\/community\/users\/([^/]+)\/profile$/);
  if (publicAuthorProfileMatch && request.method === 'GET') {
    const optionalUser = getOptionalUser(request);
    return listAuthorProfile(response, optionalUser?.id || '', publicAuthorProfileMatch[1], parsePagination(url.searchParams));
  }

  const user = requireUser(request, response);
  if (!user) return;

  if (request.method === 'GET' && url.pathname === '/api/admin/users') {
    if (user.username !== AUTH_USERNAME) return sendJson(response, 403, { error: 'FORBIDDEN', message: '无权限' });
    const service = await getPhoneAuthService();
    return sendJson(response, 200, { users: service.adminListUsers(url) });
  }
  const adminUserStatusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (request.method === 'POST' && adminUserStatusMatch) {
    if (user.username !== AUTH_USERNAME) return sendJson(response, 403, { error: 'FORBIDDEN', message: '无权限' });
    const body = await readJson(request);
    const service = await getPhoneAuthService();
    const result = await service.adminSetUserStatus(adminUserStatusMatch[1], body.status, body.reason, user.id);
    return sendJson(response, 200, result);
  }
  if (request.method === 'GET' && url.pathname === '/api/admin/sms-logs') {
    if (user.username !== AUTH_USERNAME) return sendJson(response, 403, { error: 'FORBIDDEN', message: '无权限' });
    const service = await getPhoneAuthService();
    return sendJson(response, 200, { logs: service.adminSmsLogs(url) });
  }

  if (request.method === 'GET' && url.pathname === '/api/me') {
    return sendJson(response, 200, { user, ...getFollowCounts(user.id) });
  }
  if (request.method === 'PATCH' && url.pathname === '/api/profile') {
    return updateProfile(request, response, user.id);
  }
  if (request.method === 'GET' && url.pathname === '/api/warehouses') {
    return listWarehouses(response, user.id);
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    return listProjects(response, user.id, url);
  }
  if (request.method === 'GET' && url.pathname === '/api/project-folders') {
    return listProjectFolders(response, user.id);
  }
  if (request.method === 'POST' && url.pathname === '/api/project-folders') {
    return createProjectFolder(request, response, user.id);
  }
  const projectFolderMatch = url.pathname.match(/^\/api\/project-folders\/([^/]+)$/);
  if (projectFolderMatch && request.method === 'PATCH') {
    return renameProjectFolder(request, response, user.id, projectFolderMatch[1]);
  }
  if (projectFolderMatch && request.method === 'DELETE') {
    return deleteProjectFolder(response, user.id, projectFolderMatch[1]);
  }
  const followMatch = url.pathname.match(/^\/api\/community\/users\/([^/]+)\/follow$/);
  if (followMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    return followUser(response, user.id, followMatch[1], request.method === 'POST');
  }
  if (request.method === 'GET' && url.pathname === '/api/community/following') {
    return listFollowing(response, user.id);
  }
  if (request.method === 'GET' && url.pathname === '/api/community/followers') {
    return listFollowers(response, user.id);
  }
  if (request.method === 'GET' && url.pathname === '/api/notifications') {
    return listNotifications(response, user.id, url);
  }
  const notificationReadMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notificationReadMatch && request.method === 'PATCH') {
    return markNotificationRead(response, user.id, notificationReadMatch[1]);
  }
  const apiPrefix = url.pathname.startsWith('/api/v1/') ? '/api/v1' : '/api';
  const inventoryCheckMatch = url.pathname.match(new RegExp(`^${apiPrefix.replace('/', '\\/')}\\/projects\\/([^/]+)\\/inventory-check$`));
  if (request.method === 'POST' && inventoryCheckMatch) {
    const body = await readJson(request);
    return handleBeadingCall(response, () => getBeadingService().checkProjectInventory(user.id, inventoryCheckMatch[1], body.warehouseId, body.expectedProjectRevision));
  }
  const sessionInventoryCheckMatch = url.pathname.match(new RegExp(`^${apiPrefix.replace('/', '\\/')}\\/beading-sessions\\/([^/]+)\\/inventory-check$`));
  if (request.method === 'POST' && sessionInventoryCheckMatch) {
    const body = await readJson(request);
    return handleBeadingCall(response, () => getBeadingService().checkSessionInventory(user.id, sessionInventoryCheckMatch[1], body.warehouseId));
  }
  const projectSessionMatch = url.pathname.match(new RegExp(`^${apiPrefix.replace('/', '\\/')}\\/projects\\/([^/]+)\\/beading-session$`));
  if (projectSessionMatch && (request.method === 'GET' || request.method === 'POST')) {
    const body = request.method === 'POST' ? await readJson(request) : {};
    if (request.method === 'GET') {
      return handleBeadingCall(response, async () => {
        const row = getOne('SELECT * FROM beading_sessions WHERE user_id = ? AND project_id = ? AND status IN (\'in_progress\', \'paused\', \'pending_completion\') ORDER BY updated_at DESC LIMIT 1', [user.id, projectSessionMatch[1]]);
        return { session: row ? getBeadingService().sessionView(row) : null };
      });
    }
    return handleBeadingCall(response, () => getBeadingService().createOrReuse(user.id, projectSessionMatch[1], body));
  }
  const sessionMatch = url.pathname.match(new RegExp(`^${apiPrefix.replace('/', '\\/')}\\/beading-sessions\\/([^/]+)$`));
  if (sessionMatch && request.method === 'PATCH') {
    return handleBeadingCall(response, async () => getBeadingService().patchSession(user.id, sessionMatch[1], await readJson(request)));
  }
  const sessionActionMatch = url.pathname.match(new RegExp(`^${apiPrefix.replace('/', '\\/')}\\/beading-sessions\\/([^/]+)\\/(pause|resume|prepare-completion|return-to-progress|abandon)$`));
  if (sessionActionMatch && request.method === 'POST') {
    const body = await readJson(request);
    const actionMap = { pause: 'pause', resume: 'resume', 'prepare-completion': 'prepare_completion', 'return-to-progress': 'return_to_progress', abandon: 'abandon' };
    return handleBeadingCall(response, () => getBeadingService().transition(user.id, sessionActionMatch[1], actionMap[sessionActionMatch[2]], body));
  }
  const sessionCompleteMatch = url.pathname.match(new RegExp(`^${apiPrefix.replace('/', '\\/')}\\/beading-sessions\\/([^/]+)\\/complete$`));
  if (sessionCompleteMatch && request.method === 'POST') {
    return handleBeadingCall(response, async () => getBeadingService().complete(user.id, sessionCompleteMatch[1], await readJson(request)));
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
  const communityCommentDeleteMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/comments\/([^/]+)$/);
  if (communityCommentDeleteMatch && request.method === 'DELETE') {
    return deleteProjectComment(response, user.id, communityCommentDeleteMatch[1], communityCommentDeleteMatch[2]);
  }
  const communityLikeMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/like$/);
  if (communityLikeMatch && request.method === 'POST') {
    return likeCommunityPost(response, user.id, communityLikeMatch[1]);
  }
  const projectShareMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/share$/);
  if (projectShareMatch && request.method === 'POST') {
    return shareProject(request, response, user.id, projectShareMatch[1]);
  }
  const projectTagsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/community-tags$/);
  if (projectTagsMatch && request.method === 'PATCH') {
    return updateProjectCommunityTags(request, response, user.id, projectTagsMatch[1]);
  }
  const projectCopyMatch = url.pathname.match(/^\/api(?:\/v1)?\/projects\/([^/]+)\/copy$/);
  if (projectCopyMatch && request.method === 'POST') {
    return copyCommunityProject(response, user.id, projectCopyMatch[1]);
  }
  const projectFolderAssignmentMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/folder$/);
  if (projectFolderAssignmentMatch && request.method === 'PATCH') {
    return moveProjectToFolder(request, response, user.id, projectFolderAssignmentMatch[1]);
  }
  const projectDeleteMatch = url.pathname.match(/^\/api(?:\/v1)?\/projects\/([^/]+)$/);
  if (projectDeleteMatch && request.method === 'DELETE') {
    return deleteProject(response, user.id, projectDeleteMatch[1]);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && request.method === 'GET') {
    return getProjectDetail(response, user.id, projectMatch[1]);
  }
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

async function getPhoneAuthService() {
  if (phoneAuthService) return phoneAuthService;
  const redis = await getRedisClient();
  phoneAuthService = createPhoneAuthService({ db, getOne, getAll, persist, redis });
  return phoneAuthService;
}

async function handlePhoneAuthRoute(request, response, url) {
  const requestId = `trace_${randomUUID()}`;
  try {
    if (request.method === 'POST' && !String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return sendJson(response, 400, { code: 'AUTH_REQUEST_INVALID', message: '请求无效，请刷新后重试', requestId });
    }
    if (request.method === 'POST' && Number(request.headers['content-length'] || 0) > 8192) {
      return sendJson(response, 400, { code: 'AUTH_REQUEST_INVALID', message: '请求无效，请刷新后重试', requestId });
    }
    const service = await getPhoneAuthService();
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/sms/challenge') {
      return sendAuthResult(response, await service.challenge(await readJson(request), trustedClientIp(request), requestId));
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/sms/send') {
      const body = await readJson(request);
      const headers = {
        platform: request.headers['x-client-platform'], signVersion: request.headers['x-sign-version'],
        requestId: request.headers['x-request-id'], timestamp: request.headers['x-timestamp'], nonce: request.headers['x-nonce'],
        challengeId: request.headers['x-challenge-id'], signature: request.headers['x-signature'],
      };
      return sendAuthResult(response, await service.send(body, headers, trustedClientIp(request), requestId));
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/sms/login') {
      return sendAuthResult(response, await service.login(await readJson(request), trustedClientIp(request), requestId));
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/sms/register') {
      return sendAuthResult(response, await service.register(await readJson(request), trustedClientIp(request), requestId));
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/token/refresh') {
      const body = await readJson(request);
      const cookies = parseCookieHeader(request.headers.cookie);
      return sendAuthResult(response, await service.refresh(body.refreshToken || cookies.refresh_token, requestId));
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
      const body = await readJson(request);
      const cookies = parseCookieHeader(request.headers.cookie);
      return sendAuthResult(response, await service.logout(body.refreshToken || cookies.refresh_token, requestId));
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/auth/me') {
      const user = service.authenticate(request.headers.authorization || '');
      if (!user) return sendJson(response, 401, { code: 'AUTH_UNAUTHORIZED', message: '请先登录', requestId });
      return sendJson(response, 200, { code: 'OK', message: 'success', data: { user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl || null, status: user.status } }, requestId });
    }
    return sendJson(response, 404, { code: 'NOT_FOUND', message: '接口不存在', requestId });
  } catch (error) {
    if (error instanceof AuthError) {
      const headers = error.retryAfter ? { 'retry-after': String(error.retryAfter) } : {};
      return sendJson(response, error.status, { code: error.code, message: error.message, requestId }, headers);
    }
    if (error?.message === 'REDIS_NOT_CONFIGURED' || error?.code === 'ECONNREFUSED' || error?.message?.includes('Redis')) {
      return sendJson(response, 503, { code: 'AUTH_RISK_SERVICE_UNAVAILABLE', message: '服务暂不可用，请稍后再试', requestId });
    }
    if (error?.message === 'AUTH_PHONE_INVALID') {
      return sendJson(response, 400, { code: 'AUTH_PHONE_INVALID', message: '请输入正确的手机号', requestId });
    }
    if (error?.message === 'ALIYUN_PNVS_NOT_CONFIGURED') {
      return sendJson(response, 503, { code: 'AUTH_SMS_PROVIDER_UNAVAILABLE', message: '短信服务暂不可用，请稍后再试', requestId });
    }
    throw error;
  }
}

function sendAuthResult(response, result) {
  const headers = result.headers || {};
  response.writeHead(result.status, { ...corsHeaders(), ...headers, 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(result.body));
}

function parseCookieHeader(value) {
  return Object.fromEntries(String(value || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

function trustedClientIp(request) {
  return request.socket.remoteAddress || 'unknown';
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
  sendJson(response, 200, { token, user: { id: row.id, username: row.username, nickname: row.nickname || row.username, avatarUrl: row.avatar_url || null } });
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
      ...summarizeXhsUpstreamResponse(pageResponse),
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
    logger.error('extract_failed', summarizeXhsError(error));
    sendJson(response, 502, { error: 'EXTRACT_FAILED', message: error instanceof Error ? error.message : '小红书图片提取失败' });
  }
}

async function filterReachableImageUrls(imageUrls, logger) {
  const checks = await Promise.all(imageUrls.map(async (imageUrl) => {
    const startedAt = Date.now();
    const result = await probeImageUrl(imageUrl);
    logger.info(result.reachable ? 'image_probe_success' : 'image_probe_failed', {
      url: redactUrl(imageUrl),
      durationMs: Date.now() - startedAt,
      ...result.details,
    });
    return result.reachable ? imageUrl : '';
  }));
  return checks.filter(Boolean);
}

async function probeImageUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl, {
      headers: imageRequestHeaders(),
      signal: AbortSignal.timeout(XHS_UPSTREAM_TIMEOUT_MS),
    });
    const details = summarizeXhsUpstreamResponse(response);
    if (!response.ok) return { reachable: false, details };
    const reader = response.body?.getReader?.();
    let firstChunkBytes = 0;
    if (reader) {
      const firstChunk = await reader.read();
      firstChunkBytes = firstChunk.value?.byteLength || 0;
      await reader.cancel();
    }
    return { reachable: true, details: { ...details, firstChunkBytes } };
  } catch (error) {
    return { reachable: false, details: summarizeXhsError(error) };
  }
}

async function downloadXiaohongshuImage(request, response) {
  const requestId = randomUUID().slice(0, 8);
  const logger = createXhsLogger(`xhs-image:${requestId}`);
  const body = await readJson(request);
  const imageUrl = String(body.imageUrl || '').trim();
  logger.info('download_request_received', { url: redactUrl(imageUrl) });
  if (!isSupportedXiaohongshuImageUrl(imageUrl)) {
    logger.info('download_request_rejected', { reason: 'invalid_image_url' });
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '图片链接无效' });
  }
  try {
    const imageDataUrl = await fetchImageDataUrl(imageUrl, logger);
    logger.info('download_success', { encodedBytes: Buffer.byteLength(imageDataUrl) });
    return sendJson(response, 200, { imageDataUrl });
  } catch (error) {
    logger.error('download_failed', summarizeXhsError(error));
    return sendJson(response, 502, {
      error: 'EXTRACT_FAILED',
      message: error instanceof Error ? error.message : '小红书图片读取失败',
    });
  }
}

async function proxyXiaohongshuImage(url, response) {
  const requestId = randomUUID().slice(0, 8);
  const logger = createXhsLogger(`xhs-proxy:${requestId}`);
  const imageUrl = String(url.searchParams.get('url') || '').trim();
  logger.info('proxy_request_received', { url: redactUrl(imageUrl) });
  if (!isSupportedXiaohongshuImageUrl(imageUrl)) {
    logger.info('proxy_request_rejected', { reason: 'invalid_image_url' });
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '图片链接无效' });
  }
  try {
    const imageResponse = await fetch(imageUrl, {
      headers: imageRequestHeaders(),
      signal: AbortSignal.timeout(XHS_UPSTREAM_TIMEOUT_MS),
    });
    logger.info('proxy_upstream_response', summarizeXhsUpstreamResponse(imageResponse));
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
        logger.error('proxy_failed', { reason: 'image_too_large', totalBytes });
        response.destroy(new Error('小红书图片超过大小限制'));
        return;
      }
      response.write(buffer);
    }
    logger.info('proxy_success', { totalBytes, contentType });
    response.end();
  } catch (error) {
    logger.error('proxy_failed', summarizeXhsError(error));
    if (!response.headersSent) {
      return sendJson(response, 502, { error: 'EXTRACT_FAILED', message: '小红书图片读取失败' });
    }
    response.destroy();
  }
}

async function fetchImageDataUrl(imageUrl, logger) {
  const startedAt = Date.now();
  const imageResponse = await fetch(imageUrl, {
    headers: imageRequestHeaders(),
    signal: AbortSignal.timeout(XHS_UPSTREAM_TIMEOUT_MS),
  });
  logger.info('download_upstream_response', {
    ...summarizeXhsUpstreamResponse(imageResponse),
    durationMs: Date.now() - startedAt,
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
  logger.info('download_body_loaded', { totalBytes, contentType });
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
  return { id: row.id, username: row.username, nickname: row.nickname || row.username, avatarUrl: row.avatarUrl || null, status: row.status || 'ACTIVE' };
}

function getFollowCounts(userId) {
  const counts = getOne(
    `SELECT
       (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followersCount,
       (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? AND u.status = 'ACTIVE') AS followingCount,
       (SELECT COALESCE(SUM(likes_count), 0) FROM projects WHERE user_id = ? AND shared_to_community = 1) AS likesCount`,
    [userId, userId, userId],
  );
  return {
    followersCount: Number(counts?.followersCount || 0),
    followingCount: Number(counts?.followingCount || 0),
    likesCount: Number(counts?.likesCount || 0),
  };
}

function getUserFromRequest(request) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const legacyUser = getOne(
    `SELECT users.id, users.username, users.nickname, users.avatar_url AS avatarUrl, users.status
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ? AND users.username = ?`,
    [token, new Date().toISOString(), AUTH_USERNAME],
  );
  if (legacyUser) return legacyUser;
  const payload = verifyAccessToken(token, String(process.env.AUTH_JWT_SECRET || '').trim());
  if (!payload) return null;
  return getOne('SELECT id, username, nickname, avatar_url AS avatarUrl, status FROM users WHERE id = ? AND status = \'ACTIVE\'', [payload.sub]);
}

async function updateProfile(request, response, userId) {
  const body = await readJson(request);
  const nickname = String(body.nickname || '').trim();
  if (!nickname) return sendJson(response, 400, { error: 'INVALID_PROFILE', message: '请输入用户名' });
  if ([...nickname].length > 32) return sendJson(response, 400, { error: 'INVALID_PROFILE', message: '用户名不能超过 32 个字符' });

  const avatarUrl = body.avatarUrl == null ? null : String(body.avatarUrl).trim();
  if (avatarUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarUrl)) {
    return sendJson(response, 400, { error: 'INVALID_PROFILE', message: '头像格式不支持' });
  }
  const avatarMatch = avatarUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (avatarMatch && Buffer.from(avatarMatch[2], 'base64').length > 1024 * 1024) {
    return sendJson(response, 400, { error: 'INVALID_PROFILE', message: '头像不能超过 1MB' });
  }

  db.run('UPDATE users SET nickname = ?, avatar_url = ?, updated_at = ? WHERE id = ?', [nickname, avatarUrl || null, new Date().toISOString(), userId]);
  await persist();
  return sendJson(response, 200, { user: { id: userId, nickname, avatarUrl: avatarUrl || null } });
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
  const projects = getAll(
    `SELECT user_id AS userId, shared_to_community AS sharedToCommunity
     FROM projects
     WHERE source_image = ? OR thumbnail_image = ?
     `,
    [assetPath, assetPath],
  );
  if (projects.length === 0) return sendJson(response, 404, { error: 'NOT_FOUND', message: '项目图片不存在' });
  if (projects.some((project) => project.sharedToCommunity)) return redirectToCosAsset(response, assetPath);
  const access = String(url.searchParams.get('access') || '');
  const expires = String(url.searchParams.get('expires') || '');
  if (projects.some((project) => verifyProjectAssetAccess(assetPath, project.userId, access, expires))) {
    return redirectToCosAsset(response, assetPath);
  }
  const user = getUserFromRequest(request);
  if (!user) return sendJson(response, 401, { error: 'UNAUTHORIZED', message: '请先登录' });
  if (projects.some((project) => project.userId === user.id)) return redirectToCosAsset(response, assetPath);
  return sendJson(response, 404, { error: 'NOT_FOUND', message: '项目图片不存在' });
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

function listProjects(response, userId, url) {
  const pagination = parsePagination(url.searchParams);
  const projects = getAll(
    `SELECT id, folder_id AS folderId, name, rows, cols, tone, thumbnail_image AS thumbnailImage,
            shared_to_community AS sharedToCommunity, shared_at AS sharedAt, likes_count AS likesCount,
            created_at AS createdAt, updated_at AS updatedAt
     FROM projects
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    [userId, pagination.pageSize, pagination.offset],
  );
  sendJson(response, 200, {
    projects: projects.map((project) => ({
      ...project,
      thumbnailImage: resolveProjectImage(project.thumbnailImage, userId),
    })),
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasMore: projects.length === pagination.pageSize,
  });
}

function getProjectDetail(response, userId, projectId) {
  const project = getOne(
    `SELECT id, folder_id AS folderId, name, rows, cols, tone,
            source_image AS sourceImage, thumbnail_image AS thumbnailImage, canvas_data AS canvasData,
            bead_list AS beadList, revision, shared_to_community AS sharedToCommunity,
            shared_at AS sharedAt, likes_count AS likesCount,
            created_at AS createdAt, updated_at AS updatedAt
     FROM projects
     WHERE id = ? AND user_id = ?`,
    [projectId, userId],
  );
  if (!project) return sendJson(response, 404, { error: 'NOT_FOUND', message: '作品不存在' });
  return sendJson(response, 200, {
    project: {
      ...project,
      sourceImage: resolveProjectImage(project.sourceImage, userId),
      thumbnailImage: resolveProjectImage(project.thumbnailImage, userId),
    },
  });
}

function normalizeFolderName(value) {
  const name = String(value || '').trim();
  if (!name || Array.from(name).length > 30) throw new Error('文件夹名称需为 1–30 个字符');
  return name;
}

function getOwnedProjectFolder(userId, folderId) {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  return getOne('SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM project_folders WHERE id = ? AND user_id = ?', [String(folderId), userId]);
}

function listProjectFolders(response, userId) {
  const folders = getAll(
    'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM project_folders WHERE user_id = ? ORDER BY created_at ASC, id ASC',
    [userId],
  );
  sendJson(response, 200, { folders });
}

async function createProjectFolder(request, response, userId) {
  const body = await readJson(request);
  let name;
  try {
    name = normalizeFolderName(body.name);
  } catch (error) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: error.message });
  }
  if (getOne('SELECT id FROM project_folders WHERE user_id = ? AND name = ?', [userId, name])) {
    return sendJson(response, 409, { error: 'DUPLICATE_FOLDER_NAME', message: '已有同名文件夹' });
  }
  const now = new Date().toISOString();
  const folder = { id: randomUUID(), name, createdAt: now, updatedAt: now };
  db.run('INSERT INTO project_folders (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [folder.id, userId, folder.name, now, now]);
  await persist();
  sendJson(response, 201, { folder });
}

async function renameProjectFolder(request, response, userId, folderId) {
  const folder = getOwnedProjectFolder(userId, folderId);
  if (!folder) return sendJson(response, 404, { error: 'NOT_FOUND', message: '文件夹不存在' });
  const body = await readJson(request);
  let name;
  try {
    name = normalizeFolderName(body.name);
  } catch (error) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: error.message });
  }
  if (name !== folder.name && getOne('SELECT id FROM project_folders WHERE user_id = ? AND name = ?', [userId, name])) {
    return sendJson(response, 409, { error: 'DUPLICATE_FOLDER_NAME', message: '已有同名文件夹' });
  }
  const updatedAt = new Date().toISOString();
  db.run('UPDATE project_folders SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?', [name, updatedAt, folderId, userId]);
  await persist();
  sendJson(response, 200, { folder: { ...folder, name, updatedAt } });
}

async function deleteProjectFolder(response, userId, folderId) {
  const folder = getOwnedProjectFolder(userId, folderId);
  if (!folder) return sendJson(response, 404, { error: 'NOT_FOUND', message: '文件夹不存在' });
  await withTransaction(async () => {
    db.run('UPDATE projects SET folder_id = NULL, updated_at = ? WHERE user_id = ? AND folder_id = ?', [new Date().toISOString(), userId, folderId]);
    db.run('DELETE FROM project_folders WHERE id = ? AND user_id = ?', [folderId, userId]);
  });
  sendJson(response, 200, { deleted: true, folderId });
}

async function moveProjectToFolder(request, response, userId, projectId) {
  const project = getOne('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!project) return sendJson(response, 404, { error: 'NOT_FOUND', message: '作品不存在' });
  const body = await readJson(request);
  const folderId = body.folderId === null || body.folderId === undefined || body.folderId === '' ? null : String(body.folderId);
  if (folderId && !getOwnedProjectFolder(userId, folderId)) return sendJson(response, 404, { error: 'NOT_FOUND', message: '文件夹不存在' });
  const updatedAt = new Date().toISOString();
  db.run('UPDATE projects SET folder_id = ?, updated_at = ? WHERE id = ? AND user_id = ?', [folderId, updatedAt, projectId, userId]);
  await persist();
  sendJson(response, 200, { project: { id: projectId, folderId, updatedAt } });
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
  const beadList = Array.isArray(body.beadList) ? JSON.stringify(body.beadList) : '';
  if (!name || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '项目名称和画布尺寸无效' });
  }
  const folderId = body.folderId === null || body.folderId === undefined || body.folderId === '' ? null : String(body.folderId);
  if (folderId && !getOwnedProjectFolder(userId, folderId)) return sendJson(response, 404, { error: 'NOT_FOUND', message: '文件夹不存在' });
  const now = new Date().toISOString();
  const id = randomUUID();
  db.run(
    'INSERT INTO projects (id, user_id, folder_id, name, rows, cols, tone, source_image, thumbnail_image, canvas_data, bead_list, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, folderId, name, rows, cols, tone, sourceImage, thumbnailImage, canvasData, beadList, now, now],
  );
  await persist();
  sendJson(response, 201, { project: {
    id, folderId, name, rows, cols, tone,
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
    `SELECT id, user_id, folder_id AS folderId, source_image AS sourceImage, thumbnail_image AS thumbnailImage,
            bead_list AS beadList,
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
  const beadList = Array.isArray(body.beadList) ? JSON.stringify(body.beadList) : existing.beadList || '';
  if (!name || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '项目名称和画布尺寸无效' });
  }
  const folderId = Object.hasOwn(body, 'folderId')
    ? (body.folderId === null || body.folderId === undefined || body.folderId === '' ? null : String(body.folderId))
    : (existing.folderId || null);
  if (folderId && !getOwnedProjectFolder(userId, folderId)) return sendJson(response, 404, { error: 'NOT_FOUND', message: '文件夹不存在' });
  const now = new Date().toISOString();
  db.run(
    `UPDATE projects
     SET folder_id = ?, name = ?, rows = ?, cols = ?, tone = ?, source_image = ?, thumbnail_image = ?, canvas_data = ?, bead_list = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [folderId, name, rows, cols, tone, sourceImage, thumbnailImage, canvasData, beadList, now, projectId, userId],
  );
  await persist();
  sendJson(response, 200, { project: {
    id: projectId,
    folderId,
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

async function copyCommunityProject(response, userId, projectId) {
  const source = getOne(`SELECT id, name, rows, cols, tone, source_image AS sourceImage, thumbnail_image AS thumbnailImage,
    canvas_data AS canvasData, bead_list AS beadList, shared_to_community AS sharedToCommunity
    FROM projects WHERE id = ? AND shared_to_community = 1`, [projectId]);
  if (!source) return sendJson(response, 404, { error: 'NOT_FOUND', message: '社区稿件不存在或不可复制' });
  const now = new Date().toISOString();
  const copyId = randomUUID();
  // Preserve one renderable COS asset for the copy. Asset access is checked
  // against the copied project owner when the image is requested.
  const sourceCosImage = String(source.sourceImage || '').startsWith('cos://') ? source.sourceImage : '';
  const thumbnailCosImage = String(source.thumbnailImage || '').startsWith('cos://') ? source.thumbnailImage : '';
  const copiedSourceImage = sourceCosImage || thumbnailCosImage;
  const copiedThumbnailImage = String(source.thumbnailImage || '').startsWith('data:') ? source.thumbnailImage : '';
  db.run(`INSERT INTO projects (id, user_id, name, rows, cols, tone, source_image, thumbnail_image, canvas_data, bead_list, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, [copyId, userId, `${source.name}（副本）`, source.rows, source.cols, source.tone, copiedSourceImage, copiedThumbnailImage, source.canvasData || '', source.beadList || '', now, now]);
  await persist();
  return sendJson(response, 201, { project: { id: copyId, userId, name: `${source.name}（副本）`, rows: Number(source.rows), cols: Number(source.cols), tone: source.tone, sourceImage: resolveProjectImage(copiedSourceImage, userId), thumbnailImage: resolveProjectImage(copiedThumbnailImage, userId), canvasData: source.canvasData || '', revision: 1, createdAt: now, updatedAt: now } });
}

async function deleteProject(response, userId, projectId) {
  const existing = getOne('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!existing) return sendJson(response, 404, { error: 'NOT_FOUND', message: '作品不存在' });
  await withTransaction(async () => {
    const now = new Date().toISOString();
    db.run("UPDATE beading_sessions SET status = 'abandoned', project_id = NULL, active_key = NULL, abandoned_at = COALESCE(abandoned_at, ?), version = version + 1, updated_at = ? WHERE project_id = ? AND user_id = ? AND status IN ('in_progress', 'paused', 'pending_completion')", [now, now, projectId, userId]);
    db.run('DELETE FROM project_likes WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM notifications WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM project_comments WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM project_tags WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
    invalidateCommunityTagCounts();
  });
  return sendJson(response, 200, { deleted: true, projectId });
}

function buildBeadList(canvasData) {
  let cells;
  try {
    cells = JSON.parse(String(canvasData || ''));
  } catch {
    return [];
  }
  if (!Array.isArray(cells)) return [];
  const counts = new Map();
  for (const cell of cells) {
    const color = String(cell?.color || '').trim().toLowerCase();
    if (!color || cell?.transparent) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((left, right) => right.count - left.count || left.color.localeCompare(right.color));
}

function parseStoredBeadList(value) {
  try {
    const list = JSON.parse(String(value || ''));
    return Array.isArray(list) ? list.filter((item) => item && typeof item.color === 'string' && Number.isFinite(Number(item.count))) : [];
  } catch {
    return [];
  }
}

function safeDisplayName(user) {
  const nickname = String(user?.nickname || '').trim();
  if (nickname && !nickname.startsWith('phone_')) return [...nickname].slice(0, 32).join('');
  if (user?.phoneLast4) return '用户' + user.phoneLast4;
  return [...String(user?.username || '').trim()].slice(0, 24).join('') || '用户';
}

function safeAvatarUrl(value) {
  return String(value || '').trim() || null;
}

function publicAvatarUrl(userId, value) {
  const avatarUrl = safeAvatarUrl(value);
  return avatarUrl?.startsWith('data:image/')
    ? `/api/community/users/${encodeURIComponent(userId)}/avatar`
    : avatarUrl;
}

function servePublicAvatar(userId, response) {
  const user = getOne("SELECT avatar_url AS avatarUrl FROM users WHERE id = ? AND status = 'ACTIVE'", [userId]);
  const match = String(user?.avatarUrl || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return sendJson(response, 404, { error: 'NOT_FOUND', message: '头像不存在' });
  const contentType = `image/${match[1]}`;
  const image = Buffer.from(match[2], 'base64');
  response.writeHead(200, { 'content-type': contentType, 'content-length': image.length, 'cache-control': 'no-store' });
  response.end(image);
}

function getCommunityPost(userId, projectId) {
  const post = getOne(
    `SELECT p.id, p.name, p.rows, p.cols, p.tone,
            p.source_image AS sourceImage, p.thumbnail_image AS thumbnailImage, p.canvas_data AS canvasData, p.bead_list AS beadList,
            p.shared_at AS sharedAt, p.likes_count AS likesCount,
            u.id AS authorId, COALESCE(NULLIF(u.nickname, ''), u.username) AS author, u.avatar_url AS authorAvatar,
            COUNT(DISTINCT c.id) AS commentsCount,
            CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END AS likedByMe,
            CASE WHEN EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) THEN 1 ELSE 0 END AS isFollowing
     FROM projects p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN project_comments c ON c.project_id = p.id
     LEFT JOIN project_likes l ON l.project_id = p.id AND l.user_id = ?
     WHERE p.id = ? AND p.shared_to_community = 1
     GROUP BY p.id, l.user_id`,
    [userId || '', userId, projectId],
  );
  if (!post) return null;
  return { ...post, tags: getProjectTags([post.id]).get(post.id) || [] };
}

function formatCommunityPost(post) {
  const storedBeadList = parseStoredBeadList(post.beadList);
  return {
    ...post,
    authorAvatar: publicAvatarUrl(post.authorId, post.authorAvatar),
    sourceImage: resolveProjectImage(post.sourceImage),
    thumbnailImage: resolveProjectImage(post.thumbnailImage),
    beadList: storedBeadList.length > 0 ? storedBeadList : buildBeadList(post.canvasData),
    rows: Number(post.rows),
    cols: Number(post.cols),
    likesCount: Number(post.likesCount || 0),
    commentsCount: Number(post.commentsCount || 0),
    likedByMe: Boolean(post.likedByMe),
    tags: Array.isArray(post.tags) ? post.tags : [],
  };
}

function getProjectTags(projectIds) {
  const ids = [...new Set(projectIds.filter(Boolean))];
  const tagsByProjectId = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return tagsByProjectId;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getAll(
    `SELECT project_id AS projectId, tag FROM project_tags WHERE project_id IN (${placeholders}) ORDER BY created_at ASC, tag ASC`,
    ids,
  );
  for (const row of rows) tagsByProjectId.get(row.projectId)?.push(row.tag);
  return tagsByProjectId;
}

function formatCommunityPosts(posts) {
  const tagsByProjectId = getProjectTags(posts.map((post) => post.id));
  return posts.map((post) => ({
    id: post.id,
    name: post.name,
    rows: Number(post.rows),
    cols: Number(post.cols),
    tone: post.tone,
    thumbnailImage: resolveProjectImage(post.thumbnailImage),
    sharedAt: post.sharedAt,
    likesCount: Number(post.likesCount || 0),
    commentsCount: Number(post.commentsCount || 0),
    authorId: post.authorId,
    author: post.author,
    authorAvatar: publicAvatarUrl(post.authorId, post.authorAvatar),
    likedByMe: Boolean(post.likedByMe),
    isFollowing: Boolean(post.isFollowing),
    tags: tagsByProjectId.get(post.id) || [],
  }));
}

function listCommunityTagCounts() {
  if (communityTagCountsCache) return communityTagCountsCache;
  const rows = getAll(
    `SELECT pt.tag, COUNT(*) AS count
     FROM project_tags pt
     JOIN projects p ON p.id = pt.project_id
     WHERE p.shared_to_community = 1
     GROUP BY pt.tag`,
  );
  const counts = new Map(rows.map((row) => [row.tag, Number(row.count || 0)]));
  communityTagCountsCache = COMMUNITY_TAGS
    .map((tag) => ({ tag, count: counts.get(tag) || 0 }))
    .filter(({ count }) => count > 0);
  return communityTagCountsCache;
}

function invalidateCommunityTagCounts() {
  communityTagCountsCache = null;
}

function normalizeCommunityTags(value) {
  if (!Array.isArray(value)) throw new Error('请选择 1–3 个标签');
  const tags = value.map((tag) => String(tag || '').trim());
  if (tags.length < 1 || tags.length > 3 || tags.some((tag) => !tag) || new Set(tags).size !== tags.length || tags.some((tag) => !COMMUNITY_TAGS.includes(tag))) {
    throw new Error('请选择 1–3 个预设标签');
  }
  return tags;
}

function parseCommunityTagFilters(value) {
  const rawTags = String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  return {
    tags: [...new Set(rawTags.filter((tag) => COMMUNITY_TAGS.includes(tag)))],
    hasInvalidTag: rawTags.some((tag) => !COMMUNITY_TAGS.includes(tag)),
  };
}

function parsePagination(searchParams) {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSizeInput = Number.parseInt(searchParams.get('pageSize') || '20', 10) || 20;
  const pageSize = Math.max(1, Math.min(50, pageSizeInput));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function listCommunityPosts(response, userId, sort, pagination = { page: 1, pageSize: 20, offset: 0 }, filters = {}) {
  const orderBy = sort === 'latest' ? 'p.shared_at DESC, p.id DESC' : 'p.likes_count DESC, p.shared_at DESC, p.id DESC';
  const q = String(filters.q || '').trim().slice(0, 60);
  const tagFilters = parseCommunityTagFilters(filters.tags);
  const where = ['p.shared_to_community = 1'];
  const params = [userId || '', userId || ''];
  if (q) {
    const like = `%${q}%`;
    where.push('(p.name LIKE ? OR COALESCE(NULLIF(u.nickname, \'\'), u.username) LIKE ? OR EXISTS (SELECT 1 FROM project_tags search_tags WHERE search_tags.project_id = p.id AND search_tags.tag LIKE ?))');
    params.push(like, like, like);
  }
  if (tagFilters.hasInvalidTag) {
    where.push('1 = 0');
  } else if (tagFilters.tags.length > 0) {
    const placeholders = tagFilters.tags.map(() => '?').join(', ');
    where.push(`EXISTS (SELECT 1 FROM project_tags filter_tags WHERE filter_tags.project_id = p.id AND filter_tags.tag IN (${placeholders}))`);
    params.push(...tagFilters.tags);
  }
  const posts = getAll(
    `SELECT p.id, p.name, p.rows, p.cols, p.tone,
            p.thumbnail_image AS thumbnailImage,
            p.shared_at AS sharedAt, p.likes_count AS likesCount,
            u.id AS authorId, COALESCE(NULLIF(u.nickname, ''), u.username) AS author, u.avatar_url AS authorAvatar,
            (SELECT COUNT(*) FROM project_comments c WHERE c.project_id = p.id) AS commentsCount,
            CASE WHEN EXISTS (SELECT 1 FROM project_likes l WHERE l.project_id = p.id AND l.user_id = ?) THEN 1 ELSE 0 END AS likedByMe,
            CASE WHEN EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) THEN 1 ELSE 0 END AS isFollowing
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [userId || '', userId || '', ...params.slice(2), pagination.pageSize, pagination.offset],
  );
  sendJson(response, 200, { posts: formatCommunityPosts(posts), tagCounts: listCommunityTagCounts(), page: pagination.page, pageSize: pagination.pageSize });
}

function getAuthorProfile(viewerId, authorId) {
  const profile = getOne(
    `SELECT u.id, COALESCE(NULLIF(u.nickname, ''), u.username) AS name, u.avatar_url AS avatarUrl,
            COUNT(DISTINCT p.id) AS postsCount,
            COALESCE(SUM(p.likes_count), 0) AS likesCount,
            (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followersCount,
            CASE WHEN EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) THEN 1 ELSE 0 END AS isFollowing
     FROM users u
     LEFT JOIN projects p ON p.user_id = u.id AND p.shared_to_community = 1
     WHERE u.id = ? AND u.status = 'ACTIVE'
     GROUP BY u.id`,
    [viewerId || '', authorId],
  );
  return profile ? {
    ...profile,
    avatarUrl: publicAvatarUrl(profile.id, profile.avatarUrl),
    postsCount: Number(profile.postsCount || 0),
    likesCount: Number(profile.likesCount || 0),
    followersCount: Number(profile.followersCount || 0),
    isFollowing: Boolean(profile.isFollowing),
  } : null;
}

function listAuthorProfile(response, viewerId, authorId, pagination = { page: 1, pageSize: 20, offset: 0 }) {
  const profile = getAuthorProfile(viewerId, authorId);
  if (!profile) return sendJson(response, 404, { error: 'NOT_FOUND', message: '用户不存在' });
  const posts = getAll(
    `SELECT p.id, p.name, p.rows, p.cols, p.tone,
            p.thumbnail_image AS thumbnailImage,
            p.shared_at AS sharedAt, p.likes_count AS likesCount,
            u.id AS authorId, COALESCE(NULLIF(u.nickname, ''), u.username) AS author, u.avatar_url AS authorAvatar,
            (SELECT COUNT(*) FROM project_comments c WHERE c.project_id = p.id) AS commentsCount,
            CASE WHEN EXISTS (SELECT 1 FROM project_likes l WHERE l.project_id = p.id AND l.user_id = ?) THEN 1 ELSE 0 END AS likedByMe,
            CASE WHEN EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) THEN 1 ELSE 0 END AS isFollowing
     FROM projects p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ? AND p.shared_to_community = 1
     ORDER BY p.shared_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [viewerId || '', viewerId || '', authorId, pagination.pageSize, pagination.offset],
  );
  sendJson(response, 200, { profile, posts: formatCommunityPosts(posts), page: pagination.page, pageSize: pagination.pageSize });
}

function assertSharedProject(response, userId, projectId) {
  const post = getOne(
    `SELECT id, user_id AS authorId, name
     FROM projects
     WHERE id = ? AND shared_to_community = 1`,
    [projectId],
  );
  if (!post) {
    sendJson(response, 404, { error: 'NOT_FOUND', message: '社区稿件不存在' });
    return null;
  }
  return post;
}

function replaceProjectTags(projectId, tags, now) {
  db.run('DELETE FROM project_tags WHERE project_id = ?', [projectId]);
  for (const tag of tags) db.run('INSERT INTO project_tags (project_id, tag, created_at) VALUES (?, ?, ?)', [projectId, tag, now]);
  invalidateCommunityTagCounts();
}

async function shareProject(request, response, userId, projectId) {
  const body = await readJson(request);
  let tags;
  try {
    tags = normalizeCommunityTags(body.tags);
  } catch (error) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: error.message });
  }
  const project = getOne('SELECT id, user_id, thumbnail_image AS thumbnailImage, source_image AS sourceImage, canvas_data AS canvasData, bead_list AS beadList, shared_to_community AS sharedToCommunity, shared_at AS sharedAt FROM projects WHERE id = ?', [projectId]);
  if (!project || project.user_id !== userId) return sendJson(response, 404, { error: 'NOT_FOUND', message: '作品不存在' });
  if (!String(project.thumbnailImage || project.sourceImage || '').trim()) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: '作品缺少有效预览图，无法分享到社区' });
  }
  const beadList = buildBeadList(project.canvasData);
  const now = new Date().toISOString();
  const sharedAt = project.sharedToCommunity ? project.sharedAt : now;
  await withTransaction(async () => {
    db.run('UPDATE projects SET shared_to_community = 1, shared_at = ?, bead_list = ?, updated_at = ? WHERE id = ?', [sharedAt, JSON.stringify(beadList), now, projectId]);
    replaceProjectTags(projectId, tags, now);
  });
  sendJson(response, 200, { shared: true, sharedAt, projectId, beadList, tags });
}

async function updateProjectCommunityTags(request, response, userId, projectId) {
  const project = getOne('SELECT id FROM projects WHERE id = ? AND user_id = ? AND shared_to_community = 1', [projectId, userId]);
  if (!project) return sendJson(response, 404, { error: 'NOT_FOUND', message: '社区作品不存在' });
  const body = await readJson(request);
  let tags;
  try {
    tags = normalizeCommunityTags(body.tags);
  } catch (error) {
    return sendJson(response, 400, { error: 'INVALID_INPUT', message: error.message });
  }
  await withTransaction(async () => replaceProjectTags(projectId, tags, new Date().toISOString()));
  sendJson(response, 200, { projectId, tags });
}

function listProjectComments(response, userId, projectId, pagination = { page: 1, pageSize: 20, offset: 0 }) {
  if (!assertSharedProject(response, userId, projectId)) return;
  const totalTopLevel = Number(getOne('SELECT COUNT(*) AS count FROM project_comments WHERE project_id = ? AND parent_id IS NULL', [projectId])?.count || 0);
  const totalComments = Number(getOne('SELECT COUNT(*) AS count FROM project_comments WHERE project_id = ?', [projectId])?.count || 0);
  const formatComment = (comment) => ({
    ...comment,
    authorAvatar: publicAvatarUrl(comment.authorId, comment.authorAvatar),
    replies: comment.replies || [],
  });
  const comments = getAll(
    `SELECT c.id, c.project_id AS projectId, c.content, c.parent_id AS parentId,
            c.reply_to_user_id AS replyToUserId, c.created_at AS createdAt, u.id AS authorId,
            COALESCE(NULLIF(u.nickname, ''), u.username) AS author, u.avatar_url AS authorAvatar,
            COALESCE(NULLIF(ru.nickname, ''), ru.username) AS replyToUserName
     FROM project_comments c JOIN users u ON u.id = c.user_id
     LEFT JOIN users ru ON ru.id = c.reply_to_user_id
     WHERE c.project_id = ? AND c.parent_id IS NULL ORDER BY c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [projectId, pagination.pageSize, pagination.offset],
  ).map((comment) => formatComment(comment));
  if (comments.length) {
    const placeholders = comments.map(() => '?').join(', ');
    const replies = getAll(
      `WITH RECURSIVE comment_tree AS (
         SELECT c.id, c.project_id AS projectId, c.content, c.parent_id AS parentId,
                c.reply_to_user_id AS replyToUserId, c.created_at AS createdAt, c.user_id AS userId
         FROM project_comments c
         WHERE c.project_id = ? AND c.parent_id IN (${placeholders})
         UNION ALL
         SELECT c.id, c.project_id AS projectId, c.content, c.parent_id AS parentId,
                c.reply_to_user_id AS replyToUserId, c.created_at AS createdAt, c.user_id AS userId
         FROM project_comments c JOIN comment_tree parent ON c.parent_id = parent.id
         WHERE c.project_id = ?
       )
       SELECT c.id, c.projectId, c.content, c.parentId,
              c.replyToUserId, c.createdAt, u.id AS authorId,
              COALESCE(NULLIF(u.nickname, ''), u.username) AS author, u.avatar_url AS authorAvatar,
              COALESCE(NULLIF(ru.nickname, ''), ru.username) AS replyToUserName
       FROM comment_tree c JOIN users u ON u.id = c.userId
       LEFT JOIN users ru ON ru.id = c.replyToUserId
       ORDER BY c.createdAt ASC, c.id ASC`,
      [projectId, ...comments.map((comment) => comment.id), projectId],
    ).map((comment) => formatComment(comment));
    const topLevelIds = new Set(comments.map((comment) => comment.id));
    const repliesById = new Map(replies.map((reply) => [reply.id, reply]));
    const childrenByParent = new Map();
    for (const reply of replies) {
      const list = childrenByParent.get(reply.parentId) || [];
      list.push(reply);
      childrenByParent.set(reply.parentId, list);
    }
    const appendDescendants = (parentId, output) => {
      for (const child of childrenByParent.get(parentId) || []) {
        output.push(child);
        appendDescendants(child.id, output);
      }
    };
    const findTopLevelParent = (reply) => {
      let current = reply;
      const visited = new Set();
      while (current?.parentId && !topLevelIds.has(current.parentId) && !visited.has(current.parentId)) {
        visited.add(current.parentId);
        current = repliesById.get(current.parentId);
      }
      return current?.parentId || null;
    }
    for (const comment of comments) {
      const flattened = [];
      appendDescendants(comment.id, flattened);
      comment.replies = flattened.filter((reply) => findTopLevelParent(reply) === comment.id);
    }
  }
  sendJson(response, 200, {
    comments,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasMore: pagination.offset + comments.length < totalTopLevel,
    totalTopLevel,
    totalComments,
  });
}

async function createProjectComment(request, response, userId, projectId) {
  const post = assertSharedProject(response, userId, projectId);
  if (!post) return;
  const body = await readJson(request);
  const content = String(body.content || '').trim();
  if (!content || [...content].length > 300) return sendJson(response, 400, { error: 'INVALID_INPUT', message: '评论内容不能为空且不能超过 300 个字' });
  const requestedParentId = String(body.parentId || '').trim() || null;
  let parentId = null;
  let replyToUserId = null;
  if (requestedParentId) {
    const target = getOne('SELECT id, project_id AS projectId, user_id AS userId, parent_id AS parentId FROM project_comments WHERE id = ?', [requestedParentId]);
    if (!target || target.projectId !== projectId) return sendJson(response, 400, { error: 'INVALID_INPUT', message: '回复目标不存在' });
    parentId = target.id;
    replyToUserId = target.userId;
  }
  const author = getOne(
    `SELECT u.id, u.username, u.nickname, u.avatar_url AS avatarUrl, i.identifier_last4 AS phoneLast4
     FROM users u LEFT JOIN user_identities i ON i.user_id = u.id AND i.provider = 'PHONE'
     WHERE u.id = ?`,
    [userId],
  );
  const replyToAuthor = replyToUserId ? getOne("SELECT COALESCE(NULLIF(nickname, ''), username) AS name FROM users WHERE id = ?", [replyToUserId]) : null;
  const comment = { id: randomUUID(), projectId, authorId: userId, author: safeDisplayName(author), authorAvatar: safeAvatarUrl(author?.avatarUrl), content, parentId, replyToUserId, replyToUserName: replyToAuthor?.name || null, createdAt: new Date().toISOString(), replies: [] };
  await withTransaction(async () => {
    db.run('INSERT INTO project_comments (id, project_id, user_id, content, parent_id, reply_to_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [comment.id, projectId, userId, comment.content, parentId, replyToUserId, comment.createdAt]);
    const receiverId = replyToUserId || post.authorId;
    if (receiverId !== userId) {
      db.run(
        `INSERT INTO notifications (id, receiver_id, sender_id, type, project_id, comment_id, content, created_at, read_at)
         VALUES (?, ?, ?, 'comment', ?, ?, ?, ?, NULL)`,
        [randomUUID(), receiverId, userId, projectId, comment.id, parentId ? `${comment.author} 回复了你的评论` : `${comment.author} 评论了你的作品「${post.name}」`, comment.createdAt],
      );
    }
  });
  sendJson(response, 201, { comment });
}

async function deleteProjectComment(response, userId, projectId, commentId) {
  const comment = getOne('SELECT id, project_id AS projectId, user_id AS userId, parent_id AS parentId FROM project_comments WHERE id = ?', [commentId]);
  if (!comment || comment.projectId !== projectId || comment.userId !== userId) return sendJson(response, 404, { error: 'NOT_FOUND', message: '评论不存在' });
  const idsToDelete = getAll(
    `WITH RECURSIVE comment_tree(id) AS (
       SELECT id FROM project_comments WHERE id = ?
       UNION ALL
       SELECT c.id FROM project_comments c JOIN comment_tree t ON c.parent_id = t.id
     )
     SELECT id FROM comment_tree`,
    [commentId],
  ).map((item) => item.id);
  const deletedCount = idsToDelete.length;
  const placeholders = idsToDelete.map(() => '?').join(', ');
  await withTransaction(async () => {
    db.run(`DELETE FROM notifications WHERE comment_id IN (${placeholders})`, idsToDelete);
    db.run(`DELETE FROM project_comments WHERE id IN (${placeholders})`, idsToDelete);
  });
  sendJson(response, 200, { deletedCount });
}

async function followUser(response, followerId, followingId, shouldFollow) {
  if (followerId === followingId) return sendJson(response, 400, { error: 'INVALID_INPUT', message: '不能关注自己' });
  const target = getOne('SELECT id FROM users WHERE id = ? AND status = \'ACTIVE\'', [followingId]);
  if (!target) return sendJson(response, 404, { error: 'NOT_FOUND', message: '用户不存在' });
  if (shouldFollow) {
    db.run('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)', [followerId, followingId, new Date().toISOString()]);
  } else {
    db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
  }
  await persist();
  const counts = getOne(
    `SELECT
       (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followersCount,
       (SELECT COUNT(*) FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? AND u.status = 'ACTIVE') AS followingCount`,
    [followingId, followingId],
  );
  sendJson(response, 200, { following: shouldFollow, followersCount: Number(counts?.followersCount || 0), followingCount: Number(counts?.followingCount || 0) });
}

function listFollowing(response, userId) {
  const users = getAll(
    `SELECT u.id, COALESCE(NULLIF(u.nickname, ''), u.username) AS name, u.avatar_url AS avatarUrl
     FROM follows f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = ? AND u.status = 'ACTIVE'
     ORDER BY f.created_at DESC, u.id DESC`,
    [userId],
  ).map((user) => ({ ...user, avatarUrl: publicAvatarUrl(user.id, user.avatarUrl) }));
  sendJson(response, 200, { users });
}

function listFollowers(response, userId) {
  const users = getAll(
    `SELECT u.id, COALESCE(NULLIF(u.nickname, ''), u.username) AS name, u.avatar_url AS avatarUrl
     FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = ? AND u.status = 'ACTIVE'
     ORDER BY f.created_at DESC, u.id DESC`,
    [userId],
  ).map((user) => ({ ...user, avatarUrl: publicAvatarUrl(user.id, user.avatarUrl) }));
  sendJson(response, 200, { users });
}

function listNotifications(response, userId, url) {
  const { page, pageSize, offset } = parsePagination(url.searchParams);
  const notifications = getAll(
    `SELECT n.id, n.type, n.project_id AS projectId, n.comment_id AS commentId,
            n.content, n.created_at AS createdAt, n.read_at AS readAt,
            s.id AS senderId, COALESCE(NULLIF(s.nickname, ''), s.username) AS senderName, s.avatar_url AS senderAvatar
     FROM notifications n JOIN users s ON s.id = n.sender_id
     WHERE n.receiver_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
    [userId, pageSize, offset],
  ).map((item) => ({ ...item, senderAvatar: publicAvatarUrl(item.senderId, item.senderAvatar), isRead: Boolean(item.readAt) }));
  const unread = getOne('SELECT COUNT(*) AS count FROM notifications WHERE receiver_id = ? AND read_at IS NULL', [userId]);
  sendJson(response, 200, { notifications, unreadCount: Number(unread?.count || 0), page, pageSize });
}

async function markNotificationRead(response, userId, notificationId) {
  const notification = getOne('SELECT id FROM notifications WHERE id = ? AND receiver_id = ?', [notificationId, userId]);
  if (!notification) return sendJson(response, 404, { error: 'NOT_FOUND', message: '消息不存在' });
  db.run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?', [new Date().toISOString(), notificationId]);
  await persist();
  sendJson(response, 200, { read: true, notificationId });
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
  return db.prepare(sql).get(...params) || null;
}

function getAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function sendCors(response) {
  response.writeHead(204, corsHeaders());
  response.end();
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(),
    ...extraHeaders,
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-client-platform, x-client-version, x-sign-version, x-request-id, x-timestamp, x-nonce, x-challenge-id, x-signature',
    'access-control-expose-headers': 'retry-after',
  };
}
