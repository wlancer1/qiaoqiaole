import type { ComponentProps } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImageWithSkeleton } from './ImageWithSkeleton';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('ImageWithSkeleton', () => {
  let renderer: ReactTestRenderer | undefined;

  type FlushableTestRenderer = ReactTestRenderer & {
    unstable_flushSync: (callback: () => void) => void;
  };

  const installIntersectionObserver = () => {
    const observers: Array<{
      callback: IntersectionObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
      options?: IntersectionObserverInit;
    }> = [];
    const IntersectionObserverMock = vi.fn((callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
      const observer = {
        callback,
        disconnect: vi.fn(),
        observe: vi.fn(),
        options,
      };
      observers.push(observer);
      return observer;
    });
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    return { IntersectionObserverMock, observers };
  };

  const createDeferredImage = (props: Partial<ComponentProps<typeof ImageWithSkeleton>> = {}) => create(
    <ImageWithSkeleton
      src="/popular.webp"
      alt="热门图纸"
      loading="lazy"
      fetchPriority="low"
      deferUntilVisible
      loadTimeoutMs={2_500}
      maxRetries={0}
      fallback={<span data-fallback="true">暂无预览图</span>}
      {...props}
    />,
    { createNodeMock: () => ({ nodeType: 1 }) },
  );

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

  it('waits to mount and time a deferred image until it approaches the viewport', () => {
    vi.useFakeTimers();
    const { IntersectionObserverMock, observers } = installIntersectionObserver();
    act(() => {
      renderer = createDeferredImage();
    });

    expect(renderer!.root.findByProps({ 'data-image-skeleton': 'true' })).toBeTruthy();
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(IntersectionObserverMock).toHaveBeenCalledOnce();
    expect(observers[0].options).toEqual({ rootMargin: '0px 0px 240px 0px' });

    act(() => { vi.advanceTimersByTime(2_500); });
    expect(renderer!.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(0);

    act(() => {
      observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(renderer!.root.findByType('img').props.fetchPriority).toBe('low');
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    act(() => { vi.advanceTimersByTime(2_499); });
    expect(renderer!.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
  });

  it('disconnects the observer when a waiting deferred image unmounts', () => {
    const { observers } = installIntersectionObserver();
    act(() => {
      renderer = createDeferredImage();
    });

    act(() => renderer!.unmount());
    renderer = undefined;

    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it('uses native lazy loading without a component timeout when IntersectionObserver is unavailable', () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', undefined);
    act(() => {
      renderer = createDeferredImage();
    });

    expect(renderer!.root.findByType('img').props.loading).toBe('lazy');
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(renderer!.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(0);

    act(() => renderer!.root.findByType('img').props.onLoad());
    expect(renderer!.root.findAllByProps({ 'data-image-skeleton': 'true' })).toHaveLength(0);
    expect(renderer!.root.findByType('img').props.className).toContain('is-loaded');
  });

  it('shows fallback once after a deferred native-lazy image errors without IntersectionObserver', () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', undefined);
    act(() => {
      renderer = createDeferredImage({ src: '/missing-popular.webp' });
    });

    const staleOnError = renderer!.root.findByType('img').props.onError;
    act(() => staleOnError());

    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    act(() => staleOnError());
    expect(renderer!.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let a stale load event revive an image after its terminal timeout', () => {
    vi.useFakeTimers();
    const { observers } = installIntersectionObserver();
    act(() => {
      renderer = createDeferredImage({ src: '/slow-popular.webp' });
    });
    act(() => {
      observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    const staleOnLoad = renderer!.root.findByType('img').props.onLoad;

    act(() => { vi.advanceTimersByTime(2_500); });
    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();

    act(() => staleOnLoad());
    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
  });

  it('resets activation and clears previous work when the source changes', () => {
    vi.useFakeTimers();
    const { observers } = installIntersectionObserver();
    act(() => {
      renderer = createDeferredImage({ src: '/first.webp' });
    });
    act(() => {
      observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(renderer!.root.findByType('img').props.src).toBe('/first.webp');
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      renderer!.update(
        <ImageWithSkeleton
          src="/second.webp"
          alt="热门图纸"
          loading="lazy"
          fetchPriority="low"
          deferUntilVisible
          loadTimeoutMs={2_500}
          maxRetries={0}
          fallback={<span data-fallback="true">暂无预览图</span>}
        />,
      );
    });

    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(renderer!.root.findByProps({ 'data-image-skeleton': 'true' })).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();

    act(() => {
      observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(2_500); });
    expect(renderer!.root.findAllByProps({ 'data-fallback': 'true' })).toHaveLength(0);
    act(() => {
      observers[1].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(renderer!.root.findByType('img').props.src).toBe('/second.webp');
    expect(vi.getTimerCount()).toBe(1);

    act(() => { vi.advanceTimersByTime(2_500); });
    expect(renderer!.root.findByProps({ 'data-fallback': 'true' })).toBeTruthy();
    act(() => {
      renderer!.update(
        <ImageWithSkeleton
          src="/third.webp"
          alt="热门图纸"
          loading="lazy"
          fetchPriority="low"
          deferUntilVisible
          loadTimeoutMs={2_500}
          maxRetries={0}
          fallback={<span data-fallback="true">暂无预览图</span>}
        />,
      );
    });
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(observers).toHaveLength(3);
    act(() => {
      observers[2].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    act(() => renderer!.root.findByType('img').props.onLoad());
    expect(renderer!.root.findByType('img').props.src).toBe('/third.webp');
    expect(renderer!.root.findByType('img').props.className).toContain('is-loaded');
  });

  it('does not commit a changed deferred source with the previous activation or retry count', () => {
    const { observers } = installIntersectionObserver();
    act(() => {
      renderer = createDeferredImage({ src: '/first.webp', maxRetries: 2 });
    });
    act(() => {
      observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    act(() => renderer!.root.findByType('img').props.onError());
    expect(renderer!.root.findByType('img').props.src).toBe('/first.webp?imageRetry=1');

    act(() => {
      (renderer as FlushableTestRenderer).unstable_flushSync(() => {
        renderer!.update(
          <ImageWithSkeleton
            src="/second.webp"
            alt="热门图纸"
            loading="lazy"
            fetchPriority="low"
            deferUntilVisible
            loadTimeoutMs={2_500}
            maxRetries={2}
            fallback={<span data-fallback="true">暂无预览图</span>}
          />,
        );
      });

      expect(renderer!.root.findAllByType('img')).toHaveLength(0);
      expect(renderer!.root.findByProps({ 'data-image-skeleton': 'true' })).toBeTruthy();
    });

    expect(observers).toHaveLength(2);
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
