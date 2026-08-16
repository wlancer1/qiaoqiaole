import { useCallback, useRef, useState } from 'react';

type ProfileResponse = { user: { nickname: string; avatarUrl?: string | null } };
type Dependencies = {
  request: (path: string, init: RequestInit) => Promise<ProfileResponse>;
  dispatchProfileUpdated: (changes: { displayName: string; avatarUrl: string }) => void;
  token: string;
  sessionVersion: number;
  fileToDataUrl: (file: File) => Promise<string>;
  getSessionIdentity?: () => { token: string; sessionVersion: number };
};

export type ProfileEditorController = ReturnType<typeof useProfileEditor>;

export function useProfileEditor(dependencies: Dependencies) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const avatarReadSequence = useRef(0);

  const open = useCallback((profile: { name: string; avatarUrl?: string | null }) => {
    avatarReadSequence.current += 1;
    setName(profile.name);
    setAvatar(profile.avatarUrl || '');
    setError('');
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    if (savingRef.current) return;
    setIsOpen(false);
    avatarReadSequence.current += 1;
    setError('');
  }, []);
  const chooseAvatar = useCallback(async (file: File | undefined, input = avatarInputRef.current) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError('头像仅支持 PNG、JPG 或 WebP 图片');
      if (input) input.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      setError('头像不能超过 1MB');
      if (input) input.value = '';
      return;
    }
    const sequence = ++avatarReadSequence.current;
    try {
      const dataUrl = await dependencies.fileToDataUrl(file);
      if (sequence !== avatarReadSequence.current) return;
      setAvatar(dataUrl);
      setError('');
    } catch {
      if (sequence !== avatarReadSequence.current) return;
      setError('头像读取失败，请换一张图片');
    } finally {
      if (input) input.value = '';
    }
  }, [dependencies]);
  const save = useCallback(async () => {
    if (savingRef.current) return;
    const nickname = name.trim();
    if (!nickname) {
      setError('请输入用户名');
      return;
    }
    savingRef.current = true;
    const capturedSession = dependencies.getSessionIdentity?.() ?? { token: dependencies.token, sessionVersion: dependencies.sessionVersion };
    setSaving(true);
    setError('');
    try {
      const payload = await dependencies.request('/profile', { method: 'PATCH', body: JSON.stringify({ nickname, avatarUrl: avatar || null }) });
      const currentSession = dependencies.getSessionIdentity?.() ?? { token: dependencies.token, sessionVersion: dependencies.sessionVersion };
      if (currentSession.token !== capturedSession.token || currentSession.sessionVersion !== capturedSession.sessionVersion) return;
      dependencies.dispatchProfileUpdated({ displayName: payload.user.nickname, avatarUrl: payload.user.avatarUrl || '' });
      setIsOpen(false);
    } catch (cause) {
      const currentSession = dependencies.getSessionIdentity?.() ?? { token: dependencies.token, sessionVersion: dependencies.sessionVersion };
      if (currentSession.token !== capturedSession.token || currentSession.sessionVersion !== capturedSession.sessionVersion) return;
      setError(cause instanceof Error ? cause.message : '资料保存失败');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [avatar, dependencies, name]);

  return { isOpen, name, setName, avatar, error, saving, avatarInputRef, open, close, chooseAvatar, save };
}
