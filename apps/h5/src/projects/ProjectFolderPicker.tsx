import type { ProjectFolder } from './projectFolders';
import { resolveFolderId } from './projectFolders';

export function ProjectFolderPicker({ folders, value, onChange, onCreateFolder }: {
  folders: ProjectFolder[];
  value: string | null | undefined;
  onChange: (folderId: string | null) => void;
  onCreateFolder?: () => void;
}) {
  const selectedFolderId = resolveFolderId(value, folders);
  return (
    <div className="save-project-folder-picker">
      <label>
        <span>保存位置</span>
        <select
          className="save-project-folder-select"
          aria-label="保存位置"
          value={selectedFolderId || ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">未分类</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label>
      {onCreateFolder ? <button type="button" aria-label="新建文件夹" onClick={onCreateFolder}>新建文件夹</button> : null}
    </div>
  );
}
