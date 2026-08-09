import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EffectSlot = { deps?: readonly unknown[]; cleanup?: void | (() => void) };
type MemoSlot = { deps: readonly unknown[]; value: unknown };

const hookRuntime = vi.hoisted(() => ({ current: null as null | HookRuntime }));

class HookRuntime {
  private cursor = 0;
  private readonly refs: Array<{ current: unknown }> = [];
  private readonly effects: EffectSlot[] = [];
  private readonly memos: MemoSlot[] = [];
  private pendingEffects: Array<() => void> = [];

  useRef<T>(initialValue: T): { current: T } {
    const index = this.cursor++;
    this.refs[index] ??= { current: initialValue };
    return this.refs[index] as { current: T };
  }

  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void {
    const index = this.cursor++;
    const previous = this.effects[index];
    const changed = !previous || !deps || !previous.deps
      || deps.length !== previous.deps.length
      || deps.some((dependency, dependencyIndex) => !Object.is(dependency, previous.deps?.[dependencyIndex]));
    if (!changed) return;
    this.pendingEffects.push(() => {
      previous?.cleanup?.();
      this.effects[index] = { deps, cleanup: effect() };
    });
  }

  useCallback<T>(callback: T, deps: readonly unknown[]): T {
    const index = this.cursor++;
    const previous = this.memos[index];
    const changed = !previous || deps.length !== previous.deps.length
      || deps.some((dependency, dependencyIndex) => !Object.is(dependency, previous.deps[dependencyIndex]));
    if (changed) this.memos[index] = { deps, value: callback };
    return this.memos[index].value as T;
  }

  render<T>(renderHook: () => T): T {
    this.cursor = 0;
    hookRuntime.current = this;
    const result = renderHook();
    hookRuntime.current = null;
    const effects = this.pendingEffects;
    this.pendingEffects = [];
    effects.forEach((effect) => effect());
    return result;
  }

  unmount(): void {
    this.effects.forEach((effect) => effect?.cleanup?.());
  }
}

vi.mock('react', () => ({
  useRef: <T,>(initialValue: T) => hookRuntime.current!.useRef(initialValue),
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => hookRuntime.current!.useEffect(effect, deps),
  useCallback: <T,>(callback: T, deps: readonly unknown[]) => hookRuntime.current!.useCallback(callback, deps),
}));

import { beadingDraftKey } from './beadingSessionUtils';
import {
  beadingToolReducer,
  createBeadingToolState,
  type BeadingToolAction,
  type BeadingToolState,
} from './beadingToolState';
import { useBeadingDraft } from './useBeadingDraft';

function createStorage(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

function createHarness(options?: {
  ownerId?: string;
  sessionId?: string;
  cellCount?: number;
  state?: BeadingToolState;
  storage?: ReturnType<typeof createStorage>;
  onWarning?: (message: string) => void;
}) {
  const runtime = new HookRuntime();
  const values = {
    ownerId: options?.ownerId,
    sessionId: options?.sessionId ?? 'session-1',
    cellCount: options?.cellCount ?? 6,
    state: options?.state ?? createBeadingToolState(),
  };
  const storage = options?.storage ?? createStorage();
  const dispatch = vi.fn((action: BeadingToolAction) => {
    values.state = beadingToolReducer(values.state, action);
  });
  const render = () => runtime.render(() => useBeadingDraft({
    ...values,
    dispatch,
    storage,
    onWarning: options?.onWarning,
  }));

  return { runtime, values, storage, dispatch, render };
}

describe('useBeadingDraft', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads a stable owner once and restores only persisted tool fields', () => {
    const key = beadingDraftKey('owner-1', 'session-1');
    const storage = createStorage({
      [key]: JSON.stringify({
        completedColorCodes: ['SERVER-MUST-WIN'],
        elapsedSeconds: 999,
        updatedAt: 'old',
        markedCellIndexes: [5, 2, 2],
        highlightEnabled: false,
        locked: true,
        codesVisible: false,
        gridVisible: false,
        sortMode: 'code',
        interactionMode: 'revise',
        activePanel: 'more',
        focusMode: true,
      }),
    });
    const harness = createHarness({ ownerId: 'owner-1', storage });

    harness.render();
    harness.render();

    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(harness.values.state).toEqual({
      ...createBeadingToolState(),
      markedCellIndexes: [2, 5],
      highlightEnabled: false,
      locked: true,
      codesVisible: false,
      gridVisible: false,
      sortMode: 'code',
    });
  });

  it('does not access storage when owner is missing', () => {
    const harness = createHarness();

    harness.render();
    vi.advanceTimersByTime(500);
    harness.runtime.unmount();

    expect(harness.storage.getItem).not.toHaveBeenCalled();
    expect(harness.storage.setItem).not.toHaveBeenCalled();
    expect(harness.storage.removeItem).not.toHaveBeenCalled();
  });

  it('writes once after 150ms and merges rapid state changes', () => {
    const harness = createHarness({ ownerId: 'owner-1' });
    harness.render();
    harness.values.state = { ...harness.values.state, locked: true };
    harness.render();
    vi.advanceTimersByTime(100);
    harness.values.state = { ...harness.values.state, gridVisible: false };
    harness.render();

    vi.advanceTimersByTime(149);
    expect(harness.storage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(harness.storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(harness.storage.setItem.mock.calls[0][1])).toMatchObject({
      locked: true,
      gridVisible: false,
    });
  });

  it('filters marks when cellCount changes', () => {
    const harness = createHarness({
      ownerId: 'owner-1',
      state: { ...createBeadingToolState(), markedCellIndexes: [1, 4, 5] },
    });
    harness.render();
    harness.values.cellCount = 4;
    harness.render();

    expect(harness.values.state.markedCellIndexes).toEqual([1]);
    vi.advanceTimersByTime(150);
    expect(JSON.parse(harness.storage.setItem.mock.calls[0][1]).markedCellIndexes).toEqual([1]);
  });

  it('warns without throwing for malformed JSON and quota errors', () => {
    const warning = vi.fn();
    const key = beadingDraftKey('owner-1', 'session-1');
    const storage = createStorage({ [key]: '{broken' });
    storage.setItem.mockImplementation(() => { throw new Error('quota'); });
    const harness = createHarness({ ownerId: 'owner-1', storage, onWarning: warning });

    expect(() => harness.render()).not.toThrow();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('读取'));
    vi.advanceTimersByTime(150);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('保存'));
  });

  it('flushes the latest state on unmount without waiting for debounce', () => {
    const harness = createHarness({ ownerId: 'owner-1' });
    harness.render();
    harness.values.state = { ...harness.values.state, sortMode: 'remaining' };
    harness.render();

    harness.runtime.unmount();

    expect(harness.storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(harness.storage.setItem.mock.calls[0][1]).sortMode).toBe('remaining');
  });

  it('clears explicitly and suppression prevents unmount from recreating the draft', () => {
    const harness = createHarness({ ownerId: 'owner-1' });
    const result = harness.render();
    harness.values.state = { ...harness.values.state, locked: true };
    harness.render();

    result.clearDraft();
    harness.runtime.unmount();
    vi.advanceTimersByTime(500);

    expect(harness.storage.removeItem).toHaveBeenCalledWith(beadingDraftKey('owner-1', 'session-1'));
    expect(harness.storage.setItem).not.toHaveBeenCalled();
  });
});
