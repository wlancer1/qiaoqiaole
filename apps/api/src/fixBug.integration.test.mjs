import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 4500 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-fix-bug-'));
const dbPath = path.join(root, 'fix-bug.sqlite');
let serverProcess;
let token;
let userId;
let projectId;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_PATH: dbPath,
      QIAOQIAOLE_USERNAME: 'fix-bug-user',
      QIAOQIAOLE_PASSWORD: 'fix-bug-password',
      AUTH_PHONE_PEPPER: 'fix-bug-phone-pepper',
      AUTH_JWT_SECRET: 'fix-bug-jwt-secret',
      TENCENT_COS_ENABLED: 'false',
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await request('/api/health')).status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'fix-bug-user', password: 'fix-bug-password' }) });
  token = login.body.token;
  userId = login.body.user.id;
  const project = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: '通知测试作品', rows: 1, cols: 1, thumbnailImagePath: 'data:image/png;base64,AA==', canvasData: '[]' }) });
  projectId = project.body.project.id;
  await request(`/api/projects/${projectId}/share`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ tags: ['其他'] }) });
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('fix bug API foundations', () => {
  it('rejects unauthenticated save requests instead of silently accepting them', async () => {
    const response = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '未登录保存', rows: 1, cols: 1, canvasData: '[]' }) });
    expect(response.status).toBe(401);
  });

  it('exposes follow and notification endpoints with authenticated responses', async () => {
    const follow = await request('/api/community/users/missing-user/follow', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    expect(follow.status).toBe(404);
    const selfFollow = await request(`/api/community/users/${userId}/follow`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    expect(selfFollow.status).toBe(400);
    const notifications = await request('/api/notifications', { headers: { authorization: `Bearer ${token}` } });
    expect(notifications.status).toBe(200);
    expect(Array.isArray(notifications.body.notifications)).toBe(true);
  });

  it('creates a comment notification for another user and skips self notification', async () => {
    const comment = await request(`/api/community/posts/${projectId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ content: '自己的评论' }) });
    expect(comment.status).toBe(201);
    const notifications = await request('/api/notifications', { headers: { authorization: `Bearer ${token}` } });
    expect(notifications.body.notifications.some((item) => item.type === 'comment' && item.projectId === projectId)).toBe(false);
  });
});
