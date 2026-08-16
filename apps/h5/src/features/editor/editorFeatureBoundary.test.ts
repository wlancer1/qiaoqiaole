import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('editor feature boundary', () => {
  it('keeps canvas interaction state and the editor route view out of application composition', () => {
    const application = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');
    expect(application).not.toContain("const [tool, setTool]");
    expect(application).not.toContain("const [history, setHistory]");
    expect(application).not.toContain('handleCanvasPointerDown');
    expect(application).toContain('<EditorFeatureContent');
  });

  it('keeps pointer movement local to the editor feature rather than Redux', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/editor/EditorFeatureContent.tsx'), 'utf8');
    expect(source).toContain('const pointerMove');
    expect(source).toContain('const pointerDown');
    expect(source).not.toMatch(/useApp(?:Dispatch|Selector)|dispatch\(/);
  });
});
