import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { removeGridEdgeBackground } from '../../utils/gridBackground';
import { EditorFeatureContent, type EditorFeatureCommands } from './EditorFeatureContent';

vi.mock('../../pages/editor/CanvasPage', () => ({
  CanvasPage: (props: { canRemoveGridBackground?: boolean }) => (
    <main
      className="editor-canvas-stub"
      data-can-remove-grid-background={props.canRemoveGridBackground ? 'true' : 'false'}
    />
  ),
}));

const project = { id: 'project one', name: '测试作品', rows: 1, cols: 1, canvasData: '[]' };

function renderEditor(path: string, requestApi = vi.fn().mockResolvedValue({ project }), extra: Partial<React.ComponentProps<typeof EditorFeatureContent>> = {}) {
  const props: React.ComponentProps<typeof EditorFeatureContent> = {
    requestApi, token: 'token', authStatus: 'authenticated', requireLogin: vi.fn(), setStatus: vi.fn(), ...extra,
  };
  return { props, requestApi, view: create(<MemoryRouter initialEntries={[path]}><EditorFeatureContent {...props} /></MemoryRouter>) };
}

describe('EditorFeatureContent route workflow', () => {
  it('commits a background transformation without unloading the saved project', async () => {
    const cells = Array.from({ length: 9 }, (_, index) => ({
      x: index % 3,
      y: Math.floor(index / 3),
      color: index === 4 ? '#ff0000' : '#ffffff',
      transparent: false,
    }));
    let commands: EditorFeatureCommands | undefined;
    renderEditor('/projects/project%20one/edit', vi.fn().mockResolvedValue({ project: { ...project, rows: 3, cols: 3, canvasData: JSON.stringify(cells) } }), {
      onCommands: (value) => { commands = value; },
    });

    await act(async () => { await Promise.resolve(); });
    const before = commands!.snapshot();

    await act(async () => {
      commands!.commitCells(removeGridEdgeBackground(before.cells, before.rows, before.cols));
    });

    expect(commands!.snapshot()).toMatchObject({ activeProjectId: 'project one' });
    expect(commands!.snapshot().cells.filter((cell) => cell.transparent)).toHaveLength(8);
  });

  it('keeps background removal available when editing a saved project', async () => {
    const { view } = renderEditor('/projects/project%20one/edit');

    await act(async () => { await Promise.resolve(); });

    expect(view.root.findByProps({ className: 'editor-canvas-stub' }).props['data-can-remove-grid-background']).toBe('true');
  });

  it('keeps the loaded project name for the save dialog', async () => {
    let commands: EditorFeatureCommands | undefined;
    renderEditor('/projects/project%20one/edit', vi.fn().mockResolvedValue({ project: { ...project, name: '已有名称' } }), {
      onCommands: (value) => { commands = value; },
    });

    await act(async () => { await Promise.resolve(); });

    expect(commands!.snapshot().projectName).toBe('已有名称');
  });

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
