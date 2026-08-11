import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { SaveProjectDialog } from './SaveProjectDialog';

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onConfirm = vi.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<SaveProjectDialog
      saveProjectName="小熊"
      setSaveProjectName={vi.fn()}
      shareToCommunity={false}
      setShareToCommunity={vi.fn()}
      activeProjectShared={false}
      isSaving={false}
      onConfirm={onConfirm}
      onClose={vi.fn()}
      {...overrides}
    />);
  });
  return { renderer, onConfirm };
}

describe('SaveProjectDialog', () => {
  it('submits ordinary save with an explicit false intent', () => {
    const { renderer, onConfirm } = renderDialog();
    act(() => renderer.root.findByProps({ 'aria-label': '保存到作品' }).props.onClick({ preventDefault: vi.fn() }));
    expect(onConfirm).toHaveBeenCalledWith({ startBeading: false });
  });

  it('submits save-and-start with an explicit true intent', () => {
    const { renderer, onConfirm } = renderDialog();
    act(() => renderer.root.findByProps({ 'aria-label': '保存并开始拼豆' }).props.onClick());
    expect(onConfirm).toHaveBeenCalledWith({ startBeading: true });
  });

  it('does not submit an empty name or a second click while submitting', () => {
    const { renderer, onConfirm } = renderDialog({ saveProjectName: '' });
    act(() => renderer.root.findByProps({ 'aria-label': '保存并开始拼豆' }).props.onClick());
    expect(onConfirm).not.toHaveBeenCalled();

    const second = renderDialog();
    act(() => {
      const button = second.renderer.root.findByProps({ 'aria-label': '保存并开始拼豆' });
      button.props.onClick();
      button.props.onClick();
    });
    expect(second.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('becomes inert, hidden and non-interactive while covered by a folder sheet', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const setSaveProjectName = vi.fn();
    const { renderer } = renderDialog({ covered: true, onClose, onConfirm, setSaveProjectName, folders: [{ id: 'folder-1', name: '花卉', createdAt: '', updatedAt: '' }], onFolderChange: vi.fn() });
    const dialog = renderer.root.findByProps({ 'aria-labelledby': 'save-project-title' });

    expect(dialog.props['aria-hidden']).toBe(true);
    expect(dialog.props['aria-modal']).toBeUndefined();
    expect(dialog.props.inert).toBe(true);
    act(() => {
      dialog.props.onClick();
      renderer.root.findByProps({ 'aria-label': '关闭保存作品' }).props.onClick();
      renderer.root.findByProps({ 'aria-label': '保存到作品' }).props.onClick({ preventDefault: vi.fn() });
      renderer.root.findByProps({ 'aria-label': '作品名称' }).props.onChange({ target: { value: '改名' } });
      renderer.root.findByProps({ 'aria-label': '保存位置' }).props.onChange({ target: { value: 'folder-1' } });
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(setSaveProjectName).not.toHaveBeenCalled();
  });
});
