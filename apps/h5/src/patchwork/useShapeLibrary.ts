import { useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { H5RootState } from '../store/store';
import { shapeApi } from './shapeApi';
import { readShapeTemplates, SHAPE_TEMPLATES_KEY, type ShapeTemplate } from './shapeLibrary';

type Filter = 'recent' | 'favorite' | 'all';
const pendingKey = (id: string) => SHAPE_TEMPLATES_KEY + ':pending:' + id;
function readPending(id: string): ShapeTemplate[] {
  try { const value = JSON.parse(localStorage.getItem(pendingKey(id)) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
export function useShapeLibrary() {
  const auth = useAppSelector((state) => state.auth);
  const accountId = auth.status === 'authenticated' ? auth.user?.id || '' : '';
  const dispatch = useAppDispatch();
  const store = useStore<H5RootState>();
  const [browse, setBrowse] = useState<{ query: string; filter: Filter }>({ query: '', filter: 'recent' });
  const [local, setLocal] = useState<{ owner: string; shapes: ShapeTemplate[] }>(() => ({ owner: '', shapes: readShapeTemplates() }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && store.getState().auth.sessionVersion === auth.sessionVersion && store.getState().auth.token === auth.token;
  const result = shapeApi.useListPatchworkShapesInfiniteQuery({ accountId, ...browse }, { skip: !accountId });
  const server = result.currentData?.pages.flatMap((page) => page.shapes.map(({ previewPoints, ...shape }) => ({ ...shape, points: previewPoints, remote: true }))) || [];
  const pending = local.owner === accountId ? local.shapes : [];
  const templates: ShapeTemplate[] = accountId ? [...server.filter((s) => !pending.some((p) => p.id === s.id)), ...pending] : auth.status === 'anonymous' ? pending : [];
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const persist = (shapes: ShapeTemplate[]) => {
    const operation = async () => {
      if (!current()) return false;
      setSaving(true); setError('');
      let stagedLocally = false;
      try {
        if (!accountId) {
          if (auth.status !== 'anonymous') throw new Error('账号正在恢复，请稍后重试');
          localStorage.setItem(SHAPE_TEMPLATES_KEY, JSON.stringify(shapes));
          setLocal({ owner: '', shapes }); return true;
        }
        const staged = readPending(accountId);
        for (const shape of [...pending, ...shapes]) {
          const index = staged.findIndex((s) => s.id === shape.id);
          if (index < 0) staged.push(shape); else staged[index] = shape;
        }
        // Stage on this account before sending, so an interrupted upload is retryable.
        try { localStorage.setItem(pendingKey(accountId), JSON.stringify(staged)); stagedLocally = true; } catch { /* Online saves can proceed when local storage is full. */ }
        setLocal({ owner: accountId, shapes: staged });
        let remaining = staged;
        for (const shape of staged) {
          if (!current()) return false;
          const request = dispatch(shapeApi.endpoints.savePatchworkShape.initiate({ accountId, shape }));
          try { await request.unwrap(); } finally { request.reset(); }
          if (!current()) return false;
          remaining = remaining.filter((s) => s.id !== shape.id);
          try { localStorage.setItem(pendingKey(accountId), JSON.stringify(remaining)); } catch { /* The server already has this shape. */ }
          setLocal({ owner: accountId, shapes: remaining });
        }
        return true;
      } catch {
        if (current()) setError(accountId ? (stagedLocally ? '云端保存未完成，形状已暂存，请重试' : '云端保存未完成，且本机无法暂存，请保持页面并重试') : '形状保存失败，请检查浏览器存储空间');
        return false;
      } finally { if (current()) setSaving(false); }
    };
    const task = queue.current.then(operation, operation);
    queue.current = task;
    return task;
  };
  useEffect(() => {
    setError(''); setSaving(false);
    if (!accountId) { setLocal({ owner: '', shapes: auth.status === 'anonymous' ? readShapeTemplates() : [] }); return; }
    const staged = readPending(accountId);
    const legacy = readShapeTemplates();
    try {
      // Claim old unscoped local shapes for this account before any request.
      const combined = [...staged, ...legacy.filter((s) => !staged.some((p) => p.id === s.id))];
      localStorage.setItem(pendingKey(accountId), JSON.stringify(combined));
      localStorage.removeItem(SHAPE_TEMPLATES_KEY);
      setLocal({ owner: accountId, shapes: combined });
      if (combined.length) void persist(combined);
    } catch { setError('无法迁移本机形状，请检查浏览器存储空间'); }
  // A new auth session must never reuse another account's local pending data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, auth.sessionVersion]);
  const updateTemplates = (next: ShapeTemplate[]) => persist(accountId ? next.filter((shape) => {
    const previous = templates.find((s) => s.id === shape.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(shape);
  }) : next);
  const resolveTemplate = async (id: string) => {
    if (!current()) throw new Error('账号已切换，请重新选择形状');
    const localShape = templates.find((s) => s.id === id);
    if (localShape && !localShape.remote) return localShape;
    if (!accountId) throw new Error('形状不存在');
    const request = dispatch(shapeApi.endpoints.getPatchworkShape.initiate({ accountId, id }, { forceRefetch: true }));
    try {
      const { shape } = await request.unwrap();
      if (!current()) throw new Error('账号已切换，请重新选择形状');
      return shape;
    } finally { request.unsubscribe(); }
  };
  return {
    templates, updateTemplates, resolveTemplate, setBrowse, saving,
    loading: Boolean(accountId && result.isFetching),
    hasMore: Boolean(accountId && result.hasNextPage),
    loadMore: () => { if (accountId && result.hasNextPage && !result.isFetching) void result.fetchNextPage(); },
    error: error || (accountId && result.isError ? '形状列表加载失败，请重试' : ''),
    retry: () => { if (accountId) { void persist(pending); void result.refetch(); } },
    accountId,
  };
}
