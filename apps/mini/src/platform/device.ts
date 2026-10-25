import Taro from '@tarojs/taro'

const KEY = 'qiaoqiaole.deviceId'

/** 本机设备标识：首次生成后持久保存，用于 API 的设备维度风控/会话记录。 */
export function getDeviceId(): string {
  try {
    const saved = Taro.getStorageSync(KEY)
    if (saved) return String(saved)
  } catch { /* 存储不可用时现生成 */ }
  const id = `mini_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
  try { Taro.setStorageSync(KEY, id) } catch { /* 忽略写入失败 */ }
  return id
}
