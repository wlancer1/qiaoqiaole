import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-project-list-'));
const dbPath = path.join(root, 'test.sqlite');
let serverProcess;
let port;
let token;

async function request(route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(5000), ...options });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const locator = createServer();
  await new Promise((resolve) => locator.listen(0, '127.0.0.1', resolve));
  port = locator.address().port;
  await new Promise((resolve) => locator.close(resolve));
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'list-test-user',
      QIAOQIAOLE_PASSWORD: 'list-test-pass', REDIS_URL: 'redis://127.0.0.1:6380',
      TENCENT_COS_ENABLED: 'false',
    },
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    try {
      const result = await request('/api/health');
      if (result.status === 200) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error('test API failed to start');
  const login = await request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'list-test-user', password: 'list-test-pass' }),
  });
  if (login.status !== 200) throw new Error('test login failed');
  token = login.body.token;
}, 15000);

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('project list performance and paging contract', () => {
  it('requires auth and returns paginated lightweight works and folder totals', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    expect((await request('/api/project-folders')).status).toBe(401);
    expect((await request('/api/projects?page=2&pageSize=12')).status).toBe(401);
    const folder = await request('/api/project-folders', { method: 'POST', headers, body: JSON.stringify({ name: '材料' }) });
    expect(folder.status).toBe(201);
    for (let i = 0; i < 13; i += 1) {
      const created = await request('/api/projects', {
        method: 'POST', headers,
        body: JSON.stringify({ name: `作品${i}`, rows: 4, cols: 4, kind: 'bead', folderId: folder.body.folder.id, canvasData: '[]' }),
      });
      expect(created.status).toBe(201);
    }
    const first = await request('/api/projects?page=1&pageSize=12', { headers });
    const second = await request('/api/projects?page=2&pageSize=12', { headers });
    const folders = await request('/api/project-folders', { headers });
    expect(first.status).toBe(200);
    expect(first.body.projects).toHaveLength(12);
    expect(first.body.hasMore).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.projects).toHaveLength(1);
    expect(second.body.hasMore).toBe(false);
    expect(second.body.total).toBe(13);
    expect(second.body.projects[0]).not.toHaveProperty('canvasData');
    expect(folders.body.folders).toEqual([expect.objectContaining({ id: folder.body.folder.id, projectCount: 13 })]);
    const exact = await request('/api/projects?page=1&pageSize=13', { headers });
    expect(exact.body.hasMore).toBe(false);
  });

  it('uses indexes for user-level and type-filtered pagination', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const plans = [
        ['SELECT id FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 12', ['user-1'], 'idx_projects_user_updated'],
        ['SELECT id FROM projects WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC LIMIT 12', ['user-1', 'bead'], 'idx_projects_user_kind_updated'],
        ['SELECT id FROM project_folders WHERE user_id = ? ORDER BY created_at ASC, id ASC', ['user-1'], 'idx_project_folders_user_created'],
      ];
      for (const [sql, params, index] of plans) {
        const details = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => row.detail).join(' ');
        expect(details).toContain(index);
        expect(details).not.toContain('USE TEMP B-TREE');
      }
    } finally {
      db.close();
    }
  });
});
