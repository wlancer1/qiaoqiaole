import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 4400 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-beading-completion-'));
const dbPath = path.join(root, 'api.sqlite');
let serverProcess;
let token;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${token || ''}`, ...(options.headers || {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}

async function makeProject(name, warehouseId, colors = ['A14']) {
  const projectId = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name, rows: 1, cols: colors.length, canvasData: JSON.stringify(colors.map((color) => ({ color }))) }) })).body.project.id;
  const session = (await request(`/api/v1/projects/${projectId}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId }) })).body.session;
  const pending = (await request(`/api/v1/beading-sessions/${session.id}/prepare-completion`, { method: 'POST', body: JSON.stringify({ version: session.version }) })).body.session;
  return { projectId, session: pending };
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'completion-admin', QIAOQIAOLE_PASSWORD: 'completion-password' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await request('/api/health')).response.status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  token = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'completion-admin', password: 'completion-password' }) })).body.token;
});

afterAll(async () => { serverProcess?.kill(); await rm(root, { recursive: true, force: true }); });

describe('beading completion API', () => {
  it('deducts each required color atomically and returns the used warehouse', async () => {
    const warehouseId = (await request('/api/warehouses', { method: 'POST', body: JSON.stringify({ name: '扣减仓库' }) })).body.warehouse.id;
    await request(`/api/warehouses/${warehouseId}/inventory`, { method: 'POST', body: JSON.stringify({ codes: ['A14'], type: 'in', quantity: 1 }) });
    const { session } = await makeProject('扣减作品', warehouseId, ['A14', 'C5']);
    const result = await request(`/api/v1/beading-sessions/${session.id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'deduct-key', deductInventory: true }) });
    expect(result.response.status, JSON.stringify(result.body)).toBe(409);
    expect(result.body.error).toBe('BEADING_INSUFFICIENT_STOCK');
    const inventory = await request(`/api/warehouses/${warehouseId}/inventory`);
    expect(inventory.body.inventory.A14).toBe(1);
    expect(session.status).toBe('pending_completion');
  });

  it('deducts successfully when every required color is available', async () => {
    const warehouseId = (await request('/api/warehouses', { method: 'POST', body: JSON.stringify({ name: '足量仓库' }) })).body.warehouse.id;
    await request(`/api/warehouses/${warehouseId}/inventory`, { method: 'POST', body: JSON.stringify({ codes: ['A14'], type: 'in', quantity: 2 }) });
    const { session } = await makeProject('足量作品', warehouseId);
    const result = await request(`/api/v1/beading-sessions/${session.id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'success-key', deductInventory: true }) });
    expect(result.response.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.deducted).toBe(true);
    expect(result.body.warehouseId).toBe(warehouseId);
    expect((await request(`/api/warehouses/${warehouseId}/inventory`)).body.inventory.A14).toBe(1);
  });
});
