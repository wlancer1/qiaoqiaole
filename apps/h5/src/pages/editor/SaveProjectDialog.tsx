import { Save, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export type SaveProjectIntent = { startBeading: boolean };

export function SaveProjectDialog({ saveProjectName, setSaveProjectName, shareToCommunity, setShareToCommunity, activeProjectShared, isSaving, onConfirm, onClose }: {
  saveProjectName: string;
  setSaveProjectName: (value: string) => void;
  shareToCommunity: boolean;
  setShareToCommunity: (value: boolean) => void;
  activeProjectShared: boolean;
  isSaving: boolean;
  onConfirm: (intent: SaveProjectIntent) => void;
  onClose: () => void;
}) {
  const submitLockedRef = useRef(false);
  useEffect(() => {
    if (!isSaving) submitLockedRef.current = false;
  }, [isSaving]);

  const submit = (startBeading: boolean) => {
    if (isSaving || submitLockedRef.current || !saveProjectName.trim()) return;
    submitLockedRef.current = true;
    onConfirm({ startBeading });
  };

  return (
    <div className="save-project-modal" role="dialog" aria-modal="true" aria-labelledby="save-project-title" onClick={() => { if (!isSaving) onClose(); }}>
      <form className="save-project-panel" onSubmit={(event) => { event.preventDefault(); submit(false); }} onClick={(event) => event.stopPropagation()}>
        <button className="save-project-close" type="button" aria-label="关闭保存作品" onClick={onClose} disabled={isSaving}><X aria-hidden="true" /></button>
        <h2 id="save-project-title">保存作品</h2>
        <label className="save-project-field">
          <span>作品名称</span>
          <div className="save-project-input-wrap">
            <input autoFocus type="text" aria-label="作品名称" maxLength={30} value={saveProjectName} onChange={(event) => setSaveProjectName(event.target.value)} />
            {saveProjectName ? <button type="button" aria-label="清空作品名称" onClick={() => setSaveProjectName('')} disabled={isSaving}>×</button> : null}
          </div>
          <output>{saveProjectName.length}/30</output>
        </label>
        <label className="save-project-share-option">
          <input type="checkbox" checked={shareToCommunity} onChange={(event) => setShareToCommunity(event.target.checked)} disabled={isSaving || activeProjectShared} />
          <span><strong>{activeProjectShared ? '已分享到社区' : '分享到社区'}</strong><small>{activeProjectShared ? '保存不会重复分享或刷新分享时间' : '分享后会出现在发现和热门模板'}</small></span>
        </label>
        <button className="save-project-submit" type="submit" aria-label="保存到作品" onClick={() => submit(false)} disabled={isSaving || !saveProjectName.trim()}><Save aria-hidden="true" />{isSaving ? '保存中…' : '保存到作品'}</button>
        <button className="save-project-submit save-project-start" type="button" aria-label="保存并开始拼豆" onClick={() => submit(true)} disabled={isSaving || !saveProjectName.trim()}><Save aria-hidden="true" />保存并开始拼豆</button>
      </form>
    </div>
  );
}
