import { createAction } from '@reduxjs/toolkit';
import type { AuthUser } from './authTypes';

type SessionIdentity = {
  token: string;
  sessionVersion: number;
};

export const sessionEstablished = createAction<{
  token: string;
  user: AuthUser;
}>('auth/sessionEstablished');

export const sessionInvalidated = createAction<SessionIdentity>('auth/sessionInvalidated');

export const profileUpdated = createAction<SessionIdentity & {
  changes: Pick<AuthUser, 'displayName' | 'avatarUrl'>;
}>('auth/profileUpdated');

export const profileStatsUpdated = createAction<SessionIdentity & {
  changes: Pick<AuthUser, 'likesCount' | 'followingCount' | 'followersCount'>;
}>('auth/profileStatsUpdated');

export const sessionCleared = createAction('auth/sessionCleared');
