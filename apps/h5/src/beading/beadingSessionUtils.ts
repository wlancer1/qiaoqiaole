import { createBeadingToolState, type PersistedBeadingToolState, type SortMode } from './beadingToolState';

export type { PersistedBeadingToolState } from './beadingToolState';

export type BeadingRequirement = { colorCode: string; required: number };
export type BeadingProgress = { completed: number; total: number; percent: number };

export function completionProgress(requirements: BeadingRequirement[], completedColorCodes: string[]): BeadingProgress {
  const codes = new Set(requirements.map((item) => item.colorCode));
  const completed = new Set(completedColorCodes.filter((code) => codes.has(code))).size;
  const total = codes.size;
  return { completed, total, percent: total === 0 ? 0 : Math.floor((completed / total) * 100) };
}

export function nextIncompleteColor(requirements: BeadingRequirement[], completedColorCodes: string[], current?: string): string | null {
  const completed = new Set(completedColorCodes);
  const start = current ? requirements.findIndex((item) => item.colorCode === current) : -1;
  return requirements.slice(Math.max(0, start + 1)).find((item) => !completed.has(item.colorCode))?.colorCode
    ?? requirements.find((item) => !completed.has(item.colorCode))?.colorCode
    ?? null;
}

export function beadingDraftKey(userId: string, sessionId: string): string {
  return `qiaoqiaole.beading-draft:${userId}:${sessionId}`;
}

export type BeadingDraft = {
  completedColorCodes: string[];
  elapsedSeconds: number;
  updatedAt: string;
  markedCellIndexes?: number[];
  highlightEnabled?: boolean;
  locked?: boolean;
  codesVisible?: boolean;
  gridVisible?: boolean;
  sortMode?: SortMode;
};

export function normalizeBeadingDraft(raw: unknown, cellCount: number): PersistedBeadingToolState {
  const defaults = createBeadingToolState();
  const draft = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const markedCellIndexes = Array.isArray(draft.markedCellIndexes)
    ? [...new Set(draft.markedCellIndexes.filter(
      (index): index is number => Number.isInteger(index) && Number(index) >= 0 && Number(index) < cellCount,
    ) as number[])].sort((left, right) => left - right)
    : defaults.markedCellIndexes;
  const sortMode = draft.sortMode === 'canvas' || draft.sortMode === 'remaining' || draft.sortMode === 'code'
    ? draft.sortMode
    : defaults.sortMode;

  return {
    markedCellIndexes,
    highlightEnabled: typeof draft.highlightEnabled === 'boolean' ? draft.highlightEnabled : defaults.highlightEnabled,
    locked: typeof draft.locked === 'boolean' ? draft.locked : defaults.locked,
    codesVisible: typeof draft.codesVisible === 'boolean' ? draft.codesVisible : defaults.codesVisible,
    gridVisible: typeof draft.gridVisible === 'boolean' ? draft.gridVisible : defaults.gridVisible,
    sortMode,
  };
}

export function readBeadingDraft(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
  sessionId: string,
  onError?: (error: unknown) => void,
): BeadingDraft | null {
  const reportError = (error: unknown) => {
    try { onError?.(error); } catch { /* Error reporting must remain non-blocking. */ }
  };

  try {
    const raw = storage.getItem(beadingDraftKey(userId, sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      reportError(new Error('Invalid beading draft object'));
      return null;
    }
    const value = parsed as Record<string, unknown>;
    const completedColorCodes = value.completedColorCodes === undefined ? [] : value.completedColorCodes;
    const elapsedSeconds = value.elapsedSeconds === undefined ? 0 : value.elapsedSeconds;
    const updatedAt = value.updatedAt === undefined ? '' : value.updatedAt;
    if (!Array.isArray(completedColorCodes) || !completedColorCodes.every((code) => typeof code === 'string')
      || typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0
      || typeof updatedAt !== 'string') {
      reportError(new Error('Invalid legacy beading draft fields'));
      return null;
    }

    const draft: BeadingDraft = { completedColorCodes, elapsedSeconds, updatedAt };
    if (Array.isArray(value.markedCellIndexes)) {
      draft.markedCellIndexes = value.markedCellIndexes.filter((index): index is number => typeof index === 'number');
    }
    if (typeof value.highlightEnabled === 'boolean') draft.highlightEnabled = value.highlightEnabled;
    if (typeof value.locked === 'boolean') draft.locked = value.locked;
    if (typeof value.codesVisible === 'boolean') draft.codesVisible = value.codesVisible;
    if (typeof value.gridVisible === 'boolean') draft.gridVisible = value.gridVisible;
    if (value.sortMode === 'canvas' || value.sortMode === 'remaining' || value.sortMode === 'code') draft.sortMode = value.sortMode;
    return draft;
  } catch (error) {
    reportError(error);
    return null;
  }
}

export function writeBeadingDraft(storage: Pick<Storage, 'setItem'>, userId: string, sessionId: string, draft: BeadingDraft): void {
  storage.setItem(beadingDraftKey(userId, sessionId), JSON.stringify(draft));
}

export function clearBeadingDraft(storage: Pick<Storage, 'removeItem'>, userId: string, sessionId: string): void {
  storage.removeItem(beadingDraftKey(userId, sessionId));
}

export function canCompleteOffline(isOnline: boolean): boolean { return isOnline; }
