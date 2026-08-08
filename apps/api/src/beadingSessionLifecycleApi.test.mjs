import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 4300 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-beading-lifecycle-'));
const dbPath = path.join(root, 'api.sqlite');
let serverProcess;
let token;
let projectId;
let warehouseId;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${token || ''}`, ...(options.headers || {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'lifecycle-admin', QIAOQIAOLE_PASSWORD: 'lifecycle-password' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await request('/api/health')).response.status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  token = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'lifecycle-admin', password: 'lifecycle-password' }) })).body.token;
  warehouseId = (await request('/api/warehouses', { method: 'POST', body: JSON.stringify({ name: '拼豆仓库' }) })).body.warehouse.id;
  await request(`/api/warehouses/${warehouseId}/inventory`, { method: 'POST', body: JSON.stringify({ codes: ['A14'], type: 'in', quantity: 10 }) });
  projectId = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: '生命周期作品', rows: 1, cols: 1, canvasData: JSON.stringify([{ color: 'A14' }]) }) })).body.project.id;
});

afterAll(async () => { serverProcess?.kill(); await rm(root, { recursive: true, force: true }); });

describe('beading session lifecycle API', () => {
  it('supports pause, resume, progress, prepare-completion and no-deduct completion', async () => {
    const created = await request(`/api/v1/projects/${projectId}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId }) });
    expect(created.response.status).toBe(200);
    const id = created.body.session.id;
    const paused = await request(`/api/v1/beading-sessions/${id}/pause`, { method: 'POST', body: JSON.stringify({ version: created.body.session.version }) });
    expect(paused.body.session.status).toBe('paused');
    const resumed = await request(`/api/v1/beading-sessions/${id}/resume`, { method: 'POST', body: JSON.stringify({ version: paused.body.session.version }) });
    expect(resumed.body.session.status).toBe('in_progress');
    const patched = await request(`/api/v1/beading-sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ version: resumed.body.session.version, completedColorCodes: ['A14'], elapsedSeconds: 12 }) });
    expect(patched.body.session.progress).toEqual({ completed: 1, total: 1, percent: 100 });
    const pending = await request(`/api/v1/beading-sessions/${id}/prepare-completion`, { method: 'POST', body: JSON.stringify({ version: patched.body.session.version }) });
    expect(pending.body.session.status).toBe('pending_completion');
    const complete = await request(`/api/v1/beading-sessions/${id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'lifecycle-no-deduct', deductInventory: false }) });
    expect(complete.response.status).toBe(200);
    expect(complete.body.deducted).toBe(false);
    expect(complete.body.session.status).toBe('completed_without_deduction');
    const replay = await request(`/api/v1/beading-sessions/${id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'lifecycle-no-deduct', deductInventory: false }) });
    expect(replay.response.status).toBe(200);
    expect(replay.body.session.status).toBe('completed_without_deduction');
  });

  it('rejects writes to a terminal session and a different idempotency key', async () => {
    const created = await request(`/api/v1/projects/${projectId}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId, restart: true }) });
    const id = created.body.session.id;
    const pending = await request(`/api/v1/beading-sessions/${id}/prepare-completion`, { method: 'POST', body: JSON.stringify({ version: created.body.session.version }) });
    const complete = await request(`/api/v1/beading-sessions/${id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'terminal-key', deductInventory: false }) });
    expect(complete.response.status).toBe(200);
    const different = await request(`/api/v1/beading-sessions/${id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'different-key', deductInventory: true }) });
    expect(different.response.status).toBe(409);
    const patch = await request(`/api/v1/beading-sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ version: pending.body.session.version, completedColorCodes: [] }) });
    expect(patch.response.status).toBe(409);
  });
});
