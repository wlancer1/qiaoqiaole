import { describe, expect, it } from 'vitest';
import { toProjectSummary } from './projectSummary';

describe('toProjectSummary', () => {
  it('removes detail fields and inline image payloads before a project enters list state', () => {
    const summary = toProjectSummary({ id: 'p1', name: '作品', rows: 1, cols: 1, tone: 'recent', createdAt: '', updatedAt: '', canvasData: '[]', beadList: [{ color: 'A1', count: 1 }], sourceImage: 'data:image/png;base64,AA==', thumbnailImage: 'data:image/png;base64,BB==' } as never);
    expect(summary).not.toHaveProperty('canvasData');
    expect(summary).not.toHaveProperty('beadList');
    expect(summary).not.toHaveProperty('sourceImage');
    expect(summary.thumbnailImage).toBe('');
  });
});
