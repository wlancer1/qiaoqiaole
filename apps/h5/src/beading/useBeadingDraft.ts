import { useCallback, useEffect, useRef, type Dispatch } from 'react';
import {
  beadingDraftKey,
  normalizeBeadingDraft,
  readBeadingDraft,
  type BeadingDraft,
} from './beadingSessionUtils';
import type { BeadingToolAction, BeadingToolState } from './beadingToolState';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type UseBeadingDraftOptions = {
  ownerId?: string;
  sessionId: string;
  cellCount: number;
  state: BeadingToolState;
  dispatch: Dispatch<BeadingToolAction>;
  storage?: DraftStorage;
  onWarning?: (message: string) => void;
};

export type UseBeadingDraftResult = { clearDraft(): void };

type LatestDraftContext = {
  ownerId?: string;
  sessionId: string;
  cellCount: number;
  state: BeadingToolState;
  storage?: DraftStorage;
  onWarning?: (message: string) => void;
};

function warn(onWarning: ((message: string) => void) | undefined, message: string): void {
  try { onWarning?.(message); } catch { /* Warning handlers must not break draft persistence. */ }
}

function browserStorage(onWarning?: (message: string) => void): DraftStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    warn(onWarning, '无法访问本地草稿存储，本次更改可能无法保存。');
    return undefined;
  }
}

function draftFromState(state: BeadingToolState, cellCount: number): BeadingDraft {
  const normalized = normalizeBeadingDraft(state, cellCount);
  return {
    completedColorCodes: [],
    elapsedSeconds: 0,
    updatedAt: new Date().toISOString(),
    ...normalized,
  };
}

function writeLatestDraft(context: LatestDraftContext, suppressed: boolean): void {
  const { ownerId, sessionId, cellCount, state, onWarning } = context;
  if (!ownerId || !context.storage || suppressed) return;
  try {
    context.storage.setItem(beadingDraftKey(ownerId, sessionId), JSON.stringify(draftFromState(state, cellCount)));
  } catch {
    warn(onWarning, '本地草稿保存失败，存储空间可能不足。');
  }
}

export function useBeadingDraft({
  ownerId,
  sessionId,
  cellCount,
  state,
  dispatch,
  storage,
  onWarning,
}: UseBeadingDraftOptions): UseBeadingDraftResult {
  const resolvedStorage = storage ?? browserStorage(onWarning);
  const loadedKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedRef = useRef(false);
  const latestContextRef = useRef<LatestDraftContext>({
    ownerId,
    sessionId,
    cellCount,
    state,
    storage: resolvedStorage,
    onWarning,
  });
  latestContextRef.current = {
    ownerId,
    sessionId,
    cellCount,
    state,
    storage: resolvedStorage,
    onWarning,
  };

  useEffect(() => {
    if (!ownerId || !resolvedStorage) return;
    const key = beadingDraftKey(ownerId, sessionId);
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    suppressedRef.current = false;
    const draft = readBeadingDraft(resolvedStorage, ownerId, sessionId, () => {
      warn(onWarning, '本地草稿读取失败，已使用默认工具设置。');
    });
    if (!draft) return;

    const restored = normalizeBeadingDraft(draft, cellCount);
    dispatch({ type: 'set-marks', indexes: restored.markedCellIndexes, cellCount });
    dispatch({ type: 'set-sort', sortMode: restored.sortMode });
    if (restored.highlightEnabled !== state.highlightEnabled) dispatch({ type: 'toggle-highlight' });
    if (restored.locked !== state.locked) dispatch({ type: 'toggle-lock' });
    if (restored.codesVisible !== state.codesVisible) dispatch({ type: 'toggle-codes' });
    if (restored.gridVisible !== state.gridVisible) dispatch({ type: 'toggle-grid' });
  }, [cellCount, dispatch, onWarning, ownerId, resolvedStorage, sessionId, state.codesVisible, state.gridVisible, state.highlightEnabled, state.locked]);

  useEffect(() => {
    const normalizedMarks = normalizeBeadingDraft(state, cellCount).markedCellIndexes;
    if (normalizedMarks.length !== state.markedCellIndexes.length
      || normalizedMarks.some((index, position) => index !== state.markedCellIndexes[position])) {
      dispatch({ type: 'set-marks', indexes: normalizedMarks, cellCount });
    }
  }, [cellCount, dispatch, state.markedCellIndexes]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!ownerId || !resolvedStorage || suppressedRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      writeLatestDraft(latestContextRef.current, suppressedRef.current);
    }, 150);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cellCount, ownerId, resolvedStorage, sessionId, state]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    writeLatestDraft(latestContextRef.current, suppressedRef.current);
  }, []);

  const clearDraft = useCallback(() => {
    suppressedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const context = latestContextRef.current;
    if (!context.ownerId || !context.storage) return;
    try {
      context.storage.removeItem(beadingDraftKey(context.ownerId, context.sessionId));
    } catch {
      warn(context.onWarning, '本地草稿删除失败，请稍后重试。');
    }
  }, []);

  return { clearDraft };
}
