const PROJECT_FOLDER_HISTORY_KEY = '__qiaoqiaoleProjectFolderSheet';

type HistoryLike = Pick<History, 'state' | 'pushState' | 'back'>;

export function isProjectFolderHistorySentinel(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[PROJECT_FOLDER_HISTORY_KEY] === true;
}

export function ensureProjectFolderHistorySentinel(history: HistoryLike, url: string): boolean {
  if (isProjectFolderHistorySentinel(history.state)) return false;
  const base = typeof history.state === 'object' && history.state !== null ? history.state : {};
  history.pushState({ ...base, [PROJECT_FOLDER_HISTORY_KEY]: true }, '', url);
  return true;
}

export function consumeProjectFolderHistorySentinel(history: HistoryLike): boolean {
  if (!isProjectFolderHistorySentinel(history.state)) return false;
  history.back();
  return true;
}

export function resolveProjectFolderHistoryPop({ createOpen, createPending, moveOpen, movePending }: { createOpen: boolean; createPending: boolean; moveOpen: boolean; movePending: boolean }) {
  if (createOpen) return { close: createPending ? null : 'create' as const, retainSentinel: createPending || moveOpen };
  if (moveOpen) return { close: movePending ? null : 'move' as const, retainSentinel: movePending };
  return { close: null, retainSentinel: false };
}
