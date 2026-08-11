import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ShareCommunityDialog } from './ShareCommunityDialog';

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onConfirm = vi.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<ShareCommunityDialog
      project={{ id: 'project-1', name: '小熊', rows: 24, cols: 18, tone: 'recent-bear', createdAt: '', updatedAt: '' }}
      tags={[]}
      onTagsChange={vi.fn()}
      onConfirm={onConfirm}
      onClose={vi.fn()}
      isSaving={false}
      {...overrides}
    />);
  });
  return { renderer, onConfirm };
}

describe('ShareCommunityDialog', () => {
  it('requires between one and three preset tags before publishing', () => {
    const onTagsChange = vi.fn();
    const { renderer, onConfirm } = renderDialog({ onTagsChange });
    const confirm = renderer.root.findByProps({ 'aria-label': '确认发布' });
    expect(confirm.props.disabled).toBe(true);

    act(() => renderer.root.findByProps({ 'aria-label': '选择标签 动物' }).props.onClick());
    expect(onTagsChange).toHaveBeenCalledWith(['动物']);
    act(() => confirm.props.onClick());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits selected tags and labels an already shared work as tag editing', () => {
    const { renderer, onConfirm } = renderDialog({ tags: ['动物', '动漫'], isShared: true });
    expect(renderer.root.findByProps({ id: 'share-community-title' }).children).toEqual(['编辑社区标签']);
    const confirm = renderer.root.findByProps({ 'aria-label': '保存社区标签' });
    expect(confirm.props.disabled).toBe(false);
    act(() => confirm.props.onClick());
    expect(onConfirm).toHaveBeenCalledWith(['动物', '动漫']);
  });
});
