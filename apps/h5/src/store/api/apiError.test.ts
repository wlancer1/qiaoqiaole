import { describe, expect, it } from 'vitest';
import { toApiError, toUserMessage } from './apiError';

describe('toApiError', () => {
  it('maps an HTTP 500 query to a retryable HTTP error', () => {
    expect(toApiError({ status: 500, data: { message: '服务器异常' } }, 'query')).toEqual({
      kind: 'http',
      status: 500,
      message: '服务器异常',
      data: { message: '服务器异常' },
      retryable: true,
    });
  });

  it('does not mark the same HTTP 500 mutation as retryable', () => {
    expect(toApiError({ status: 500, data: { message: '服务器异常' } }, 'mutation')).toMatchObject({
      kind: 'http',
      status: 500,
      retryable: false,
    });
  });

  it('maps an HTTP 400 response to a non-retryable HTTP error', () => {
    expect(toApiError({ status: 400, data: { error: '参数错误' } }, 'query')).toEqual({
      kind: 'http',
      status: 400,
      message: '参数错误',
      data: { error: '参数错误' },
      retryable: false,
    });
  });

  it('maps a query network failure as retryable but the same mutation as non-retryable', () => {
    const raw = { status: 'FETCH_ERROR', error: 'Failed to fetch' };

    expect(toApiError(raw, 'query')).toEqual({
      kind: 'network',
      message: 'Failed to fetch',
      retryable: true,
    });
    expect(toApiError(raw, 'mutation')).toEqual({
      kind: 'network',
      message: 'Failed to fetch',
      retryable: false,
    });
  });

  it('maps a parsing failure to a non-retryable parse error', () => {
    expect(toApiError({
      status: 'PARSING_ERROR',
      originalStatus: 200,
      data: '<html>',
      error: 'Unexpected token',
    }, 'query')).toEqual({
      kind: 'parse',
      status: 200,
      message: 'Unexpected token',
      data: '<html>',
      retryable: false,
    });
  });

  it('maps an aborted request to a non-retryable aborted error', () => {
    expect(toApiError(new DOMException('The operation was aborted.', 'AbortError'), 'query')).toEqual({
      kind: 'aborted',
      message: 'The operation was aborted.',
      retryable: false,
    });
  });

  it('maps an explicit success false envelope to a business error', () => {
    expect(toApiError({
      status: 200,
      data: { success: false, code: 'POST_HIDDEN', message: '作品不可见' },
    }, 'query')).toEqual({
      kind: 'business',
      status: 200,
      code: 'POST_HIDDEN',
      message: '作品不可见',
      data: { success: false, code: 'POST_HIDDEN', message: '作品不可见' },
      retryable: false,
    });
  });

  it('maps an explicit ok false envelope to a business error', () => {
    expect(toApiError({ status: 200, data: { ok: false, message: '操作失败' } }, 'mutation')).toMatchObject({
      kind: 'business',
      status: 200,
      message: '操作失败',
      retryable: false,
    });
  });

  it('never treats a message field alone as a business failure', () => {
    expect(toApiError({ status: 200, data: { message: '普通响应消息' } }, 'query')).toMatchObject({
      kind: 'parse',
      status: 200,
      retryable: false,
    });
  });
});

describe('toUserMessage', () => {
  it('preserves a useful server message', () => {
    expect(toUserMessage({
      kind: 'business',
      message: '作品不可见',
      retryable: false,
    })).toBe('作品不可见');
  });
});
