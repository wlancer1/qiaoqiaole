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
});
