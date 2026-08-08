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

export type BeadingDraft = { completedColorCodes: string[]; elapsedSeconds: number; updatedAt: string };

export function readBeadingDraft(storage: Pick<Storage, 'getItem'>, userId: string, sessionId: string): BeadingDraft | null {
  try {
    const raw = storage.getItem(beadingDraftKey(userId, sessionId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as BeadingDraft;
    return Array.isArray(draft.completedColorCodes) ? draft : null;
  } catch { return null; }
}

export function writeBeadingDraft(storage: Pick<Storage, 'setItem'>, userId: string, sessionId: string, draft: BeadingDraft): void {
  storage.setItem(beadingDraftKey(userId, sessionId), JSON.stringify(draft));
}

export function clearBeadingDraft(storage: Pick<Storage, 'removeItem'>, userId: string, sessionId: string): void {
  storage.removeItem(beadingDraftKey(userId, sessionId));
}

export function canCompleteOffline(isOnline: boolean): boolean { return isOnline; }
