import { normalizeSelectedTags } from '../../community/communityTags';

export type CommunityDiscoveryRoute = {
  sort: 'hot' | 'latest';
  tags: string[];
  page: number;
  query: string;
};

const MAX_QUERY_LENGTH = 100;

export function communityDiscoveryRoute(search: string): CommunityDiscoveryRoute {
  const params = new URLSearchParams(search);
  const sort = params.get('sort') === 'latest' ? 'latest' : 'hot';
  const rawPage = Number.parseInt(params.get('page') || '1', 10);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const tags = normalizeSelectedTags((params.get('tags') || '').split(','));
  return { sort, tags, page, query: (params.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH) };
}

export function communityDiscoverySearch(route: CommunityDiscoveryRoute): string {
  const params = new URLSearchParams();
  if (route.sort !== 'hot') params.set('sort', route.sort);
  if (route.tags.length) params.set('tags', route.tags.join(','));
  if (route.page > 1) params.set('page', String(route.page));
  if (route.query) params.set('q', route.query);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function communityRouteBackTarget(searchOrUrl: string, fallback: string): string {
  const search = searchOrUrl.includes('?') ? searchOrUrl.slice(searchOrUrl.indexOf('?')) : searchOrUrl;
  const from = new URLSearchParams(search).get('from');
  if (!from || !from.startsWith('/') || from.startsWith('//')) return fallback;
  try {
    const target = new URL(from, 'http://qiaoqiaole.local');
    if (target.origin !== 'http://qiaoqiaole.local') return fallback;
    if (!/^(?:\/discover|\/following|\/followers|\/profile|\/community\/posts\/[^/]+|\/community\/users\/[^/]+)\/?$/.test(target.pathname)) return fallback;
    return `${target.pathname}${target.search}`;
  } catch {
    return fallback;
  }
}
