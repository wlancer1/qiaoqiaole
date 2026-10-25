import Taro from '@tarojs/taro'
import { API_BASE } from '../config'

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: Record<string, unknown>
  token?: string
}

/** 与 H5 的 requestApi 同口径：解包 { code, message, data } 信封，非 OK 抛 ApiError。 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await Taro.request({
    url: `${API_BASE}${path}`,
    method: options.method || 'GET',
    data: options.data,
    header: {
      'content-type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
  })
  const body = (res.data || {}) as { code?: string; message?: string; data?: T }
  if (res.statusCode < 200 || res.statusCode >= 300 || (body.code && body.code !== 'OK')) {
    throw new ApiError(body.code || `HTTP_${res.statusCode}`, body.message || '请求失败，请稍后重试', res.statusCode)
  }
  // /v1 接口走 { data } 信封；/community 等平铺接口直接返回整包
  return (body.data !== undefined ? body.data : (body as unknown)) as T
}
