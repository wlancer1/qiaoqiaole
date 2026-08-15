import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ImageWithSkeleton } from './ImageWithSkeleton';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('ImageWithSkeleton', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
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

  it('renders fallback after an image error and does not keep the broken image visible', () => {
    act(() => {
      renderer = create(<ImageWithSkeleton src="/missing.png" alt="作品预览" fallback={<span data-fallback="true">暂无预览图</span>} />);
    });

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
