import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqliteDatabase } from './sqliteStore.mjs';
import { createPatchworkShapeApi } from './patchworkShapeApi.mjs';

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qiaoqiaole-shapes-'));
  const file = path.join(dir, 'shapes.sqlite');
  let db = openSqliteDatabase(file);
  db.run('CREATE TABLE users (id TEXT PRIMARY KEY)');
  db.run("INSERT INTO users VALUES ('a'), ('b')");
  const make = () => createPatchworkShapeApi({ db, readJson: async (req) => req.body, sendJson: (_res, status, body) => ({ status, body }) });
  let api = make();
  cleanups.push(() => { db.close(); rmSync(dir, { recursive: true }); });
  return {
    call: (user, method, suffix = '', body) => api.handle({ method, body }, {}, new URL('http://localhost/api/patchwork-shapes' + suffix), user),
    reopen: () => { db.close(); db = openSqliteDatabase(file); api = make(); },
  };
}
const points = Array.from({ length: 300 }, (_, i) => ({ x: 50 + 50 * Math.cos(i * Math.PI / 150), y: 50 + 50 * Math.sin(i * Math.PI / 150) }));
describe('account shape API', () => {
  it('persists full geometry across database reopen and isolates accounts', async () => {
    const h = fixture();
    expect((await h.call('a', 'PUT', '/one', { name: '我的图形', points })).status).toBe(200);
    h.reopen();
    expect((await h.call('a', 'GET', '/one')).body.shape.points).toHaveLength(300);
    expect((await h.call('b', 'GET')).body.total).toBe(0);
    expect((await h.call('b', 'GET', '/one')).status).toBe(404);
    expect((await h.call('b', 'PATCH', '/one', { favorite: true })).status).toBe(404);
    await h.call('b', 'PUT', '/one', { name: '账号 B', points });
    expect((await h.call('a', 'GET', '/one')).body.shape.name).toBe('我的图形');
  });
  it('paginates lightweight summaries, searches, and updates metadata without touching geometry', async () => {
    const h = fixture();
    for (let i = 0; i < 4; i++) await h.call('a', 'PUT', '/shape-' + i, { name: '形状_' + i, points });
    const first = (await h.call('a', 'GET', '?pageSize=2')).body;
    expect(first.shapes).toHaveLength(2); expect(first.total).toBe(4); expect(first.hasMore).toBe(true);
    expect(first.shapes[0]).not.toHaveProperty('points');
    expect(first.shapes[0].previewPoints.length).toBeLessThanOrEqual(64);
    const second = (await h.call('a', 'GET', '?pageSize=2&page=2')).body;
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.shapes, ...second.shapes].map((s) => s.id)).size).toBe(4);
    expect((await h.call('a', 'GET', '?pageSize=900')).body.pageSize).toBe(50);
    expect((await h.call('a', 'GET', '?q=_2')).body.total).toBe(1);
    const before = (await h.call('a', 'GET', '/shape-2')).body.shape.points;
    await h.call('a', 'PATCH', '/shape-2', { favorite: true, lastUsedAt: 100 });
    expect((await h.call('a', 'GET', '?favorite=true')).body.total).toBe(1);
    expect((await h.call('a', 'GET', '/shape-2')).body.shape.points).toEqual(before);
    expect((await h.call('a', 'PATCH', '/shape-2', { points })).status).toBe(400);
  });
  it('rejects invalid or oversized outlines and invalid metadata', async () => {
    const h = fixture();
    for (const body of [null, [], { name: '', points }, { name: 'a', points: points.slice(0, 2) }, { name: 'a', points: Array(20001).fill(points[0]) }, { name: 'a', points, favorite: 'yes' }, { name: 'a', points, lastUsedAt: -1 }]) expect((await h.call('a', 'PUT', '/bad', body)).status).toBe(400);
    expect((await h.call('a', 'GET')).body.total).toBe(0);
  });
});
