import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('H5App canvas authentication fallback', () => {
  it('renders the shared login modal while the canvas screen is active', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
    const canvasBranch = source.match(/if \(screen === 'canvas'\) \{([\s\S]*?)\n  \}\n\n  if \(screen === 'beading'/)?.[1] ?? '';

    expect(canvasBranch).toContain('return withLoginModalFallback(');
    expect(canvasBranch).toContain('<CanvasPage');
  });

  it('does not forward the save button click event as an authentication token', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/editor/CanvasPage.tsx'), 'utf8');

    expect(source).toContain('onClick={() => saveCurrentProject()}');
    expect(source).not.toContain('onClick={saveCurrentProject}');
  });
});
