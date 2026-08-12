import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectFolderPicker } from './ProjectFolderPicker';
import fs from 'node:fs';
import path from 'node:path';

const folders = [
  { id: 'animals', name: '动物作品', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
  { id: 'gifts', name: '节日礼物', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
];

describe('ProjectFolderPicker', () => {
  it('uses a two-column aligned layout for the folder select and create button', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const pickerStyles = styles.match(/\.save-project-folder-picker\s*\{[^}]*\}/)?.[0] ?? '';
    const buttonStyles = styles.match(/\.save-project-folder-picker > button\s*\{[^}]*\}/)?.[0] ?? '';

    expect(pickerStyles).toContain('display: grid');
    expect(pickerStyles).toContain('grid-template-columns: minmax(0, 1fr) auto');
    expect(buttonStyles).toContain('align-self: end');
    expect(buttonStyles).toContain('height: 1.65rem');
    expect(buttonStyles).toContain('min-height: 1.65rem');
    const selectStyles = styles.match(/\.save-project-folder-picker select\s*\{[^}]*\}/)?.[0] ?? '';
    expect(selectStyles).toContain('height: 1.65rem');
    expect(selectStyles).toContain('box-sizing: border-box');
  });

  it('shows uncategorized and folders, then returns the selected folder id', () => {
    const onChange = vi.fn();
    const markup = renderToStaticMarkup(<ProjectFolderPicker folders={folders} value="animals" onChange={onChange} />);
    expect(markup).toContain('aria-label="保存位置"');
    expect(markup).toContain('<option value="animals" selected="">动物作品</option>');
    expect(markup).toContain('<option value="">未分类</option>');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to uncategorized if the selected folder was deleted and can request a new folder', () => {
    const onCreateFolder = vi.fn();
    const markup = renderToStaticMarkup(<ProjectFolderPicker folders={folders} value="deleted-folder" onChange={vi.fn()} onCreateFolder={onCreateFolder} />);
    expect(markup).toContain('<option value="" selected="">未分类</option>');
    expect(markup).toContain('aria-label="新建文件夹"');
    expect(onCreateFolder).not.toHaveBeenCalled();
  });
});
