# Codex 开发任务：H5 极速去背景（本地算法版）

## 1. 任务目标

在现有 H5 图片处理 / 拼豆图生成流程中，实现一个**纯前端、本地运行、无需第三方 API** 的“快速去背景”功能。

目标体验：

- 用户打开“去除背景”开关后，立即对当前图片进行背景移除。
- 提供 `0~100` 的“灵敏度”滑杆。
- 用户拖动灵敏度时，预览结果应近实时更新。
- 对纯色背景、近似纯色背景、墙面、桌面、摄影棚等简单背景，应达到较稳定的去背景效果。
- 主体颜色与背景相近时，尽量避免大面积误删。
- 结果直接进入现有像素化 / 拼豆颜色映射流程。
- 第一阶段**不接入 remove.bg、BiRefNet、rembg 或任何云端 API**。
- 后续保留“AI 智能去背景”的扩展接口，但本任务只完成“快速去背景”。

核心算法：

```text
图片缩放
  ↓
边缘多点采样
  ↓
背景颜色聚类 / 背景颜色模型
  ↓
四边 Multi-source Flood Fill
  ↓
Region Growing 区域生长
  ↓
中心主体保护
  ↓
生成背景 Mask
  ↓
1px 左右边缘羽化
  ↓
去背景色残边 / halo
  ↓
输出透明 ImageData
```

---

# 2. 技术约束

项目技术栈以仓库现状为准。

预计环境：

- React
- TypeScript
- Canvas 2D
- H5 / 移动端浏览器
- Vitest
- 必要时增加 Playwright 页面测试

开发前请先检查现有项目结构，找到：

1. 图片上传入口
2. 图片参数调整逻辑
3. 当前“去除背景”实现
4. 灵敏度字段
5. 图片预览 Canvas
6. 像素化 / 拼豆颜色量化处理入口
7. 现有相关测试

**不要为了匹配本文档而强行创建重复模块。**

如果项目已经存在：

- `removeBackground`
- `backgroundRemoval`
- `imageProcessor`
- `imageFilters`

等功能，请优先重构 / 复用现有代码。

---

# 3. 非目标

本任务不做：

- AI 人像分割
- BiRefNet
- U2Net
- RMBG
- rembg
- remove.bg API
- 后端 GPU 推理
- 用户手动画蒙版
- 魔棒工具
- 抠图笔刷
- 自动识别人 / 宠物 / 商品语义
- 复杂头发级 Alpha Matting

这些后续可作为“智能去背景”模式单独开发。

---

# 4. UI 要求

保留现有参数设置布局，不大改 UI。

建议结构：

```text
去除背景                         [ ON ]

灵敏度
[-]  ─────────●─────────  [+]
               30
```

如果当前已经存在“去除背景”和“灵敏度”，直接接入新算法。

默认值：

```ts
removeBackground = false
backgroundSensitivity = 30
```

灵敏度：

```text
最小值：0
最大值：100
默认值：30
步长：1
```

用户关闭“去除背景”时：

- 立即恢复原图 / 未去背景状态。
- 不重复解码原始图片。
- 不丢失当前其它参数，例如：
  - 亮度
  - 对比度
  - 饱和度
  - 尺寸
  - 去杂色等。

---

# 5. 处理顺序

必须保证：

```text
原始图片
  ↓
尺寸调整 / crop（遵循现有逻辑）
  ↓
基础颜色参数
  ↓
快速去背景
  ↓
像素化 / 缩小
  ↓
调色板颜色映射
  ↓
去杂色 / 合并
  ↓
最终拼豆图
```

具体顺序若与现有架构冲突，可根据现有 pipeline 调整。

但必须满足核心原则：

> 去背景应尽量发生在最终颜色量化之前。

不要先把图片压成 20~30 种拼豆颜色后再做背景识别，否则背景和主体颜色更容易混淆。

---

# 6. 处理分辨率

为保证手机端性能，不要求在原始 4K 图片上做 Flood Fill。

创建一个专门用于去背景分析的工作尺寸。

建议：

```ts
const MAX_BACKGROUND_PROCESS_SIZE = 256
```

规则：

```text
最长边 <= 256：保持原尺寸

最长边 > 256：
等比缩小到最长边 256
```

如果现有预览 / 像素化阶段本身已经缩小到约：

```text
128 × 128
256 × 256
```

可直接复用该尺寸。

禁止每次拖动灵敏度时重新：

```text
decode image
→ createImageBitmap
→ drawImage
→ getImageData
```

原始处理数据必须缓存。

---

# 7. 模块设计

建议目录：

```text
src/
  ...
  image/
    backgroundRemoval/
      types.ts
      colorDistance.ts
      sampleBackground.ts
      buildBackgroundModel.ts
      floodFill.ts
      featherMask.ts
      removeHalo.ts
      removeBackground.ts
      removeBackground.test.ts
```

如果项目已有对应目录，使用现有目录。

---

# 8. 对外 API

建议暴露统一入口：

```ts
export interface RemoveBackgroundOptions {
  sensitivity: number
  feather?: number
  protectCenter?: boolean
}

export interface RemoveBackgroundResult {
  imageData: ImageData

  /**
   * 0 = 主体
   * 255 = 背景
   */
  mask: Uint8Array
}

export function removeBackground(
  imageData: ImageData,
  options: RemoveBackgroundOptions
): RemoveBackgroundResult
```

默认参数：

```ts
{
  sensitivity: 30,
  feather: 1,
  protectCenter: true
}
```

函数必须是：

- 纯本地
- 可测试
- 不依赖 React
- 不依赖 DOM 组件状态
- 不调用网络 API

---

# 9. Step 1：边缘多点背景采样

不要只读取左上角像素。

从：

- top
- bottom
- left
- right

四条边采样。

例如每隔：

```ts
Math.max(1, Math.floor(edgeLength / 32))
```

采一个点。

目标每条边大约：

```text
20~40 个样本
```

同时避免重复采四个角。

伪代码：

```ts
function sampleEdgePixels(
  imageData: ImageData
): RGB[] {
  // top
  // bottom
  // left
  // right
}
```

过滤以下像素：

- alpha 很低的透明像素
- 非法值

---

# 10. Step 2：背景颜色模型

不要简单对全部边缘像素取平均。

原因：

如果人物 / 商品碰到画面边缘：

```text
背景像素 + 主体像素
```

平均值会被污染。

第一版可实现一个轻量聚类。

不要求引入第三方聚类库。

推荐：

## 方案 A：RGB 网格量化聚类

把 RGB 降低精度：

```ts
const STEP = 16

bucketKey = [
  Math.round(r / STEP),
  Math.round(g / STEP),
  Math.round(b / STEP),
]
```

统计边缘颜色桶。

选占比最大的：

```text
1~3 个 cluster
```

作为背景候选色。

忽略占比极低的 cluster。

例如：

```ts
interface BackgroundColor {
  r: number
  g: number
  b: number
  weight: number
}
```

最终：

```ts
backgroundColors: BackgroundColor[]
```

---

# 11. Step 3：颜色距离

第一阶段优先性能，不要求 CIEDE2000。

使用加权 RGB distance。

实现：

```ts
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2

  return Math.sqrt(
    dr * dr * 0.299 +
    dg * dg * 0.587 +
    db * db * 0.114
  )
}
```

如果项目已有 OKLab / Lab 转换函数，可以复用。

不要为了本任务额外引入大型颜色处理依赖。

---

# 12. Step 4：灵敏度映射

UI：

```text
0 ~ 100
```

内部不要直接拿 `sensitivity` 当 RGB distance。

建议：

```ts
function sensitivityToThreshold(
  sensitivity: number
): number {
  const value = clamp(sensitivity, 0, 100)

  return 10 + value * 1.15
}
```

参考：

```text
0   → 10
30  → 44.5
50  → 67.5
100 → 125
```

具体常数允许根据测试图片调整。

但必须集中在一个函数中，禁止把 magic number 分散在多个模块。

---

# 13. Step 5：Multi-source Flood Fill

不要：

```text
只从左上角 Flood Fill
```

必须：

```text
从四条边同时进入
```

使用：

```text
Multi-source BFS
```

或者更高效的 scanline flood fill。

对于 `256×256` 以内图片，普通 BFS 足够。

初始化：

```ts
for top/bottom/left/right edge pixels:
  if pixel looks like background:
    queue.push(pixel)
```

需要：

```ts
visited = new Uint8Array(width * height)
mask = new Uint8Array(width * height)
```

避免：

```ts
boolean[]
object[]
Set<string>
```

这类会增加 GC 压力的结构。

队列也不要反复：

```ts
Array.shift()
```

建议：

```ts
const queue = new Int32Array(width * height)
let head = 0
let tail = 0
```

---

# 14. Step 6：Region Growing

不能只判断：

```text
当前像素
vs
固定背景色
```

否则渐变背景容易断掉。

每次扩展像素时，同时计算：

```text
当前像素 vs 背景颜色模型
```

以及：

```text
当前像素 vs 父级背景像素
```

建议条件：

```ts
const globalDistance =
  distanceToBackgroundModel(pixel)

const localDistance =
  colorDistance(pixel, parentPixel)

const globalThreshold =
  sensitivityToThreshold(sensitivity)

const localThreshold =
  12 + sensitivity * 0.35

const isBackground =
  globalDistance <= globalThreshold ||
  (
    globalDistance <= globalThreshold * 1.55 &&
    localDistance <= localThreshold
  )
```

目的：

允许：

```text
白
→ 灰白
→ 浅灰
→ 灰
```

这种缓慢背景渐变继续向内部扩散。

同时避免跨过明显主体边缘。

---

# 15. Step 7：中心主体保护

默认开启：

```ts
protectCenter = true
```

中心区域：

```text
宽度中间 60%
高度中间 60%
```

即：

```ts
normalizedX in [0.2, 0.8]
normalizedY in [0.2, 0.8]
```

在中心区域降低删除阈值：

```ts
effectiveThreshold *= 0.78
```

或者等效增加成为背景的难度。

注意：

中心保护不能做到完全禁止删除。

否则：

```text
纯色空背景
```

中心会留下大块背景。

中心保护只是增加权重，不是 hard mask。

---

# 16. Step 8：必须只删除“与边缘连通”的背景

核心安全原则：

> 即使图片内部有颜色和背景完全相同，只要它没有通过相似像素连接到图片边缘，就不要直接删除。

例如：

```text
白背景
+
主体内部白色图案
```

主体内部白色区域不应该因为“颜色像背景”而被直接全部透明。

Flood Fill 的结果即作为主要 background mask。

禁止实现：

```ts
for each pixel:
  if distance(pixel, bg) < threshold:
    alpha = 0
```

这种全图颜色删除算法。

---

# 17. Step 9：Mask

Mask 定义：

```text
0   = 主体
255 = 背景
中间值 = 半透明边缘
```

Flood Fill 初始结果：

```text
背景 = 255
主体 = 0
```

之后再做羽化。

---

# 18. Step 10：边缘羽化

默认：

```ts
feather = 1
```

第一版只需要对 mask 边界做：

```text
1px
```

简单羽化。

不需要大型 Gaussian Blur。

可实现：

- 3×3 box blur
- 或根据相邻 mask 数量生成 alpha

例如：

```text
周围全部背景 → 255
大部分背景 → 192
背景 / 主体混合 → 96
主体 → 0
```

要求：

- 不明显扩大背景区域
- 不导致主体整体发虚
- 主要用于减少硬锯齿

---

# 19. Step 11：去白边 / 背景色残边

背景移除后边缘可能出现：

```text
white halo
gray halo
background color halo
```

只处理：

```text
mask 边缘 1~2px
```

不要修改主体内部大面积像素。

第一版可以：

1. 找到半透明边缘像素。
2. 判断其 RGB 与背景模型距离。
3. 如果高度接近背景：
   - 进一步降低 alpha。
4. 不要求复杂 color decontamination。

以后再升级 RGB 去污染算法。

---

# 20. 输出 ImageData

不要修改缓存中的原始 ImageData。

必须：

```ts
const output = new Uint8ClampedArray(input.data)
```

对于每个像素：

```ts
const backgroundWeight = mask[i] / 255

outputAlpha =
  originalAlpha * (1 - backgroundWeight)
```

不要简单：

```ts
alpha = mask ? 0 : 255
```

否则羽化无效。

返回：

```ts
new ImageData(
  output,
  width,
  height
)
```

---

# 21. React 集成

React 层不要承担算法细节。

组件只负责：

```text
removeBackgroundEnabled
sensitivity
```

以及触发图像 pipeline。

建议：

```ts
const processed = useMemo(
  () => processImage(...),
  [...]
)
```

但如果现有 pipeline 有自己的缓存 / worker / reducer，遵循现有架构。

---

# 22. 拖动灵敏度优化

灵敏度 slider 拖动时：

```text
30
31
32
33
34
```

不要重复加载图片。

缓存：

```ts
interface BackgroundRemovalCache {
  sourceImageData: ImageData
  edgeSamples: RGB[]
  backgroundModel: BackgroundColor[]
}
```

每次 sensitivity 改变只重新：

```text
Flood Fill
→ Mask
→ Feather
→ Output
```

---

# 23. Slider 实时预览节流

不要在移动端触发数百次无意义计算。

允许：

```text
requestAnimationFrame
```

或者：

```text
30~50ms throttle
```

推荐：

```ts
requestAnimationFrame
```

行为：

```text
手指持续拖动
↓
最多每帧计算一次
↓
永远处理最新 sensitivity
```

不要使用：

```text
300ms debounce
```

否则操作感会明显延迟。

---

# 24. Web Worker

第一版不强制使用 Worker。

先测试：

```text
128×128
256×256
```

如果主线程单次计算：

```text
< 16ms
```

保持主线程即可。

如果实际测试：

```text
明显 > 16ms
```

再把：

```text
Flood Fill
Mask
Feather
```

移动到 Web Worker。

不要为了理论上的性能过早增加 Worker 复杂度。

---

# 25. 内存要求

对于：

```text
256 × 256
```

像素数：

```text
65,536
```

允许的数据结构：

```ts
Uint8Array
Uint8ClampedArray
Int32Array
```

禁止为每个像素创建对象：

```ts
{
  x,
  y,
  r,
  g,
  b
}
```

也禁止：

```ts
Set<`${x},${y}`>
```

避免移动端 GC 抖动。

---

# 26. 复杂度目标

核心 Flood Fill：

```text
O(width × height)
```

Mask feather：

```text
O(width × height)
```

整体：

```text
O(N)
```

其中：

```text
N = width × height
```

不允许：

```text
每个像素
×
扫描全图
```

这种 O(N²) 实现。

---

# 27. 测试要求

必须先补算法测试。

## Test 1：纯白背景

输入：

```text
白色背景
中心红色方块
```

预期：

- 四周背景透明。
- 中心红色方块保留。

---

## Test 2：浅灰渐变背景

输入：

```text
四周白色
向内部逐渐变浅灰
中心深色主体
```

预期：

- Region Growing 能删除大部分渐变背景。
- 深色主体保留。

---

## Test 3：主体内部存在背景色

输入：

```text
白背景
主体内部有一个封闭白色区域
```

预期：

- 外部白背景删除。
- 主体内部封闭的白色区域不因为颜色相同被直接删除。

重点验证：

> 只删除与边缘连通区域。

---

## Test 4：主体触碰边缘

输入：

```text
主体一部分碰到左边
其它三边为背景
```

预期：

- 背景正常删除。
- 不因为主体碰边而导致整个主体被 Flood Fill 吃掉。

---

## Test 5：灵敏度

同一图片分别：

```text
sensitivity = 10
sensitivity = 30
sensitivity = 80
```

预期：

```text
删除背景数量：
10 <= 30 <= 80
```

---

## Test 6：透明输入

输入本身包含透明区域。

预期：

- 原透明区域继续保持透明。
- 算法不产生异常。
- 不把透明像素作为错误的主体颜色参与背景模型。

---

## Test 7：极小图片

输入：

```text
1×1
2×2
3×3
```

预期：

- 不崩溃。
- 不越界。
- 返回尺寸一致。

---

## Test 8：性能测试

生成：

```text
256×256
```

测试图片。

在测试环境中至少确保：

- 无明显 O(N²) 行为。
- 算法可以快速完成。

不要写极易受 CI 环境影响的严格毫秒断言。

可以设置相对宽松的上限用于防止明显性能退化。

---

# 28. 页面集成测试

如果当前项目已有页面测试，增加：

### Case 1

```text
默认关闭去背景
```

预期：

- 使用正常图片 pipeline。

### Case 2

```text
打开去背景
```

预期：

- 预览更新。
- 参数状态为 true。

### Case 3

```text
改变灵敏度 30 → 60
```

预期：

- 不重新上传 / 解码图片。
- 预览重新计算。

### Case 4

```text
关闭去背景
```

预期：

- 恢复没有背景移除的结果。
- 其它参数保持不变。

---

# 29. 建议实现伪代码

```ts
export function removeBackground(
  imageData: ImageData,
  options: RemoveBackgroundOptions
): RemoveBackgroundResult {
  const sensitivity = clamp(
    options.sensitivity,
    0,
    100
  )

  const samples =
    sampleEdgePixels(imageData)

  const backgroundModel =
    buildBackgroundModel(samples)

  const mask =
    floodFillBackground(
      imageData,
      backgroundModel,
      {
        sensitivity,
        protectCenter:
          options.protectCenter ?? true,
      }
    )

  const finalMask =
    options.feather === 0
      ? mask
      : featherMask(
          mask,
          imageData.width,
          imageData.height,
          options.feather ?? 1
        )

  const output =
    applyBackgroundMask(
      imageData,
      finalMask
    )

  return {
    imageData: output,
    mask: finalMask,
  }
}
```

---

# 30. Flood Fill 伪代码

```ts
function floodFillBackground(
  imageData,
  backgroundModel,
  options
) {
  const { width, height, data } = imageData

  const pixelCount = width * height

  const visited =
    new Uint8Array(pixelCount)

  const mask =
    new Uint8Array(pixelCount)

  const queue =
    new Int32Array(pixelCount)

  let head = 0
  let tail = 0

  // 1. 将四边符合背景条件的点加入 queue
  seedEdges()

  while (head < tail) {
    const index = queue[head++]

    if (visited[index]) continue

    visited[index] = 1

    const parentPixel =
      readPixel(data, index)

    mask[index] = 255

    for (const nextIndex of neighbors(index)) {
      if (visited[nextIndex]) continue

      const pixel =
        readPixel(data, nextIndex)

      const globalDistance =
        distanceToBackgroundModel(
          pixel,
          backgroundModel
        )

      const localDistance =
        colorDistance(
          pixel,
          parentPixel
        )

      let threshold =
        sensitivityToThreshold(
          options.sensitivity
        )

      if (
        options.protectCenter &&
        isCenterPixel(nextIndex)
      ) {
        threshold *= 0.78
      }

      const localThreshold =
        12 +
        options.sensitivity * 0.35

      const background =
        globalDistance <= threshold ||
        (
          globalDistance <= threshold * 1.55 &&
          localDistance <= localThreshold
        )

      if (background) {
        queue[tail++] = nextIndex
      }
    }
  }

  return mask
}
```

实际开发中请避免 `neighbors()` 为每个像素生成数组。

直接判断：

```ts
x > 0
x < width - 1
y > 0
y < height - 1
```

---

# 31. 背景模型距离

如果有多个背景 cluster：

```ts
backgroundColors = [
  bg1,
  bg2,
  bg3,
]
```

当前像素的 background distance：

```ts
distance = Math.min(
  distance(pixel, bg1),
  distance(pixel, bg2),
  distance(pixel, bg3)
)
```

不要把三个背景色先简单平均成一个颜色。

这对：

```text
浅蓝天空 + 白墙
```

这种边缘存在两种主要背景颜色的情况更友好。

---

# 32. 失败保护

如果背景采样结果不可靠，例如：

```text
边缘颜色极度分散
没有明显主 cluster
```

不要激进删除。

可以降低 threshold。

例如：

```ts
backgroundConfidence < 0.35
```

时：

```ts
threshold *= 0.7
```

原则：

> 宁可少删，也不要把主体大量误删。

---

# 33. 调试模式

开发环境允许增加：

```ts
DEBUG_BACKGROUND_REMOVAL
```

可选调试信息：

```ts
{
  sampledColors,
  backgroundColors,
  backgroundConfidence,
  processingWidth,
  processingHeight,
  removedPixelCount,
}
```

生产环境不要 `console.log` 每个像素或每次 slider 变化。

---

# 34. 可扩展 AI 接口

本任务不实现 AI，但架构不要堵死。

建议未来统一：

```ts
type BackgroundRemovalMode =
  | 'fast'
  | 'ai'
```

未来：

```ts
async function removeBackgroundAI(...)
```

当前 UI 可以暂时只显示快速去背景。

不要现在为了 AI 功能增加后端接口。

---

# 35. 性能目标

针对处理尺寸：

```text
128×128
```

目标：

```text
用户感知接近即时
```

针对：

```text
256×256
```

目标：

```text
正常现代手机浏览器下拖动 slider
无明显卡顿
```

具体毫秒数不作为硬性验收条件，因为设备差异较大。

重点：

- 不重复解码图片。
- 不创建大量临时对象。
- 不 O(N²)。
- slider 最多每 animation frame 处理一次。
- 处理尺寸最大约 256px。

---

# 36. 验收标准

完成后必须满足：

- [ ] 去除背景完全在浏览器本地完成。
- [ ] 无第三方 API。
- [ ] 无网络请求。
- [ ] 四边多点采样背景。
- [ ] 至少支持 1~3 个背景颜色 cluster。
- [ ] 使用 Multi-source Flood Fill。
- [ ] 只删除与边缘连通的背景。
- [ ] 支持 Region Growing。
- [ ] 支持中心主体保护。
- [ ] 支持 `0~100` 灵敏度。
- [ ] 灵敏度默认 `30`。
- [ ] 输出透明 Alpha。
- [ ] 边缘至少有轻量羽化。
- [ ] 不修改原始 ImageData。
- [ ] slider 拖动不重复 decode 原图。
- [ ] 128~256px 工作尺寸性能良好。
- [ ] 现有亮度 / 对比度 / 饱和度等参数不被破坏。
- [ ] 现有像素化 / 拼豆颜色映射功能不回归。
- [ ] 算法单元测试通过。
- [ ] 页面相关测试通过。
- [ ] TypeScript typecheck 通过。
- [ ] lint 通过。
- [ ] build 通过。

---

# 37. Codex 执行流程

请严格按照以下顺序执行。

## Task 1：调查现有代码

先找到：

- 图片处理 pipeline
- 去背景现有逻辑
- 灵敏度参数
- Canvas 预览逻辑
- 图片缓存逻辑
- 像素化逻辑
- 测试位置

输出简短调查结论后再修改。

---

## Task 2：写 RED 测试

先写：

- 纯色背景
- 渐变背景
- 封闭同色区域
- 主体触边
- 灵敏度
- 透明图片
- 极小图片

确认测试先失败。

---

## Task 3：实现背景算法

完成：

```text
sampleBackground
buildBackgroundModel
colorDistance
floodFill
mask
feather
applyMask
```

使算法测试 PASS。

---

## Task 4：接入现有 pipeline

接入：

```text
去除背景开关
灵敏度
```

不要破坏现有参数处理。

---

## Task 5：性能优化

检查：

- 是否重复 decode
- 是否重复 drawImage
- 是否重复 getImageData
- 是否 Array.shift
- 是否创建大量 pixel object
- 是否重复计算背景 cluster

优化 slider 实时更新。

---

## Task 6：页面测试

覆盖：

```text
打开
调节
关闭
恢复
其它参数不丢失
```

---

## Task 7：完整验证

运行仓库已有的：

```bash
test
typecheck
lint
build
```

具体命令以 `package.json` 为准。

修复由本次修改引起的错误。

---

# 38. 最终输出要求

Codex 完成后请输出：

```text
1. 修改了哪些文件
2. 当前算法流程
3. 性能优化点
4. 测试覆盖内容
5. test / typecheck / lint / build 结果
6. 已知限制
```

已知限制必须明确写出，例如：

```text
快速模式不适合：
- 复杂室内背景
- 头发丝
- 主体与背景大范围连续同色
- 多层半透明物体
```

不要声称该算法可以替代 AI 抠图。

---

# 39. 最重要的实现原则

优先级：

```text
1. 不误删主体
2. 实时速度
3. 简单背景删除完整度
4. 边缘质量
```

如果“删得更干净”和“保护主体”冲突：

> 优先保护主体。

该功能定位是：

```text
极速快速去背景
```

而不是：

```text
专业 AI Matting
```
