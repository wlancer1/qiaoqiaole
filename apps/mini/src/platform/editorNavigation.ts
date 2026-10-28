import Taro from '@tarojs/taro'

let closing = false
/** Pop the editor so the source page retains its scroll, filters and open detail. */
export async function closeEditor(): Promise<void> {
  if (closing) return
  closing = true
  try {
    if ((Taro.getCurrentPages?.().length ?? 0) > 1) {
      await Taro.navigateBack({ delta: 1 })
    } else {
      await Taro.redirectTo({ url: '/pages/works/index' })
    }
  } finally {
    closing = false
  }
}

export function returnFromEditor(): void {
  void closeEditor().catch(() => {
    Taro.showToast({ title: '返回失败，请重试', icon: 'none' })
  })
}
