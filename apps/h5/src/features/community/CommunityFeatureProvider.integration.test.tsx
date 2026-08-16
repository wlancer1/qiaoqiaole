import { Provider } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../../store/store';
import { sessionEstablished } from '../../store/auth/authEvents';
import { CommunityFeatureContent } from './CommunityFeatureContent';
import { CommunityFeatureProvider } from './CommunityFeatureProvider';

describe('CommunityFeatureProvider route integration', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

  it('loads a direct post route by its URL id without a parent-held post object', async () => {
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-1', user: { id: 'user-1', username: 'user', displayName: '用户', avatarUrl: '', legacyDraftOwnerId: 'user-1', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    const requestApi = vi.fn(async (path: string) => {
      if (path === '/community/posts/deep-link') return { post: { id: 'deep-link', name: '深链接作品', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' } };
      if (path.endsWith('/comments')) return { comments: [] };
      if (path.startsWith('/community/posts?')) return { posts: [] };
      return { notifications: [] };
    });
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/posts/deep-link']}><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>);
    });
    expect(requestApi).toHaveBeenCalledWith('/community/posts/deep-link');
    expect(JSON.stringify(renderer.toJSON())).toContain('深链接作品');
  });

  it('does not navigate or publish a copy success after the route changes during the copy request', async () => {
    let resolveCopy!: () => void;
    const copy = new Promise<void>((resolve) => { resolveCopy = resolve; });
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-1', user: { id: 'user-1', username: 'user', displayName: '用户', avatarUrl: '', legacyDraftOwnerId: 'user-1', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    const requestApi = vi.fn((path: string) => {
      if (path === '/community/posts/copy-me') return Promise.resolve({ post: { id: 'copy-me', name: '待复制作品', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' } });
      if (path === '/projects/copy-me/copy') return copy;
      if (path.endsWith('/comments')) return Promise.resolve({ comments: [] });
      return Promise.resolve({ posts: [] });
    });
    function Controls() { const navigate = useNavigate(); const location = useLocation(); return <><button aria-label="离开详情" onClick={() => navigate('/discover')}>离开</button><output>{location.pathname}</output></>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/posts/copy-me']}><Controls /><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>);
    });
    const copyButton = renderer.root.findAllByType('button').find((node) => node.props.className === 'detail-download-action');
    expect(copyButton).toBeDefined();
    act(() => { copyButton!.props.onClick(); });
    await act(async () => { renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '离开详情')!.props.onClick(); });
    await act(async () => { resolveCopy(); await copy; });

    expect(renderer.root.findByType('output').children.join('')).toBe('/discover');
    expect(store.getState().ui.status).toBeNull();
  });

  it('loads a direct author route by its URL id and honors a valid internal return target', async () => {
    const store = createH5Store({ storage: undefined });
    const requestApi = vi.fn(async (path: string) => {
      if (path === '/community/users/author-1/profile?page=1&pageSize=50') {
        return { profile: { id: 'author-1', name: '路由作者', postsCount: 1, likesCount: 2, followersCount: 3, isFollowing: false }, posts: [] };
      }
      return { posts: [] };
    });
    function LocationProbe() { const location = useLocation(); return <output>{`${location.pathname}${location.search}`}</output>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/users/author-1?from=%2Ffollowers']}><LocationProbe /><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>);
    });
    expect(requestApi).toHaveBeenCalledWith('/community/users/author-1/profile?page=1&pageSize=50', { headers: {} }, null);
    expect(JSON.stringify(renderer.toJSON())).toContain('路由作者');
    const back = renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '返回上一页');
    await act(async () => { back!.props.onClick(); });
    expect(renderer.root.findByType('output').children.join('')).toBe('/followers');
  });

  it('falls back to discovery instead of honoring an unsafe author return target', async () => {
    const store = createH5Store({ storage: undefined });
    const requestApi = vi.fn(async (path: string) => {
      if (path === '/community/users/author-1/profile?page=1&pageSize=50') {
        return { profile: { id: 'author-1', name: '路由作者', postsCount: 0, likesCount: 0, followersCount: 0, isFollowing: false }, posts: [] };
      }
      return { posts: [] };
    });
    function LocationProbe() { const location = useLocation(); return <output>{`${location.pathname}${location.search}`}</output>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/users/author-1?from=https%3A%2F%2Fevil.example']}><LocationProbe /><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>);
    });
    const back = renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '返回上一页');
    await act(async () => { back!.props.onClick(); });
    expect(renderer.root.findByType('output').children.join('')).toBe('/discover');
  });

  it('discards an older direct-author response when the URL author id changes', async () => {
    let resolveFirst!: (value: any) => void;
    const first = new Promise<any>((resolve) => { resolveFirst = resolve; });
    const store = createH5Store({ storage: undefined });
    const requestApi = vi.fn((path: string) => {
      if (path === '/community/users/one/profile?page=1&pageSize=50') return first;
      if (path === '/community/users/two/profile?page=1&pageSize=50') return Promise.resolve({ profile: { id: 'two', name: '第二位作者', postsCount: 0, likesCount: 0, followersCount: 0, isFollowing: false }, posts: [] });
      return Promise.resolve({ posts: [] });
    });
    function NavigateToTwo() { const navigate = useNavigate(); return <button onClick={() => navigate('/community/users/two')}>next</button>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/users/one']}><NavigateToTwo /><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>); });
    await act(async () => { renderer.root.findByType('button').props.onClick(); });
    await act(async () => {
      resolveFirst({ profile: { id: 'one', name: '旧作者', postsCount: 0, likesCount: 0, followersCount: 0, isFollowing: false }, posts: [] });
      await first;
    });
    const markup = JSON.stringify(renderer.toJSON());
    expect(markup).toContain('第二位作者');
    expect(markup).not.toContain('旧作者');
  });

  it('discards a late direct-detail response after URL navigation changes the post id', async () => {
    let resolveFirst!: (value: any) => void;
    const first = new Promise<any>((resolve) => { resolveFirst = resolve; });
    const store = createH5Store({ storage: undefined });
    const requestApi = vi.fn((path: string) => {
      if (path === '/community/posts/one') return first;
      if (path === '/community/posts/two') return Promise.resolve({ post: { id: 'two', name: '第二篇', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' } });
      if (path.endsWith('/comments')) return Promise.resolve({ comments: [] });
      return Promise.resolve({ posts: [], notifications: [] });
    });
    function NavigateToTwo() { const navigate = useNavigate(); return <button onClick={() => navigate('/community/posts/two')}>next</button>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/posts/one']}><NavigateToTwo /><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>); });
    await act(async () => { renderer.root.findByType('button').props.onClick(); });
    await act(async () => { resolveFirst({ post: { id: 'one', name: '旧稿件', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' } }); await first; });
    const markup = JSON.stringify(renderer.toJSON());
    expect(markup).toContain('第二篇');
    expect(markup).not.toContain('旧稿件');
  });

  it('uses only a safe internal from target when returning from a directly loaded post route', async () => {
    const store = createH5Store({ storage: undefined });
    const requestApi = vi.fn(async (path: string) => {
      if (path === '/community/posts/one') return { post: { id: 'one', name: '第一篇', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' } };
      if (path.endsWith('/comments')) return { comments: [] };
      return { posts: [] };
    });
    function LocationProbe() { const location = useLocation(); return <output>{`${location.pathname}${location.search}`}</output>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/community/posts/one?from=https%3A%2F%2Fevil.example']}><CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><LocationProbe /><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider></MemoryRouter></Provider>);
    });
    const back = renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '返回发现');
    expect(back).toBeDefined();
    await act(async () => { back!.props.onClick(); });
    expect(renderer.root.findByType('output').children.join('')).toBe('/discover');
  });

  it('loads URL ids again and keeps browser back/forward navigation route-driven', async () => {
    const store = createH5Store({ storage: undefined });
    const requestApi = vi.fn(async (path: string) => {
      const id = path.match(/^\/community\/posts\/(one|two)$/)?.[1];
      if (id) return { post: { id, name: id === 'one' ? '第一篇' : '第二篇', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' } };
      if (path.endsWith('/comments')) return { comments: [] };
      return { posts: [] };
    });
    function BrowserControls() {
      const navigate = useNavigate();
      const location = useLocation();
      return <><button aria-label="浏览器后退" onClick={() => navigate(-1)} /><button aria-label="浏览器前进" onClick={() => navigate(1)} /><output>{location.pathname}</output></>;
    }
    const content = <CommunityFeatureProvider requestApi={requestApi as never} requireLogin={vi.fn()} loadFollowingCount={vi.fn()}><BrowserControls /><CommunityFeatureContent fallback={null} /></CommunityFeatureProvider>;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/discover', '/community/posts/one', '/community/posts/two']} initialIndex={2}>{content}</MemoryRouter></Provider>); });
    expect(JSON.stringify(renderer.toJSON())).toContain('第二篇');
    await act(async () => { renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '浏览器后退')!.props.onClick(); });
    expect(renderer.root.findByType('output').children.join('')).toBe('/community/posts/one');
    expect(JSON.stringify(renderer.toJSON())).toContain('第一篇');
    await act(async () => { renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '浏览器前进')!.props.onClick(); });
    expect(renderer.root.findByType('output').children.join('')).toBe('/community/posts/two');
    expect(JSON.stringify(renderer.toJSON())).toContain('第二篇');
    expect(requestApi.mock.calls.filter(([path]) => path === '/community/posts/one')).toHaveLength(1);
    expect(requestApi.mock.calls.filter(([path]) => path === '/community/posts/two')).toHaveLength(2);
  });
});
