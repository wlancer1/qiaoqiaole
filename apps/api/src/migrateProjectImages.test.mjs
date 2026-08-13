import { describe, expect, it } from 'vitest';
import {
  findLegacyProjectImages,
  parseImageDataUrl,
  shouldExecuteMigration,
} from '../scripts/migrate-project-images.mjs';

describe('project image migration helpers', () => {
  it('finds only base64 project image fields and preserves COS paths', () => {
    const rows = [
      { id: 'p1', user_id: 'u1', name: '一', source_image: 'data:image/png;base64,AA==', thumbnail_image: 'cos://bucket/thumb.webp' },
      { id: 'p2', user_id: 'u2', name: '二', source_image: '', thumbnail_image: 'data:image/webp;base64,AQID' },
      { id: 'p3', user_id: 'u3', name: '三', source_image: 'cos://bucket/source.webp', thumbnail_image: '' },
    ];

    expect(findLegacyProjectImages(rows)).toEqual([
      { projectId: 'p1', userId: 'u1', name: '一', field: 'source_image', dataUrl: 'data:image/png;base64,AA==' },
      { projectId: 'p2', userId: 'u2', name: '二', field: 'thumbnail_image', dataUrl: 'data:image/webp;base64,AQID' },
    ]);
  });

  it('parses supported data URLs and rejects malformed or non-image values', () => {
    expect(parseImageDataUrl('data:image/png;base64,AA==')).toEqual({
      contentType: 'image/png',
      buffer: Buffer.from([0]),
    });
    expect(() => parseImageDataUrl('data:text/plain;base64,AA==')).toThrow('图片格式无效');
    expect(() => parseImageDataUrl('not-an-image')).toThrow('图片格式无效');
  });

  it('runs in preview mode unless execute is explicitly requested', () => {
    expect(shouldExecuteMigration([])).toBe(false);
    expect(shouldExecuteMigration(['--dry-run'])).toBe(false);
    expect(shouldExecuteMigration(['--execute'])).toBe(true);
  });
});
