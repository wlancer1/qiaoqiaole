import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useProfileEditor, type ProfileEditorController } from './useProfileEditor';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
const renderers: ReactTestRenderer[] = [];
afterEach(() => { for (const renderer of renderers) act(() => renderer.unmount()); renderers.length = 0; });

describe('useProfileEditor', () => {
  it('rejects unsupported avatar files and clears the input', async () => {
    let controller!: ProfileEditorController;
    function Probe() {
      controller = useProfileEditor({ request: vi.fn(), dispatchProfileUpdated: vi.fn(), token: 'token', sessionVersion: 1, fileToDataUrl: vi.fn() });
      return null;
    }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    const input = { value: 'selected' } as HTMLInputElement;
    await act(async () => { await controller.chooseAvatar(new File(['x'], 'avatar.gif', { type: 'image/gif' }), input); });

    expect(controller.error).toBe('头像仅支持 PNG、JPG 或 WebP 图片');
    expect(input.value).toBe('');
  });

  it('does not submit twice while a profile save is pending', async () => {
    type Response = { user: { nickname: string; avatarUrl?: string | null } };
    let resolveRequest!: (value: Response) => void;
    const request = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    const dispatchProfileUpdated = vi.fn();
    let controller!: ProfileEditorController;
    function Probe() {
      controller = useProfileEditor({ request, dispatchProfileUpdated, token: 'token', sessionVersion: 1, fileToDataUrl: vi.fn() });
      return null;
    }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { controller.open({ name: '小乔', avatarUrl: '' }); await Promise.resolve(); });
    let one!: Promise<void>;
    let two!: Promise<void>;
    await act(async () => { one = controller.save(); two = controller.save(); await Promise.resolve(); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRequest({ user: { nickname: '小乔' } }); await Promise.all([one, two]); });
    expect(dispatchProfileUpdated).toHaveBeenCalledOnce();
  });

  it('drops an avatar read that completes after the editor closes', async () => {
    let resolveRead!: (value: string) => void;
    let controller!: ProfileEditorController;
    function Probe() {
      controller = useProfileEditor({ request: vi.fn(), dispatchProfileUpdated: vi.fn(), token: 'token', sessionVersion: 1, fileToDataUrl: vi.fn(() => new Promise<string>((resolve) => { resolveRead = resolve; })) });
      return null;
    }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { controller.open({ name: '小乔' }); await Promise.resolve(); });
    let pending!: Promise<void>;
    await act(async () => { pending = controller.chooseAvatar(new File(['x'], 'avatar.png', { type: 'image/png' })); await Promise.resolve(); });
    await act(async () => { controller.close(); resolveRead('data:image/png;base64,new'); await pending; });
    expect(controller.avatar).toBe('');
    expect(controller.isOpen).toBe(false);
  });

  it('validates oversized and unreadable avatar files', async () => {
    let controller!: ProfileEditorController;
    const fileToDataUrl = vi.fn().mockRejectedValue(new Error('bad image'));
    function Probe() { controller = useProfileEditor({ request: vi.fn(), dispatchProfileUpdated: vi.fn(), token: 'token', sessionVersion: 1, fileToDataUrl }); return null; }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { await controller.chooseAvatar(new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', { type: 'image/png' })); });
    expect(controller.error).toBe('头像不能超过 1MB');
    await act(async () => { await controller.chooseAvatar(new File(['x'], 'bad.png', { type: 'image/png' })); });
    expect(controller.error).toBe('头像读取失败，请换一张图片');
  });

  it('publishes successful saves and retains the editor with an error after a failed save', async () => {
    const dispatchProfileUpdated = vi.fn();
    let controller!: ProfileEditorController;
    const request = vi.fn()
      .mockResolvedValueOnce({ user: { nickname: '新名字', avatarUrl: '/avatar.png' } })
      .mockRejectedValueOnce(new Error('保存失败'));
    function Probe() { controller = useProfileEditor({ request, dispatchProfileUpdated, token: 'token', sessionVersion: 1, fileToDataUrl: vi.fn() }); return null; }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { controller.open({ name: '旧名字' }); await Promise.resolve(); });
    await act(async () => { await controller.save(); });
    expect(dispatchProfileUpdated).toHaveBeenCalledWith({ displayName: '新名字', avatarUrl: '/avatar.png' });
    expect(controller.isOpen).toBe(false);
    await act(async () => { controller.open({ name: '旧名字' }); await Promise.resolve(); });
    await act(async () => { await controller.save(); });
    expect(controller.isOpen).toBe(true);
    expect(controller.error).toBe('保存失败');
  });

  it('drops a deferred save completion after session identity changes', async () => {
    let identity = { token: 'one', sessionVersion: 1 };
    let resolveRequest!: (value: { user: { nickname: string } }) => void;
    const dispatchProfileUpdated = vi.fn(); let controller!: ProfileEditorController;
    function Probe() { controller = useProfileEditor({ request: vi.fn(() => new Promise<{ user: { nickname: string } }>((resolve) => { resolveRequest = resolve; })), dispatchProfileUpdated, token: 'one', sessionVersion: 1, getSessionIdentity: () => identity, fileToDataUrl: vi.fn() }); return null; }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { controller.open({ name: '小乔' }); await Promise.resolve(); });
    let pending!: Promise<void>;
    await act(async () => { pending = controller.save(); await Promise.resolve(); });
    identity = { token: 'two', sessionVersion: 2 };
    await act(async () => { resolveRequest({ user: { nickname: '小乔' } }); await pending; });
    expect(dispatchProfileUpdated).not.toHaveBeenCalled();
    expect(controller.isOpen).toBe(true);
    expect(controller.error).toBe('');
  });
});
