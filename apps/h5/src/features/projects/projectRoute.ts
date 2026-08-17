export type ProjectListRoute = {
  folderId: string | 'all';
  page: number;
  tab: 'works' | 'likes';
};

function positiveInteger(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseProjectListRoute(search: string): ProjectListRoute {
  const params = new URLSearchParams(search);
  const folder = params.get('folder')?.trim();
  return {
    folderId: folder || 'all',
    page: positiveInteger(params.get('page')) ?? 1,
    tab: params.get('tab') === 'likes' ? 'likes' : 'works',
  };
}

export function projectListPath({ folderId, page, tab = 'works' }: ProjectListRoute): string {
  const params = new URLSearchParams();
  if (tab === 'likes') params.set('tab', 'likes');
  if (folderId !== 'all') params.set('folder', folderId);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return search ? `/projects?${search}` : '/projects';
}
