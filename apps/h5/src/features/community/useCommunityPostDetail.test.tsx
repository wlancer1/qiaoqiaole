import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useCommunityPostDetail } from './useCommunityPostDetail';
import type { CommunityPost } from '../../community/communityData';

function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((nextResolve) => { resolve = nextResolve; }), resolve };
}

const post = (id: string): CommunityPost => ({ id, name: id, author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' });

describe('useCommunityPostDetail', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

  it('discards an old post response when the route id changes', async () => {
    const first = deferred<{ post: CommunityPost }>();
    const second = deferred<{ post: CommunityPost }>();
    const requestApi = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const setStatus = vi.fn();
    let id = 'old';
    let value!: ReturnType<typeof useCommunityPostDetail>;
    let renderer!: ReactTestRenderer;
    function Probe() { value = useCommunityPostDetail({ postId: id, requestApi, setStatus }); return null; }
    await act(async () => { renderer = create(<Probe />); });
    id = 'new';
    await act(async () => { renderer.update(<Probe />); });
    await act(async () => { second.resolve({ post: post('new') }); await second.promise; });
    await act(async () => { first.resolve({ post: post('old') }); await first.promise; });
    expect(value.post?.id).toBe('new');
    await act(async () => { renderer.unmount(); });
  });

  it('does not restart a detail request solely because its parent rerenders', async () => {
    const pending = deferred<{ post: CommunityPost }>();
    const requestApi = vi.fn().mockReturnValue(pending.promise);
    let renderer!: ReactTestRenderer;
    function Probe() {
      useCommunityPostDetail({ postId: 'one', requestApi: ((...args: Parameters<typeof requestApi>) => requestApi(...args)) as never, setStatus: vi.fn() });
      return null;
    }
    await act(async () => { renderer = create(<Probe />); });
    await act(async () => { renderer.update(<Probe />); });
    expect(requestApi).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ post: post('one') }); await pending.promise; renderer.unmount(); });
  });

  it('updates the loaded detail after a successful like or unlike', async () => {
    let value!: ReturnType<typeof useCommunityPostDetail>;
    function Probe() { value = useCommunityPostDetail({ postId: 'one', requestApi: vi.fn().mockResolvedValue({ post: post('one') }), setStatus: vi.fn() }); return null; }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Probe />); await Promise.resolve(); });

    act(() => { value.setLikeState('one', { liked: true, likesCount: 1 }); });

    expect(value.post).toMatchObject({ id: 'one', likesCount: 1, likedByMe: true });
    act(() => { value.setLikeState('one', { liked: false, likesCount: 0 }); });
    expect(value.post).toMatchObject({ id: 'one', likesCount: 0, likedByMe: false });
    await act(async () => { renderer.unmount(); });
  });
});
