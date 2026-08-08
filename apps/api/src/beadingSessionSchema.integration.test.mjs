import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';

const port = 4100 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-beading-schema-'));
const dbPath = path.join(root, 'schema.sqlite');
let serverProcess;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, options);
  return { response, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'schema-admin', QIAOQIAOLE_PASSWORD: 'schema-password' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await request('/api/health');
      if (health.response.status === 200) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'schema-admin', password: 'schema-password' }) });
  serverProcess.kill();
  await new Promise((resolve) => serverProcess.once('exit', resolve));
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('beading schema migration', () => {
  it('creates the session, audit, idempotency and revision columns', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database(await readFile(dbPath));
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('beading_sessions', 'beading_idempotency_keys')")[0].values.flat();
    expect(tables).toEqual(expect.arrayContaining(['beading_sessions', 'beading_idempotency_keys']));
    const sessionColumns = db.exec('PRAGMA table_info(beading_sessions)')[0].values.map((row) => row[1]);
    expect(sessionColumns).toEqual(expect.arrayContaining(['project_snapshot_json', 'requirements_json', 'active_key', 'inventory_deducted', 'inventory_deduction_idempotency_key', 'timer_started_at', 'version']));
    const transactionColumns = db.exec('PRAGMA table_info(inventory_transactions)')[0].values.map((row) => row[1]);
    expect(transactionColumns).toEqual(expect.arrayContaining(['project_id', 'beading_session_id', 'project_name_snapshot', 'source']));
    const projectColumns = db.exec('PRAGMA table_info(projects)')[0].values.map((row) => row[1]);
    expect(projectColumns).toContain('revision');
    expect(db.exec("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_beading_sessions_active_key'")[0].values[0][0]).toMatch(/active_key/);
    db.close();
  });
});
