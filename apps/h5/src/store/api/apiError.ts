export type ApiError = {
  kind: 'http' | 'business' | 'network' | 'parse' | 'aborted';
  status?: number;
  code?: string;
  message: string;
  data?: unknown;
  retryable: boolean;
};

export type ApiOperation = 'query' | 'mutation';

type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null;
}

function readString(record: ErrorRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function responseMessage(data: unknown, fallback: string): string {
  if (!isRecord(data)) return fallback;
  return readString(data, 'message') ?? readString(data, 'error') ?? fallback;
}

function isBusinessFailure(data: unknown): data is ErrorRecord {
  return isRecord(data) && (data.success === false || data.ok === false);
}

function isAbortError(raw: unknown): raw is Error {
  if (raw instanceof Error && raw.name === 'AbortError') return true;
  if (!isRecord(raw)) return false;
  const error = readString(raw, 'error') ?? '';
  return raw.name === 'AbortError' || /abort/i.test(error);
}

export function toApiError(raw: unknown, operation: ApiOperation): ApiError {
  if (isAbortError(raw)) {
    const message = raw instanceof Error
      ? raw.message
      : readString(raw, 'error') ?? '请求已取消';
    return { kind: 'aborted', message, retryable: false };
  }

  if (!isRecord(raw)) {
    return {
      kind: 'network',
      message: raw instanceof Error ? raw.message : '网络请求失败',
      retryable: operation === 'query',
    };
  }

  if (raw.status === 'FETCH_ERROR' || raw.status === 'TIMEOUT_ERROR') {
    return {
      kind: 'network',
      message: readString(raw, 'error') ?? '网络请求失败',
      retryable: operation === 'query',
    };
  }

  if (raw.status === 'PARSING_ERROR') {
    return {
      kind: 'parse',
      ...(typeof raw.originalStatus === 'number' ? { status: raw.originalStatus } : {}),
      message: readString(raw, 'error') ?? '响应数据解析失败',
      ...('data' in raw ? { data: raw.data } : {}),
      retryable: false,
    };
  }

  if (typeof raw.status === 'number') {
    const data = raw.data;
    if (raw.status >= 200 && raw.status < 300) {
      if (isBusinessFailure(data)) {
        return {
          kind: 'business',
          status: raw.status,
          ...(readString(data, 'code') ? { code: readString(data, 'code') } : {}),
          message: responseMessage(data, '操作失败'),
          data,
          retryable: false,
        };
      }
      return {
        kind: 'parse',
        status: raw.status,
        message: '响应数据格式不正确',
        data,
        retryable: false,
      };
    }

    return {
      kind: 'http',
      status: raw.status,
      message: responseMessage(data, `请求失败（${raw.status}）`),
      ...('data' in raw ? { data } : {}),
      retryable: operation === 'query' && raw.status >= 500,
    };
  }

  return {
    kind: 'network',
    message: readString(raw, 'message') ?? readString(raw, 'error') ?? '网络请求失败',
    retryable: operation === 'query',
  };
}

export function toUserMessage(error: ApiError): string {
  if (error.message) return error.message;
  if (error.kind === 'aborted') return '请求已取消';
  if (error.kind === 'network') return '网络连接失败，请稍后重试';
  if (error.kind === 'parse') return '服务响应异常，请稍后重试';
  return '操作失败，请稍后重试';
}
