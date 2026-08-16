import { useEffect, useRef, useState } from 'react';
import type { RecentProject } from '../../shared/h5Types';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { foldersLoaded, selectProjectFolders } from '../../store/projects/projectSlice';
import { createProjectFolderThunk, deleteProjectFolderThunk, moveProjectToFolderThunk } from '../../store/projects/projectThunks';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';
import { CreateProjectFolderSheet, MoveProjectFolderSheet } from '../../projects/ProjectFolderSheets';
import { applyCreatedProjectFolder, beginProjectFolderMove, type ProjectFolderCreateOrigin } from '../../projects/projectFolderFlow';
import { consumeProjectFolderHistorySentinel, ensureProjectFolderHistorySentinel, resolveProjectFolderHistoryPop } from '../../projects/projectFolderHistory';
import type { ProjectFolder } from '../../projects/projectFolders';

export type ProjectFolderController = {
  saveFolderId: string | null;
  setSaveFolderId: (folderId: string | null) => void;
  openCreate: (origin: ProjectFolderCreateOrigin) => void;
  openMove: (project: RecentProject, onMoveOpened?: () => void) => void;
  deleteFolder: (folder: ProjectFolder) => void;
};

type Options = {
  token: string;
  activeFolderId: string | 'all';
  onActiveFolderChange: (folderId: string | 'all') => void;
  requireLogin: (action: (token: string) => void) => void;
  setStatus: (message: string) => void;
};

export function useProjectFolderController({ token, activeFolderId, onActiveFolderChange, requireLogin, setStatus }: Options): ProjectFolderController {
  const dispatch = useAppDispatch();
  const folders = useAppSelector(selectProjectFolders);
  const { openConfirm, setOverlaySlot } = useAppOverlay();
  const [saveFolderId, setSaveFolderId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrigin, setCreateOrigin] = useState<ProjectFolderCreateOrigin>('my-works');
  const [createName, setCreateName] = useState('');
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState('');
  const [moveTarget, setMoveTarget] = useState<RecentProject | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [movePending, setMovePending] = useState(false);
  const [moveError, setMoveError] = useState('');
  const createFocusRef = useRef<HTMLElement | null>(null);
  const moveFocusRef = useRef<HTMLElement | null>(null);
  const ignoreHistoryPopRef = useRef(false);
  const sheetOpen = createOpen || Boolean(moveTarget);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sheetOpen) ensureProjectFolderHistorySentinel(window.history, window.location.href);
    else if (consumeProjectFolderHistorySentinel(window.history)) ignoreHistoryPopRef.current = true;
  }, [sheetOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPopState = () => {
      if (ignoreHistoryPopRef.current) {
        ignoreHistoryPopRef.current = false;
        return;
      }
      const resolution = resolveProjectFolderHistoryPop({ createOpen, createPending, moveOpen: Boolean(moveTarget), movePending });
      if (resolution.retainSentinel) ensureProjectFolderHistorySentinel(window.history, window.location.href);
      if (resolution.close === 'create') { setCreateOpen(false); setCreateError(''); }
      if (resolution.close === 'move') setMoveTarget(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [createOpen, createPending, movePending, moveTarget]);

  const closeCreate = () => {
    if (createPending) return;
    setCreateOpen(false);
    setCreateError('');
  };
  const closeMove = () => {
    if (!movePending) setMoveTarget(null);
  };
  const openCreate = (origin: ProjectFolderCreateOrigin) => {
    if (!token) {
      requireLogin(() => openCreate(origin));
      return;
    }
    createFocusRef.current = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreateOrigin(origin);
    setCreateName('');
    setCreateError('');
    setCreateOpen(true);
  };
  const createFolder = async (nameValue: string) => {
    const name = nameValue.trim();
    if (!name || createPending || !token) return;
    setCreatePending(true);
    setCreateError('');
    try {
      const folder = await dispatch(createProjectFolderThunk({ name, token })).unwrap();
      const next = applyCreatedProjectFolder({
        folders: folders.filter((item) => item.id !== folder.id), activeFolderId, saveFolderId,
        move: moveTarget ? { projectId: moveTarget.id, selectedFolderId: moveFolderId } : null,
      }, folder, createOrigin);
      dispatch(foldersLoaded(next.folders));
      if (next.activeFolderId !== activeFolderId) onActiveFolderChange(next.activeFolderId || 'all');
      setSaveFolderId(next.saveFolderId);
      if (next.move) setMoveFolderId(next.move.selectedFolderId);
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '新建文件夹失败');
      throw error;
    } finally {
      setCreatePending(false);
    }
  };
  const openMove = (project: RecentProject, onMoveOpened?: () => void) => {
    moveFocusRef.current = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(`[data-project-card-id="${CSS.escape(project.id)}"]`);
    const flow = beginProjectFolderMove({ folders, activeFolderId, saveFolderId, move: null }, project);
    setMoveTarget(project);
    setMoveFolderId(flow.move?.selectedFolderId ?? null);
    setMoveError('');
    onMoveOpened?.();
  };
  const confirmMove = async (folderId: string | null) => {
    if (!moveTarget || movePending || !token) return;
    setMovePending(true);
    setMoveError('');
    try {
      await dispatch(moveProjectToFolderThunk({ projectId: moveTarget.id, folderId, token })).unwrap();
      setMoveTarget(null);
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : '移动作品失败');
      throw error;
    } finally {
      setMovePending(false);
    }
  };
  const deleteFolder = (folder: ProjectFolder) => openConfirm({
    title: `删除“${folder.name}”？`, message: '文件夹中的作品会保留，并移到未分类。', confirmText: '删除文件夹', danger: true,
    onConfirm: async () => {
      try {
        await dispatch(deleteProjectFolderThunk({ folderId: folder.id, token })).unwrap();
        if (activeFolderId === folder.id) onActiveFolderChange('all');
        setSaveFolderId((current) => current === folder.id ? null : current);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '删除文件夹失败');
      }
    },
  });

  useEffect(() => {
    const overlay = moveTarget || createOpen ? <>
      {moveTarget ? <MoveProjectFolderSheet folders={folders} currentFolderId={moveTarget.folderId ?? null} selectedFolderId={moveFolderId} onSelectionChange={setMoveFolderId} onConfirm={confirmMove} onCreateFolder={() => openCreate('move')} onClose={closeMove} pending={movePending} covered={createOpen} error={moveError} returnFocusRef={moveFocusRef} /> : null}
      {createOpen ? <CreateProjectFolderSheet name={createName} onNameChange={setCreateName} onCreate={createFolder} onClose={closeCreate} pending={createPending} error={createError} returnFocusRef={createFocusRef} /> : null}
    </> : null;
    setOverlaySlot('folder', overlay);
    return () => setOverlaySlot('folder', null);
  }, [createError, createName, createOpen, createPending, folders, moveError, moveFolderId, movePending, moveTarget, setOverlaySlot]);

  return { saveFolderId, setSaveFolderId, openCreate, openMove, deleteFolder };
}
