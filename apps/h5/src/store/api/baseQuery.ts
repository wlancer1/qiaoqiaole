import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
} from '@reduxjs/toolkit/query';
import { sessionInvalidated } from '../auth/authEvents';
import type { AuthState } from '../auth/authTypes';
import { toApiError, type ApiError } from './apiError';

export type AuthExtraOptions = {
  auth: 'required' | 'optional' | 'none';
};

type AuthRootState = {
  auth: AuthState;
};

const transportBaseQuery = fetchBaseQuery({ baseUrl: '/api' });

function isBusinessFailure(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const envelope = data as Record<string, unknown>;
  return envelope.success === false || envelope.ok === false;
}

export const authenticatedBaseQuery: BaseQueryFn<
string | FetchArgs,
unknown,
ApiError,
Partial<AuthExtraOptions>
> = async (args, api, extraOptions) => {
  const auth = (api.getState() as AuthRootState).auth;
  const capturedIdentity = {
    token: auth.token,
    sessionVersion: auth.sessionVersion,
  };
  const authPolicy = extraOptions.auth ?? 'none';
  const headers = new Headers(
    typeof args === 'string' ? undefined : args.headers as HeadersInit | undefined,
  );

  if (authPolicy !== 'none' && capturedIdentity.token) {
    headers.set('authorization', `Bearer ${capturedIdentity.token}`);
  } else {
    headers.delete('authorization');
  }

  const request: FetchArgs = typeof args === 'string'
    ? { url: args, headers }
    : { ...args, headers };
  const result = await transportBaseQuery(request, api, extraOptions);

  if (result.error) {
    if (authPolicy === 'required' && result.error.status === 401) {
      api.dispatch(sessionInvalidated(capturedIdentity));
    }
    return { error: toApiError(result.error, api.type) };
  }

  if (isBusinessFailure(result.data)) {
    return {
      error: toApiError({ status: 200, data: result.data }, api.type),
      meta: result.meta,
    };
  }

  return result;
};
