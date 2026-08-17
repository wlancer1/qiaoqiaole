import { sessionEstablished } from '../../store/auth/authEvents';
import type { AuthUser } from '../../store/auth/authTypes';

type RawUser = {
  id?: unknown;
  username?: unknown;
  nickname?: unknown;
  avatarUrl?: unknown;
  likesCount?: unknown;
  followingCount?: unknown;
  followersCount?: unknown;
};

type Dependencies = {
  dispatch: (action: ReturnType<typeof sessionEstablished>) => unknown;
  completeLogin: (requestId: string) => void;
  isCurrentLoginRequest?: (requestId: string) => boolean;
};

type LoginOptions = { gateRequestId?: string; legacyDraftOwnerId?: string };

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeUser(raw: RawUser, legacyDraftOwnerId?: string): AuthUser {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  // Phone auth's production response exposes nickname rather than the legacy
  // username field. Keep AuthUser's stable username-shaped identity by using
  // nickname as the compatibility fallback.
  const username = typeof raw.username === 'string' && raw.username.trim()
    ? raw.username.trim()
    : typeof raw.nickname === 'string' ? raw.nickname.trim() : '';
  if (!id || !username) throw new Error('登录响应无效');
  const displayName = typeof raw.nickname === 'string' && raw.nickname.trim() ? raw.nickname.trim() : username;
  return {
    id,
    username,
    displayName,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : '',
    legacyDraftOwnerId: legacyDraftOwnerId?.trim() || username,
    likesCount: numberOrZero(raw.likesCount),
    followingCount: numberOrZero(raw.followingCount),
    followersCount: numberOrZero(raw.followersCount),
  };
}

export function createAuthSessionCoordinator({ dispatch, completeLogin, isCurrentLoginRequest: isCurrent = () => true }: Dependencies) {
  const completedGateIds = new Set<string>();
  const establish = (token: unknown, rawUser: RawUser, options: LoginOptions) => {
    if (typeof token !== 'string' || !token.trim()) throw new Error('登录响应无效');
    const user = normalizeUser(rawUser, options.legacyDraftOwnerId);
    dispatch(sessionEstablished({ token, user }));
    if (options.gateRequestId && !completedGateIds.has(options.gateRequestId)
      && isCurrent(options.gateRequestId)) {
      completedGateIds.add(options.gateRequestId);
      completeLogin(options.gateRequestId);
    }
    return { token, user };
  };
  return {
    establishFromUsername: (response: { token?: unknown; user?: RawUser }, options: LoginOptions = {}) => establish(response.token, response.user ?? {}, options),
    establishFromPhone: (response: { accessToken?: unknown; user?: RawUser }, options: LoginOptions = {}) => establish(response.accessToken, response.user ?? {}, options),
  };
}
