import { createBeadingToolState, type BeadingToolState, type SortMode } from './beadingToolState';

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

export type PersistedBeadingToolState = Pick<
  BeadingToolState,
  'markedCellIndexes' | 'highlightEnabled' | 'locked' | 'codesVisible' | 'gridVisible' | 'sortMode'
>;

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
  try {
    const raw = storage.getItem(beadingDraftKey(userId, sessionId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as BeadingDraft;
    return Array.isArray(draft.completedColorCodes) ? draft : null;
  } catch (error) {
    onError?.(error);
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
