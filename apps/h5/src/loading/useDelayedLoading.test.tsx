import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedLoading } from './useDelayedLoading';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function Harness({ loading }: { loading: boolean }) {
  return <output>{useDelayedLoading(loading) ? 'visible' : 'hidden'}</output>;
}

describe('useDelayedLoading', () => {
  const renderers: ReactTestRenderer[] = [];

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not show before 300ms and becomes visible after the delay', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Harness loading />); });
    renderers.push(renderer);
    act(() => { vi.advanceTimersByTime(299); });
    expect(renderer.root.findByType('output').children.join('')).toBe('hidden');
    act(() => { vi.advanceTimersByTime(1); });
    expect(renderer.root.findByType('output').children.join('')).toBe('visible');
  });

  it('keeps a visible indicator for at least 250ms', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Harness loading />); });
    renderers.push(renderer);
    act(() => { vi.advanceTimersByTime(300); });
    await act(async () => { renderer.update(<Harness loading={false} />); });
    act(() => { vi.advanceTimersByTime(249); });
    expect(renderer.root.findByType('output').children.join('')).toBe('visible');
    act(() => { vi.advanceTimersByTime(1); });
    expect(renderer.root.findByType('output').children.join('')).toBe('hidden');
  });

  it('cancels a pending reveal when loading finishes early', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Harness loading />); });
    renderers.push(renderer);
    act(() => { vi.advanceTimersByTime(100); });
    await act(async () => { renderer.update(<Harness loading={false} />); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(renderer.root.findByType('output').children.join('')).toBe('hidden');
  });
});
