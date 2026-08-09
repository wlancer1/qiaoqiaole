import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

type Action = Exclude<PendingAction, null>;
type Operation = {
  action: Action;
  generation: number;
  sessionId: string;
  token: symbol;
  input: UseBeadingSessionActionsInput;
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请重试';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBeadingSession(value: unknown): value is BeadingSession {
  if (!isRecord(value)) return false;
  const requirements = value.requirements;
  const completedColorCodes = value.completedColorCodes;
  const progress = value.progress;
  return typeof value.id === 'string'
    && isNullableString(value.projectId)
    && typeof value.projectName === 'string'
    && Array.isArray(requirements)
    && requirements.every((item) => isRecord(item)
      && typeof item.colorCode === 'string'
      && isFiniteNumber(item.required))
    && isNullableString(value.warehouseId)
    && isNullableString(value.warehouseName)
    && typeof value.status === 'string'
    && Array.isArray(completedColorCodes)
    && completedColorCodes.every((code) => typeof code === 'string')
    && isRecord(progress)
    && isFiniteNumber(progress.completed)
    && isFiniteNumber(progress.total)
    && isFiniteNumber(progress.percent)
    && isFiniteNumber(value.elapsedSeconds)
    && isNullableString(value.timerStartedAt)
    && typeof value.inventoryDeducted === 'boolean'
    && Number.isInteger(value.version)
    && (value.version as number) >= 0;
}

export function isSessionConflictError(
  error: unknown,
  expectedSessionId: string,
): error is { status: 409; code: 'BEADING_VERSION_CONFLICT'; body: { session: BeadingSession } } {
  if (!isRecord(error)
    || error.status !== 409
    || error.code !== 'BEADING_VERSION_CONFLICT'
    || !isRecord(error.body)
    || !isBeadingSession(error.body.session)) return false;
  return error.body.session.id === expectedSessionId;
}

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

function nextIncompleteCode(session: BeadingSession): string | null {
  const completed = new Set(session.completedColorCodes);
  return uniqueCodes(session.requirements.map(({ colorCode }) => colorCode))
    .find((code) => !completed.has(code)) ?? null;
}

function safeStatus(input: UseBeadingSessionActionsInput, message: string): void {
  try {
    input.onStatus(message);
  } catch {
    // Status UI is advisory and cannot alter remote action semantics.
  }
}

function safeNotify<T>(input: UseBeadingSessionActionsInput, callback: (value: T) => void, value: T): boolean {
  try {
    callback(value);
    return true;
  } catch {
    safeStatus(input, '界面更新失败，请刷新');
    return false;
  }
}

export function useBeadingSessionActions(input: UseBeadingSessionActionsInput): UseBeadingSessionActionsResult {
  const committedInputRef = useRef(input);
  const lifecycleCounterRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const restoredPendingKeysRef = useRef(new Set<string>());
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useLayoutEffect(() => {
    const generation = ++lifecycleCounterRef.current;
    activeGenerationRef.current = generation;
    return () => {
      if (activeGenerationRef.current !== generation) return;
      activeGenerationRef.current = null;
      operationRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const previousSessionId = committedInputRef.current.session.id;
    committedInputRef.current = input;
    if (previousSessionId === input.session.id) return;
    operationRef.current = null;
    setPendingAction(null);
  });

  useEffect(() => {
    if (input.session.status !== 'pending_completion') return;
    const key = `${input.session.id}:${input.session.version}`;
    if (restoredPendingKeysRef.current.has(key)) return;
    if (safeNotify(input, input.onPrepared, input.session)) restoredPendingKeysRef.current.add(key);
  }, [input.session.id, input.session.status, input.session.version]);

  const begin = useCallback((action: Action): Operation | null => {
    const generation = activeGenerationRef.current;
    if (generation === null || operationRef.current !== null) return null;
    const committed = committedInputRef.current;
    const operation: Operation = {
      action,
      generation,
      sessionId: committed.session.id,
      token: Symbol(action),
      input: { ...committed },
    };
    operationRef.current = operation;
    setPendingAction(action);
    return operation;
  }, []);

  const isCurrent = useCallback((operation: Operation): boolean => (
    activeGenerationRef.current === operation.generation
    && committedInputRef.current.session.id === operation.sessionId
    && operationRef.current?.token === operation.token
  ), []);

  const transition = useCallback((operation: Operation, action: Action): boolean => {
    if (!isCurrent(operation)) return false;
    operation.action = action;
    setPendingAction(action);
    return true;
  }, [isCurrent]);

  const finish = useCallback((operation: Operation): void => {
    if (operationRef.current?.token !== operation.token) return;
    operationRef.current = null;
    setPendingAction(null);
  }, []);

  const reportError = useCallback((operation: Operation, error: unknown): void => {
    let message = errorMessage(error);
    if (isSessionConflictError(error, operation.sessionId)) {
      message = '进度已更新，请重试';
      safeNotify(operation.input, operation.input.onSessionConflict, error.body.session);
    }
    safeStatus(operation.input, message);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const operation = begin('save');
    if (!operation) return false;
    const { input: snapshot } = operation;
    try {
      await snapshot.onPatch({
        completedColorCodes: uniqueCodes(snapshot.session.completedColorCodes),
        elapsedSeconds: snapshot.elapsedSeconds,
        version: snapshot.session.version,
      });
      return isCurrent(operation);
    } catch (error) {
      if (!isCurrent(operation)) return false;
      reportError(operation, error);
      return false;
    } finally {
      finish(operation);
    }
  }, [begin, finish, isCurrent, reportError]);

  const completeCurrent = useCallback(async (): Promise<boolean> => {
    const committed = committedInputRef.current;
    if (!committed.currentColor || committed.session.completedColorCodes.includes(committed.currentColor)) return false;
    const operation = begin('patch');
    if (!operation) return false;
    const { input: snapshot } = operation;
    const currentColor = snapshot.currentColor!;

    try {
      let patched: BeadingSession;
      try {
        patched = await snapshot.onPatch({
          completedColorCodes: uniqueCodes([...snapshot.session.completedColorCodes, currentColor]),
          elapsedSeconds: snapshot.elapsedSeconds,
          version: snapshot.session.version,
        });
      } catch (error) {
        if (!isCurrent(operation)) return false;
        reportError(operation, error);
        return false;
      }
      if (!isCurrent(operation)) return false;

      const nextIncomplete = nextIncompleteCode(patched);
      safeNotify(snapshot, snapshot.onCurrentChange, nextIncomplete);
      if (!isCurrent(operation)) return false;
      if (nextIncomplete !== null) return true;
      if (!transition(operation, 'prepare')) return false;

      let prepared: BeadingSession;
      try {
        prepared = await snapshot.onPrepareCompletion({ version: patched.version });
      } catch (error) {
        if (!isCurrent(operation)) return false;
        reportError(operation, error);
        return false;
      }
      if (!isCurrent(operation)) return false;
      safeNotify(snapshot, snapshot.onPrepared, prepared);
      return true;
    } finally {
      finish(operation);
    }
  }, [begin, finish, isCurrent, reportError, transition]);

  const retryPrepare = useCallback(async (): Promise<boolean> => {
    const committed = committedInputRef.current;
    if (!['in_progress', 'paused'].includes(committed.session.status)
      || nextIncompleteCode(committed.session) !== null) return false;
    const operation = begin('prepare');
    if (!operation) return false;
    try {
      let prepared: BeadingSession;
      try {
        prepared = await operation.input.onPrepareCompletion({ version: operation.input.session.version });
      } catch (error) {
        if (!isCurrent(operation)) return false;
        reportError(operation, error);
        return false;
      }
      if (!isCurrent(operation)) return false;
      safeNotify(operation.input, operation.input.onPrepared, prepared);
      return true;
    } finally {
      finish(operation);
    }
  }, [begin, finish, isCurrent, reportError]);

  const openInventory = useCallback(async (): Promise<boolean> => {
    const operation = begin('inventory');
    if (!operation) return false;
    try {
      try {
        await operation.input.onOpenInventory();
      } catch (error) {
        if (!isCurrent(operation)) return false;
        reportError(operation, error);
        return false;
      }
      return isCurrent(operation);
    } finally {
      finish(operation);
    }
  }, [begin, finish, isCurrent, reportError]);

  const resume = useCallback(async (): Promise<boolean> => {
    const operation = begin('resume');
    if (!operation) return false;
    try {
      try {
        await operation.input.onResume({ version: operation.input.session.version });
      } catch (error) {
        if (!isCurrent(operation)) return false;
        reportError(operation, error);
        return false;
      }
      if (!isCurrent(operation)) return false;
      safeStatus(operation.input, '已继续计时');
      return true;
    } finally {
      finish(operation);
    }
  }, [begin, finish, isCurrent, reportError]);

  const complete = useCallback(async (deduct: boolean): Promise<boolean> => {
    const operation = begin('complete');
    if (!operation) return false;
    try {
      let completed: BeadingSession;
      try {
        completed = await operation.input.onComplete({ deduct });
      } catch (error) {
        if (!isCurrent(operation)) return false;
        reportError(operation, error);
        return false;
      }
      if (!isCurrent(operation)) return false;
      safeNotify(operation.input, operation.input.onCompleted, completed);
      return true;
    } finally {
      finish(operation);
    }
  }, [begin, finish, isCurrent, reportError]);

  return { pendingAction, save, completeCurrent, retryPrepare, openInventory, resume, complete };
}
