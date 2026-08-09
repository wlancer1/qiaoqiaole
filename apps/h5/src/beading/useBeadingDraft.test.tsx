import { StrictMode, act, useReducer } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beadingDraftKey } from './beadingSessionUtils';
import {
  beadingToolReducer,
  createBeadingToolState,
  type BeadingToolAction,
  type BeadingToolState,
} from './beadingToolState';
import { useBeadingDraft, type UseBeadingDraftResult } from './useBeadingDraft';

type TestStorage = ReturnType<typeof createStorage>;
type HarnessProps = {
  ownerId?: string;
  sessionId: string;
  cellCount: number;
  storage?: TestStorage;
  onWarning?: (message: string) => void;
  renderPhaseRef?: { current: boolean };
};

type HarnessControl = {
  state: BeadingToolState;
  dispatch: (action: BeadingToolAction) => void;
  draft: UseBeadingDraftResult;
};

function createStorage(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

function draft(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ completedColorCodes: [], elapsedSeconds: 0, updatedAt: 'old', ...fields });
}

function createHarness() {
  const control = { current: null as HarnessControl | null };
  let renderer: ReactTestRenderer;

  function Harness(props: HarnessProps) {
    const [state, dispatch] = useReducer(beadingToolReducer, undefined, createBeadingToolState);
    if (props.renderPhaseRef) props.renderPhaseRef.current = true;
    try {
      const persistedDraft = useBeadingDraft({ ...props, state, dispatch });
      control.current = { state, dispatch, draft: persistedDraft };
    } finally {
      if (props.renderPhaseRef) props.renderPhaseRef.current = false;
    }
    return null;
  }

  const tree = (props: HarnessProps) => <StrictMode><Harness {...props} /></StrictMode>;

  return {
    control,
    async mount(props: HarnessProps) {
      await act(async () => { renderer = create(tree(props)); });
    },
    async update(props: HarnessProps) {
      await act(async () => { renderer.update(tree(props)); });
    },
    dispatch(action: BeadingToolAction) {
      act(() => { control.current!.dispatch(action); });
    },
    unmount() {
      act(() => { renderer.unmount(); });
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useBeadingDraft with real React lifecycle', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const originalConsoleError = console.error;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (args[0] === 'react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer') return;
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('does not let StrictMode replay overwrite a restored draft and waits 150ms to write', async () => {
    const key = beadingDraftKey('owner-a', 'session-a');
    const original = draft({ locked: true, markedCellIndexes: [3, 1] });
    const storage = createStorage({ [key]: original });
    const harness = createHarness();

    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });
    await flushMicrotasks();

    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data.get(key)).toBe(original);
    expect(harness.control.current!.state).toEqual({
      ...createBeadingToolState(),
      locked: true,
      markedCellIndexes: [1, 3],
    });

    act(() => { vi.advanceTimersByTime(149); });
    expect(storage.setItem).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('merges rapid state changes into one debounced write', async () => {
    const storage = createStorage();
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });

    harness.dispatch({ type: 'toggle-lock' });
    act(() => { vi.advanceTimersByTime(100); });
    harness.dispatch({ type: 'toggle-grid' });
    act(() => { vi.advanceTimersByTime(150); });

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toMatchObject({ locked: true, gridVisible: false });
  });

  it('flushes latest state only after the real unmount microtask', async () => {
    const storage = createStorage();
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });
    harness.dispatch({ type: 'set-sort', sortMode: 'remaining' });

    harness.unmount();
    expect(storage.setItem).not.toHaveBeenCalled();
    await flushMicrotasks();

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.setItem.mock.calls[0][1]).sortMode).toBe('remaining');
  });

  it('does not recreate a cleared draft during real unmount', async () => {
    const storage = createStorage();
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });
    harness.dispatch({ type: 'toggle-lock' });

    act(() => { harness.control.current!.draft.clearDraft(); });
    harness.unmount();
    await flushMicrotasks();
    act(() => { vi.advanceTimersByTime(500); });

    expect(storage.removeItem).toHaveBeenCalledWith(beadingDraftKey('owner-a', 'session-a'));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('flushes A before hydrating B and never writes A state into B', async () => {
    const keyA = beadingDraftKey('owner-a', 'session-a');
    const keyB = beadingDraftKey('owner-b', 'session-b');
    const storage = createStorage({ [keyB]: draft({ gridVisible: false, sortMode: 'code' }) });
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });
    harness.dispatch({ type: 'toggle-lock' });

    await harness.update({ ownerId: 'owner-b', sessionId: 'session-b', cellCount: 4, storage });

    expect(JSON.parse(storage.data.get(keyA)!)).toMatchObject({ locked: true });
    expect(storage.setItem.mock.calls.some(([key]) => key === keyB)).toBe(false);
    expect(harness.control.current!.state).toEqual({
      ...createBeadingToolState(),
      gridVisible: false,
      sortMode: 'code',
    });
  });

  it('resets to defaults when B has no draft', async () => {
    const storage = createStorage();
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });
    harness.dispatch({ type: 'toggle-lock' });
    harness.dispatch({ type: 'toggle-mode', mode: 'mark' });

    await harness.update({ ownerId: 'owner-b', sessionId: 'session-b', cellCount: 4, storage });

    expect(harness.control.current!.state).toEqual(createBeadingToolState());
    expect(storage.setItem.mock.calls.some(([key]) => key === beadingDraftKey('owner-b', 'session-b'))).toBe(false);
  });

  it('treats the storage object as part of identity', async () => {
    const key = beadingDraftKey('owner-a', 'session-a');
    const storageA = createStorage();
    const storageB = createStorage({ [key]: draft({ codesVisible: false }) });
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage: storageA });
    harness.dispatch({ type: 'toggle-lock' });

    await harness.update({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage: storageB });

    expect(JSON.parse(storageA.data.get(key)!)).toMatchObject({ locked: true });
    expect(storageB.getItem).toHaveBeenCalledTimes(1);
    expect(harness.control.current!.state).toEqual({ ...createBeadingToolState(), codesVisible: false });
  });

  it('filters marks after cellCount changes', async () => {
    const storage = createStorage();
    const harness = createHarness();
    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 6, storage });
    harness.dispatch({ type: 'set-marks', indexes: [1, 4, 5], cellCount: 6 });

    await harness.update({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage });

    expect(harness.control.current!.state.markedCellIndexes).toEqual([1]);
  });

  it('does not access storage when owner is missing', async () => {
    const storage = createStorage();
    const harness = createHarness();
    await harness.mount({ sessionId: 'session-a', cellCount: 4, storage });
    act(() => { vi.advanceTimersByTime(500); });
    harness.unmount();
    await flushMicrotasks();

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('does not resolve default localStorage when owner is missing', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const getter = vi.fn(() => createStorage() as unknown as Storage);
    const localWindow = {} as Window;
    Object.defineProperty(localWindow, 'localStorage', { configurable: true, get: getter });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: localWindow });
    const harness = createHarness();

    try {
      await harness.mount({ sessionId: 'session-a', cellCount: 4 });
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else delete (globalThis as { window?: Window }).window;
    }

    expect(getter).not.toHaveBeenCalled();
  });

  it('reports malformed JSON and quota errors without throwing', async () => {
    const key = beadingDraftKey('owner-a', 'session-a');
    const storage = createStorage({ [key]: '{broken' });
    storage.setItem.mockImplementation(() => { throw new Error('quota'); });
    const onWarning = vi.fn();
    const harness = createHarness();

    await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, storage, onWarning });
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('读取'));
    act(() => { vi.advanceTimersByTime(150); });
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('保存'));
  });

  it('accesses a failing default localStorage getter only after render and warns once', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const renderPhaseRef = { current: false };
    const phases: boolean[] = [];
    const onWarning = vi.fn(() => phases.push(renderPhaseRef.current));
    const localWindow = {} as Window;
    Object.defineProperty(localWindow, 'localStorage', {
      configurable: true,
      get() {
        phases.push(renderPhaseRef.current);
        throw new Error('blocked');
      },
    });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: localWindow });
    const harness = createHarness();

    try {
      await harness.mount({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, onWarning, renderPhaseRef });
      await harness.update({ ownerId: 'owner-a', sessionId: 'session-a', cellCount: 4, onWarning, renderPhaseRef });
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else delete (globalThis as { window?: Window }).window;
    }

    expect(phases).toEqual([false, false]);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });
});
