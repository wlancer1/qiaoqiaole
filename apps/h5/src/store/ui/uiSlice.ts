import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export const GLOBAL_STATUS_SCOPE = 'global';

export type UiStatus = {
  scopeId: string;
  message: string;
};

export type LoginRequest = {
  id: string;
  scopeId: string;
  returnTo?: string;
};

export type UiState = {
  currentRouteScope: string;
  status: UiStatus | null;
  loginRequest: LoginRequest | null;
};

export type UiRootState = {
  ui: UiState;
};

const initialState: UiState = {
  currentRouteScope: '',
  status: null,
  loginRequest: null,
};

export function normalizeLoginReturnTo(returnTo?: unknown): string | undefined {
  if (typeof returnTo !== 'string') return undefined;
  const normalized = returnTo.trim();
  if (!normalized || !normalized.startsWith('/') || normalized.startsWith('//')) return undefined;
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized)) return undefined;
  if (/[\u0000-\u001f\u007f#]/.test(normalized)) return undefined;
  return normalized;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    routeScopeChanged: (state, action: PayloadAction<{ scopeId: string }>) => {
      state.currentRouteScope = action.payload.scopeId;
      state.status = null;
    },
    statusRequested: (state, action: PayloadAction<{ scopeId: string; message: string }>) => {
      if (action.payload.scopeId !== state.currentRouteScope) return;
      state.status = action.payload;
    },
    statusCleared: (state, action: PayloadAction<{ scopeId: string }>) => {
      if (action.payload.scopeId !== state.currentRouteScope) return;
      if (state.status?.scopeId !== action.payload.scopeId) return;
      state.status = null;
    },
    globalStatusRequested: (state, action: PayloadAction<{ message: string }>) => {
      state.status = {
        scopeId: GLOBAL_STATUS_SCOPE,
        message: action.payload.message,
      };
    },
    globalStatusCleared: (state) => {
      if (state.status?.scopeId === GLOBAL_STATUS_SCOPE) state.status = null;
    },
    loginRequestStarted: (state, action: PayloadAction<LoginRequest>) => {
      if (action.payload.scopeId !== state.currentRouteScope) return;
      if (!state.loginRequest) {
        const returnTo = normalizeLoginReturnTo(action.payload.returnTo);
        state.loginRequest = {
          id: action.payload.id,
          scopeId: action.payload.scopeId,
          ...(returnTo ? { returnTo } : {}),
        };
        return;
      }
      if (
        state.loginRequest.scopeId !== action.payload.scopeId
        || normalizeLoginReturnTo(state.loginRequest.returnTo)
      ) return;
      const returnTo = normalizeLoginReturnTo(action.payload.returnTo);
      if (returnTo) state.loginRequest.returnTo = returnTo;
    },
    loginRequestReconciled: (state, action: PayloadAction<LoginRequest>) => {
      if (
        state.loginRequest?.id !== action.payload.id
        || action.payload.scopeId !== state.currentRouteScope
      ) return;
      const returnTo = normalizeLoginReturnTo(state.loginRequest.returnTo)
        ?? normalizeLoginReturnTo(action.payload.returnTo);
      state.loginRequest = {
        id: action.payload.id,
        scopeId: action.payload.scopeId,
        ...(returnTo ? { returnTo } : {}),
      };
    },
    loginRequestCompleted: (state, action: PayloadAction<{ id: string }>) => {
      if (state.loginRequest?.id !== action.payload.id) return;
      state.loginRequest = null;
    },
    loginRequestCancelled: (state, action: PayloadAction<{ id: string }>) => {
      if (state.loginRequest?.id !== action.payload.id) return;
      state.loginRequest = null;
    },
  },
});

export const {
  globalStatusCleared,
  globalStatusRequested,
  loginRequestCancelled,
  loginRequestCompleted,
  loginRequestReconciled,
  loginRequestStarted,
  routeScopeChanged,
  statusCleared,
  statusRequested,
} = uiSlice.actions;

export const uiReducer = uiSlice.reducer;

export const selectCurrentRouteScope = (state: UiRootState): string => state.ui.currentRouteScope;
export const selectUiStatus = (state: UiRootState): UiStatus | null => state.ui.status;
export const selectUiStatusForScope = (state: UiRootState, scopeId: string): UiStatus | null => {
  const status = selectUiStatus(state);
  if (!status) return null;
  return status.scopeId === GLOBAL_STATUS_SCOPE || status.scopeId === scopeId ? status : null;
};
export const selectLoginRequest = (state: UiRootState): LoginRequest | null => state.ui.loginRequest;
