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

const initialState: UiState = {
  currentRouteScope: '',
  status: null,
  loginRequest: null,
};

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
    loginRequestStarted: (state, action: PayloadAction<LoginRequest>) => {
      if (state.loginRequest || action.payload.scopeId !== state.currentRouteScope) return;
      state.loginRequest = action.payload;
    },
    loginRequestReconciled: (state, action: PayloadAction<LoginRequest>) => {
      if (state.loginRequest?.id !== action.payload.id) return;
      state.loginRequest = action.payload;
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
