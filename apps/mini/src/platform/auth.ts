import Taro from '@tarojs/taro'
import { request, ApiError } from './request'
import { getDeviceId } from './device'
import { AGREEMENT_VERSION, APP_VERSION } from '../config'

export type AuthUser = {
  id: string
  nickname: string
  avatarUrl: string | null
  status: string
}

export type StoredAuth = {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

const KEY = 'qiaoqiaole.auth'

export function getStoredAuth(): StoredAuth | null {
  try {
    const saved = Taro.getStorageSync(KEY)
    return saved && saved.accessToken ? (saved as StoredAuth) : null
  } catch {
    return null
  }
}

export function getAccessToken(): string {
  return getStoredAuth()?.accessToken || ''
}

function saveAuth(auth: StoredAuth): void {
  Taro.setStorageSync(KEY, auth)
}

export function clearAuth(): void {
  try { Taro.removeStorageSync(KEY) } catch { /* 忽略 */ }
}

function mapWxLoginError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'AUTH_WX_NOT_CONFIGURED') return '微信登录未配置：请在 API 的 .env 加 WX_AUTH_MOCK=1 后重启 API'
    if (e.code === 'AUTH_WX_CODE_INVALID') return '微信登录凭证无效，请重试'
    return e.message || '登录失败，请重试'
  }
  const msg = e instanceof Error ? e.message : ''
  if (/request:fail|network|ECONNREFUSED|timeout/i.test(msg)) return '连不上本机 API：请确认 API 已启动（端口 3000）'
  return msg || '登录失败，请重试'
}

/**
 * 微信登录：先弹微信官方授权框（头像、昵称），用户同意后拿 code → API /v1/auth/wx/login 换本站 JWT（与 H5 同一套会话）。
 * 拒绝授权则不继续登录。
 */
export async function wxLogin(): Promise<StoredAuth> {
  let userInfo: { nickName?: string; avatarUrl?: string } = {}
  try {
    const profile = await Taro.getUserProfile({ desc: '用于完善个人资料' })
    userInfo = { nickName: profile.userInfo?.nickName, avatarUrl: profile.userInfo?.avatarUrl }
  } catch {
    throw new Error('需要微信授权才能登录')
  }
  const { code } = await Taro.login()
  if (!code) throw new Error('微信登录失败，请重试')
  let data: { isNewUser: boolean; user: AuthUser; accessToken: string; refreshToken: string; expiresIn: number }
  try {
    data = await request<{ isNewUser: boolean; user: AuthUser; accessToken: string; refreshToken: string; expiresIn: number }>('/v1/auth/wx/login', {
      method: 'POST',
      data: {
        code,
        userInfo,
        agreementVersion: AGREEMENT_VERSION,
        device: { platform: 'weapp', deviceId: getDeviceId(), appVersion: APP_VERSION },
      },
    })
  } catch (e) {
    throw new Error(mapWxLoginError(e))
  }
  const auth: StoredAuth = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user }
  saveAuth(auth)
  return auth
}

/** 用 refreshToken 换新令牌对（服务端按 body 传 token 的路径才会把新 refreshToken 回 body）。 */
export async function refreshAuth(): Promise<StoredAuth | null> {
  const current = getStoredAuth()
  if (!current?.refreshToken) return null
  try {
    const data = await request<{ user: AuthUser; accessToken: string; refreshToken?: string; expiresIn: number }>('/v1/auth/token/refresh', {
      method: 'POST',
      data: { refreshToken: current.refreshToken },
    })
    const auth: StoredAuth = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || current.refreshToken,
      user: data.user,
    }
    saveAuth(auth)
    return auth
  } catch {
    clearAuth()
    return null
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getAccessToken()
  if (!token) return null
  const data = await request<{ user: AuthUser }>('/v1/auth/me', { token })
  return data.user
}
