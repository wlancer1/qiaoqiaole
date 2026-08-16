import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { useEditorProjectLoader } from './useEditorProjectLoader';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe('useEditorProjectLoader', () => {
  it('discards a project detail that arrives after the route changes', async () => {
    const first = deferred<{ project: { id: string } }>();
    const second = deferred<{ project: { id: string } }>();
    const requestProject = vi.fn((id: string) => id === 'one' ? first.promise : second.promise);
    const onLoaded = vi.fn();
    const props = { projectId: 'one', requestProject, onLoaded, setStatus: vi.fn() };
    const View = ({ projectId }: { projectId: string }) => {
      useEditorProjectLoader({ ...props, projectId, enabled: true, token: 'token', authStatus: 'authenticated', activeProjectId: '' });
      return null;
    };
    let view: ReturnType<typeof create>;
    await act(async () => { view = create(<View projectId="one" />); });
    await act(async () => { view!.update(<View projectId="two" />); });
    await act(async () => { first.resolve({ project: { id: 'one' } }); second.resolve({ project: { id: 'two' } }); await Promise.resolve(); });

    expect(onLoaded).toHaveBeenCalledWith({ id: 'two' });
    expect(onLoaded).not.toHaveBeenCalledWith({ id: 'one' });
  });
});
