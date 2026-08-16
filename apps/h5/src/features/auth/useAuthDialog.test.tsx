import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SmsCodeError, useAuthDialog, type AuthDialogController } from './useAuthDialog';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
});

function Probe({ controller }: { controller: (value: AuthDialogController) => void }) {
  controller(useAuthDialog({
    storage: undefined,
    requestPhoneAuth: vi.fn(),
    requestSmsCode: vi.fn(),
    establishSession: vi.fn(),
    refreshAfterLogin: vi.fn(async () => undefined),
    cancelGate: vi.fn(),
  }));
  return null;
}

async function renderController(): Promise<AuthDialogController> {
  let value!: AuthDialogController;
  await act(async () => {
    const renderer = create(<Probe controller={(next) => { value = next; }} />);
    renderers.push(renderer);
  });
  return value;
}

describe('useAuthDialog', () => {
  it('cleans up its SMS countdown when the dialog is closed', async () => {
    vi.useFakeTimers();
    const controller = await renderController();
    act(() => controller.setCountdown(2));
    act(() => controller.close());
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(controller.countdown).toBe(0);
    vi.useRealTimers();
  });

  it('only persists remembered credentials after a successful phone login', async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() } as unknown as Storage;
    const requestPhoneAuth = vi.fn(async () => ({ accessToken: 'token', user: { id: 'u1', username: '13800138000' } }));
    let controller!: AuthDialogController;
    function LoginProbe() {
      controller = useAuthDialog({ storage, requestPhoneAuth, requestSmsCode: vi.fn(), establishSession: vi.fn(), refreshAfterLogin: vi.fn(async () => undefined), cancelGate: vi.fn() });
      return null;
    }
    await act(async () => { const renderer = create(<LoginProbe />); renderers.push(renderer); });
    act(() => {
      controller.setPhoneNumber('13800138000');
      controller.setPassword('password1');
      controller.setAgreement(true);
      controller.setRememberPassword(true);
    });
    await act(async () => { await controller.submitPhoneLogin(); });

    expect(requestPhoneAuth).toHaveBeenCalledWith('login', expect.objectContaining({ phone: '+8613800138000', password: 'password1' }));
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it('applies a Retry-After countdown and ignores an SMS response that arrives after close', async () => {
    let resolveSms!: (value: { smsRequestId: string; retryAfter: number }) => void;
    const requestSmsCode = vi.fn(() => new Promise<{ smsRequestId: string; retryAfter: number }>((resolve) => { resolveSms = resolve; }));
    let controller!: AuthDialogController;
    function SmsProbe() {
      controller = useAuthDialog({ storage: undefined, requestPhoneAuth: vi.fn(), requestSmsCode, establishSession: vi.fn(), refreshAfterLogin: vi.fn(async () => undefined), cancelGate: vi.fn() });
      return null;
    }
    await act(async () => { const renderer = create(<SmsProbe />); renderers.push(renderer); });
    await act(async () => { controller.setPhoneNumber('13800138000'); });
    let pending!: Promise<void>;
    await act(async () => { pending = controller.sendCode(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); controller.close(); resolveSms({ smsRequestId: 'late', retryAfter: 60 }); await pending; });
    expect(controller.countdown).toBe(0);

    requestSmsCode.mockRejectedValueOnce(new SmsCodeError('操作过于频繁，请稍后再试', 29));
    await act(async () => { await controller.sendCode(); });
    expect(controller.countdown).toBe(29);
  });

  it('clears the sending lock when switching modes while an SMS request is pending', async () => {
    let resolveSms!: (value: { smsRequestId: string; retryAfter: number }) => void;
    const requestSmsCode = vi.fn(() => new Promise<{ smsRequestId: string; retryAfter: number }>((resolve) => { resolveSms = resolve; }));
    let controller!: AuthDialogController;
    function Probe() { controller = useAuthDialog({ storage: undefined, requestPhoneAuth: vi.fn(), requestSmsCode, establishSession: vi.fn(), refreshAfterLogin: vi.fn(async () => undefined), cancelGate: vi.fn() }); return null; }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { controller.setPhoneNumber('13800138000'); await Promise.resolve(); });
    let pending!: Promise<void>;
    await act(async () => { pending = controller.sendCode(); await Promise.resolve(); });
    expect(controller.sending).toBe(true);
    await act(async () => { controller.setMode('login'); await Promise.resolve(); });
    expect(controller.sending).toBe(false);
    resolveSms({ smsRequestId: 'late', retryAfter: 60 });
    await act(async () => { await pending; });
  });

  it('ignores a stale phone attempt after a newer attempt begins', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const requestPhoneAuth = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ accessToken: 'new-token', user: { id: 'u2', username: '13900139000' } });
    const establishSession = vi.fn();
    let controller!: AuthDialogController;
    function LoginProbe() {
      controller = useAuthDialog({ storage: undefined, requestPhoneAuth, requestSmsCode: vi.fn(), establishSession, refreshAfterLogin: vi.fn(async () => undefined), cancelGate: vi.fn() });
      return null;
    }
    await act(async () => { const renderer = create(<LoginProbe />); renderers.push(renderer); });
    act(() => { controller.setPhoneNumber('13800138000'); controller.setPassword('password1'); controller.setAgreement(true); });
    let older!: Promise<void>;
    await act(async () => { older = controller.submitPhoneLogin(); await Promise.resolve(); });
    let newer!: Promise<void>;
    await act(async () => { controller.close(); newer = controller.submitPhoneLogin(); await Promise.resolve(); });
    await act(async () => { resolveFirst({ accessToken: 'old-token', user: { id: 'u1', username: '13800138000' } }); await Promise.all([older, newer]); });

    expect(establishSession).toHaveBeenCalledTimes(1);
    expect(establishSession).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'new-token' }), expect.any(Object));
  });

  it('does not navigate when the dialog closes during deferred post-login refresh', async () => {
    let resolveRefresh!: () => void;
    const refreshAfterLogin = vi.fn(() => new Promise<void>((resolve) => { resolveRefresh = resolve; }));
    const onAuthenticated = vi.fn();
    let controller!: AuthDialogController;
    function Probe() { controller = useAuthDialog({ storage: undefined, requestPhoneAuth: vi.fn(async () => ({ accessToken: 'token', user: { id: 'u', username: '13800138000' } })), requestSmsCode: vi.fn(), establishSession: vi.fn(), refreshAfterLogin, cancelGate: vi.fn(), onAuthenticated }); return null; }
    await act(async () => { const renderer = create(<Probe />); renderers.push(renderer); });
    await act(async () => { controller.setPhoneNumber('13800138000'); await Promise.resolve(); });
    await act(async () => { controller.setPassword('password1'); await Promise.resolve(); });
    await act(async () => { controller.setAgreement(true); await Promise.resolve(); });
    let pending!: Promise<void>;
    await act(async () => { pending = controller.submitPhoneLogin(); await Promise.resolve(); });
    await act(async () => { controller.close(); resolveRefresh(); await pending; });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
