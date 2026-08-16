import { useMemo, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { H5Store } from '../../store/store';
import { selectAuthAvatarUrl, selectAuthDisplayName, selectAuthToken } from '../../store/auth/authSlice';
import { profileUpdated } from '../../store/auth/authEvents';
import { logoutSession } from '../../store/auth/authThunks';
import { createAuthSessionCoordinator } from './authSessionCoordinator';
import { createPhoneAuthTransport } from './authPhoneTransport';
import { useAuthDialog } from './useAuthDialog';
import { useProfileEditor } from './useProfileEditor';
import { useAuthController } from './useAuthController';

type Args = {
  apiBase: string; captchaAppId: string;
  requestRef: MutableRefObject<(<T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>) | null>;
  refreshAfterLoginRef: MutableRefObject<(token: string) => Promise<unknown>>;
  fileToDataUrl: (file: File) => Promise<string>;
};

export function useAuthFeature({ apiBase, captchaAppId, requestRef, refreshAfterLoginRef, fileToDataUrl }: Args) {
  const dispatch = useAppDispatch(); const store = useStore() as H5Store; const navigate = useNavigate();
  const controller = useAuthController(); const token = useAppSelector(selectAuthToken);
  const isLoginModalOpen = useAppSelector((state) => Boolean(state.ui.loginRequest));
  const displayName = useAppSelector(selectAuthDisplayName); const avatarUrl = useAppSelector(selectAuthAvatarUrl);
  const transport = useMemo(() => createPhoneAuthTransport(apiBase, captchaAppId), [apiBase, captchaAppId]);
  const coordinator = useMemo(() => createAuthSessionCoordinator({ dispatch, completeLogin: controller.gate.completeLogin, isCurrentLoginRequest: (id) => store.getState().ui.loginRequest?.id === id }), [controller.gate, dispatch, store]);
  const dialog = useAuthDialog({ storage: typeof window === 'undefined' ? undefined : window.localStorage, ...transport, establishSession: (response, options) => coordinator.establishFromPhone(response, options), refreshAfterLogin: (nextToken) => refreshAfterLoginRef.current(nextToken), getGateRequestId: () => store.getState().ui.loginRequest?.id, getLoginReturnTo: () => store.getState().ui.loginRequest?.returnTo, onAuthenticated: (returnTo) => { if (returnTo) navigate(returnTo); }, cancelGate: () => { const id = store.getState().ui.loginRequest?.id; if (id) controller.gate.cancelLogin(id); } });
  const profile = useProfileEditor({ request: (path, options) => requestRef.current!(path, options), dispatchProfileUpdated: (changes) => dispatch(profileUpdated({ token, sessionVersion: store.getState().auth.sessionVersion, changes })), token, sessionVersion: store.getState().auth.sessionVersion, getSessionIdentity: () => ({ token: store.getState().auth.token, sessionVersion: store.getState().auth.sessionVersion }), fileToDataUrl });
  const logout = () => {
    dialog.close();
    void dispatch(logoutSession());
  };
  return { ...controller, dialog, profile, isLoginModalOpen, logout, openProfileEdit: () => profile.open({ name: displayName, avatarUrl }) };
}
