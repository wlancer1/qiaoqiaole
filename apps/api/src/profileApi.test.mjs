import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 4900 + Math.floor(Math.random() * 50);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-profile-'));
const dbPath = path.join(root, 'profile.sqlite');
let serverProcess;
let token;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'profile-user', QIAOQIAOLE_PASSWORD: 'profile-password', TENCENT_COS_ENABLED: 'false' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await request('/api/health')).status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'profile-user', password: 'profile-password' }) });
  token = login.body.token;
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('profile API', () => {
  it('updates the authenticated user display name and avatar', async () => {
    const response = await request('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '新用户名', avatarUrl: 'data:image/png;base64,AA==' }),
    });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ nickname: '新用户名', avatarUrl: 'data:image/png;base64,AA==' });

    const me = await request('/api/me', { headers: { authorization: `Bearer ${token}` } });
    const publicProfile = await request(`/api/community/users/${me.body.user.id}/profile`);
    expect(publicProfile.body.profile.avatarUrl).toBe(`/api/community/users/${me.body.user.id}/avatar`);
    const avatar = await fetch(`http://127.0.0.1:${port}${publicProfile.body.profile.avatarUrl}`);
    expect(avatar.status).toBe(200);
    expect(avatar.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await avatar.arrayBuffer()).equals(Buffer.from([0]))).toBe(true);
  });

  it('rejects an empty display name', async () => {
    const response = await request('/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: '   ' }),
    });
    expect(response.status).toBe(400);
  });

  it('lists the users followed by the authenticated user', async () => {
    const response = await request('/api/community/following', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ users: [] });
  });

  it('returns the public profile and shared work summary for an author', async () => {
    const me = await request('/api/me', { headers: { authorization: `Bearer ${token}` } });
    const response = await request(`/api/community/users/${me.body.user.id}/profile`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ id: me.body.user.id, postsCount: 0, likesCount: 0 });
    expect(response.body.posts).toEqual([]);
  });

  it('allows an unauthenticated visitor to view the public author profile', async () => {
    const me = await request('/api/me', { headers: { authorization: `Bearer ${token}` } });
    const response = await request(`/api/community/users/${me.body.user.id}/profile`);
    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ id: me.body.user.id });
  });
});
