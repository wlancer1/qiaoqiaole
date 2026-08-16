import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { useCommunityDiscoveryRoute } from './useCommunityDiscoveryRoute';

describe('useCommunityDiscoveryRoute', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('uses the URL as the source of truth and resets page when a filter changes', async () => {
    let route!: ReturnType<typeof useCommunityDiscoveryRoute>;
    let location = '';
    let renderer!: ReactTestRenderer;
    function Probe() {
      route = useCommunityDiscoveryRoute();
      const current = useLocation();
      location = `${current.pathname}${current.search}`;
      return null;
    }
    await act(async () => {
      renderer = create(<MemoryRouter initialEntries={['/discover?sort=latest&tags=%E5%8A%A8%E7%89%A9&page=3&q=%E6%98%9F%E7%A9%BA']}><Probe /></MemoryRouter>);
    });

    expect(route.value).toEqual({ sort: 'latest', tags: ['动物'], page: 3, query: '星空' });
    act(() => { route.setTags(['人物']); });
    expect(location).toBe('/discover?sort=latest&tags=%E4%BA%BA%E7%89%A9&q=%E6%98%9F%E7%A9%BA');
    act(() => { route.setPage(4); });
    expect(location).toBe('/discover?sort=latest&tags=%E4%BA%BA%E7%89%A9&page=4&q=%E6%98%9F%E7%A9%BA');
    await act(async () => { renderer.unmount(); });
  });
});
