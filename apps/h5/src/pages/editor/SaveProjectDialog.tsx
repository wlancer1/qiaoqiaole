import { Save, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ProjectFolderPicker } from '../../projects/ProjectFolderPicker';
import type { ProjectFolder } from '../../projects/projectFolders';

export type SaveProjectIntent = { startBeading: boolean };

export function SaveProjectDialog({ saveProjectName, setSaveProjectName, shareToCommunity, setShareToCommunity, activeProjectShared, isSaving, onConfirm, onClose, folders, folderId, onFolderChange, onCreateFolder, covered = false }: {
  saveProjectName: string;
  setSaveProjectName: (value: string) => void;
  shareToCommunity: boolean;
  setShareToCommunity: (value: boolean) => void;
  activeProjectShared: boolean;
  isSaving: boolean;
  onConfirm: (intent: SaveProjectIntent) => void;
  onClose: () => void;
  folders?: ProjectFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  onCreateFolder?: () => void;
  covered?: boolean;
}) {
  const submitLockedRef = useRef(false);
  useEffect(() => {
    if (!isSaving) submitLockedRef.current = false;
  }, [isSaving]);

  const submit = (startBeading: boolean) => {
    if (covered || isSaving || submitLockedRef.current || !saveProjectName.trim()) return;
    submitLockedRef.current = true;
    onConfirm({ startBeading });
  };

  return (
    <div className="save-project-modal" role="dialog" aria-modal={covered ? undefined : 'true'} aria-hidden={covered || undefined} inert={covered || undefined} aria-labelledby="save-project-title" onClick={() => { if (!covered && !isSaving) onClose(); }}>
      <form className="save-project-panel" onSubmit={(event) => { event.preventDefault(); submit(false); }} onClick={(event) => event.stopPropagation()}>
        <button className="save-project-close" type="button" aria-label="关闭保存作品" onClick={() => { if (!covered) onClose(); }} disabled={isSaving || covered}><X aria-hidden="true" /></button>
        <h2 id="save-project-title">保存作品</h2>
        <label className="save-project-field">
          <span>作品名称</span>
          <div className="save-project-input-wrap">
            <input autoFocus type="text" aria-label="作品名称" maxLength={30} value={saveProjectName} disabled={covered} onChange={(event) => { if (!covered) setSaveProjectName(event.target.value); }} />
            {saveProjectName ? <button type="button" aria-label="清空作品名称" onClick={() => { if (!covered) setSaveProjectName(''); }} disabled={isSaving || covered}>×</button> : null}
          </div>
          <output>{saveProjectName.length}/30</output>
        </label>
        {folders && onFolderChange ? <ProjectFolderPicker folders={folders} value={folderId} onChange={(nextFolderId) => { if (!covered) onFolderChange(nextFolderId); }} onCreateFolder={covered ? undefined : onCreateFolder} /> : null}
        <label className="save-project-share-option">
          <input type="checkbox" checked={shareToCommunity} onChange={(event) => { if (!covered) setShareToCommunity(event.target.checked); }} disabled={isSaving || activeProjectShared || covered} />
          <span><strong>{activeProjectShared ? '已分享到社区' : '分享到社区'}</strong><small>{activeProjectShared ? '保存不会重复分享或刷新分享时间' : '分享后会出现在发现和热门模板'}</small></span>
        </label>
        <button className="save-project-submit" type="submit" aria-label="保存到作品" onClick={() => submit(false)} disabled={isSaving || covered || !saveProjectName.trim()}><Save aria-hidden="true" />{isSaving ? '保存中…' : '保存到作品'}</button>
        <button className="save-project-submit save-project-start" type="button" aria-label="保存并开始拼豆" onClick={() => submit(true)} disabled={isSaving || covered || !saveProjectName.trim()}><Save aria-hidden="true" />保存并开始拼豆</button>
      </form>
    </div>
  );
}
