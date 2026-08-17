import { type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { Provider } from 'react-redux';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../../store/store';
import { AuthGateProvider } from '../../store/ui/AuthGateContext';
import { statusCleared, statusRequested } from '../../store/ui/uiSlice';
import { appOverlaySlotNames, AppOverlayProvider, useAppOverlay } from './AppOverlayContext';
import { AppOverlayHost } from './AppOverlayHost';
import { RouteScopeBridge } from '../RouteScopeBridge';
import { InventoryCheckSheet } from '../../pages/beading/InventoryCheckSheet';
import { PhoneLoginModal, ProfileEditModal } from '../../pages/home/HomeShellPage';
import { CreateProjectFolderSheet } from '../../projects/ProjectFolderSheets';

vi.mock('react-hot-toast', () => ({
  Toaster: () => <div data-testid="third-party-toast-host" />,
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}));

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
  vi.unstubAllGlobals();
});

function installDialogDom() {
  const addEventListener = vi.fn();
  vi.stubGlobal('window', {
    addEventListener,
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('document', { body: { style: { overflow: 'auto' } } });
  return addEventListener;
}

function renderOverlay(children?: ReactNode, onUnderlyingTouch?: () => void) {
  const store = createH5Store({ storage: undefined });
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Provider store={store}>
        <AuthGateProvider>
          <div onTouchStart={onUnderlyingTouch}>
            <MemoryRouter initialEntries={['/projects']}>
              <AppOverlayProvider>
                <RouteScopeBridge />
                {children}
                <AppOverlayHost />
              </AppOverlayProvider>
            </MemoryRouter>
          </div>
        </AuthGateProvider>
      </Provider>,
    );
  });
  renderers.push(renderer);
  return { renderer, store };
}

function dispatchTouch(target: { parent: { parent: unknown } | null; props: { onTouchStart?: (event: { stopPropagation: () => void }) => void } }): void {
  let stopped = false;
  const event = { stopPropagation: () => { stopped = true; } };
  let current: typeof target | null = target;
  while (current && !stopped) {
    current.props.onTouchStart?.(event);
    current = current.parent as typeof target | null;
  }
}

function OverlayControls({ onConfirm }: { onConfirm: () => void | Promise<void> }) {
  const { openConfirm, setOverlaySlot } = useAppOverlay();
  return <>
    <button type="button" aria-label="打开确认" onClick={() => openConfirm({ title: '删除作品', message: '此操作不可撤销', onConfirm })}>打开确认</button>
    <button type="button" aria-label="打开登录插槽" onClick={() => setOverlaySlot('login', <p data-testid="login-overlay">登录</p>)}>打开登录插槽</button>
    <button type="button" aria-label="打开全部插槽" onClick={() => {
      for (const name of appOverlaySlotNames) setOverlaySlot(name, <p data-testid={`overlay-${name}`}>{name}</p>);
    }}>打开全部插槽</button>
  </>;
}

function ConfirmReplacementControls({ firstConfirm, secondConfirm }: { firstConfirm: () => Promise<void>; secondConfirm: () => void }) {
  const { openConfirm } = useAppOverlay();
  return <>
    <button type="button" aria-label="打开第一个确认" onClick={() => openConfirm({ title: '第一个操作', message: '等待中', onConfirm: firstConfirm })}>第一个</button>
    <button type="button" aria-label="打开第二个确认" onClick={() => openConfirm({ title: '第二个操作', message: '替换请求', onConfirm: secondConfirm })}>第二个</button>
  </>;
}

function InventoryControls() {
  const { setOverlaySlot } = useAppOverlay();
  return <button type="button" aria-label="打开库存检测" onClick={() => setOverlaySlot('inventory', <InventoryCheckSheet result={{ warehouseId: null, projectRevision: null, items: [], summary: { sufficient: true, required: 0, available: 0, missing: 0 } }} onClose={() => setOverlaySlot('inventory', null)} onStart={() => {}} />)}>库存</button>;
}

function PhoneLoginControls({ onClose }: { onClose: () => void }) {
  const { setOverlaySlot } = useAppOverlay();
  const close = () => { onClose(); setOverlaySlot('login', null); };
  return <button type="button" aria-label="打开手机号登录" onClick={() => setOverlaySlot('login', <PhoneLoginModal
    phoneNumber="" setPhoneNumber={() => {}} phonePassword="" setPhonePassword={() => {}} phoneConfirmPassword="" setPhoneConfirmPassword={() => {}}
    phoneCode="" setPhoneCode={() => {}} phoneAuthMode="login" setPhoneAuthMode={() => {}} phoneAgreement={false} setPhoneAgreement={() => {}}
    phoneAuthError="" phoneSending={false} phoneVerifying={false} phoneCountdown={0} sendPhoneCode={() => {}} submitPhoneLogin={() => {}} submitPhoneRegister={() => {}} closeLoginModal={close} logoutPhone={() => {}}
    rememberPassword={false} setRememberPassword={() => {}}
  />)}>登录</button>;
}

function ProfileControls({ onClose }: { onClose: () => void }) {
  const { setOverlaySlot } = useAppOverlay();
  const close = () => { onClose(); setOverlaySlot('profile', null); };
  return <button type="button" aria-label="打开编辑资料" onClick={() => setOverlaySlot('profile', <ProfileEditModal profileEditName="小乔" setProfileEditName={() => {}} profileEditAvatar="" profileEditError="" profileEditSaving={false} profileAvatarInputRef={{ current: null }} chooseProfileAvatar={() => {}} saveProfile={() => {}} closeProfileEdit={close} />)}>编辑资料</button>;
}

function FolderControls() {
  const { setOverlaySlot } = useAppOverlay();
  return <button type="button" aria-label="打开新建文件夹" onClick={() => setOverlaySlot('folder', <CreateProjectFolderSheet name="" onNameChange={() => {}} onCreate={() => {}} onClose={() => setOverlaySlot('folder', null)} />)}>文件夹</button>;
}

describe('AppOverlayHost', () => {
  it('delegates route-scoped light status presentation to react-hot-toast', () => {
    const source = readFileSync(new URL('./AppOverlayHost.tsx', import.meta.url), 'utf8');

    expect(source).toContain("from 'react-hot-toast'");
    expect(source).toContain('<Toaster');
    expect(source).toContain('toast(');
    expect(source).toContain('position="bottom-center"');
    expect(source).toContain('env(safe-area-inset-bottom)');
    expect(source).not.toContain('className="app-status"');
  });

  it('renders a route-scoped status through the persistent toast host and clears it independently', () => {
    const { renderer, store } = renderOverlay();
    act(() => {
      store.dispatch(statusRequested({ scopeId: store.getState().ui.currentRouteScope, message: '保存成功' }));
    });

    expect(renderer.root.findAllByProps({ 'data-testid': 'third-party-toast-host' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ className: 'app-status' })).toHaveLength(0);
    act(() => {
      store.dispatch(statusCleared({ scopeId: store.getState().ui.currentRouteScope }));
    });
    expect(store.getState().ui.status).toBeNull();
  });

  it('mounts typed future overlay slots beneath the same durable host', () => {
    const { renderer } = renderOverlay(<OverlayControls onConfirm={() => {}} />);
    act(() => renderer.root.findByProps({ 'aria-label': '打开登录插槽' }).props.onClick());

    const host = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' });
    expect(host.findByProps({ 'data-testid': 'login-overlay' }).children.join('')).toBe('登录');
  });

  it('mounts all eight slot wrappers only beneath the persistent host', () => {
    const { renderer } = renderOverlay(<OverlayControls onConfirm={() => {}} />);
    act(() => renderer.root.findByProps({ 'aria-label': '打开全部插槽' }).props.onClick());

    const host = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' });
    expect(host.findAll((node) => typeof node.props['data-overlay-slot'] === 'string').map((node) => node.props['data-overlay-slot'])).toEqual([...appOverlaySlotNames]);
    for (const name of appOverlaySlotNames) expect(host.findByProps({ 'data-testid': `overlay-${name}` }).children.join('')).toBe(name);
  });

  it('deduplicates a pending confirmation and closes after it resolves', async () => {
    installDialogDom();
    let resolveConfirmation!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveConfirmation = resolve; }));
    const { renderer } = renderOverlay(<OverlayControls onConfirm={onConfirm} />);
    act(() => renderer.root.findByProps({ 'aria-label': '打开确认' }).props.onClick());

    const confirmButton = renderer.root.findByProps({ 'aria-label': '确认删除作品' });
    act(() => {
      confirmButton.props.onClick();
      confirmButton.props.onClick();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirmation();
      await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({ role: 'alertdialog' })).toHaveLength(0);
  });

  it('does not let a resolving replaced confirmation dismiss the newer request', async () => {
    installDialogDom();
    let resolveFirst!: () => void;
    const { renderer } = renderOverlay(<ConfirmReplacementControls
      firstConfirm={() => new Promise<void>((resolve) => { resolveFirst = resolve; })}
      secondConfirm={vi.fn()}
    />);
    act(() => renderer.root.findByProps({ 'aria-label': '打开第一个确认' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '确认第一个操作' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '打开第二个确认' }).props.onClick());

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ role: 'alertdialog' }).findByType('h2').children.join('')).toBe('第二个操作');
  });

  it('locks and restores background scrolling for an inventory sheet hosted by the application overlay', () => {
    installDialogDom();
    const { renderer } = renderOverlay(<InventoryControls />);
    act(() => renderer.root.findByProps({ 'aria-label': '打开库存检测' }).props.onClick());
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' }).findAllByProps({ 'aria-label': '库存检测' })).toHaveLength(1);
    expect(document.body.style.overflow).toBe('hidden');
    act(() => renderer.root.findByProps({ 'aria-label': '关闭库存检测' }).props.onClick());
    expect(document.body.style.overflow).toBe('auto');
  });

  it('locks and restores background scrolling for a folder sheet hosted by the application overlay', () => {
    installDialogDom();
    const { renderer } = renderOverlay(<FolderControls />);
    expect(document.body.style.overflow).toBe('auto');
    act(() => renderer.root.findByProps({ 'aria-label': '打开新建文件夹' }).props.onClick());
    expect(document.body.style.overflow).toBe('hidden');
    act(() => renderer.root.findByProps({ 'aria-label': '关闭新建文件夹' }).props.onClick());
    expect(document.body.style.overflow).toBe('auto');
  });

  it('enforces the phone-login backdrop, Escape, content isolation, and scroll-lock contract', () => {
    const addEventListener = installDialogDom();
    const onClose = vi.fn();
    const { renderer } = renderOverlay(<PhoneLoginControls onClose={onClose} />);
    act(() => renderer.root.findByProps({ 'aria-label': '打开手机号登录' }).props.onClick());
    expect(document.body.style.overflow).toBe('hidden');
    const panel = renderer.root.findByProps({ className: 'home-create-panel phone-login-panel' });
    expect(panel.props.role).toBe('dialog');
    const stop = vi.fn();
    act(() => panel.props.onClick({ stopPropagation: stop }));
    expect(stop).toHaveBeenCalledOnce();
    const escapeListener = addEventListener.mock.calls.find(([type]) => type === 'keydown')?.[1] as (event: KeyboardEvent) => void;
    act(() => escapeListener({ key: 'Escape' } as KeyboardEvent));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('closes the profile overlay from its backdrop while isolating panel touch events', () => {
    installDialogDom();
    const onClose = vi.fn();
    const onUnderlyingTouch = vi.fn();
    const { renderer } = renderOverlay(<ProfileControls onClose={onClose} />, onUnderlyingTouch);
    act(() => renderer.root.findByProps({ 'aria-label': '打开编辑资料' }).props.onClick());
    const backdrop = renderer.root.findByProps({ className: 'home-create-modal' });
    const panel = renderer.root.findByProps({ className: 'home-create-panel profile-edit-panel' });
    dispatchTouch(panel);
    expect(onUnderlyingTouch).not.toHaveBeenCalled();
    act(() => backdrop.props.onClick());
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('closes confirmation with Escape or its backdrop and restores the locked scroll state', () => {
    const addEventListener = installDialogDom();
    const onUnderlyingTouch = vi.fn();
    const { renderer } = renderOverlay(<OverlayControls onConfirm={() => {}} />, onUnderlyingTouch);

    act(() => renderer.root.findByProps({ 'aria-label': '打开确认' }).props.onClick());
    expect(document.body.style.overflow).toBe('hidden');
    const escapeListener = addEventListener.mock.calls.find(([type]) => type === 'keydown')?.[1] as (event: KeyboardEvent) => void;
    act(() => escapeListener({ key: 'Escape' } as KeyboardEvent));
    expect(renderer.root.findAllByProps({ role: 'alertdialog' })).toHaveLength(0);
    expect(document.body.style.overflow).toBe('auto');

    act(() => renderer.root.findByProps({ 'aria-label': '打开确认' }).props.onClick());
    const backdrop = renderer.root.findByProps({ className: 'confirm-dialog-backdrop' });
    const sameTarget = {};
    act(() => backdrop.props.onClick({ target: sameTarget, currentTarget: sameTarget }));
    expect(renderer.root.findAllByProps({ role: 'alertdialog' })).toHaveLength(0);

    act(() => renderer.root.findByProps({ 'aria-label': '打开确认' }).props.onClick());
    const stopPropagation = vi.fn();
    act(() => renderer.root.findByProps({ className: 'confirm-dialog' }).props.onClick({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledOnce();
    const stopTouchPropagation = vi.fn();
    act(() => renderer.root.findByProps({ className: 'confirm-dialog-backdrop' }).props.onTouchStart({ stopPropagation: stopTouchPropagation }));
    expect(stopTouchPropagation).toHaveBeenCalledOnce();
    act(() => dispatchTouch(renderer.root.findByProps({ className: 'confirm-dialog-backdrop' })));
    expect(onUnderlyingTouch).not.toHaveBeenCalled();
    act(() => renderer.root.findByProps({ 'aria-label': '取消删除作品' }).props.onClick());
    expect(renderer.root.findAllByProps({ role: 'alertdialog' })).toHaveLength(0);
  });
});
