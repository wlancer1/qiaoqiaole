import { useEffect, useRef, useState } from 'react';
import { SaveProjectDialog, type SaveProjectIntent } from '../../pages/editor/SaveProjectDialog';
import type { ProjectFolder } from '../../projects/projectFolders';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';

export type ProjectSaveOverlayController = { open: () => void };

export function useProjectSaveOverlay({
  token,
  initialName,
  initialShared,
  folders,
  folderId,
  onFolderChange,
  onCreateFolder,
  requireLogin,
  persist,
}: {
  token: string;
  initialName: () => string;
  initialShared: () => boolean;
  folders: ProjectFolder[];
  folderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onCreateFolder: () => void;
  requireLogin: (next: (token: string) => void) => void;
  persist: (input: { name: string; shareToCommunity: boolean; intent: SaveProjectIntent }) => Promise<boolean>;
}): ProjectSaveOverlayController {
  const { setOverlaySlot } = useAppOverlay();
  const [saveOpen, setSaveOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [name, setName] = useState('未命名作品');
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const openSave = () => {
    setName(initialName().slice(0, 30));
    setShareToCommunity(initialShared());
    setSaveOpen(true);
  };
  const open = () => {
    if (!token) {
      setLoginPromptOpen(true);
      return;
    }
    openSave();
  };
  const submit = async (intent: SaveProjectIntent) => {
    if (pendingRef.current || !name.trim()) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const saved = await persist({ name: name.trim().slice(0, 30), shareToCommunity, intent });
      if (saved) setSaveOpen(false);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  useEffect(() => {
    setOverlaySlot('save', saveOpen ? <SaveProjectDialog
      saveProjectName={name}
      setSaveProjectName={setName}
      shareToCommunity={shareToCommunity}
      setShareToCommunity={setShareToCommunity}
      activeProjectShared={initialShared()}
      isSaving={pending}
      onConfirm={(intent) => { void submit(intent); }}
      onClose={() => { if (!pending) setSaveOpen(false); }}
      folders={folders}
      folderId={folderId}
      onFolderChange={onFolderChange}
      onCreateFolder={onCreateFolder}
    /> : null);
    return () => setOverlaySlot('save', null);
  }, [folderId, folders, name, onCreateFolder, onFolderChange, pending, saveOpen, setOverlaySlot, shareToCommunity]);

  useEffect(() => {
    const slot = loginPromptOpen ? <div className="save-login-prompt" role="presentation" onClick={() => setLoginPromptOpen(false)} onTouchStart={(event) => event.stopPropagation()}>
      <div className="save-login-prompt-panel" role="dialog" aria-modal="true" aria-labelledby="save-login-title" onClick={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}>
        <button className="save-project-close" type="button" aria-label="关闭登录提示" onClick={() => setLoginPromptOpen(false)}>关闭</button>
        <h2 id="save-login-title">登录后保存作品</h2>
        <p>登录后才能把当前画布保存到我的作品，当前画布内容不会丢失。</p>
        <div className="h5-modal-actions">
          <button className="cancel-btn" type="button" onClick={() => setLoginPromptOpen(false)}>暂不登录</button>
          <button className="confirm-btn" type="button" onClick={() => { setLoginPromptOpen(false); requireLogin(() => openSave()); }}>去登录</button>
        </div>
      </div>
    </div> : null;
    setOverlaySlot('saveLoginPrompt', slot);
    return () => setOverlaySlot('saveLoginPrompt', null);
  }, [loginPromptOpen, requireLogin, setOverlaySlot]);

  return { open };
}
