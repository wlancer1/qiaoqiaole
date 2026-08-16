import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EditorFeatureContent } from './EditorFeatureContent';

vi.mock('../../pages/editor/CanvasPage', () => ({ CanvasPage: () => <main className="editor-canvas-stub" /> }));

const project = { id: 'project one', name: '测试作品', rows: 1, cols: 1, canvasData: '[]' };

function renderEditor(path: string, requestApi = vi.fn().mockResolvedValue({ project }), extra: Partial<React.ComponentProps<typeof EditorFeatureContent>> = {}) {
  const props: React.ComponentProps<typeof EditorFeatureContent> = {
    requestApi, token: 'token', authStatus: 'authenticated', requireLogin: vi.fn(), setStatus: vi.fn(), ...extra,
  };
  return { props, requestApi, view: create(<MemoryRouter initialEntries={[path]}><EditorFeatureContent {...props} /></MemoryRouter>) };
}

describe('EditorFeatureContent route workflow', () => {
  it('loads a direct encoded project route with the decoded id exactly once', async () => {
    const { requestApi } = renderEditor('/projects/project%20one/edit');
    await act(async () => { await Promise.resolve(); });
    expect(requestApi).toHaveBeenCalledWith('/projects/project%20one', {}, 'token');
  });

  it('shows a recoverable error instead of an endless skeleton for a missing project', async () => {
    const missing = Object.assign(new Error('not found'), { status: 404 });
    const { view, props } = renderEditor('/projects/missing/edit', vi.fn().mockRejectedValue(missing));
    await act(async () => { await Promise.resolve(); });
    expect(props.setStatus).toHaveBeenCalledWith('作品不存在或已被删除。');
    expect(view.toJSON()).toMatchObject({ props: { className: 'editor-route-error' } });
  });

  it('offers the login path after a protected editor request returns 401', async () => {
    const unauthorised = Object.assign(new Error('expired'), { status: 401 });
    const requireLogin = vi.fn();
    const { view, props } = renderEditor('/projects/private/edit', vi.fn().mockRejectedValue(unauthorised), { requireLogin });
    await act(async () => { await Promise.resolve(); });
    expect(requireLogin).toHaveBeenCalled();
    expect(props.setStatus).toHaveBeenCalledWith('登录后才能查看该作品。');
    expect(view.toJSON()).toMatchObject({ props: { className: 'editor-route-error' } });
  });
});
