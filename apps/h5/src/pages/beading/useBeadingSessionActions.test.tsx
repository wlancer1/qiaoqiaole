import { StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeadingSession } from '../../beading/beadingSessionClient';
import {
  useBeadingSessionActions,
  type UseBeadingSessionActionsInput,
  type UseBeadingSessionActionsResult,
} from './useBeadingSessionActions';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function session(overrides: Partial<BeadingSession> = {}): BeadingSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    projectName: '小熊',
    requirements: [
      { colorCode: 'A1', required: 2 },
      { colorCode: 'B2', required: 3 },
    ],
    warehouseId: null,
    warehouseName: null,
    status: 'in_progress',
    completedColorCodes: [],
    progress: { completed: 0, total: 2, percent: 0 },
    elapsedSeconds: 12,
    timerStartedAt: null,
    inventoryDeducted: false,
    version: 4,
    ...overrides,
  };
}

function defaultProps(overrides: Partial<UseBeadingSessionActionsInput> = {}): UseBeadingSessionActionsInput {
  return {
    session: session(),
    elapsedSeconds: 19,
    currentColor: 'A1',
    onPatch: vi.fn(async () => session()),
    onPrepareCompletion: vi.fn(async () => session({ status: 'pending_completion' })),
    onComplete: vi.fn(async () => session({ status: 'completed_deducted' })),
    onResume: vi.fn(async () => session({ status: 'in_progress' })),
    onOpenInventory: vi.fn(async () => undefined),
    onSessionConflict: vi.fn(),
    onStatus: vi.fn(),
    onCurrentChange: vi.fn(),
    onPrepared: vi.fn(),
    onCompleted: vi.fn(),
    ...overrides,
  };
}

const harnessCleanups = new Set<() => void>();

function createHarness() {
  const control = { current: null as UseBeadingSessionActionsResult | null };
  let renderer: ReactTestRenderer | null = null;

  function Harness(props: UseBeadingSessionActionsInput) {
    control.current = useBeadingSessionActions(props);
    return null;
  }

  const tree = (props: UseBeadingSessionActionsInput) => (
    <StrictMode><Harness {...props} /></StrictMode>
  );

  const harness = {
    control,
    async mount(props: UseBeadingSessionActionsInput) {
      harnessCleanups.add(harness.unmount);
      await act(async () => { renderer = create(tree(props)); });
    },
    async update(props: UseBeadingSessionActionsInput) {
      await act(async () => { renderer!.update(tree(props)); });
    },
    unmount: () => {
      if (!renderer) return;
      act(() => { renderer!.unmount(); });
      renderer = null;
      harnessCleanups.delete(harness.unmount);
    },
  };
  return harness;
}

describe('useBeadingSessionActions', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const originalConsoleError = console.error;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (args[0] === 'react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer') return;
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    for (const cleanup of [...harnessCleanups]) cleanup();
    consoleErrorSpy.mockRestore();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('serializes completeCurrent and blocks every other action while PATCH is pending', async () => {
    const patch = deferred<BeadingSession>();
    const onPatch = vi.fn(() => patch.promise);
    const onPrepareCompletion = vi.fn(async () => session());
    const onCurrentChange = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onPatch, onPrepareCompletion, onCurrentChange }));

    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    let competing!: Promise<boolean>;
    act(() => {
      first = harness.control.current!.completeCurrent();
      duplicate = harness.control.current!.completeCurrent();
      competing = harness.control.current!.save();
    });

    expect(harness.control.current!.pendingAction).toBe('patch');
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ completedColorCodes: ['A1'], elapsedSeconds: 19, version: 4 });
    expect(await duplicate).toBe(false);
    expect(await competing).toBe(false);
    expect(onCurrentChange).not.toHaveBeenCalled();
    expect(onPrepareCompletion).not.toHaveBeenCalled();

    await act(async () => { patch.resolve(session({ completedColorCodes: ['A1'], version: 5 })); });

    expect(await first).toBe(true);
    expect(onCurrentChange).toHaveBeenCalledWith('B2');
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it('uses only the PATCH response to decide completion and prepare version', async () => {
    const patch = deferred<BeadingSession>();
    const prepared = session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'], version: 10 });
    const onPatch = vi.fn(() => patch.promise);
    const onPrepareCompletion = vi.fn(async () => prepared);
    const onPrepared = vi.fn();
    const onCurrentChange = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({
      session: session({ completedColorCodes: ['A1'], version: 7 }),
      currentColor: 'B2',
      onPatch,
      onPrepareCompletion,
      onPrepared,
      onCurrentChange,
    }));

    let result!: Promise<boolean>;
    act(() => { result = harness.control.current!.completeCurrent(); });
    expect(onPrepareCompletion).not.toHaveBeenCalled();

    await act(async () => {
      patch.resolve(session({ completedColorCodes: ['B2', 'A1', 'B2'], version: 9 }));
      await patch.promise;
    });

    expect(await result).toBe(true);
    expect(onCurrentChange).toHaveBeenCalledWith(null);
    expect(onPrepareCompletion).toHaveBeenCalledWith({ version: 9 });
    expect(onPrepared).toHaveBeenCalledWith(prepared);
  });

  it('does not change color or prepare when PATCH fails', async () => {
    const onPatch = vi.fn(async () => { throw new Error('保存断线'); });
    const onCurrentChange = vi.fn();
    const onPrepareCompletion = vi.fn(async () => session());
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onPatch, onCurrentChange, onPrepareCompletion, onStatus }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.completeCurrent(); });

    expect(result).toBe(false);
    expect(onCurrentChange).not.toHaveBeenCalled();
    expect(onPrepareCompletion).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('保存断线');
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it('retries only prepare after a successful terminal PATCH and failed prepare', async () => {
    const patched = session({ completedColorCodes: ['A1', 'B2'], version: 8 });
    const onPatch = vi.fn(async () => patched);
    const onPrepareCompletion = vi.fn()
      .mockRejectedValueOnce(new Error('结算失败'))
      .mockResolvedValueOnce(session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'], version: 9 }));
    const onPrepared = vi.fn();
    const onCurrentChange = vi.fn();
    const harness = createHarness();
    const initialProps = defaultProps({
      session: session({ completedColorCodes: ['A1'], version: 7 }),
      currentColor: 'B2',
      onPatch,
      onPrepareCompletion,
      onPrepared,
      onCurrentChange,
    });
    await harness.mount(initialProps);

    let completed!: boolean;
    await act(async () => { completed = await harness.control.current!.completeCurrent(); });
    expect(completed).toBe(false);
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPrepareCompletion).toHaveBeenLastCalledWith({ version: 8 });
    expect(onCurrentChange).toHaveBeenCalledWith(null);

    await harness.update({ ...initialProps, session: patched, currentColor: null });
    let retried!: boolean;
    await act(async () => { retried = await harness.control.current!.retryPrepare(); });

    expect(retried).toBe(true);
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPrepareCompletion).toHaveBeenLastCalledWith({ version: 8 });
    expect(onPrepareCompletion).toHaveBeenCalledTimes(2);
    expect(onPrepared).toHaveBeenCalledTimes(1);
  });

  it('rejects retryPrepare unless all unique required colors are complete and status is nonterminal', async () => {
    const onPrepareCompletion = vi.fn(async () => session());
    const harness = createHarness();
    const props = defaultProps({ onPrepareCompletion });
    await harness.mount(props);

    expect(await harness.control.current!.retryPrepare()).toBe(false);
    await harness.update({
      ...props,
      session: session({
        requirements: [{ colorCode: 'A1', required: 1 }, { colorCode: 'A1', required: 2 }],
        completedColorCodes: ['A1'],
        status: 'completed_without_deduction',
      }),
    });
    expect(await harness.control.current!.retryPrepare()).toBe(false);
    expect(onPrepareCompletion).not.toHaveBeenCalled();
  });

  it('restores a pending completion once per session id and version in StrictMode', async () => {
    const onPrepared = vi.fn();
    const harness = createHarness();
    const pending = session({ status: 'pending_completion', version: 11 });
    const props = defaultProps({ session: pending, onPrepared });

    await harness.mount(props);
    await harness.update({ ...props, elapsedSeconds: 99 });
    expect(onPrepared).toHaveBeenCalledTimes(1);
    expect(onPrepared).toHaveBeenCalledWith(pending);

    const newer = session({ status: 'pending_completion', version: 12 });
    await harness.update({ ...props, session: newer });
    expect(onPrepared).toHaveBeenCalledTimes(2);
    expect(onPrepared).toHaveBeenLastCalledWith(newer);
  });

  it('reports only a valid full version conflict for the action session', async () => {
    const latest = session({ version: 22 });
    const onSessionConflict = vi.fn();
    const onStatus = vi.fn();
    const onPatch = vi.fn(async () => {
      throw Object.assign(new Error('conflict'), {
        status: 409,
        code: 'BEADING_VERSION_CONFLICT',
        body: { session: latest },
      });
    });
    const harness = createHarness();
    await harness.mount(defaultProps({ onPatch, onSessionConflict, onStatus }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.save(); });

    expect(result).toBe(false);
    expect(onSessionConflict).toHaveBeenCalledWith(latest);
    expect(onStatus).toHaveBeenCalledWith('进度已更新，请重试');
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it.each([
    {
      name: 'non-409',
      error: Object.assign(new Error('真实错误'), {
        status: 400,
        code: 'BEADING_VERSION_CONFLICT',
        body: { session: session({ version: 22 }) },
      }),
    },
    {
      name: 'wrong code',
      error: Object.assign(new Error('真实错误'), {
        status: 409,
        code: 'BEADING_INVALID_STATE',
        body: { session: session({ version: 22 }) },
      }),
    },
    {
      name: 'wrong session id',
      error: Object.assign(new Error('真实错误'), {
        status: 409,
        code: 'BEADING_VERSION_CONFLICT',
        body: { session: session({ id: 'session-other', version: 22 }) },
      }),
    },
    {
      name: 'malformed session',
      error: Object.assign(new Error('真实错误'), {
        status: 409,
        code: 'BEADING_VERSION_CONFLICT',
        body: { session: { ...session({ version: 22 }), progress: { completed: 1 } } },
      }),
    },
  ])('keeps the real message and ignores body.session for $name errors', async ({ error }) => {
    const onSessionConflict = vi.fn();
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({
      onPatch: vi.fn(async () => { throw error; }),
      onSessionConflict,
      onStatus,
    }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.save(); });

    expect(result).toBe(false);
    expect(onSessionConflict).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('真实错误');
  });

  it.each(['abandoned', 'future_terminal'])('does not retry prepare from status %s', async (status) => {
    const onPrepareCompletion = vi.fn(async () => session());
    const harness = createHarness();
    await harness.mount(defaultProps({
      session: session({ status, completedColorCodes: ['A1', 'B2'] }),
      onPrepareCompletion,
    }));

    expect(await harness.control.current!.retryPrepare()).toBe(false);
    expect(onPrepareCompletion).not.toHaveBeenCalled();
  });

  it('lets an action reference from an old render use the latest props and callbacks', async () => {
    const firstPatch = vi.fn(async () => session());
    const latestPatch = vi.fn(async () => session({ version: 31 }));
    const harness = createHarness();
    const oldProps = defaultProps({ onPatch: firstPatch });
    await harness.mount(oldProps);
    const staleSave = harness.control.current!.save;

    await harness.update({
      ...oldProps,
      session: session({ completedColorCodes: ['B2'], version: 30 }),
      elapsedSeconds: 77,
      onPatch: latestPatch,
    });
    let result!: boolean;
    await act(async () => { result = await staleSave(); });

    expect(result).toBe(true);
    expect(firstPatch).not.toHaveBeenCalled();
    expect(latestPatch).toHaveBeenCalledWith({ completedColorCodes: ['B2'], elapsedSeconds: 77, version: 30 });
  });

  it('freezes committed callbacks for an action that is already pending', async () => {
    const patch = deferred<BeadingSession>();
    const oldPrepare = vi.fn(async () => session({ status: 'pending_completion', version: 6 }));
    const latestPrepare = vi.fn(async () => session({ status: 'pending_completion', version: 7 }));
    const oldPrepared = vi.fn();
    const latestPrepared = vi.fn();
    const harness = createHarness();
    const props = defaultProps({
      session: session({ completedColorCodes: ['A1'] }),
      currentColor: 'B2',
      onPatch: vi.fn(() => patch.promise),
      onPrepareCompletion: oldPrepare,
      onPrepared: oldPrepared,
    });
    await harness.mount(props);
    let result!: Promise<boolean>;
    act(() => { result = harness.control.current!.completeCurrent(); });

    await harness.update({ ...props, onPrepareCompletion: latestPrepare, onPrepared: latestPrepared });
    await act(async () => { patch.resolve(session({ completedColorCodes: ['A1', 'B2'], version: 6 })); });

    expect(await result).toBe(true);
    expect(oldPrepare).toHaveBeenCalledWith({ version: 6 });
    expect(latestPrepare).not.toHaveBeenCalled();
    expect(oldPrepared).toHaveBeenCalledWith(session({ status: 'pending_completion', version: 6 }));
    expect(latestPrepared).not.toHaveBeenCalled();
  });

  it('invalidates session A immediately on switching to B and ignores A response side effects', async () => {
    const patchA = deferred<BeadingSession>();
    const onPatchA = vi.fn(() => patchA.promise);
    const onCurrentChangeA = vi.fn();
    const onPrepareA = vi.fn(async () => session());
    const onPreparedA = vi.fn();
    const onStatusA = vi.fn();
    const patchB = deferred<BeadingSession>();
    const onPatchB = vi.fn(() => patchB.promise);
    const harness = createHarness();
    const propsA = defaultProps({
      onPatch: onPatchA,
      onCurrentChange: onCurrentChangeA,
      onPrepareCompletion: onPrepareA,
      onPrepared: onPreparedA,
      onStatus: onStatusA,
    });
    await harness.mount(propsA);

    let actionA!: Promise<boolean>;
    act(() => { actionA = harness.control.current!.completeCurrent(); });
    expect(harness.control.current!.pendingAction).toBe('patch');

    await harness.update(defaultProps({
      session: session({ id: 'session-B', version: 1 }),
      onPatch: onPatchB,
    }));
    expect(harness.control.current!.pendingAction).toBeNull();
    let actionB!: Promise<boolean>;
    act(() => { actionB = harness.control.current!.save(); });
    expect(onPatchB).toHaveBeenCalledTimes(1);
    expect(harness.control.current!.pendingAction).toBe('save');

    await act(async () => { patchA.resolve(session({ completedColorCodes: ['A1', 'B2'], version: 5 })); });
    expect(await actionA).toBe(false);
    expect(onCurrentChangeA).not.toHaveBeenCalled();
    expect(onPrepareA).not.toHaveBeenCalled();
    expect(onPreparedA).not.toHaveBeenCalled();
    expect(onStatusA).not.toHaveBeenCalled();
    expect(harness.control.current!.pendingAction).toBe('save');

    await act(async () => { patchB.resolve(session({ id: 'session-B', version: 2 })); });
    expect(await actionB).toBe(true);
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it('silently invalidates a pending action on real unmount', async () => {
    const patch = deferred<BeadingSession>();
    const onPatch = vi.fn(() => patch.promise);
    const onStatus = vi.fn();
    const onCurrentChange = vi.fn();
    const onPrepared = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onPatch, onStatus, onCurrentChange, onPrepared }));
    consoleErrorSpy.mockClear();

    let result!: Promise<boolean>;
    act(() => { result = harness.control.current!.completeCurrent(); });
    harness.unmount();
    await act(async () => { patch.reject(new Error('late failure')); });

    expect(await result).toBe(false);
    expect(onStatus).not.toHaveBeenCalled();
    expect(onCurrentChange).not.toHaveBeenCalled();
    expect(onPrepared).not.toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).not.toMatch(/state update|not wrapped in act/i);
  });

  it('continues prepare and returns true when onCurrentChange throws after PATCH succeeds', async () => {
    const patched = session({ completedColorCodes: ['A1', 'B2'], version: 8 });
    const prepared = session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'], version: 9 });
    const onPatch = vi.fn(async () => patched);
    const onCurrentChange = vi.fn(() => { throw new Error('render color failed'); });
    const onPrepareCompletion = vi.fn(async () => prepared);
    const onPrepared = vi.fn();
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({
      session: session({ completedColorCodes: ['A1'], version: 7 }),
      currentColor: 'B2',
      onPatch,
      onCurrentChange,
      onPrepareCompletion,
      onPrepared,
      onStatus,
    }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.completeCurrent(); });

    expect(result).toBe(true);
    expect(onPrepareCompletion).toHaveBeenCalledWith({ version: 8 });
    expect(onPrepared).toHaveBeenCalledWith(prepared);
    expect(onStatus).toHaveBeenCalledWith('界面更新失败，请刷新');
  });

  it('returns true when onPrepared throws after prepare succeeds', async () => {
    const prepared = session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'], version: 9 });
    const onPrepared = vi.fn(() => { throw new Error('dialog failed'); });
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({
      session: session({ completedColorCodes: ['A1'], version: 7 }),
      currentColor: 'B2',
      onPatch: vi.fn(async () => session({ completedColorCodes: ['A1', 'B2'], version: 8 })),
      onPrepareCompletion: vi.fn(async () => prepared),
      onPrepared,
      onStatus,
    }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.completeCurrent(); });

    expect(result).toBe(true);
    expect(onPrepared).toHaveBeenCalledWith(prepared);
    expect(onStatus).toHaveBeenCalledWith('界面更新失败，请刷新');
  });

  it('returns true without encouraging a remote retry when onCompleted throws', async () => {
    const completed = session({ status: 'completed_deducted', version: 20 });
    const onComplete = vi.fn(async () => completed);
    const onCompleted = vi.fn(() => { throw new Error('clear failed'); });
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onComplete, onCompleted, onStatus }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.complete(true); });

    expect(result).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith(completed);
    expect(onStatus).toHaveBeenCalledWith('界面更新失败，请刷新');
  });

  it('isolates pending-completion restoration callback failures in StrictMode', async () => {
    const onPrepared = vi.fn(() => { throw new Error('dialog failed'); });
    const onStatus = vi.fn();
    const onPatch = vi.fn(async () => session({ status: 'pending_completion', version: 12 }));
    const harness = createHarness();

    await expect(harness.mount(defaultProps({
      session: session({ status: 'pending_completion', version: 11 }),
      onPrepared,
      onStatus,
      onPatch,
    }))).resolves.toBeUndefined();

    expect(onPrepared).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledWith('界面更新失败，请刷新');
    let saved!: boolean;
    await act(async () => { saved = await harness.control.current!.save(); });
    expect(saved).toBe(true);
  });

  it('saves the snapshot without changing page state and unlocks after failure', async () => {
    const onPatch = vi.fn(async () => { throw new Error('保存失败'); });
    const onCurrentChange = vi.fn();
    const onPrepared = vi.fn();
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onPatch, onCurrentChange, onPrepared, onStatus }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.save(); });

    expect(result).toBe(false);
    expect(onCurrentChange).not.toHaveBeenCalled();
    expect(onPrepared).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('保存失败');
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it.each([
    { currentColor: null, completedColorCodes: [] },
    { currentColor: 'A1', completedColorCodes: ['A1'] },
  ])('does not PATCH when currentColor=$currentColor is unavailable', async ({ currentColor, completedColorCodes }) => {
    const onPatch = vi.fn(async () => session());
    const harness = createHarness();
    await harness.mount(defaultProps({
      session: session({ completedColorCodes }),
      currentColor,
      onPatch,
    }));

    expect(await harness.control.current!.completeCurrent()).toBe(false);
    expect(onPatch).not.toHaveBeenCalled();
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it('opens inventory once and rejects competing actions until it settles', async () => {
    const inventory = deferred<void>();
    const onOpenInventory = vi.fn(() => inventory.promise);
    const onResume = vi.fn(async () => session());
    const harness = createHarness();
    await harness.mount(defaultProps({ onOpenInventory, onResume }));

    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    let competing!: Promise<boolean>;
    act(() => {
      first = harness.control.current!.openInventory();
      duplicate = harness.control.current!.openInventory();
      competing = harness.control.current!.resume();
    });
    expect(harness.control.current!.pendingAction).toBe('inventory');
    expect(onOpenInventory).toHaveBeenCalledTimes(1);
    expect(await duplicate).toBe(false);
    expect(await competing).toBe(false);
    expect(onResume).not.toHaveBeenCalled();

    await act(async () => { inventory.resolve(); });
    expect(await first).toBe(true);
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it('reports inventory failure and unlocks it for another attempt', async () => {
    const onOpenInventory = vi.fn()
      .mockRejectedValueOnce('offline')
      .mockResolvedValueOnce(undefined);
    const onStatus = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onOpenInventory, onStatus }));

    let failed!: boolean;
    await act(async () => { failed = await harness.control.current!.openInventory(); });
    expect(failed).toBe(false);
    expect(onStatus).toHaveBeenCalledWith('操作失败，请重试');
    let retried!: boolean;
    await act(async () => { retried = await harness.control.current!.openInventory(); });
    expect(retried).toBe(true);
    expect(onOpenInventory).toHaveBeenCalledTimes(2);
  });

  it('uses committed callbacks for the current action and new callbacks for the next action', async () => {
    const resumed = session({ status: 'in_progress', version: 15 });
    const resumeRequest = deferred<BeadingSession>();
    const onResume = vi.fn(() => resumeRequest.promise);
    const oldStatus = vi.fn();
    const latestStatus = vi.fn();
    const harness = createHarness();
    const props = defaultProps({ session: session({ status: 'paused', version: 14 }), onResume, onStatus: oldStatus });
    await harness.mount(props);

    let result!: Promise<boolean>;
    act(() => { result = harness.control.current!.resume(); });
    await harness.update({ ...props, session: session({ status: 'paused', version: 99 }), onStatus: latestStatus });
    await act(async () => { resumeRequest.resolve(resumed); });

    expect(await result).toBe(true);
    expect(onResume).toHaveBeenCalledWith({ version: 14 });
    expect(oldStatus).toHaveBeenCalledWith('已继续计时');
    expect(latestStatus).not.toHaveBeenCalled();

    let nextResult!: boolean;
    await act(async () => { nextResult = await harness.control.current!.resume(); });
    expect(nextResult).toBe(true);
    expect(onResume).toHaveBeenLastCalledWith({ version: 99 });
    expect(latestStatus).toHaveBeenCalledWith('已继续计时');
  });

  it('returns false and unlocks when resume fails even if status reporting throws', async () => {
    const onResume = vi.fn(async () => { throw new Error('继续失败'); });
    const onStatus = vi.fn(() => { throw new Error('toast unavailable'); });
    const harness = createHarness();
    await harness.mount(defaultProps({ onResume, onStatus }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.resume(); });
    expect(result).toBe(false);
    expect(onStatus).toHaveBeenCalledWith('继续失败');
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it.each([
    { deduct: true, status: 'completed_deducted' },
    { deduct: false, status: 'completed_without_deduction' },
  ])('completes with deduct=$deduct and passes the latest session to onCompleted', async ({ deduct, status }) => {
    const completed = session({ status, version: 20 });
    const onComplete = vi.fn(async () => completed);
    const onCompleted = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onComplete, onCompleted }));

    let result!: boolean;
    await act(async () => { result = await harness.control.current!.complete(deduct); });

    expect(result).toBe(true);
    expect(onComplete).toHaveBeenCalledWith({ deduct });
    expect(onCompleted).toHaveBeenCalledWith(completed);
    expect(harness.control.current!.pendingAction).toBeNull();
  });

  it('does not call onCompleted when completion fails and allows a retry', async () => {
    const completed = session({ status: 'completed_deducted', version: 20 });
    const onComplete = vi.fn()
      .mockRejectedValueOnce(new Error('库存不足'))
      .mockResolvedValueOnce(completed);
    const onCompleted = vi.fn();
    const harness = createHarness();
    await harness.mount(defaultProps({ onComplete, onCompleted }));

    let failed!: boolean;
    await act(async () => { failed = await harness.control.current!.complete(true); });
    expect(failed).toBe(false);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(harness.control.current!.pendingAction).toBeNull();
    let retried!: boolean;
    await act(async () => { retried = await harness.control.current!.complete(true); });
    expect(retried).toBe(true);
    expect(onCompleted).toHaveBeenCalledWith(completed);
  });
});
