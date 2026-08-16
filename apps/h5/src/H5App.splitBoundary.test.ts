import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const applicationSource = readFileSync(new URL('./app/H5Application.tsx', import.meta.url), 'utf8');
const splitSource = readFileSync(new URL('./features/split/SplitFeatureContent.tsx', import.meta.url), 'utf8');

describe('H5App split feature boundary', () => {
  it('uses H5Application as the only application composition entry', () => {
    expect(existsSync(new URL('./H5App.tsx', import.meta.url))).toBe(false);
    expect(applicationSource).toContain('<SplitFeatureProvider');
  });

  it('keeps split workflow, upload/XHS state, and pointer gestures out of the application coordinator', () => {
    expect(applicationSource).not.toContain('const [splitMode');
    expect(applicationSource).not.toContain('const [splitPreview');
    expect(applicationSource).not.toContain('const [uploadedSplitImage');
    expect(applicationSource).not.toContain('handleSplitPointer');
    expect(applicationSource).not.toContain('extractXiaohongshuImage');
    expect(applicationSource).not.toContain('showXhs');
    expect(applicationSource).not.toContain('showUploadModal');
  });

  it('uses only the explicit feature bridges for editor import and source-image persistence', () => {
    expect(applicationSource).toContain('const importSplitToCanvas = ({ cells, rows, cols }');
    expect(applicationSource).toContain('splitCommandsRef.current?.getSourceImage()');
    expect(splitSource).not.toContain('handleSplitPointerDown: () => undefined');
    expect(splitSource).not.toContain('handleGridHandlePointerDown: () => undefined');
  });
});
