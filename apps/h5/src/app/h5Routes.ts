import type { AppScreen, HomeTab } from '../shared/h5Types';

export type H5RouteState = {
  screen: AppScreen;
  activeTab: HomeTab;
};

export const H5_ROUTE_PATHS = {
  home: '/',
  discover: '/discover',
  messages: '/messages',
  profile: '/profile',
  following: '/following',
  followers: '/followers',
  communityPost: '/community/posts/:postId',
  authorProfile: '/community/users/:userId',
  projects: '/projects',
  projectEdit: '/projects/:projectId/edit',
  projectBeading: '/projects/:projectId/beading',
  warehouses: '/warehouses',
  warehouseDetail: '/warehouses/:warehouseId',
  split: '/split',
  splitCrop: '/split/crop',
  splitPreview: '/split/preview',
  canvas: '/canvas',
  beading: '/beading',
} as const;

const routeState: Array<{ pattern: RegExp; state: H5RouteState }> = [
  { pattern: /^\/discover\/?$/, state: { screen: 'home', activeTab: 'discover' } },
  { pattern: /^\/messages\/?$/, state: { screen: 'home', activeTab: 'messages' } },
  { pattern: /^\/profile\/?$/, state: { screen: 'home', activeTab: 'profile' } },
  { pattern: /^\/following\/?$/, state: { screen: 'following', activeTab: 'profile' } },
  { pattern: /^\/followers\/?$/, state: { screen: 'followers', activeTab: 'profile' } },
  { pattern: /^\/community\/posts\/[^/]+\/?$/, state: { screen: 'pattern-detail', activeTab: 'discover' } },
  { pattern: /^\/community\/users\/[^/]+\/?$/, state: { screen: 'author-profile', activeTab: 'discover' } },
  { pattern: /^\/projects\/[^/]+\/edit\/?$/, state: { screen: 'canvas', activeTab: 'home' } },
  { pattern: /^\/projects\/[^/]+\/beading\/?$/, state: { screen: 'beading', activeTab: 'home' } },
  { pattern: /^\/projects\/?$/, state: { screen: 'my-works', activeTab: 'profile' } },
  { pattern: /^\/warehouses\/[^/]+\/?$/, state: { screen: 'warehouse-detail', activeTab: 'profile' } },
  { pattern: /^\/warehouses\/?$/, state: { screen: 'warehouse', activeTab: 'profile' } },
  { pattern: /^\/split\/crop\/?$/, state: { screen: 'split-crop', activeTab: 'home' } },
  { pattern: /^\/split\/preview\/?$/, state: { screen: 'split-preview', activeTab: 'home' } },
  { pattern: /^\/split\/?$/, state: { screen: 'split', activeTab: 'home' } },
  { pattern: /^\/canvas\/?$/, state: { screen: 'canvas', activeTab: 'home' } },
  { pattern: /^\/beading\/?$/, state: { screen: 'beading', activeTab: 'home' } },
];

export function routeStateForPath(pathname: string): H5RouteState {
  const match = routeState.find(({ pattern }) => pattern.test(pathname));
  return match?.state ?? { screen: 'home', activeTab: 'home' };
}

export function appPathForScreen(screen: AppScreen, activeTab: HomeTab = 'home'): string {
  if (screen === 'home') {
    if (activeTab === 'discover') return '/discover';
    if (activeTab === 'messages') return '/messages';
    if (activeTab === 'profile') return '/profile';
    return '/';
  }
  if (screen === 'pattern-detail') return '/community/posts';
  if (screen === 'author-profile') return '/community/users';
  if (screen === 'my-works') return '/projects';
  if (screen === 'warehouse') return '/warehouses';
  if (screen === 'warehouse-detail') return '/warehouses';
  if (screen === 'split-crop') return '/split/crop';
  if (screen === 'split-preview') return '/split/preview';
  if (screen === 'split') return '/split';
  if (screen === 'canvas') return '/canvas';
  if (screen === 'beading') return '/beading';
  if (screen === 'following') return '/following';
  if (screen === 'followers') return '/followers';
  return '/';
}
