import { describe, expect, it } from 'vitest';
import {
  globalStatusCleared,
  globalStatusRequested,
  loginRequestCancelled,
  loginRequestCompleted,
  loginRequestReconciled,
  loginRequestStarted,
  routeScopeChanged,
  selectCurrentRouteScope,
  selectLoginRequest,
  selectUiStatus,
  selectUiStatusForScope,
  statusCleared,
  statusRequested,
  uiReducer,
  type UiState,
} from './uiSlice';

const initialState: UiState = {
  currentRouteScope: 'route-a',
  status: null,
  loginRequest: null,
};

function withStatus(state = initialState): UiState {
  return uiReducer(state, statusRequested({ scopeId: 'route-a', message: '保存成功' }));
}

function withLoginRequest(state = initialState): UiState {
  return uiReducer(state, loginRequestStarted({
    id: 'login-1',
    scopeId: 'route-a',
    returnTo: '/projects/1',
  }));
}

describe('ui reducer route-scoped status', () => {
  it('clears the old status when the route scope changes', () => {
    expect(uiReducer(withStatus(), routeScopeChanged({ scopeId: 'route-b' }))).toEqual({
      currentRouteScope: 'route-b',
      status: null,
      loginRequest: null,
    });
  });

  it('accepts status for the current route scope', () => {
    expect(withStatus()).toEqual({
      ...initialState,
      status: { scopeId: 'route-a', message: '保存成功' },
    });
  });

  it('ignores status and clear actions from an old route scope', () => {
    const state = withStatus();

    expect(uiReducer(state, statusRequested({ scopeId: 'route-old', message: '旧提示' }))).toBe(state);
    expect(uiReducer(state, statusCleared({ scopeId: 'route-old' }))).toBe(state);
  });

  it('allows a global status to bypass the current route scope', () => {
    const state = uiReducer(initialState, globalStatusRequested({ message: '登录状态已失效' }));

    expect(state).toEqual({
      ...initialState,
      status: { scopeId: 'global', message: '登录状态已失效' },
    });
    expect(uiReducer(state, globalStatusCleared())).toEqual(initialState);
  });
});

describe('ui reducer login request metadata', () => {
  it('rejects unsafe return targets at the reducer boundary', () => {
    for (const returnTo of ['https://evil.example', '//evil.example', '/ok#fragment', '/ok\u0000bad']) {
      expect(uiReducer(initialState, loginRequestStarted({ id: 'login-1', scopeId: 'route-a', returnTo })).loginRequest)
        .toEqual({ id: 'login-1', scopeId: 'route-a' });
    }
    expect(uiReducer(initialState, loginRequestStarted({ id: 'login-1', scopeId: 'route-a', returnTo: ' /projects/1?tab=a ' })).loginRequest)
      .toEqual({ id: 'login-1', scopeId: 'route-a', returnTo: '/projects/1?tab=a' });
  });
  it('keeps the active request id and scope while ignoring a later request', () => {
    const started = withLoginRequest();

    expect(uiReducer(started, loginRequestStarted({
      id: 'login-2',
      scopeId: 'route-a',
      returnTo: '/projects/2',
    }))).toBe(started);
  });

  it('fills an empty returnTo from a later request in the current scope', () => {
    const startedWithoutReturnTo = uiReducer(initialState, loginRequestStarted({
      id: 'login-1',
      scopeId: 'route-a',
      returnTo: '   ',
    }));

    expect(uiReducer(startedWithoutReturnTo, loginRequestStarted({
      id: 'login-2',
      scopeId: 'route-a',
      returnTo: '  /projects/2  ',
    }))).toEqual({
      ...initialState,
      loginRequest: { id: 'login-1', scopeId: 'route-a', returnTo: '/projects/2' },
    });
  });

  it('does not overwrite an existing returnTo or accept another scope', () => {
    const started = withLoginRequest();

    expect(uiReducer(started, loginRequestStarted({
      id: 'login-2',
      scopeId: 'route-a',
      returnTo: '/projects/2',
    }))).toBe(started);
    expect(uiReducer(started, loginRequestStarted({
      id: 'login-2',
      scopeId: 'route-b',
      returnTo: '/projects/2',
    }))).toBe(started);
  });

  it('updates the surviving scope while keeping the first valid returnTo', () => {
    const routeBState = uiReducer(withLoginRequest(), routeScopeChanged({ scopeId: 'route-b' }));

    expect(uiReducer(routeBState, loginRequestReconciled({
      id: 'login-1',
      scopeId: 'route-b',
      returnTo: '  /profile  ',
    }))).toEqual({
      ...routeBState,
      loginRequest: { id: 'login-1', scopeId: 'route-b', returnTo: '/projects/1' },
    });
  });

  it('preserves an existing returnTo when reconciliation omits or blanks the new value', () => {
    const routeBState = uiReducer(withLoginRequest(), routeScopeChanged({ scopeId: 'route-b' }));
    const expected = {
      ...routeBState,
      loginRequest: { id: 'login-1', scopeId: 'route-b', returnTo: '/projects/1' },
    };

    for (const returnTo of [undefined, '', '   ']) {
      expect(uiReducer(routeBState, loginRequestReconciled({
        id: 'login-1',
        scopeId: 'route-b',
        returnTo,
      }))).toEqual(expected);
    }
  });

  it('uses a valid reconciliation returnTo only when no earlier value exists', () => {
    const stateWithoutReturnTo = uiReducer(initialState, loginRequestStarted({
      id: 'login-1',
      scopeId: 'route-a',
    }));

    expect(uiReducer(stateWithoutReturnTo, loginRequestReconciled({
      id: 'login-1',
      scopeId: 'route-a',
      returnTo: '  /profile  ',
    }))).toEqual({
      ...initialState,
      loginRequest: { id: 'login-1', scopeId: 'route-a', returnTo: '/profile' },
    });
  });

  it('ignores matching-ID reconciliation from an old route scope', () => {
    const state = withLoginRequest();

    expect(uiReducer(state, loginRequestReconciled({
      id: 'login-1',
      scopeId: 'route-old',
      returnTo: '/profile',
    }))).toBe(state);
  });

  it('ignores reconciliation for a stale login request ID', () => {
    const state = withLoginRequest();

    expect(uiReducer(state, loginRequestReconciled({
      id: 'login-old',
      scopeId: 'route-b',
      returnTo: '/profile',
    }))).toBe(state);
  });

  it('completes or cancels only the matching login request ID', () => {
    const state = withLoginRequest();

    expect(uiReducer(state, loginRequestCompleted({ id: 'login-old' }))).toBe(state);
    expect(uiReducer(state, loginRequestCancelled({ id: 'login-old' }))).toBe(state);
    expect(uiReducer(state, loginRequestCompleted({ id: 'login-1' }))).toEqual(initialState);
    expect(uiReducer(state, loginRequestCancelled({ id: 'login-1' }))).toEqual(initialState);
  });
});

describe('ui reducer serializability', () => {
  it('keeps every state and action serializable', () => {
    const actions = [
      routeScopeChanged({ scopeId: 'route-b' }),
      statusRequested({ scopeId: 'route-b', message: '完成' }),
      statusCleared({ scopeId: 'route-b' }),
      globalStatusRequested({ message: '全局提示' }),
      globalStatusCleared(),
      loginRequestStarted({ id: 'login-1', scopeId: 'route-b', returnTo: '/projects/1' }),
      loginRequestReconciled({ id: 'login-1', scopeId: 'route-c' }),
      loginRequestCompleted({ id: 'login-1' }),
      loginRequestCancelled({ id: 'login-1' }),
    ];
    let state = initialState;

    for (const action of actions) {
      expect(() => JSON.stringify(action)).not.toThrow();
      state = uiReducer(state, action);
      expect(() => JSON.stringify(state)).not.toThrow();
    }
  });
});

describe('ui selectors', () => {
  it('selects the current route scope, status, and login request', () => {
    const state = uiReducer(withLoginRequest(), statusRequested({
      scopeId: 'route-a',
      message: '请先登录',
    }));
    const rootState = { ui: state };

    expect(selectCurrentRouteScope(rootState)).toBe('route-a');
    expect(selectUiStatus(rootState)).toEqual({ scopeId: 'route-a', message: '请先登录' });
    expect(selectLoginRequest(rootState)).toEqual({
      id: 'login-1',
      scopeId: 'route-a',
      returnTo: '/projects/1',
    });
  });

  it('filters route status by the rendered Router scope while keeping global status visible', () => {
    const routeStatus = { ui: withStatus() };
    const globalStatus = {
      ui: uiReducer(initialState, globalStatusRequested({ message: '登录状态已失效' })),
    };

    expect(selectUiStatusForScope(routeStatus, 'route-a')).toEqual({
      scopeId: 'route-a',
      message: '保存成功',
    });
    expect(selectUiStatusForScope(routeStatus, 'route-b')).toBeNull();
    expect(selectUiStatusForScope(globalStatus, 'route-b')).toEqual({
      scopeId: 'global',
      message: '登录状态已失效',
    });
  });
});
