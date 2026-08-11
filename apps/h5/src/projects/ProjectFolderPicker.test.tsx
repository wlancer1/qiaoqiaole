import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ProjectFolderPicker } from './ProjectFolderPicker';

const folders = [
  { id: 'animals', name: '动物作品', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
  { id: 'gifts', name: '节日礼物', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
];

describe('ProjectFolderPicker', () => {
  it('shows uncategorized and folders, then returns the selected folder id', () => {
    const onChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<ProjectFolderPicker folders={folders} value="animals" onChange={onChange} />);
    });

    const select = renderer.root.findByProps({ 'aria-label': '保存位置' });
    expect(select.props.value).toBe('animals');
    expect(renderer.root.findAllByType('option').map((option) => option.children.join(''))).toEqual(['未分类', '动物作品', '节日礼物']);
    act(() => select.props.onChange({ target: { value: 'gifts' } }));
    expect(onChange).toHaveBeenCalledWith('gifts');
  });

  it('falls back to uncategorized if the selected folder was deleted and can request a new folder', () => {
    const onCreateFolder = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<ProjectFolderPicker folders={folders} value="deleted-folder" onChange={vi.fn()} onCreateFolder={onCreateFolder} />);
    });

    expect(renderer.root.findByProps({ 'aria-label': '保存位置' }).props.value).toBe('');
    act(() => renderer.root.findByProps({ 'aria-label': '新建文件夹' }).props.onClick());
    expect(onCreateFolder).toHaveBeenCalledTimes(1);
  });
});
