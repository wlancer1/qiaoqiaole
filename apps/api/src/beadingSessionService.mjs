import { createHash, randomUUID } from 'node:crypto';
import {
  aggregateBeadRequirements,
  calculateInventoryDiff,
  calculateCompletionProgress,
  transitionBeadingSession,
} from './beadingSessionUtils.mjs';

export class BeadingError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseJson(value, fallback) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function nowIso() { return new Date().toISOString(); }

function projectRequirements(project) {
  const source = parseJson(project.beadList, null) || parseJson(project.canvasData, []);
  return aggregateBeadRequirements(source);
}

function projectSnapshot(project) {
  return {
    id: project.id,
    name: project.name,
    rows: Number(project.rows),
    cols: Number(project.cols),
    tone: project.tone,
    canvasData: project.canvasData || '',
  };
}

function sessionView(session) {
  const requirements = parseJson(session.requirements_json, []);
  const completed = parseJson(session.completed_color_codes_json, []);
  const progress = calculateCompletionProgress(requirements.map((item) => item.colorCode), completed);
  return {
    id: session.id,
    projectId: session.project_id,
    projectName: session.project_name_snapshot,
    projectSnapshot: parseJson(session.project_snapshot_json, null),
    requirements,
    warehouseId: session.warehouse_id,
    warehouseName: session.warehouse_name_snapshot,
    status: session.status,
    completedColorCodes: completed,
    progress,
    elapsedSeconds: Number(session.elapsed_seconds || 0),
    timerStartedAt: session.timer_started_at,
    inventoryDeducted: Boolean(session.inventory_deducted),
    inventoryDeductionIdempotencyKey: session.inventory_deduction_idempotency_key,
    version: Number(session.version),
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    completedAt: session.completed_at,
    abandonedAt: session.abandoned_at,
  };
}

function projectRow(getOne, userId, projectId, allowShared = false) {
  const project = getOne(`SELECT id, user_id AS userId, name, rows, cols, tone, canvas_data AS canvasData,
      bead_list AS beadList, revision, shared_to_community AS sharedToCommunity
      FROM projects WHERE id = ?`, [projectId]);
  if (!project || (project.userId !== userId && !(allowShared && project.sharedToCommunity))) {
    throw new BeadingError(404, 'NOT_FOUND', '作品不存在');
  }
  return project;
}

function assertExpectedRevision(project, expectedProjectRevision) {
  if (expectedProjectRevision !== undefined && Number(expectedProjectRevision) !== Number(project.revision)) {
    throw new BeadingError(409, 'BEADING_PROJECT_REVISION_MISMATCH', '作品已更新，请刷新后重试', { projectRevision: Number(project.revision) });
  }
}

function inventoryForWarehouse(getOne, warehouseId, userId) {
  if (!warehouseId) return { warehouse: null, available: {} };
  const warehouse = getOne('SELECT id, name, color_system AS colorSystem FROM warehouses WHERE id = ? AND user_id = ?', [warehouseId, userId]);
  if (!warehouse) throw new BeadingError(404, 'BEADING_WAREHOUSE_NOT_FOUND', '仓库不存在或无权访问');
  if (warehouse.colorSystem !== 'MARD_221') throw new BeadingError(409, 'BEADING_COLOR_SYSTEM_UNSUPPORTED', '仓库色号系统不兼容');
  const rows = getOne ? null : null;
  return { warehouse, available: rows };
}

export function createBeadingSessionService({ db, getOne, getAll, persist, withTransaction }) {
  function getAvailable(warehouseId, userId) {
    if (!warehouseId) return { warehouse: null, available: {} };
    const warehouse = getOne('SELECT id, name, color_system AS colorSystem FROM warehouses WHERE id = ? AND user_id = ?', [warehouseId, userId]);
    if (!warehouse) throw new BeadingError(404, 'BEADING_WAREHOUSE_NOT_FOUND', '仓库不存在或无权访问');
    if (warehouse.colorSystem !== 'MARD_221') throw new BeadingError(409, 'BEADING_COLOR_SYSTEM_UNSUPPORTED', '仓库色号系统不兼容');
    const available = Object.fromEntries(getAll('SELECT color_code AS colorCode, quantity FROM inventory WHERE warehouse_id = ?', [warehouseId]).map((row) => [row.colorCode, Number(row.quantity)]));
    return { warehouse, available };
  }

  function checkProjectInventory(userId, projectId, warehouseId, expectedProjectRevision) {
    const project = projectRow(getOne, userId, projectId, true);
    assertExpectedRevision(project, expectedProjectRevision);
    const requirements = projectRequirements(project);
    const { warehouse, available } = getAvailable(warehouseId, userId);
    return { projectRevision: Number(project.revision), warehouseId: warehouse?.id || null, warehouseName: warehouse?.name || null, ...calculateInventoryDiff(requirements, available) };
  }

  function checkSessionInventory(userId, sessionId, warehouseId) {
    const session = getOne('SELECT * FROM beading_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    if (!session) throw new BeadingError(404, 'NOT_FOUND', '拼豆会话不存在');
    const selectedWarehouse = warehouseId === undefined ? session.warehouse_id : warehouseId;
    const { warehouse, available } = getAvailable(selectedWarehouse, userId);
    return { projectRevision: null, warehouseId: warehouse?.id || null, warehouseName: warehouse?.name || null, ...calculateInventoryDiff(parseJson(session.requirements_json, []), available) };
  }

  async function createOrReuse(userId, projectId, body = {}) {
    return withTransaction(async () => {
      const project = projectRow(getOne, userId, projectId, false);
      assertExpectedRevision(project, body.expectedProjectRevision);
      const active = getOne("SELECT * FROM beading_sessions WHERE user_id = ? AND active_key = ? AND status IN ('in_progress', 'paused', 'pending_completion')", [userId, `${userId}:${projectId}`]);
      if (active && body.restart !== true) return { session: sessionView(active), reused: true };
      if (active) {
        db.run("UPDATE beading_sessions SET status = 'abandoned', active_key = NULL, abandoned_at = ?, version = version + 1, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), active.id]);
      }
      const selectedWarehouseId = body.warehouseId || null;
      const { warehouse } = getAvailable(selectedWarehouseId, userId);
      const requirements = projectRequirements(project);
      const now = nowIso();
      const id = randomUUID();
      db.run(`INSERT INTO beading_sessions
        (id, user_id, project_id, project_name_snapshot, project_snapshot_json, requirements_json, warehouse_id, warehouse_name_snapshot, status, active_key, timer_started_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)`,
      [id, userId, projectId, project.name, JSON.stringify(projectSnapshot(project)), JSON.stringify(requirements), selectedWarehouseId, warehouse?.name || null, `${userId}:${projectId}`, now, now, now]);
      return { session: sessionView(getOne('SELECT * FROM beading_sessions WHERE id = ?', [id])), reused: false };
    });
  }

  async function patchSession(userId, sessionId, body) {
    return withTransaction(async () => {
      const session = getOne('SELECT * FROM beading_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
      if (!session) throw new BeadingError(404, 'NOT_FOUND', '拼豆会话不存在');
      if (body.version !== undefined && Number(body.version) !== Number(session.version)) throw new BeadingError(409, 'BEADING_VERSION_CONFLICT', '会话已在其他设备更新', { session: sessionView(session) });
      if (session.status === 'pending_completion' || session.status.startsWith('completed') || session.status === 'abandoned') throw new BeadingError(409, 'BEADING_INVALID_STATE', '当前会话不可修改');
      const nextCodes = body.completedColorCodes === undefined ? parseJson(session.completed_color_codes_json, []) : [...new Set(body.completedColorCodes)];
      const nextElapsed = body.elapsedSeconds === undefined ? Number(session.elapsed_seconds || 0) : Math.max(0, Math.round(Number(body.elapsedSeconds)));
      const now = nowIso();
      db.run('UPDATE beading_sessions SET completed_color_codes_json = ?, elapsed_seconds = ?, timer_started_at = COALESCE(?, timer_started_at), version = version + 1, updated_at = ? WHERE id = ? AND version = ?', [JSON.stringify(nextCodes), nextElapsed, body.timerStartedAt || null, now, sessionId, session.version]);
      return { session: sessionView(getOne('SELECT * FROM beading_sessions WHERE id = ?', [sessionId])) };
    });
  }

  async function transition(userId, sessionId, action, body = {}) {
    return withTransaction(async () => {
      const session = getOne('SELECT * FROM beading_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
      if (!session) throw new BeadingError(404, 'NOT_FOUND', '拼豆会话不存在');
      if (body.version !== undefined && Number(body.version) !== Number(session.version)) throw new BeadingError(409, 'BEADING_VERSION_CONFLICT', '会话已在其他设备更新', { session: sessionView(session) });
      if (session.project_id) {
        const project = getOne('SELECT revision FROM projects WHERE id = ?', [session.project_id]);
        if (!project && action !== 'abandon') throw new BeadingError(409, 'BEADING_INVALID_STATE', '作品已删除');
        if (project && body.expectedProjectRevision !== undefined && Number(body.expectedProjectRevision) !== Number(project.revision) && action !== 'abandon') throw new BeadingError(409, 'BEADING_PROJECT_REVISION_MISMATCH', '作品已更新，请刷新后重试');
      }
      const nextStatus = transitionBeadingSession(session.status, action);
      const now = nowIso();
      const terminal = nextStatus === 'abandoned' || nextStatus.startsWith('completed');
      db.run('UPDATE beading_sessions SET status = ?, active_key = ?, abandoned_at = ?, completed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?', [nextStatus, terminal ? null : session.active_key, nextStatus === 'abandoned' ? now : session.abandoned_at, nextStatus.startsWith('completed') ? now : session.completed_at, now, sessionId, session.version]);
      return { session: sessionView(getOne('SELECT * FROM beading_sessions WHERE id = ?', [sessionId])) };
    });
  }

  async function complete(userId, sessionId, body = {}) {
    const deduct = body.deductInventory === true;
    const key = String(body.idempotencyKey || '').trim();
    if (!key) throw new BeadingError(400, 'INVALID_INPUT', '缺少幂等键');
    const fingerprint = createHash('sha256').update(JSON.stringify({ deduct, warehouseId: body.warehouseId || null })).digest('hex');
    return withTransaction(async () => {
      const session = getOne('SELECT * FROM beading_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
      if (!session) throw new BeadingError(404, 'NOT_FOUND', '拼豆会话不存在');
      const prior = getOne('SELECT * FROM beading_idempotency_keys WHERE user_id = ? AND session_id = ? AND idempotency_key = ?', [userId, sessionId, key]);
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) throw new BeadingError(409, 'BEADING_IDEMPOTENCY_CONFLICT', '幂等键参数不一致');
        return { replay: true, ...parseJson(prior.first_response_summary, {}) };
      }
      if (session.status !== 'pending_completion') throw new BeadingError(409, 'BEADING_INVALID_STATE', '当前会话不可完成');
      if (getOne('SELECT id FROM beading_idempotency_keys WHERE user_id = ? AND session_id = ?', [userId, sessionId])) throw new BeadingError(409, 'BEADING_IDEMPOTENCY_CONFLICT', '该会话已使用其他幂等键完成');
      let warehouse = null;
      if (deduct) {
        const result = getAvailable(body.warehouseId === undefined ? session.warehouse_id : body.warehouseId, userId);
        warehouse = result.warehouse;
        const diff = calculateInventoryDiff(parseJson(session.requirements_json, []), result.available);
        if (!diff.summary.sufficient) throw new BeadingError(409, 'BEADING_INSUFFICIENT_STOCK', '库存不足，无法扣减', diff);
        for (const item of diff.items) {
          db.run('UPDATE inventory SET quantity = quantity - ? WHERE warehouse_id = ? AND color_code = ? AND quantity >= ?', [item.required, warehouse.id, item.colorCode, item.required]);
          db.run('INSERT INTO inventory_transactions (id, warehouse_id, user_id, project_id, beading_session_id, project_name_snapshot, source, color_code, type, quantity, input_unit, input_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), warehouse.id, userId, session.project_id, session.id, session.project_name_snapshot, 'beading_completion', item.colorCode, 'out', item.required, 'count', item.required, nowIso()]);
        }
      }
      const nextStatus = deduct ? 'completed_deducted' : 'completed_without_deduction';
      const now = nowIso();
      db.run('UPDATE beading_sessions SET status = ?, active_key = NULL, inventory_deducted = ?, inventory_deduction_idempotency_key = ?, idempotency_key = ?, completed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?', [nextStatus, deduct ? 1 : 0, deduct ? key : null, key, now, now, sessionId, session.version]);
      const result = { session: sessionView(getOne('SELECT * FROM beading_sessions WHERE id = ?', [sessionId])), warehouseId: warehouse?.id || null, deducted: deduct };
      db.run('INSERT INTO beading_idempotency_keys (id, user_id, session_id, idempotency_key, request_fingerprint, first_response_summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), userId, sessionId, key, fingerprint, JSON.stringify(result), now]);
      return result;
    });
  }

  return { checkProjectInventory, checkSessionInventory, createOrReuse, patchSession, transition, complete, sessionView };
}
