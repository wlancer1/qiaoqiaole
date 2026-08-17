import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImageWithSkeleton } from './ImageWithSkeleton';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('ImageWithSkeleton', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows an image skeleton until the image has loaded', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton src="/pattern.png" alt="作品预览" fallback={<span>暂无预览图</span>} />);
    });

    expect(renderer!.root.findByProps({ 'data-image-skeleton': 'true' }).type).toBe('div');
    expect(renderer!.root.findByType('div').props.className).toContain('is-loading');
    expect(renderer!.root.findByType('img').props.alt).toBe('作品预览');
    expect(renderer!.root.findByType('img').props.loading).toBe('lazy');
  });

  it('removes the skeleton and marks the image loaded after onLoad', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton src="/pattern.png" alt="作品预览" fallback={<span>暂无预览图</span>} />);
    });

    act(() => renderer!.root.findByType('img').props.onLoad());

    expect(renderer!.root.findAllByProps({ 'data-image-skeleton': 'true' })).toHaveLength(0);
    expect(renderer!.root.findByType('img').props.className).toContain('is-loaded');
  });

  it('retries a transient image error with a cache-busting URL before showing fallback', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton src="/missing.png" alt="作品预览" fallback={<span data-fallback="true">暂无预览图</span>} />);
    });

    act(() => renderer!.root.findByType('img').props.onError());

    expect(renderer!.root.findByType('img').props.src).toContain('imageRetry=1');
    expect(renderer!.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(0);

    act(() => renderer!.root.findByType('img').props.onError());
    expect(renderer!.root.findByType('img').props.src).toContain('imageRetry=2');

    act(() => renderer!.root.findByType('img').props.onError());
    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ 'data-image-skeleton': 'true' })).toHaveLength(0);
  });

  it('renders fallback immediately when there is no image source', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton src="" alt="作品预览" fallback={<span data-fallback="true">暂无预览图</span>} />);
    });

    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ 'data-image-skeleton': 'true' })).toHaveLength(0);
  });

  it('tries a failed image again when the mobile connection comes back online', () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    act(() => {
      renderer = create(<ImageWithSkeleton src="/mobile.png" alt="作品预览" fallback={<span data-fallback="true">暂无预览图</span>} />);
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      act(() => renderer!.root.findByType('img').props.onError());
    }
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);

    act(() => listeners.get('online')?.());

    expect(renderer!.root.findByType('img').props.src).toContain('imageRetry=1');
  });

  it('does not leave the skeleton stuck when the browser emits neither load nor error', () => {
    vi.useFakeTimers();
    act(() => {
      renderer = create(<ImageWithSkeleton src="/stalled.png" alt="作品预览" loadTimeoutMs={10_000} fallback={<span data-fallback="true">暂无预览图</span>} />);
    });

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(renderer!.root.findByType('img').props.src).toContain('imageRetry=1');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(renderer!.root.findByType('img').props.src).toContain('imageRetry=2');
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(renderer!.root.findAllByProps({ 'data-image-skeleton': 'true' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
  });

  it('can fail fast without retrying slow list thumbnails', () => {
    vi.useFakeTimers();
    act(() => {
      renderer = create(<ImageWithSkeleton src="/slow-thumb.png" alt="作品预览" loadTimeoutMs={2_500} maxRetries={0} fallback={<span data-fallback="true">暂无预览图</span>} />);
    });

    act(() => { vi.advanceTimersByTime(2_500); });

    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
  });

  it('uses a block wrapper by default so legacy span artwork selectors do not match the loader', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton src="/pattern.png" alt="作品预览" fallback={<span>暂无预览图</span>} />);
    });

    expect(renderer!.root.findByType('div')).toBeTruthy();
  });

  it('supports an inline wrapper for avatars', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton as="span" src="/avatar.png" alt="头像" fallback={<span>默认头像</span>} />);
    });

    expect(renderer!.root.findByType('span')).toBeTruthy();
  });
});
