import { useEffect, useRef } from 'react';

type EditorProjectLoaderOptions<TProject> = {
  projectId: string;
  activeProjectId: string;
  enabled: boolean;
  authStatus: string;
  token: string | null;
  requestProject: (projectId: string, token: string) => Promise<{ project: TProject }>;
  onLoaded: (project: TProject) => void;
  onNeedsLogin?: () => void;
  onFailed?: (error: unknown) => void;
  setStatus: (message: string) => void;
};

/** Route-owned project detail loader for the editor. */
export function useEditorProjectLoader<TProject>({
  projectId, activeProjectId, enabled, authStatus, token, requestProject, onLoaded, onNeedsLogin, onFailed, setStatus,
}: EditorProjectLoaderOptions<TProject>) {
  const callbacksRef = useRef({ requestProject, onLoaded, onNeedsLogin, onFailed, setStatus });
  callbacksRef.current = { requestProject, onLoaded, onNeedsLogin, onFailed, setStatus };
  useEffect(() => {
    if (!enabled || !projectId || activeProjectId === projectId || authStatus === 'restoring') return;
    if (authStatus !== 'authenticated' || !token) {
      callbacksRef.current.onNeedsLogin?.();
      return;
    }
    let cancelled = false;
    void callbacksRef.current.requestProject(projectId, token).then(
      ({ project }) => { if (!cancelled) callbacksRef.current.onLoaded(project); },
      (error: unknown) => {
        if (cancelled) return;
        callbacksRef.current.onFailed?.(error);
        if (!callbacksRef.current.onFailed) callbacksRef.current.setStatus(error instanceof Error ? error.message : '作品读取失败');
      },
    );
    return () => { cancelled = true; };
  }, [activeProjectId, authStatus, enabled, projectId, token]);
}
