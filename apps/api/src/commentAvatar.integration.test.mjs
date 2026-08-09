import { afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';

const port = 4600 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-comment-avatar-'));
const dbPath = path.join(root, 'comment-avatar.sqlite');
const credentials = { username: 'comment-avatar-user', password: 'comment-avatar-password' };
let serverProcess;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function startServer() {
  if (serverProcess) throw new Error('Comment avatar test server is already running');
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_PATH: dbPath,
      QIAOQIAOLE_USERNAME: credentials.username,
      QIAOQIAOLE_PASSWORD: credentials.password,
      TENCENT_COS_ENABLED: 'false',
      TENCENT_COS_SECRET_ID: '',
      TENCENT_COS_SECRET_KEY: '',
      TENCENT_COS_BUCKET: 'qiaoqiaole-test',
      TENCENT_COS_KEY_PREFIX: 'uploads/images',
    },
    stdio: 'ignore',
  });
  serverProcess = child;

  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Comment avatar test server exited before becoming healthy (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const health = await request('/api/health');
      if (health.status === 200) return;
      lastError = new Error(`Health check returned ${health.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Comment avatar test server did not become healthy: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

async function stopServer() {
  const child = serverProcess;
  serverProcess = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  child.kill('SIGTERM');
  await exited;
}

async function login() {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
}

async function updateAvatar(userId, avatarUrl) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  try {
    db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);
    await writeFile(dbPath, db.export());
  } finally {
    db.close();
  }
}

async function createComment(token, projectId, content) {
  return request(`/api/community/posts/${projectId}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ content }),
  });
}

afterAll(async () => {
  try {
    await stopServer();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

describe('comment author avatars', () => {
  it('returns the current normalized user avatar for created and listed comments across restarts', async () => {
    await startServer();
    const initialLogin = await login();
    expect(initialLogin.status).toBe(200);
    const userId = initialLogin.body.user.id;
    expect(userId).toBeTruthy();
    await stopServer();

    const avatarUrl = 'https://cdn.example.com/avatar.png';
    await updateAvatar(userId, avatarUrl);
    await startServer();
    const avatarLogin = await login();
    expect(avatarLogin.status).toBe(200);
    const token = avatarLogin.body.token;
    expect(token).toBeTruthy();

    const project = await request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: '评论头像测试作品',
        rows: 1,
        cols: 1,
        thumbnailImagePath: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        canvasData: '[]',
      }),
    });
    expect(project.status).toBe(201);
    const projectId = project.body.project.id;
    expect(projectId).toBeTruthy();
    const shared = await request(`/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(shared.status).toBe(200);

    const avatarComment = await createComment(token, projectId, '带头像评论');
    expect(avatarComment.status).toBe(201);
    expect(avatarComment.body.comment.authorAvatar).toBe(avatarUrl);
    const avatarList = await request(`/api/community/posts/${projectId}/comments`);
    expect(avatarList.status).toBe(200);
    expect(avatarList.body.comments.find((comment) => comment.content === '带头像评论')?.authorAvatar).toBe(avatarUrl);
    await stopServer();

    await updateAvatar(userId, '');
    await startServer();
    const emptyAvatarLogin = await login();
    expect(emptyAvatarLogin.status).toBe(200);
    const emptyAvatarComment = await createComment(emptyAvatarLogin.body.token, projectId, '空头像评论');
    expect(emptyAvatarComment.status).toBe(201);
    expect(emptyAvatarComment.body.comment.authorAvatar).toBeNull();
    const emptyAvatarList = await request(`/api/community/posts/${projectId}/comments`);
    expect(emptyAvatarList.status).toBe(200);
    expect(emptyAvatarList.body.comments.find((comment) => comment.content === '空头像评论')?.authorAvatar).toBeNull();
    await stopServer();

    await updateAvatar(userId, '   ');
    await startServer();
    const whitespaceAvatarLogin = await login();
    expect(whitespaceAvatarLogin.status).toBe(200);
    const whitespaceAvatarComment = await createComment(whitespaceAvatarLogin.body.token, projectId, '空白头像评论');
    expect(whitespaceAvatarComment.status).toBe(201);
    expect(whitespaceAvatarComment.body.comment.authorAvatar).toBeNull();
    const finalList = await request(`/api/community/posts/${projectId}/comments`);
    expect(finalList.status).toBe(200);
    expect(finalList.body.comments.find((comment) => comment.content === '空白头像评论')?.authorAvatar).toBeNull();
    expect(finalList.body.comments.find((comment) => comment.content === '带头像评论')?.authorAvatar).toBeNull();
  });
});
