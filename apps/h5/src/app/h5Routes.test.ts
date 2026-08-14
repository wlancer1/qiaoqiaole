import { describe, expect, it } from 'vitest';
import { appPathForScreen, H5_ROUTE_PATHS, routeStateForPath } from './h5Routes';

describe('H5 route mapping', () => {
  it('maps top-level URLs to page state', () => {
    expect(routeStateForPath('/')).toEqual({ screen: 'home', activeTab: 'home' });
    expect(routeStateForPath('/discover')).toEqual({ screen: 'home', activeTab: 'discover' });
    expect(routeStateForPath('/messages')).toEqual({ screen: 'home', activeTab: 'messages' });
    expect(routeStateForPath('/profile')).toEqual({ screen: 'home', activeTab: 'profile' });
    expect(routeStateForPath('/projects')).toEqual({ screen: 'my-works', activeTab: 'profile' });
    expect(routeStateForPath('/warehouses')).toEqual({ screen: 'warehouse', activeTab: 'profile' });
  });

  it('maps resource and flow URLs to page state', () => {
    expect(routeStateForPath('/community/posts/post-1')).toEqual({ screen: 'pattern-detail', activeTab: 'discover' });
    expect(routeStateForPath('/community/users/user-1')).toEqual({ screen: 'author-profile', activeTab: 'discover' });
    expect(routeStateForPath('/projects/project-1/edit')).toEqual({ screen: 'canvas', activeTab: 'home' });
    expect(routeStateForPath('/projects/project-1/beading')).toEqual({ screen: 'beading', activeTab: 'home' });
    expect(routeStateForPath('/warehouses/warehouse-1')).toEqual({ screen: 'warehouse-detail', activeTab: 'profile' });
    expect(routeStateForPath('/split/crop')).toEqual({ screen: 'split-crop', activeTab: 'home' });
    expect(routeStateForPath('/split/preview')).toEqual({ screen: 'split-preview', activeTab: 'home' });
  });

  it('builds navigable paths for page transitions', () => {
    expect(appPathForScreen('home', 'discover')).toBe('/discover');
    expect(appPathForScreen('pattern-detail')).toBe('/community/posts');
    expect(appPathForScreen('author-profile')).toBe('/community/users');
    expect(appPathForScreen('my-works')).toBe('/projects');
    expect(appPathForScreen('warehouse')).toBe('/warehouses');
    expect(appPathForScreen('split-preview')).toBe('/split/preview');
  });

  it('declares a route for every existing page family', () => {
    expect(Object.values(H5_ROUTE_PATHS)).toEqual(expect.arrayContaining([
      '/', '/discover', '/messages', '/profile', '/following', '/followers',
      '/community/posts/:postId', '/community/users/:userId', '/projects',
      '/projects/:projectId/edit', '/projects/:projectId/beading', '/warehouses',
      '/warehouses/:warehouseId', '/split', '/split/crop', '/split/preview',
      '/canvas', '/beading',
    ]));
  });
});
