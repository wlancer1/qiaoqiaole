import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 4200 + Math.floor(Math.random() * 100);
const root = await mkdtemp(path.join(os.tmpdir(), 'qiaoqiaole-beading-api-'));
const dbPath = path.join(root, 'api.sqlite');
let serverProcess;
let token;
let projectId;
let warehouseId;

async function request(url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), SQLITE_PATH: dbPath, QIAOQIAOLE_USERNAME: 'beading-admin', QIAOQIAOLE_PASSWORD: 'beading-password' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await request('/api/health')).response.status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  token = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'beading-admin', password: 'beading-password' }) })).body.token;
  warehouseId = (await request('/api/warehouses', { method: 'POST', body: JSON.stringify({ name: '主仓库' }) })).body.warehouse.id;
  await request(`/api/warehouses/${warehouseId}/inventory`, { method: 'POST', body: JSON.stringify({ codes: ['A14'], type: 'in', quantity: 3 }) });
  projectId = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: '测试小熊', rows: 2, cols: 2, canvasData: JSON.stringify([{ color: 'A14' }, { color: 'A14' }, { color: 'C5' }]) }) })).body.project.id;
});

afterAll(async () => {
  serverProcess?.kill();
  await rm(root, { recursive: true, force: true });
});

describe('beading inventory API', () => {
  it('checks project requirements and reports missing quantities', async () => {
    const result = await request(`/api/v1/projects/${projectId}/inventory-check`, { method: 'POST', body: JSON.stringify({ warehouseId }) });
    expect(result.response.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.items).toEqual([
      { colorCode: 'A14', required: 2, available: 3, missing: 0, sufficient: true },
      { colorCode: 'C5', required: 1, available: 0, missing: 1, sufficient: false },
    ]);
    expect(result.body.summary.missing).toBe(1);
  });

  it('creates a session from a server snapshot and checks that snapshot', async () => {
    const created = await request(`/api/v1/projects/${projectId}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId }) });
    expect(created.response.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.session.projectId).toBe(projectId);
    expect(created.body.session.requirements).toEqual([{ colorCode: 'A14', required: 2 }, { colorCode: 'C5', required: 1 }]);
    const checked = await request(`/api/v1/beading-sessions/${created.body.session.id}/inventory-check`, { method: 'POST', body: JSON.stringify({}) });
    expect(checked.response.status).toBe(200);
    expect(checked.body.items.find((item) => item.colorCode === 'C5').missing).toBe(1);
  });

  it('allows session creation without a warehouse', async () => {
    const otherProject = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: '无仓库作品', rows: 1, cols: 1, canvasData: JSON.stringify([{ color: 'A14' }]) }) })).body.project.id;
    const created = await request(`/api/v1/projects/${otherProject}/beading-session`, { method: 'POST', body: JSON.stringify({}) });
    expect(created.response.status).toBe(200);
    expect(created.body.session.warehouseId).toBeNull();
  });

  it('converts legacy hex canvas colors when creating a session', async () => {
    const hexProject = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: '旧格式作品', rows: 1, cols: 1, canvasData: JSON.stringify([{ color: '#E99C17' }]) }) })).body.project.id;
    const created = await request(`/api/v1/projects/${hexProject}/beading-session`, { method: 'POST', body: JSON.stringify({}) });
    expect(created.response.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.session.requirements).toEqual([{ colorCode: 'G6', required: 1 }]);
  });

  it('creates a session with canonical color codes above 14', async () => {
    const project = (await request('/api/projects', { method: 'POST', body: JSON.stringify({
      name: '高编号色号作品',
      rows: 1,
      cols: 1,
      canvasData: JSON.stringify([{ color: '#bc9ae5' }]),
      beadList: [{ color: 'C17', count: 1 }],
    }) })).body.project.id;
    const created = await request(`/api/v1/projects/${project}/beading-session`, { method: 'POST', body: JSON.stringify({}) });
    expect(created.response.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.session.requirements).toEqual([{ colorCode: 'C17', required: 1 }]);
  });
});
