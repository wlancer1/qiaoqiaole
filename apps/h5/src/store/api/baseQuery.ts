import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query';
import { sessionInvalidated } from '../auth/authEvents';
import type { AuthState } from '../auth/authTypes';
import { toApiError, type ApiError } from './apiError';

export type AuthExtraOptions = {
  auth: 'required' | 'optional' | 'none';
};

export function authExtraOptions(auth: AuthExtraOptions['auth']): AuthExtraOptions {
  return { auth };
}

type AuthRootState = {
  auth: AuthState;
};

const transportBaseQuery = fetchBaseQuery({ baseUrl: '/api' });

function isBusinessFailure(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const envelope = data as Record<string, unknown>;
  return envelope.success === false || envelope.ok === false;
}

function configurationError(code: string, message: string): ApiError {
  return {
    kind: 'business',
    code,
    message,
    retryable: false,
  };
}

function createRequestHeaders(input: FetchArgs['headers']): Headers {
  const headers = new Headers();
  if (!input) return headers;

  if (input instanceof Headers) {
    input.forEach((value, name) => headers.append(name, value));
    return headers;
  }

  if (Array.isArray(input)) {
    input.forEach(([name, value]) => {
      if (value !== undefined) headers.append(name, value);
    });
    return headers;
  }

  Object.entries(input).forEach(([name, value]) => {
    if (value !== undefined) headers.append(name, value);
  });
  return headers;
}

function isCrossOriginAbsoluteUrl(url: string): boolean {
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
  if (!isAbsolute) return false;

  const currentOrigin = globalThis.location?.origin;
  const currentHref = globalThis.location?.href;
  if (!currentOrigin || !currentHref) return true;

  try {
    return new URL(url, currentHref).origin !== currentOrigin;
  } catch {
    return true;
  }
}

export const authenticatedBaseQuery: BaseQueryFn<
string | FetchArgs,
unknown,
ApiError,
Partial<AuthExtraOptions>,
FetchBaseQueryMeta
> = async (args, api, extraOptions) => {
  const auth = (api.getState() as AuthRootState).auth;
  const capturedIdentity = {
    token: auth.token,
    sessionVersion: auth.sessionVersion,
  };
  const authPolicy = extraOptions?.auth;
  if (!authPolicy) {
    return {
      error: configurationError('AUTH_POLICY_REQUIRED', '接口必须明确声明认证策略'),
    };
  }

  const requestUrl = typeof args === 'string' ? args : args.url;
  if (
    authPolicy !== 'none'
    && capturedIdentity.token
    && isCrossOriginAbsoluteUrl(requestUrl)
  ) {
    return {
      error: configurationError(
        'CROSS_ORIGIN_AUTH_FORBIDDEN',
        '禁止向跨域地址发送认证信息',
      ),
    };
  }

  const headers = createRequestHeaders(typeof args === 'string' ? undefined : args.headers);

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
    if (
      authPolicy === 'required'
      && capturedIdentity.token
      && result.error.status === 401
    ) {
      api.dispatch(sessionInvalidated(capturedIdentity));
    }
    return {
      error: toApiError(result.error, api.type),
      meta: result.meta,
    };
  }

  if (isBusinessFailure(result.data)) {
    return {
      error: toApiError({ status: 200, data: result.data }, api.type),
      meta: result.meta,
    };
  }

  return result;
};
