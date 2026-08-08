import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectActionSheet } from './ProjectActionSheet';

describe('ProjectActionSheet', () => {
  it('shows continue, edit, share and delete actions', () => {
    const markup = renderToStaticMarkup(createElement(ProjectActionSheet, { project: { id: 'p1', name: '小熊', rows: 32, cols: 32, tone: 'recent-bear', canvasData: '' } as any, hasSession: true, onClose: vi.fn(), onStart: vi.fn(), onEdit: vi.fn(), onShare: vi.fn(), onDelete: vi.fn() }));
    expect(markup).toContain('继续拼豆');
    expect(markup).toContain('编辑作品');
    expect(markup).toContain('分享作品');
    expect(markup).toContain('删除作品');
  });
});
