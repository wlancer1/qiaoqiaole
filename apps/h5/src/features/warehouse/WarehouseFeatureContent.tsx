import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MARD_221_COLORS } from '@qiaoqiaole/core';
import { WarehouseListPage } from '../../pages/warehouse/WarehouseListPage';
import { WarehousePage } from '../../pages/warehouse/WarehousePage';
import { PageLoadBoundary, PageSkeleton } from '../../loading/H5LoadingStates';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAuthToken } from '../../store/auth/authSlice';
import { activeWarehouseChanged, inventoryLoaded, selectActiveWarehouseId, selectWarehouseInventory, selectWarehouses, warehousesLoaded } from '../../store/warehouses/warehouseSlice';
import { fetchWarehouseInventory } from '../../store/warehouses/warehouseThunks';
import { useScopedStatus } from '../../store/ui/useScopedStatus';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';
import type { Warehouse, WarehouseUnit } from '../../shared/h5Types';
import { parseWarehouseRoute } from './warehouseRoute';
import { isWarehouseOperationCurrent } from './warehouseOperationGuard';
import { CompositionSafeInput } from '../../shared/CompositionSafeInput';

const BEADS_PER_GRAM = 15;
const WAREHOUSE_LETTERS = ['全部', ...Array.from(new Set(MARD_221_COLORS.map((color) => color.code.charAt(0))))];
const API_BASE = '/api';

export type WarehouseFeatureCommands = { refresh: (token?: string) => Promise<void>; clear: () => void };

export function WarehouseFeatureContent({ requireLogin, onCommands }: {
  requireLogin: (resume: (token: string) => void) => Promise<boolean> | void;
  onCommands?: (commands: WarehouseFeatureCommands) => void;
}) {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAppSelector(selectAuthToken);
  const warehouses = useAppSelector(selectWarehouses);
  const activeWarehouseId = useAppSelector(selectActiveWarehouseId);
  const beadStock = useAppSelector(selectWarehouseInventory);
  const setStatus = useScopedStatus();
  const { openConfirm, setOverlaySlot } = useAppOverlay();
  const route = useMemo(() => parseWarehouseRoute(location.pathname), [location.pathname]);
  const scope = `${location.key}:${location.pathname}:${location.search}`;
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const createGateRef = useRef(false);
  const createResumeHandledRef = useRef(false);
  const createGateScopeRef = useRef(scope);
  const [name, setName] = useState('默认豆子仓库');
  const [remark, setRemark] = useState('');
  const [search, setSearch] = useState('');
  const [letter, setLetter] = useState('全部');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [unit, setUnit] = useState<WarehouseUnit>('count');
  const [amount, setAmount] = useState('100');
  const activeIdRef = useRef(activeWarehouseId);
  const warehousesRequest = useRef(0);
  const inventoryRequest = useRef(0);
  const operation = useRef(0);
  const scopeRef = useRef(scope);
  const tokenRef = useRef(token);
  scopeRef.current = scope;
  tokenRef.current = token;
  if (createGateScopeRef.current !== scope) {
    createGateScopeRef.current = scope;
    createGateRef.current = false;
    createResumeHandledRef.current = false;
  }
  useEffect(() => { activeIdRef.current = activeWarehouseId; }, [activeWarehouseId]);
  useEffect(() => () => { warehousesRequest.current += 1; inventoryRequest.current += 1; operation.current += 1; }, []);

  const loadInventory = useCallback(async (warehouseId: string, nextToken = token) => {
    if (!warehouseId || !nextToken) return;
    const sequence = ++inventoryRequest.current;
    const capturedScope = scopeRef.current;
    dispatch(inventoryLoaded({}));
    try {
      const inventory = await dispatch(fetchWarehouseInventory({ warehouseId, token: nextToken })).unwrap();
      if (sequence === inventoryRequest.current && capturedScope === scopeRef.current && nextToken === tokenRef.current && activeIdRef.current === warehouseId) dispatch(inventoryLoaded(inventory));
    } catch (error) {
      if (sequence === inventoryRequest.current && capturedScope === scopeRef.current && nextToken === tokenRef.current) setStatus(error instanceof Error ? error.message : '库存读取失败');
    }
  }, [dispatch, setStatus, token]);

  const refresh = useCallback(async (nextToken = token) => {
    if (!nextToken) return;
    const sequence = ++warehousesRequest.current;
    const capturedScope = scopeRef.current;
    setWarehousesLoading(true);
    try {
      const response = await fetch(`${API_BASE}/warehouses`, { headers: { authorization: `Bearer ${nextToken}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '仓库读取失败');
      if (sequence !== warehousesRequest.current || capturedScope !== scopeRef.current || nextToken !== tokenRef.current) return;
      const items = (data as { warehouses: Warehouse[] }).warehouses;
      dispatch(warehousesLoaded(items));
      if (!activeIdRef.current && items[0]) {
        activeIdRef.current = items[0].id;
        dispatch(activeWarehouseChanged(items[0].id));
        void loadInventory(items[0].id, nextToken);
      }
    } catch (error) { if (sequence === warehousesRequest.current && capturedScope === scopeRef.current && nextToken === tokenRef.current) setStatus(error instanceof Error ? error.message : '仓库读取失败'); }
    finally { if (sequence === warehousesRequest.current && capturedScope === scopeRef.current && nextToken === tokenRef.current) setWarehousesLoading(false); }
  }, [dispatch, loadInventory, setStatus, token]);

  const clear = useCallback(() => { operation.current += 1; warehousesRequest.current += 1; inventoryRequest.current += 1; dispatch(warehousesLoaded([])); dispatch(activeWarehouseChanged('')); dispatch(inventoryLoaded({})); }, [dispatch]);
  useEffect(() => { onCommands?.({ refresh, clear }); }, [clear, onCommands, refresh]);
  useEffect(() => { if (token && route) void refresh(token); }, [refresh, route, token]);
  useEffect(() => {
    if (route?.kind !== 'detail' || !token || route.warehouseId === activeWarehouseId) return;
    activeIdRef.current = route.warehouseId;
    dispatch(activeWarehouseChanged(route.warehouseId));
    setSelectedCodes([]);
    void loadInventory(route.warehouseId, token);
  }, [activeWarehouseId, dispatch, loadInventory, route, token]);

  const request = useCallback(async <T,>(path: string, init: RequestInit, nextToken = token): Promise<T> => {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${nextToken}`, ...(init.headers ?? {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || '请求失败');
    return data as T;
  }, [token]);
  const withLogin = (work: (authenticatedToken: string) => void) => {
    if (token) { work(token); return Promise.resolve(true); }
    return Promise.resolve(requireLogin(work)).then(Boolean);
  };
  const create = useCallback(() => {
    if (createGateRef.current) return;
    createGateRef.current = true;
    createResumeHandledRef.current = false;
    const capturedScope = scopeRef.current;
    const loginResult = withLogin((nextToken) => { void (async () => {
    if (createResumeHandledRef.current) return;
    createResumeHandledRef.current = true;
    const trimmed = name.trim(); if (!trimmed) { createGateRef.current = false; createResumeHandledRef.current = false; setStatus('请输入仓库名称。'); return; }
    const op = ++operation.current; const capturedScope = scopeRef.current;
    setCreating(true);
    try { const payload = await request<{ warehouse: Warehouse }>('/warehouses', { method: 'POST', body: JSON.stringify({ name: trimmed, remark }) }, nextToken);
      if (!isWarehouseOperationCurrent({ operation: op, currentOperation: operation.current, scope: capturedScope, currentScope: scopeRef.current, token: nextToken, currentToken: tokenRef.current })) return;
      dispatch(warehousesLoaded([payload.warehouse, ...warehouses])); dispatch(activeWarehouseChanged(payload.warehouse.id)); activeIdRef.current = payload.warehouse.id; dispatch(inventoryLoaded({})); setSelectedCodes([]); setShowCreate(false);
    } catch (error) { if (isWarehouseOperationCurrent({ operation: op, currentOperation: operation.current, scope: capturedScope, currentScope: scopeRef.current, token: nextToken, currentToken: tokenRef.current })) setStatus(error instanceof Error ? error.message : '创建仓库失败'); }
    finally { if (capturedScope === scopeRef.current) { createGateRef.current = false; createResumeHandledRef.current = false; setCreating(false); } }
    })(); });
    void loginResult.then((authenticated) => {
      if (!authenticated && capturedScope === scopeRef.current) {
        createGateRef.current = false;
        createResumeHandledRef.current = false;
        setCreating(false);
      }
    });
  }, [creating, dispatch, name, remark, request, requireLogin, setStatus, warehouses]);
  const remove = (warehouseId: string) => { const capturedScope = scopeRef.current; const capturedToken = tokenRef.current; void (async () => { const op = ++operation.current; try { await request(`/warehouses/${encodeURIComponent(warehouseId)}`, { method: 'DELETE' }); if (!isWarehouseOperationCurrent({ operation: op, currentOperation: operation.current, scope: capturedScope, currentScope: scopeRef.current, token: capturedToken, currentToken: tokenRef.current })) return; const items = warehouses.filter((item) => item.id !== warehouseId); dispatch(warehousesLoaded(items)); if (activeIdRef.current === warehouseId) { activeIdRef.current = ''; dispatch(activeWarehouseChanged('')); dispatch(inventoryLoaded({})); setSelectedCodes([]); } } catch (error) { if (isWarehouseOperationCurrent({ operation: op, currentOperation: operation.current, scope: capturedScope, currentScope: scopeRef.current, token: capturedToken, currentToken: tokenRef.current })) setStatus(error instanceof Error ? error.message : '删除仓库失败'); } })(); };
  const apply = (direction: 'in' | 'out') => withLogin((nextToken) => { void (async () => { if (!selectedCodes.length) { setStatus('请先选择需要操作的色号。'); return; } if (!activeWarehouseId) { setStatus('请先创建或选择仓库。'); return; } const numeric = Number.parseFloat(amount); if (!Number.isFinite(numeric) || numeric <= 0) { setStatus('请输入有效的入库或出库数量。'); return; } const op = ++operation.current; const capturedScope = scopeRef.current; try { const payload = await request<{ inventory: Record<string, number> }>(`/warehouses/${encodeURIComponent(activeWarehouseId)}/inventory`, { method: 'POST', body: JSON.stringify({ codes: selectedCodes, type: direction, quantity: Math.max(1, Math.round(unit === 'gram' ? numeric * BEADS_PER_GRAM : numeric)), inputUnit: unit, inputValue: numeric }) }, nextToken); if (!isWarehouseOperationCurrent({ operation: op, currentOperation: operation.current, scope: capturedScope, currentScope: scopeRef.current, token: nextToken, currentToken: tokenRef.current })) return; dispatch(inventoryLoaded(payload.inventory)); const total = Object.values(payload.inventory).reduce((sum, count) => sum + count, 0); const stocked = Object.values(payload.inventory).filter((count) => count > 0).length; dispatch(warehousesLoaded(warehouses.map((item) => item.id === activeWarehouseId ? { ...item, stockedColorCount: stocked, totalWarehouseStock: total } : item))); setStatus(direction === 'in' ? '入库成功' : '出库成功'); } catch (error) { if (isWarehouseOperationCurrent({ operation: op, currentOperation: operation.current, scope: capturedScope, currentScope: scopeRef.current, token: nextToken, currentToken: tokenRef.current })) setStatus(error instanceof Error ? error.message : '库存操作失败'); } })(); });
  const colors = useMemo(() => { const query = search.trim().toLowerCase(); return MARD_221_COLORS.filter((color) => (letter === '全部' || color.code.startsWith(letter)) && (!query || color.code.toLowerCase().includes(query))); }, [letter, search]);
  const active = warehouses.find((item) => item.id === activeWarehouseId) ?? null;
  const total = Object.values(beadStock).reduce((sum, count) => sum + count, 0); const stocked = Object.values(beadStock).filter((count) => count > 0).length;
  useEffect(() => { setOverlaySlot('warehouse', showCreate ? <WarehouseCreateOverlay name={name} remark={remark} pending={creating} setName={setName} setRemark={setRemark} onClose={() => { if (!creating) setShowCreate(false); }} onCreate={create} /> : null); }, [create, creating, name, remark, setOverlaySlot, showCreate]);
  useEffect(() => () => setOverlaySlot('warehouse', null), [setOverlaySlot]);
  if (!route) return null;
  if (route.kind === 'list') {
    return <PageLoadBoundary loading={warehousesLoading} loadingLabel="正在加载仓库列表" loadingDescription="正在读取你的仓库和库存"><WarehouseListPage status="" warehouses={warehouses} activeWarehouseId={activeWarehouseId} openWarehouseDetail={(id: string) => withLogin((nextToken) => { activeIdRef.current = id; dispatch(activeWarehouseChanged(id)); setSelectedCodes([]); navigate(`/warehouses/${encodeURIComponent(id)}`); void loadInventory(id, nextToken); })} openCreate={() => setShowCreate(true)} requestConfirm={(requestConfirm: any) => openConfirm(requestConfirm)} deleteWarehouse={remove} onBack={() => navigate('/profile')} /></PageLoadBoundary>;
  }
  if (route.warehouseId !== activeWarehouseId) return <PageSkeleton kind="warehouse" label="正在加载仓库" />;
  return <WarehousePage status="" onBack={() => navigate('/warehouses')} activeWarehouse={active} stockedColorCount={stocked} totalWarehouseStock={total} missingColorCount={MARD_221_COLORS.length - stocked} warehouseLetters={WAREHOUSE_LETTERS} warehouseSearch={search} setWarehouseSearch={setSearch} warehouseLetter={letter} setWarehouseLetter={setLetter} selectedWarehouseCodes={selectedCodes} setSelectedWarehouseCodes={setSelectedCodes} selectedWarehouseCount={selectedCodes.length} selectVisibleWarehouseColors={() => setSelectedCodes((current) => Array.from(new Set([...current, ...colors.map((color) => color.code)])))} invertVisibleWarehouseColors={() => setSelectedCodes((current) => { const visible = new Set(colors.map((color) => color.code)); return MARD_221_COLORS.filter((color) => visible.has(color.code) ? !current.includes(color.code) : current.includes(color.code)).map((color) => color.code); })} warehouseColors={colors} beadStock={beadStock} toggleWarehouseCode={(code: string) => setSelectedCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])} warehouseUnit={unit} setWarehouseUnit={setUnit} warehouseAmount={amount} setWarehouseAmount={setAmount} applyWarehouseChange={apply} beadsPerGram={BEADS_PER_GRAM} />;
}

export function WarehouseCreateOverlay({ name, remark, pending, setName, setRemark, onClose, onCreate }: any) {
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) onClose(); }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [onClose, pending]);
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return <div className="home-create-modal" role="dialog" aria-modal="true" aria-label="新建豆子仓库" onClick={onClose} onTouchStart={stop}><div className="home-create-panel" onClick={stop} onTouchStart={stop}><div className="home-create-head"><strong>新建豆子仓库</strong><button type="button" aria-label="关闭新建仓库" disabled={pending} onClick={onClose}>关闭</button></div><div className="login-form"><label><span>仓库名称</span><CompositionSafeInput autoFocus type="text" aria-label="仓库名称" value={name} onValueChange={setName} /></label><label><span>备注</span><CompositionSafeInput type="text" aria-label="仓库备注" value={remark} onValueChange={setRemark} /></label></div><button className="home-create-submit warehouse-create-submit" type="button" disabled={pending} onClick={onCreate}>{pending ? '创建中…' : '创建仓库'}</button></div></div>;
}
