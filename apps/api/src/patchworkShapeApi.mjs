/** Account-owned, persistent shape library. Lists expose bounded previews only. */
export function createPatchworkShapeApi({ db, readJson, sendJson }) {
  db.run(`CREATE TABLE IF NOT EXISTS patchwork_shapes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL, name TEXT NOT NULL, points TEXT NOT NULL, preview TEXT NOT NULL,
    width_mm REAL NOT NULL, height_mm REAL NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_patchwork_shapes_user_recent ON patchwork_shapes(user_id, last_used_at DESC, updated_at DESC, id)');
  const fail = (res, message, status = 400) => sendJson(res, status, { error: status === 404 ? 'NOT_FOUND' : 'INVALID_INPUT', message });
  const metadata = (row) => ({ id: row.id, name: row.name, favorite: Boolean(row.favorite), lastUsedAt: row.last_used_at, widthMm: row.width_mm, heightMm: row.height_mm, updatedAt: row.updated_at });
  const validName = (name) => typeof name === 'string' && name.trim().length > 0 && [...name.trim()].length <= 80;
  const validLastUsed = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= Date.now() + 86_400_000;
  return {
    async handle(request, response, url, userId) {
      const match = url.pathname.match(/^\/api\/patchwork-shapes(?:\/([A-Za-z0-9_-]{1,128}))?$/);
      if (!match) return fail(response, '形状不存在', 404);
      const id = match[1];
      if (!id && request.method === 'GET') {
        const number = (key, fallback, max) => { const n = Number(url.searchParams.get(key) || fallback); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback; };
        const page = number('page', 1, 1_000_000), pageSize = number('pageSize', 30, 50);
        const clauses = ['user_id = ?'], params = [userId];
        const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
        if (q) { clauses.push("name LIKE ? ESCAPE '\\'"); params.push('%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%'); }
        if (url.searchParams.get('favorite') === 'true') clauses.push('favorite = 1');
        const where = clauses.join(' AND ');
        const order = url.searchParams.get('sort') === 'all' ? 'created_at DESC, id ASC' : 'last_used_at DESC, updated_at DESC, id ASC';
        const rows = db.prepare(`SELECT id, name, preview, width_mm, height_mm, favorite, last_used_at, updated_at FROM patchwork_shapes WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, pageSize + 1, (page - 1) * pageSize);
        const total = db.prepare(`SELECT COUNT(*) AS total FROM patchwork_shapes WHERE ${where}`).get(...params).total;
        return sendJson(response, 200, { shapes: rows.slice(0, pageSize).map((row) => ({ ...metadata(row), previewPoints: JSON.parse(row.preview) })), page, pageSize, hasMore: rows.length > pageSize, total });
      }
      if (!id) return fail(response, '请指定形状');
      if (request.method === 'GET') {
        const row = db.prepare('SELECT id, name, points, width_mm, height_mm, favorite, last_used_at, updated_at FROM patchwork_shapes WHERE user_id = ? AND id = ?').get(userId, id);
        if (!row) return fail(response, '形状不存在', 404);
        return sendJson(response, 200, { shape: { ...metadata(row), points: JSON.parse(row.points) } });
      }
      if (request.method === 'PUT') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(response, '形状设置无效');
        const points = body.points;
        if (!validName(body.name) || !Array.isArray(points) || points.length < 3 || points.length > 20_000 || points.some((p) => !p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1_000_000 || Math.abs(p.y) > 1_000_000)) return fail(response, '形状名称或轮廓无效（3–20000 个节点）');
        if (body.favorite !== undefined && typeof body.favorite !== 'boolean') return fail(response, '收藏状态无效');
        if (body.lastUsedAt !== undefined && !validLastUsed(body.lastUsedAt)) return fail(response, '使用时间无效');
        const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        if (maxX <= minX || maxY <= minY) return fail(response, '形状轮廓不能是一条线');
        const normalized = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
        // Preserve extremal nodes as well as evenly spaced samples in the compact preview.
        const indices = new Set([xs.indexOf(minX), xs.indexOf(maxX), ys.indexOf(minY), ys.indexOf(maxY)]);
        for (let i = 0; i < Math.min(60, points.length); i++) indices.add(Math.floor(i * points.length / Math.min(60, points.length)));
        const preview = [...indices].sort((a, b) => a - b).map((i) => normalized[i]);
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO patchwork_shapes (user_id, id, name, points, preview, width_mm, height_mm, favorite, last_used_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, id) DO UPDATE SET name=excluded.name, points=excluded.points, preview=excluded.preview, width_mm=excluded.width_mm, height_mm=excluded.height_mm, favorite=excluded.favorite, last_used_at=excluded.last_used_at, updated_at=excluded.updated_at`)
          .run(userId, id, body.name.trim(), JSON.stringify(normalized), JSON.stringify(preview), maxX - minX, maxY - minY, body.favorite ? 1 : 0, body.lastUsedAt || 0, now, now);
        return sendJson(response, 200, { saved: true });
      }
      if (request.method === 'PATCH') {
        const row = db.prepare('SELECT name, favorite, last_used_at FROM patchwork_shapes WHERE user_id = ? AND id = ?').get(userId, id);
        if (!row) return fail(response, '形状不存在', 404);
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(response, '形状设置无效');
        if (body.points !== undefined || (body.name !== undefined && !validName(body.name)) || (body.favorite !== undefined && typeof body.favorite !== 'boolean') || (body.lastUsedAt !== undefined && !validLastUsed(body.lastUsedAt))) return fail(response, '形状设置无效');
        db.prepare('UPDATE patchwork_shapes SET name = ?, favorite = ?, last_used_at = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(body.name?.trim() ?? row.name, body.favorite === undefined ? row.favorite : Number(body.favorite), body.lastUsedAt ?? row.last_used_at, new Date().toISOString(), userId, id);
        return sendJson(response, 200, { saved: true });
      }
      return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED', message: '不支持的操作' });
    },
  };
}
