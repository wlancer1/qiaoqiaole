import { describe, expect, it } from 'vitest';
import { parseEditorProjectRoute } from './editorRoute';

describe('parseEditorProjectRoute', () => {
  it('decodes a single encoded project id exactly once', () => {
    expect(parseEditorProjectRoute('/projects/project%20one/edit')).toEqual({ projectId: 'project one' });
  });

  it.each(['/projects/%2F/edit', '/projects/%E0%A4%A/edit', '/projects//edit', '/projects/a%00/edit'])('rejects malformed editor project routes: %s', (pathname) => {
    expect(parseEditorProjectRoute(pathname)).toBeNull();
  });
});
