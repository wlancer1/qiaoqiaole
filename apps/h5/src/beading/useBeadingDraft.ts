import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import {
  beadingDraftKey,
  normalizeBeadingDraft,
  readBeadingDraft,
  type BeadingDraft,
  type PersistedBeadingToolState,
} from './beadingSessionUtils';
import { createBeadingToolState, type BeadingToolAction, type BeadingToolState } from './beadingToolState';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type UseBeadingDraftOptions = {
  ownerId?: string;
  legacyOwnerId?: string;
  sessionId: string;
  cellCount: number;
  state: BeadingToolState;
  dispatch: Dispatch<BeadingToolAction>;
  storage?: DraftStorage;
  onWarning?: (message: string) => void;
};

export type UseBeadingDraftResult = { clearDraft(): void };

type DraftIdentity = { ownerId: string; legacyOwnerId?: string; sessionId: string; storage: DraftStorage };
type ActiveDraft = {
  identity: DraftIdentity;
  cellCount: number;
  state: BeadingToolState;
  hydrated: boolean;
  suppressed: boolean;
};
type PendingHydration = {
  identity: DraftIdentity;
  rawDraft: BeadingDraft | null;
  normalizedCellCount: number;
  persisted: PersistedBeadingToolState;
};

function warn(onWarning: ((message: string) => void) | undefined, message: string): void {
  try { onWarning?.(message); } catch { /* Warning handlers must not break draft persistence. */ }
}

function sameIdentity(left: DraftIdentity | undefined, right: DraftIdentity | undefined): boolean {
  return left?.ownerId === right?.ownerId
    && left?.sessionId === right?.sessionId
    && left?.storage === right?.storage;
}

function stateMatchesHydration(state: BeadingToolState, persisted: PersistedBeadingToolState): boolean {
  const defaults = createBeadingToolState();
  return state.interactionMode === defaults.interactionMode
    && state.activePanel === defaults.activePanel
    && state.focusMode === defaults.focusMode
    && state.highlightEnabled === persisted.highlightEnabled
    && state.locked === persisted.locked
    && state.codesVisible === persisted.codesVisible
    && state.gridVisible === persisted.gridVisible
    && state.sortMode === persisted.sortMode
    && state.markedCellIndexes.length === persisted.markedCellIndexes.length
    && state.markedCellIndexes.every((index, position) => index === persisted.markedCellIndexes[position]);
}

function draftFromState(state: BeadingToolState, cellCount: number): BeadingDraft {
  return {
    completedColorCodes: [],
    elapsedSeconds: 0,
    updatedAt: new Date().toISOString(),
    ...normalizeBeadingDraft(state, cellCount),
  };
}

function writeActiveDraft(active: ActiveDraft, onWarning?: (message: string) => void): void {
  if (!active.hydrated || active.suppressed) return;
  try {
    active.identity.storage.setItem(
      beadingDraftKey(active.identity.ownerId, active.identity.sessionId),
      JSON.stringify(draftFromState(active.state, active.cellCount)),
    );
  } catch {
    warn(onWarning, '本地草稿保存失败，存储空间可能不足。');
  }
}

export function useBeadingDraft({
  ownerId,
  legacyOwnerId,
  sessionId,
  cellCount,
  state,
  dispatch,
  storage,
  onWarning,
}: UseBeadingDraftOptions): UseBeadingDraftResult {
  const [defaultStorage, setDefaultStorage] = useState<DraftStorage>();
  const attemptedDefaultStorageRef = useRef(false);
  const warningRef = useRef(onWarning);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<ActiveDraft | undefined>(undefined);
  const pendingHydrationRef = useRef<PendingHydration | undefined>(undefined);
  const unmountGenerationRef = useRef(0);
  warningRef.current = onWarning;
  const resolvedStorage = storage ?? defaultStorage;
  const currentIdentity = ownerId && resolvedStorage
    ? { ownerId, legacyOwnerId, sessionId, storage: resolvedStorage }
    : undefined;

  const cancelTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!ownerId || storage || attemptedDefaultStorageRef.current) return;
    attemptedDefaultStorageRef.current = true;
    if (typeof window === 'undefined') return;
    try {
      setDefaultStorage(window.localStorage);
    } catch {
      warn(warningRef.current, '无法访问本地草稿存储，本次更改可能无法保存。');
    }
  }, [ownerId, storage]);

  useEffect(() => {
    const previous = activeRef.current;
    if (sameIdentity(previous?.identity, currentIdentity)) return;

    cancelTimer();
    if (previous) writeActiveDraft(previous, warningRef.current);
    pendingHydrationRef.current = undefined;
    activeRef.current = undefined;
    if (!currentIdentity) return;

    let loaded = readBeadingDraft(
      currentIdentity.storage,
      currentIdentity.ownerId,
      currentIdentity.sessionId,
      () => warn(warningRef.current, '本地草稿读取失败，已使用默认工具设置。'),
    );
    if (!loaded && currentIdentity.legacyOwnerId && currentIdentity.legacyOwnerId !== currentIdentity.ownerId) {
      loaded = readBeadingDraft(
        currentIdentity.storage,
        currentIdentity.legacyOwnerId,
        currentIdentity.sessionId,
        () => warn(warningRef.current, '旧版本地草稿读取失败，已使用默认工具设置。'),
      );
      if (loaded) {
        try {
          currentIdentity.storage.setItem(
            beadingDraftKey(currentIdentity.ownerId, currentIdentity.sessionId),
            JSON.stringify(loaded),
          );
          currentIdentity.storage.removeItem(
            beadingDraftKey(currentIdentity.legacyOwnerId, currentIdentity.sessionId),
          );
        } catch {
          warn(warningRef.current, '本地草稿迁移失败，本次仍会恢复旧版草稿。');
        }
      }
    }
    const persisted = normalizeBeadingDraft(loaded, cellCount);
    activeRef.current = {
      identity: currentIdentity,
      cellCount,
      state: createBeadingToolState(),
      hydrated: false,
      suppressed: false,
    };
    pendingHydrationRef.current = {
      identity: currentIdentity,
      rawDraft: loaded,
      normalizedCellCount: cellCount,
      persisted,
    };
    dispatch({ type: 'hydrate-persisted', state: persisted, cellCount });
  }, [dispatch, ownerId, resolvedStorage, sessionId]);

  useEffect(() => {
    const active = activeRef.current;
    if (!active?.hydrated || !sameIdentity(active.identity, currentIdentity)) return;
    const normalizedMarks = normalizeBeadingDraft(state, cellCount).markedCellIndexes;
    if (normalizedMarks.length !== state.markedCellIndexes.length
      || normalizedMarks.some((index, position) => index !== state.markedCellIndexes[position])) {
      dispatch({ type: 'set-marks', indexes: normalizedMarks, cellCount });
    }
  }, [cellCount, dispatch, ownerId, resolvedStorage, sessionId, state.markedCellIndexes]);

  useEffect(() => {
    const active = activeRef.current;
    if (!active || !sameIdentity(active.identity, currentIdentity)) return;
    const pending = pendingHydrationRef.current;
    if (pending && sameIdentity(pending.identity, currentIdentity)) {
      if (pending.normalizedCellCount !== cellCount) {
        const renormalized = normalizeBeadingDraft(pending.rawDraft, cellCount);
        pending.normalizedCellCount = cellCount;
        pending.persisted = renormalized;
        dispatch({ type: 'hydrate-persisted', state: renormalized, cellCount });
        return;
      }
      if (!stateMatchesHydration(state, pending.persisted)) return;
      active.hydrated = true;
      pendingHydrationRef.current = undefined;
    }
    active.state = state;
    active.cellCount = cellCount;
  }, [cellCount, ownerId, resolvedStorage, sessionId, state]);

  useEffect(() => {
    cancelTimer();
    const active = activeRef.current;
    if (!active || !active.hydrated || active.suppressed || !sameIdentity(active.identity, currentIdentity)) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const latest = activeRef.current;
      if (latest && sameIdentity(latest.identity, currentIdentity)) writeActiveDraft(latest, warningRef.current);
    }, 150);
    return cancelTimer;
  }, [cellCount, ownerId, resolvedStorage, sessionId, state]);

  useEffect(() => {
    const generation = ++unmountGenerationRef.current;
    return () => {
      queueMicrotask(() => {
        if (unmountGenerationRef.current !== generation) return;
        cancelTimer();
        const active = activeRef.current;
        if (active) writeActiveDraft(active, warningRef.current);
      });
    };
  }, []);

  const clearDraft = useCallback(() => {
    cancelTimer();
    const active = activeRef.current;
    if (!active) return;
    active.suppressed = true;
    try {
      active.identity.storage.removeItem(beadingDraftKey(active.identity.ownerId, active.identity.sessionId));
      if (active.identity.legacyOwnerId && active.identity.legacyOwnerId !== active.identity.ownerId) {
        active.identity.storage.removeItem(beadingDraftKey(active.identity.legacyOwnerId, active.identity.sessionId));
      }
    } catch {
      warn(warningRef.current, '本地草稿删除失败，请稍后重试。');
    }
  }, []);

  return { clearDraft };
}
