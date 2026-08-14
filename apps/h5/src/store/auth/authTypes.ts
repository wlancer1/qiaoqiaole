export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  legacyDraftOwnerId: string;
  likesCount: number;
  followingCount: number;
  followersCount: number;
};

export type RestoreIdentityHint = {
  username?: string;
  userId?: string;
};

export type StoredAuthRecord = RestoreIdentityHint & {
  token: string;
};

export type AuthState = {
  status: 'restoring' | 'authenticated' | 'anonymous';
  token: string;
  user: AuthUser | null;
  restoreIdentityHint: RestoreIdentityHint | null;
  restoreRequestId: string | null;
  sessionVersion: number;
};
