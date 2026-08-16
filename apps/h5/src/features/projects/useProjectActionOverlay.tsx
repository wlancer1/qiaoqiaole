import { useEffect, useRef, useState } from 'react';
import type { RecentProject } from '../../shared/h5Types';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';
import { ProjectActionSheet } from '../../pages/beading/ProjectActionSheet';
import { ShareCommunityDialog } from '../../community/ShareCommunityDialog';

type ShareActions = {
  shareProject: RecentProject | null;
  shareTags: string[];
  sharingProjectId: string;
  openShare: (project: RecentProject) => void;
  closeShare: () => void;
  setShareTags: (tags: string[]) => void;
  confirmShare: (tags?: string[]) => Promise<boolean>;
  requestDelete: (project: RecentProject) => void;
};

export type ProjectActionOverlayController = { open: (project: RecentProject) => void; close: () => void };

export function useProjectActionOverlay({ actions, hasSession, onStart, onEdit, onMove, onShareCommitted }: {
  actions: ShareActions;
  hasSession: (project: RecentProject) => boolean;
  onStart: (project: RecentProject) => void;
  onEdit: (project: RecentProject) => void;
  onMove: (project: RecentProject, afterOpen: () => void) => void;
  onShareCommitted: () => Promise<void>;
}): ProjectActionOverlayController {
  const { setOverlaySlot } = useAppOverlay();
  const [target, setTarget] = useState<RecentProject | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const close = () => setTarget(null);
  const open = (project: RecentProject) => {
    returnFocusRef.current = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(`[data-project-card-id="${CSS.escape(project.id)}"]`);
    setTarget(project);
  };

  useEffect(() => {
    const slot = target ? <ProjectActionSheet
      project={target}
      hasSession={hasSession(target)}
      onClose={close}
      onStart={() => { close(); onStart(target); }}
      onEdit={() => { close(); onEdit(target); }}
      onShare={() => { actions.openShare(target); close(); }}
      onMove={() => onMove(target, close)}
      onDelete={() => { actions.requestDelete(target); close(); }}
    /> : null;
    setOverlaySlot('projectAction', slot);
    return () => setOverlaySlot('projectAction', null);
  }, [actions, hasSession, onEdit, onMove, onStart, setOverlaySlot, target]);

  useEffect(() => {
    const project = actions.shareProject;
    const slot = project ? <ShareCommunityDialog project={project} tags={actions.shareTags} onTagsChange={actions.setShareTags} onConfirm={(tags) => { void actions.confirmShare(tags).then((shared) => shared ? onShareCommitted() : undefined).catch(() => undefined); }} onClose={actions.closeShare} isSaving={actions.sharingProjectId === project.id} isShared={Boolean(project.sharedToCommunity)} /> : null;
    setOverlaySlot('share', slot);
    return () => setOverlaySlot('share', null);
  }, [actions, onShareCommitted, setOverlaySlot]);

  return { open, close };
}
