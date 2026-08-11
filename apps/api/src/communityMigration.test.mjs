import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import initSqlJs from 'sql.js';

const port = 3700 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-community-migration-'));
const dbPath = path.join(root, 'legacy.sqlite');
let serverProcess;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const salt = 'legacy-salt';
  const passwordHash = scryptSync('test-password', salt, 32).toString('hex');
  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
      nickname TEXT, avatar_url TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL, updated_at TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, rows INTEGER NOT NULL, cols INTEGER NOT NULL,
      tone TEXT NOT NULL DEFAULT 'recent-flower', source_image TEXT, thumbnail_image TEXT, canvas_data TEXT,
      bead_list TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      shared_to_community INTEGER NOT NULL DEFAULT 0, shared_at TEXT, likes_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE project_comments (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  db.run('INSERT INTO users (id, username, password_hash, salt, nickname, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['legacy-user', 'legacy-user', passwordHash, salt, '旧用户', 'ACTIVE', new Date().toISOString()]);
  db.run('INSERT INTO projects (id, user_id, name, rows, cols, canvas_data, thumbnail_image, shared_to_community, shared_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)', ['legacy-project', 'legacy-user', '旧评论稿件', 1, 1, '[]', 'data:image/png;base64,AA==', new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]);
  db.run('INSERT INTO project_comments (id, project_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)', ['legacy-comment', 'legacy-project', 'legacy-user', '迁移前评论', new Date().toISOString()]);
  await writeFile(dbPath, Buffer.from(db.export()));

  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'legacy-user', QIAOQIAOLE_PASSWORD: 'test-password', TENCENT_COS_ENABLED: 'false' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { if ((await request('/api/health')).status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('community comment migration', () => {
  it('keeps legacy top-level comments readable and adds reply columns idempotently', async () => {
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'legacy-user', password: 'test-password' }) });
    const headers = { authorization: `Bearer ${login.body.token}` };
    const listed = await request('/api/community/posts/legacy-project/comments', { headers });
    expect(listed.status).toBe(200);
    expect(listed.body.comments[0]).toMatchObject({ id: 'legacy-comment', parentId: null, replies: [] });
    expect(listed.body.totalTopLevel).toBe(1);
    const reply = await request('/api/community/posts/legacy-project/comments', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ content: '迁移后回复', parentId: 'legacy-comment' }),
    });
    expect(reply.status).toBe(201);
  });
});
