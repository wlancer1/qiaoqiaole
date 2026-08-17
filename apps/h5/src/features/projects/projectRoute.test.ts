import { describe, expect, it } from 'vitest';
import { parseProjectListRoute, projectListPath } from './projectRoute';

describe('project list route', () => {
  it('defaults absent or malformed query values to the first all-folder page', () => {
    expect(parseProjectListRoute('')).toEqual({ folderId: 'all', page: 1, tab: 'works' });
    expect(parseProjectListRoute('?folder=&page=0')).toEqual({ folderId: 'all', page: 1, tab: 'works' });
    expect(parseProjectListRoute('?folder=all&page=1.2')).toEqual({ folderId: 'all', page: 1, tab: 'works' });
    expect(parseProjectListRoute('?folder=%20&page=-3')).toEqual({ folderId: 'all', page: 1, tab: 'works' });
  });

  it('keeps an encoded folder id and a positive integer page for refresh and browser history', () => {
    expect(parseProjectListRoute('?folder=%E6%94%B6%E8%97%8F%2F2026&page=3')).toEqual({ folderId: '收藏/2026', page: 3, tab: 'works' });
    expect(projectListPath({ folderId: '收藏/2026', page: 3 })).toBe('/projects?folder=%E6%94%B6%E8%97%8F%2F2026&page=3');
  });

  it('keeps the liked-works tab in the URL for refresh and direct links', () => {
    expect(parseProjectListRoute('?tab=likes')).toMatchObject({ tab: 'likes' });
    expect(projectListPath({ folderId: 'all', page: 1, tab: 'likes' })).toBe('/projects?tab=likes');
  });

  it('uses the canonical default URL without redundant query parameters', () => {
    expect(projectListPath({ folderId: 'all', page: 1 })).toBe('/projects');
    expect(projectListPath({ folderId: 'all', page: 2 })).toBe('/projects?page=2');
    expect(projectListPath({ folderId: 'folder-1', page: 1 })).toBe('/projects?folder=folder-1');
  });
});
