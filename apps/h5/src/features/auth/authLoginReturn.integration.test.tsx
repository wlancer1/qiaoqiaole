import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect } from 'react';
import { Provider, useStore } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store, type H5Store } from '../../store/store';
import { AuthGateProvider } from '../../store/ui/AuthGateContext';
import { RouteScopeBridge } from '../../app/RouteScopeBridge';
import { createAuthSessionCoordinator } from './authSessionCoordinator';
import { useAuthController } from './useAuthController';
import { useAuthDialog, type AuthDialogController } from './useAuthDialog';

beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
const renderers: ReactTestRenderer[] = [];
afterEach(() => { for (const renderer of renderers) act(() => renderer.unmount()); renderers.length = 0; });

function LoginReturnHarness({ returnTo, onReady, trace }: { returnTo: string; onReady: (controller: AuthDialogController, location: () => string) => void; trace: string[] }) {
  const store = useStore() as H5Store;
  const auth = useAuthController();
  const navigate = useNavigate();
  const location = useLocation();
  const coordinator = createAuthSessionCoordinator({
    dispatch: store.dispatch,
    completeLogin: auth.gate.completeLogin,
    isCurrentLoginRequest: (id) => store.getState().ui.loginRequest?.id === id,
  });
  const dialog = useAuthDialog({
    storage: undefined,
    requestPhoneAuth: vi.fn(async () => ({ accessToken: 'token', user: { id: 'user-1', username: '13800138000' } })),
    requestSmsCode: vi.fn(),
    establishSession: (response, options) => { trace.push(`establish:${options.gateRequestId}`); coordinator.establishFromPhone(response, options); },
    refreshAfterLogin: vi.fn(async () => { trace.push('refresh'); }),
    getGateRequestId: () => { const id = store.getState().ui.loginRequest?.id; trace.push(`gate:${id}`); return id; },
    getLoginReturnTo: () => { const target = store.getState().ui.loginRequest?.returnTo; trace.push(`target:${target}`); return target; },
    cancelGate: () => { const id = store.getState().ui.loginRequest?.id; if (id) auth.gate.cancelLogin(id); },
    onAuthenticated: (target) => { trace.push(`navigate:${target}`); if (target) navigate(target); },
  });
  useEffect(() => { auth.gate.attach('return-test'); return () => auth.gate.release('return-test'); }, [auth.gate]);
  onReady(dialog, () => `${location.pathname}${location.search}`);
  return <><button aria-label="受保护操作" type="button" onClick={() => auth.gate.require({ scopeId: store.getState().ui.currentRouteScope, returnTo })}>受保护操作</button><button aria-label="资料编辑入口" type="button" onClick={() => void auth.requireLogin(() => { trace.push('open-profile-editor'); })}>资料编辑</button><button aria-label="填写并登录" onClick={() => { dialog.setPhoneNumber('13800138000'); dialog.setPassword('password1'); dialog.setAgreement(true); }}>填写</button><button aria-label="提交登录" onClick={() => void dialog.submitPhoneLogin()}>提交</button><output data-location={`${location.pathname}${location.search}`} /></>;
}

async function renderLogin(returnTo: string) {
  const store = createH5Store({ storage: undefined });
  let controller!: AuthDialogController;
  let renderer!: ReactTestRenderer;
  const trace: string[] = [];
  await act(async () => {
    renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/profile']}><AuthGateProvider><RouteScopeBridge /><LoginReturnHarness trace={trace} returnTo={returnTo} onReady={(next) => { controller = next; }} /></AuthGateProvider></MemoryRouter></Provider>);
    await Promise.resolve();
  });
  renderers.push(renderer);
  return { renderer, controller, store, trace };
}

describe('protected login return integration', () => {
  it('returns to the validated protected pathname and search after successful login', async () => {
    const { renderer, controller, store, trace } = await renderLogin('/projects/p1?tab=beading');
    await act(async () => { renderer.root.findByProps({ 'aria-label': '受保护操作' }).props.onClick(); await Promise.resolve(); });
    expect(store.getState().ui.loginRequest?.returnTo).toBe('/projects/p1?tab=beading');
    await act(async () => { renderer.root.findByProps({ 'aria-label': '填写并登录' }).props.onClick(); await Promise.resolve(); });
    await act(async () => { await renderer.root.findByProps({ 'aria-label': '提交登录' }).props.onClick(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(controller.error).toBe('');
    expect(trace).toEqual(['gate:gate-1-login-1', 'target:/projects/p1?tab=beading', 'establish:gate-1-login-1', 'refresh', 'navigate:/projects/p1?tab=beading']);
    expect(renderer.root.findByType('output').props['data-location']).toBe('/projects/p1?tab=beading');
  });

  it('does not navigate to an invalid external return target', async () => {
    const { renderer, store } = await renderLogin('https://evil.example');
    await act(async () => { renderer.root.findByProps({ 'aria-label': '受保护操作' }).props.onClick(); await Promise.resolve(); });
    expect(store.getState().ui.loginRequest?.returnTo).toBeUndefined();
    await act(async () => { renderer.root.findByProps({ 'aria-label': '填写并登录' }).props.onClick(); await Promise.resolve(); });
    await act(async () => { await renderer.root.findByProps({ 'aria-label': '提交登录' }).props.onClick(); await Promise.resolve(); });
    expect(renderer.root.findByType('output').props['data-location']).toBe('/profile');
  });

  it('runs the protected profile action immediately after login succeeds', async () => {
    const { renderer, controller, trace } = await renderLogin('/profile');
    await act(async () => { renderer.root.findByProps({ 'aria-label': '资料编辑入口' }).props.onClick(); await Promise.resolve(); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': '填写并登录' }).props.onClick(); await Promise.resolve(); });
    await act(async () => { await renderer.root.findByProps({ 'aria-label': '提交登录' }).props.onClick(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(controller.error).toBe('');
    expect(trace).toContain('open-profile-editor');
  });
});
