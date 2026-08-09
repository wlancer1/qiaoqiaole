import { useCallback, useEffect, useRef, useState } from 'react';
import type { BeadingSession } from '../../beading/beadingSessionClient';

export type SessionMutation = (input: {
  completedColorCodes: string[];
  elapsedSeconds: number;
  version: number;
}) => Promise<BeadingSession>;
export type Prepare = (input: { version: number }) => Promise<BeadingSession>;
export type Complete = (input: { deduct: boolean }) => Promise<BeadingSession>;
export type Resume = (input: { version: number }) => Promise<BeadingSession>;
export type PendingAction = null | 'save' | 'inventory' | 'patch' | 'prepare' | 'complete' | 'resume';

export type UseBeadingSessionActionsInput = {
  session: BeadingSession;
  elapsedSeconds: number;
  currentColor: string | null;
  onPatch: SessionMutation;
  onPrepareCompletion: Prepare;
  onComplete: Complete;
  onResume: Resume;
  onOpenInventory: () => Promise<void>;
  onSessionConflict: (session: BeadingSession) => void;
  onStatus: (message: string) => void;
  onCurrentChange: (code: string | null) => void;
  onPrepared: (session: BeadingSession) => void;
  onCompleted: (session: BeadingSession) => void;
};

export type UseBeadingSessionActionsResult = {
  pendingAction: PendingAction;
  save(): Promise<boolean>;
  completeCurrent(): Promise<boolean>;
  retryPrepare(): Promise<boolean>;
  openInventory(): Promise<boolean>;
  resume(): Promise<boolean>;
  complete(deduct: boolean): Promise<boolean>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请重试';
}

export function isSessionConflictError(error: unknown): error is { body: { session: BeadingSession } } {
  if (typeof error !== 'object' || error === null || !('body' in error)) return false;
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null || !('session' in body)) return false;
  const conflictSession = (body as { session?: unknown }).session;
  return typeof conflictSession === 'object'
    && conflictSession !== null
    && typeof (conflictSession as { id?: unknown }).id === 'string'
    && typeof (conflictSession as { version?: unknown }).version === 'number';
}

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

function nextIncompleteCode(session: BeadingSession): string | null {
  const completed = new Set(session.completedColorCodes);
  return uniqueCodes(session.requirements.map(({ colorCode }) => colorCode))
    .find((code) => !completed.has(code)) ?? null;
}

export function useBeadingSessionActions(input: UseBeadingSessionActionsInput): UseBeadingSessionActionsResult {
  const latestRef = useRef(input);
  latestRef.current = input;
  const pendingRef = useRef<PendingAction>(null);
  const restoredPendingKeysRef = useRef(new Set<string>());
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    if (input.session.status !== 'pending_completion') return;
    const key = `${input.session.id}:${input.session.version}`;
    if (restoredPendingKeysRef.current.has(key)) return;
    restoredPendingKeysRef.current.add(key);
    latestRef.current.onPrepared(input.session);
  }, [input.session.id, input.session.status, input.session.version]);

  const begin = useCallback((action: Exclude<PendingAction, null>): boolean => {
    if (pendingRef.current !== null) return false;
    pendingRef.current = action;
    setPendingAction(action);
    return true;
  }, []);

  const transition = useCallback((from: Exclude<PendingAction, null>, to: Exclude<PendingAction, null>): boolean => {
    if (pendingRef.current !== from) return false;
    pendingRef.current = to;
    setPendingAction(to);
    return true;
  }, []);

  const finish = useCallback((action: Exclude<PendingAction, null>) => {
    if (pendingRef.current !== action) return;
    pendingRef.current = null;
    setPendingAction(null);
  }, []);

  const showStatus = useCallback((message: string) => {
    try {
      latestRef.current.onStatus(message);
    } catch {
      // Status UI is advisory and must not alter the action result or lock.
    }
  }, []);

  const reportError = useCallback((error: unknown) => {
    let message = errorMessage(error);
    if (isSessionConflictError(error)) {
      message = '进度已更新，请重试';
      try {
        latestRef.current.onSessionConflict(error.body.session);
      } catch {
        // Keep error presentation independent from conflict reconciliation.
      }
    }
    showStatus(message);
  }, [showStatus]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!begin('save')) return false;
    const snapshot = latestRef.current;
    const sessionSnapshot = snapshot.session;
    try {
      await snapshot.onPatch({
        completedColorCodes: uniqueCodes(sessionSnapshot.completedColorCodes),
        elapsedSeconds: snapshot.elapsedSeconds,
        version: sessionSnapshot.version,
      });
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      finish('save');
    }
  }, [begin, finish, reportError]);

  const completeCurrent = useCallback(async (): Promise<boolean> => {
    const snapshot = latestRef.current;
    const sessionSnapshot = snapshot.session;
    const currentColor = snapshot.currentColor;
    if (!currentColor || sessionSnapshot.completedColorCodes.includes(currentColor) || !begin('patch')) return false;

    let ownedAction: Exclude<PendingAction, null> = 'patch';
    try {
      const patched = await snapshot.onPatch({
        completedColorCodes: uniqueCodes([...sessionSnapshot.completedColorCodes, currentColor]),
        elapsedSeconds: snapshot.elapsedSeconds,
        version: sessionSnapshot.version,
      });
      const nextIncomplete = nextIncompleteCode(patched);
      latestRef.current.onCurrentChange(nextIncomplete);
      if (nextIncomplete !== null) return true;

      if (!transition('patch', 'prepare')) return false;
      ownedAction = 'prepare';
      const prepared = await latestRef.current.onPrepareCompletion({ version: patched.version });
      latestRef.current.onPrepared(prepared);
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      finish(ownedAction);
    }
  }, [begin, finish, reportError, transition]);

  const retryPrepare = useCallback(async (): Promise<boolean> => {
    const sessionSnapshot = latestRef.current.session;
    if (sessionSnapshot.status === 'pending_completion'
      || sessionSnapshot.status.startsWith('completed')
      || nextIncompleteCode(sessionSnapshot) !== null
      || !begin('prepare')) return false;
    try {
      const prepared = await latestRef.current.onPrepareCompletion({ version: sessionSnapshot.version });
      latestRef.current.onPrepared(prepared);
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      finish('prepare');
    }
  }, [begin, finish, reportError]);

  const openInventory = useCallback(async (): Promise<boolean> => {
    if (!begin('inventory')) return false;
    try {
      await latestRef.current.onOpenInventory();
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      finish('inventory');
    }
  }, [begin, finish, reportError]);

  const resume = useCallback(async (): Promise<boolean> => {
    const sessionSnapshot = latestRef.current.session;
    if (!begin('resume')) return false;
    try {
      await latestRef.current.onResume({ version: sessionSnapshot.version });
      showStatus('已继续计时');
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      finish('resume');
    }
  }, [begin, finish, reportError, showStatus]);

  const complete = useCallback(async (deduct: boolean): Promise<boolean> => {
    if (!begin('complete')) return false;
    try {
      const completed = await latestRef.current.onComplete({ deduct });
      latestRef.current.onCompleted(completed);
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      finish('complete');
    }
  }, [begin, finish, reportError]);

  return {
    pendingAction,
    save,
    completeCurrent,
    retryPrepare,
    openInventory,
    resume,
    complete,
  };
}
