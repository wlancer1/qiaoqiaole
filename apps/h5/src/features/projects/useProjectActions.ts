import { useRef, useState } from 'react';
import type { RecentProject } from '../../shared/h5Types';
import type { ProjectRequestApi } from './useProjectListDomain';
import { toProjectSummary } from './projectSummary';

export type ProjectSaveInput = {
  projectId?: string;
  name: string;
  rows: number;
  cols: number;
  canvasData: string;
  beadList: Array<{ color: string; count: number }>;
  tone?: string;
  folderId?: string | null;
  sourceImagePath?: string;
  thumbnailImagePath?: string;
};

export type ProjectConfirmRequest = {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
};

export type ProjectActionsOptions = {
  requestApi: ProjectRequestApi;
  token: string;
  setStatus: (message: string) => void;
  onProjectSaved: (project: RecentProject) => void;
  onProjectDeleted?: (projectId: string) => void;
  onProjectShared?: (project: RecentProject) => void;
  requestConfirm?: (request: ProjectConfirmRequest) => void;
};

export type ProjectActionResult = {
  saving: boolean;
  sharingProjectId: string;
  shareProject: RecentProject | null;
  shareTags: string[];
  save: (input: ProjectSaveInput, tokenOverride?: string) => Promise<RecentProject | null>;
  openShare: (project: RecentProject) => void;
  closeShare: () => void;
  setShareTags: (tags: string[]) => void;
  confirmShare: (tags?: string[]) => Promise<boolean>;
  requestDelete: (project: RecentProject) => void;
};

export function useProjectActions({ requestApi, token, setStatus, onProjectSaved, onProjectDeleted, onProjectShared, requestConfirm }: ProjectActionsOptions): ProjectActionResult {
  const savePending = useRef(false);
  const sharePending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [sharingProjectId, setSharingProjectId] = useState('');
  const [shareProject, setShareProject] = useState<RecentProject | null>(null);
  const [shareTags, setShareTags] = useState<string[]>([]);

  const save = async (input: ProjectSaveInput, tokenOverride?: string): Promise<RecentProject | null> => {
    const effectiveToken = tokenOverride || token;
    if (!effectiveToken || savePending.current) return null;
    savePending.current = true;
    setSaving(true);
    try {
      const projectId = input.projectId;
      const payload = await requestApi<{ project: RecentProject }>(
        projectId ? `/projects/${encodeURIComponent(projectId)}` : '/projects',
        {
          method: projectId ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: input.name,
            rows: input.rows,
            cols: input.cols,
            canvasData: input.canvasData,
            beadList: input.beadList,
            tone: input.tone ?? 'recent-flower',
            folderId: input.folderId ?? null,
            sourceImagePath: input.sourceImagePath,
            thumbnailImagePath: input.thumbnailImagePath,
          }),
        },
        effectiveToken,
      );
      const summary = toProjectSummary(payload.project);
      onProjectSaved(summary);
      return summary;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '最近项目保存失败');
      return null;
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };

  const openShare = (project: RecentProject) => {
    if (!token || sharePending.current) return;
    setShareProject(project);
    setShareTags(project.tags ?? []);
  };

  const closeShare = () => {
    if (!sharePending.current) setShareProject(null);
  };

  const confirmShare = async (nextTags = shareTags) => {
    const project = shareProject;
    if (!token || !project || sharePending.current) return false;
    sharePending.current = true;
    setSharingProjectId(project.id);
    try {
      const payload = await requestApi<{ tags: string[]; sharedAt?: string }>(
        project.sharedToCommunity ? `/projects/${encodeURIComponent(project.id)}/community-tags` : `/projects/${encodeURIComponent(project.id)}/share`,
        { method: project.sharedToCommunity ? 'PATCH' : 'POST', body: JSON.stringify({ tags: nextTags }) },
        token,
      );
      const shared = { ...project, sharedToCommunity: true, sharedAt: payload.sharedAt ?? project.sharedAt, tags: payload.tags };
      const summary = toProjectSummary(shared);
      onProjectSaved(summary);
      onProjectShared?.(summary);
      setShareProject(null);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '分享失败');
      return false;
    } finally {
      sharePending.current = false;
      setSharingProjectId('');
    }
  };

  const requestDelete = (project: RecentProject) => {
    const remove = async () => {
      if (!token) return;
      try {
        await requestApi(`/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' }, token);
        onProjectDeleted?.(project.id);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '删除作品失败');
      }
    };
    if (!requestConfirm) {
      void remove();
      return;
    }
    requestConfirm({
      title: '删除作品？',
      message: '删除后将同时放弃未完成的拼豆会话，且无法恢复。',
      confirmText: '删除作品',
      danger: true,
      onConfirm: remove,
    });
  };

  return { saving, sharingProjectId, shareProject, shareTags, save, openShare, closeShare, setShareTags, confirmShare, requestDelete };
}
