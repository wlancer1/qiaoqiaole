import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBeadingElapsedTimer } from './useBeadingElapsedTimer';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function Harness(props: Parameters<typeof useBeadingElapsedTimer>[0]) {
  const elapsed = useBeadingElapsedTimer(props);
  return <output>{elapsed}</output>;
}

describe('useBeadingElapsedTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubGlobal('window', { setInterval, clearInterval });
  });

  it('uses the wall-clock anchor so a delayed interval catches up in one tick', async () => {
    let tick: (() => void) | undefined;
    vi.spyOn(window, 'setInterval').mockImplementation(((callback: TimerHandler) => {
      tick = callback as () => void;
      return 1;
    }) as typeof window.setInterval);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Harness sessionId="s1" version={1} authoritativeElapsed={10} stopped={false} />);
    });
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z'));
    act(() => tick?.());
    expect(renderer.root.findByType('output').children.join('')).toBe('15');
  });

  it('freezes pending time and restarts from the frozen snapshot', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Harness sessionId="s1" version={1} authoritativeElapsed={10} stopped={false} />);
    });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(renderer.root.findByType('output').children.join('')).toBe('12');
    await act(async () => renderer.update(
      <Harness sessionId="s1" version={1} authoritativeElapsed={10} stopped />,
    ));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(renderer.root.findByType('output').children.join('')).toBe('12');
    await act(async () => renderer.update(
      <Harness sessionId="s1" version={1} authoritativeElapsed={10} stopped={false} />,
    ));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(renderer.root.findByType('output').children.join('')).toBe('13');
  });

  it('applies authoritative elapsed only when identity or version changes', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Harness sessionId="s1" version={1} authoritativeElapsed={10} stopped={false} />);
    });
    act(() => { vi.advanceTimersByTime(2000); });
    await act(async () => renderer.update(
      <Harness sessionId="s1" version={1} authoritativeElapsed={99} stopped={false} />,
    ));
    expect(renderer.root.findByType('output').children.join('')).toBe('12');
    await act(async () => renderer.update(
      <Harness sessionId="s1" version={2} authoritativeElapsed={50} stopped />,
    ));
    expect(renderer.root.findByType('output').children.join('')).toBe('50');
  });
});
