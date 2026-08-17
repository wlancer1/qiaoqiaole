import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Cell } from '@qiaoqiaole/core';
import { useAppSelector } from '../../store/hooks';
import { selectAuthToken, selectAuthUserId } from '../../store/auth/authSlice';
import { selectActiveWarehouseId, selectWarehouses } from '../../store/warehouses/warehouseSlice';
import { useScopedStatus } from '../../store/ui/useScopedStatus';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';
import { parseProjectCells } from '../../utils/projectPayload';
import type { RecentProject } from '../../shared/h5Types';
import { colorCodeOf } from '../../utils/h5AppUtils';
import type { BeadingSession, InventoryCheck } from '../../beading/beadingSessionClient';
import { BeadingSessionPage } from '../../pages/beading/BeadingSessionPage';
import { InventoryCheckSheet } from '../../pages/beading/InventoryCheckSheet';
import type { Complete, Prepare, Resume, SessionMutation, SessionTransition } from '../../pages/beading/useBeadingSessionActions';
import { PageSkeleton } from '../../loading/H5LoadingStates';
import { parseBeadingRoute } from './beadingRoute';

export type BeadingRequestApi = <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;
export type BeadingFeatureCommands = { start: (projectId: string, token?: string) => Promise<void>; hasSession: (projectId: string) => boolean };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isSession(value: unknown): value is BeadingSession {
  return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.requirements)
    && Array.isArray(value.completedColorCodes) && typeof value.status === 'string'
    && typeof value.version === 'number' && isRecord(value.progress);
}
function sessionFromError(error: unknown, expectedId: string): BeadingSession | null {
  if (!isRecord(error) || !isRecord(error.body)) return null;
  const session = error.body.session;
  return isSession(session) && session.id === expectedId ? session : null;
}

export function BeadingFeatureContent({ requestApi, requireLogin, onCommands }: {
  requestApi: BeadingRequestApi;
  requireLogin: (resume: (token: string) => void) => void;
  onCommands?: (commands: BeadingFeatureCommands) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAppSelector(selectAuthToken);
  const authUserId = useAppSelector(selectAuthUserId);
  const legacyDraftOwnerId = useAppSelector((state) => state.auth.user?.legacyDraftOwnerId ?? '');
  const activeWarehouseId = useAppSelector(selectActiveWarehouseId);
  const warehouses = useAppSelector(selectWarehouses);
  const setStatus = useScopedStatus();
  const { openConfirm, setOverlaySlot } = useAppOverlay();
  const route = parseBeadingRoute(location.pathname);
  const scope = `${location.key}:${location.pathname}:${location.search}`;
  const scopeRef = useRef(scope);
  const tokenRef = useRef(token);
  const loadSequence = useRef(0);
  const operation = useRef(0);
  const inventoryRequest = useRef(0);
  const inventoryChanging = useRef(false);
  const sessionGeneration = useRef(0);
  const sessionIdentity = useRef('');
  const currentSessionId = useRef('');
  const [session, setSession] = useState<BeadingSession | null>(null);
  const [project, setProject] = useState<RecentProject | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [inventory, setInventory] = useState<InventoryCheck | null>(null);
  scopeRef.current = scope;
  tokenRef.current = token;
  const nextSessionIdentity = `${scope}:${token ?? ''}:${session?.id ?? ''}`;
  currentSessionId.current = session?.id ?? '';
  if (sessionIdentity.current !== nextSessionIdentity) {
    sessionIdentity.current = nextSessionIdentity;
    sessionGeneration.current += 1;
    inventoryRequest.current += 1;
    inventoryChanging.current = false;
  }

  const current = useCallback((sequence: number, capturedScope: string, capturedToken: string | null) => (
    sequence === loadSequence.current && capturedScope === scopeRef.current && capturedToken === tokenRef.current
  ), []);
  const loadProject = useCallback(async (projectId: string, nextToken: string, preserveActiveSession = false) => {
    const sequence = ++loadSequence.current;
    const capturedScope = scopeRef.current;
    if (!preserveActiveSession) { setSession(null); setInventory(null); }
    setProject(null); setCells([]);
    try {
      const detail = await requestApi<{ project: RecentProject }>(`/projects/${encodeURIComponent(projectId)}`, {}, nextToken);
      if (!current(sequence, capturedScope, nextToken)) return;
      const saved = detail.project;
      const rows = Math.max(1, Math.round(saved.rows));
      const cols = Math.max(1, Math.round(saved.cols));
      setProject(saved);
      setCells(parseProjectCells(saved.canvasData, rows, cols) ?? []);
      const existing = await requestApi<{ session: BeadingSession | null }>(`/projects/${encodeURIComponent(projectId)}/beading-session`, {}, nextToken);
      if (!current(sequence, capturedScope, nextToken)) return;
      setSession(existing.session);
      if (!existing.session) setStatus('尚未开始拼豆，请从作品操作中开始。');
    } catch (error) {
      if (current(sequence, capturedScope, nextToken)) setStatus(error instanceof Error ? error.message : '拼豆作品读取失败');
    }
  }, [current, requestApi, setStatus]);
  useEffect(() => {
    if (!route) return;
    if (!token) { requireLogin(() => undefined); return; }
    void loadProject(route.projectId, token, session?.projectId === route.projectId);
    return () => { loadSequence.current += 1; operation.current += 1; };
  }, [loadProject, requireLogin, route?.projectId, session?.projectId, token]);

  const start = useCallback(async (projectId: string, tokenOverride?: string) => {
    const nextToken = tokenOverride ?? token;
    if (!nextToken) { requireLogin((authenticated) => { void start(projectId, authenticated); }); return; }
    const capturedScope = scopeRef.current;
    const op = ++operation.current;
    try {
      const created = await requestApi<{ session: BeadingSession }>(`/v1/projects/${encodeURIComponent(projectId)}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId: activeWarehouseId || undefined }) }, nextToken);
      const checked = await requestApi<InventoryCheck>(`/v1/beading-sessions/${encodeURIComponent(created.session.id)}/inventory-check`, { method: 'POST', body: JSON.stringify({}) }, nextToken);
      if (op !== operation.current || capturedScope !== scopeRef.current || nextToken !== tokenRef.current) return;
      setSession(created.session); setInventory(checked); navigate(`/projects/${encodeURIComponent(projectId)}/beading`);
    } catch (error) {
      if (op === operation.current && capturedScope === scopeRef.current && nextToken === tokenRef.current) setStatus(error instanceof Error ? error.message : '无法开始拼豆');
    }
  }, [activeWarehouseId, navigate, requestApi, requireLogin, setStatus, token]);
  useEffect(() => { onCommands?.({ start, hasSession: (projectId) => session?.projectId === projectId && ['in_progress', 'paused', 'pending_completion'].includes(session.status) }); }, [onCommands, session, start]);

  const mutate = useCallback(async (suffix: string, body: Record<string, unknown>, errorText: string): Promise<BeadingSession> => {
    const active = session;
    const capturedScope = scopeRef.current; const capturedToken = tokenRef.current; const op = ++operation.current;
    if (!active || !capturedToken) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${encodeURIComponent(active.id)}${suffix}`, { method: suffix ? 'POST' : 'PATCH', body: JSON.stringify(body) }, capturedToken);
      if (op === operation.current && capturedScope === scopeRef.current && capturedToken === tokenRef.current) setSession(payload.session);
      return payload.session;
    } catch (error) {
      const latest = sessionFromError(error, active.id);
      if (op === operation.current && capturedScope === scopeRef.current && capturedToken === tokenRef.current) { if (latest) setSession(latest); setStatus(error instanceof Error ? error.message : errorText); }
      throw error;
    }
  }, [requestApi, session, setStatus]);
  const patch: SessionMutation = useCallback(({ completedColorCodes, elapsedSeconds, version }) => mutate('', { completedColorCodes, elapsedSeconds, version }, '拼豆进度同步失败'), [mutate]);
  const pause: SessionMutation = useCallback(async ({ completedColorCodes, elapsedSeconds, version }) => {
    const patched = await patch({ completedColorCodes, elapsedSeconds, version });
    return mutate('/pause', { version: patched.version }, '无法暂停拼豆');
  }, [mutate, patch]);
  const prepare: Prepare = useCallback(({ version }) => mutate('/prepare-completion', { version }, '无法准备完成确认'), [mutate]);
  const resume: Resume = useCallback(({ version }) => mutate('/resume', { version }, '无法继续拼豆'), [mutate]);
  const returnToProgress: SessionTransition = useCallback(({ version }) => mutate('/return-to-progress', { version }, '无法返回检查'), [mutate]);
  const abandon: SessionTransition = useCallback(({ version }) => mutate('/abandon', { version }, '无法放弃会话'), [mutate]);
  const complete: Complete = useCallback(({ deduct }) => { if (!session) return Promise.reject(new Error('拼豆会话已失效')); return mutate('/complete', { idempotencyKey: `${session.id}:${deduct ? 'deduct' : 'no-deduct'}`, deductInventory: deduct, warehouseId: activeWarehouseId || undefined }, '完成拼豆失败'); }, [activeWarehouseId, mutate, session]);
  const openInventory = useCallback(async () => {
    const active = session; const capturedScope = scopeRef.current; const capturedToken = tokenRef.current; const generation = sessionGeneration.current; const request = ++inventoryRequest.current;
    if (!active || !capturedToken) throw new Error('拼豆会话已失效');
    const isCurrent = () => request === inventoryRequest.current && generation === sessionGeneration.current && capturedScope === scopeRef.current && capturedToken === tokenRef.current && active.id === currentSessionId.current;
    try {
      const payload = await requestApi<InventoryCheck>(`/v1/beading-sessions/${encodeURIComponent(active.id)}/inventory-check`, { method: 'POST', body: JSON.stringify({}) }, capturedToken);
      if (isCurrent()) setInventory(payload);
    } catch (error) {
      if (isCurrent()) setStatus(error instanceof Error ? error.message : '库存检测失败');
      throw error;
    }
  }, [requestApi, session, setStatus]);
  const changeWarehouse = useCallback(async (warehouseId: string) => {
    if (inventoryChanging.current) return;
    const active = session; const capturedScope = scopeRef.current; const capturedToken = tokenRef.current; const generation = sessionGeneration.current; const request = ++inventoryRequest.current;
    if (!active || !capturedToken) return;
    inventoryChanging.current = true;
    const isCurrent = () => request === inventoryRequest.current && generation === sessionGeneration.current && capturedScope === scopeRef.current && capturedToken === tokenRef.current && active.id === currentSessionId.current;
    try {
      const payload = await requestApi<InventoryCheck>(`/v1/beading-sessions/${encodeURIComponent(active.id)}/inventory-check`, { method: 'POST', body: JSON.stringify({ warehouseId: warehouseId || undefined }) }, capturedToken);
      if (isCurrent()) setInventory(payload);
    } catch (error) {
      if (isCurrent()) setStatus(error instanceof Error ? error.message : '库存检测失败');
      throw error;
    } finally {
      if (isCurrent()) inventoryChanging.current = false;
    }
  }, [requestApi, session, setStatus]);
  useEffect(() => { setOverlaySlot('inventory', inventory ? <InventoryCheckSheet result={inventory} warehouseId={inventory.warehouseId || ''} warehouseOptions={warehouses} onWarehouseChange={changeWarehouse} onClose={() => setInventory(null)} onStart={() => { setInventory(null); }} /> : null); }, [changeWarehouse, inventory, setOverlaySlot, warehouses]);
  useEffect(() => () => setOverlaySlot('inventory', null), [setOverlaySlot]);

  if (!route) return location.pathname === '/beading' ? <Navigate to="/projects" replace /> : null;
  if (!session || !project) return <PageSkeleton kind="editor" label="正在加载拼豆进度" />;
  return <BeadingSessionPage session={session} cells={cells} rows={project.rows} cols={project.cols} getCode={colorCodeOf} onPatch={patch} onPause={pause} onReturnToProgress={returnToProgress} onAbandon={abandon} onPrepareCompletion={prepare} onComplete={complete} onResume={resume} onOpenInventory={openInventory} onSessionConflict={setSession} draftOwnerId={authUserId || undefined} legacyDraftOwnerId={legacyDraftOwnerId || undefined} onStatus={setStatus} onExit={() => navigate(`/projects/${encodeURIComponent(route.projectId)}/edit`)} requestConfirm={openConfirm} confirmDialog={null} status="" />;
}
