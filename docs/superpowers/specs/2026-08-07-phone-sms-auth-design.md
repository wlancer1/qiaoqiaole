# 手机号验证码登录/注册模块需求与技术设计

- 文档版本：v1.0
- 日期：2026-08-07
- 适用端：H5 / Web、Android、iOS
- 短信服务：阿里云号码认证服务（PNVS）短信认证
- 基础设施：Redis、关系型数据库
- 建议文件路径：`docs/superpowers/specs/2026-08-07-phone-sms-auth-design.md`

---

## 1. 背景

系统需要新增注册用户模块，允许用户通过手机号和短信验证码完成登录或注册。短信接口属于匿名、高成本、容易被自动化滥用的接口，因此除常规验证码校验外，还需要增加手机号限流、IP 限流、设备限流、行为验证码、请求签名、时间戳校验、随机数防重放、全局额度熔断和审计告警。

客户端签名的作用是提高简单脚本、抓包复制和低成本攻击的门槛，不作为真正的身份认证或唯一安全边界。真正的防护由 Redis 原子限流、腾讯云控制台限频、行为验证码、一次性 challenge、全局预算和服务端风控共同完成。

---

## 2. 产品决策

### 2.1 登录与注册一体化

采用“手机号验证码登录/注册”统一入口：

1. 用户输入手机号并获取验证码。
2. 用户提交手机号和验证码。
3. 手机号已存在：直接登录。
4. 手机号不存在：创建用户后自动登录。
5. 对外不返回“手机号是否已经注册”的差异信息，降低手机号枚举风险。

如后续业务必须区分注册页和登录页，前端可以保留两个页面，但后端仍复用同一套验证码和认证服务。

### 2.2 MVP 范围

本期包含：

- 中国大陆 `+86` 手机号验证码登录/注册。
- 验证码发送、校验、重发倒计时。
- 用户创建、用户状态校验。
- Access Token、Refresh Token、刷新和退出登录。
- 手机号、IP、设备、验证码错误次数、全局额度限制。
- Web 与移动端不同签名版本。
- Redis 防重放和接口幂等。
- 阿里云 PNVS 短信调用、验证码远程核验、发送日志、风控日志和监控告警。
- 后台用户列表、启用/禁用、短信发送日志查询。

本期不包含：

- 密码登录、找回密码。
- 微信、Apple、Google 等第三方登录。
- 更换手机号、账号合并、账号注销。
- 国际手机号短信。
- 营销短信。
- 用户实名认证。

数据库手机号按 E.164 格式设计，方便后续扩展国际号码。

---

## 3. 用户体验流程

### 3.1 获取验证码

1. 用户输入 11 位中国大陆手机号。
2. 前端进行格式校验。
3. 前端获取一次性签名 challenge。
4. Web 端完成腾讯行为验证码；移动端完成行为验证或设备风险验证。
5. 客户端生成 `requestId`、`nonce`、`timestamp` 和 `signature`。
6. 客户端调用发送验证码接口。
7. 发送成功后按钮进入 60 秒倒计时。
8. 服务端返回验证码有效期，不返回真实验证码。

### 3.2 登录/注册

1. 用户输入 6 位验证码。
2. 客户端提交手机号、验证码、短信请求编号和用户协议版本。
3. 服务端原子校验验证码、有效期和错误次数。
4. 手机号不存在时，在数据库事务内创建用户。
5. 校验用户是否被禁用。
6. 创建登录会话并返回登录凭证。
7. 前端跳转到登录前页面或首页。

### 3.3 退出登录

1. 客户端调用退出接口。
2. 服务端撤销当前 Refresh Token。
3. Web 清除认证 Cookie；移动端清除安全存储中的 Token。
4. Access Token 即使尚未自然过期，也不能再通过已撤销的 Refresh Token 延长会话。

---

## 4. 页面需求

### 4.1 登录/注册页

页面元素：

- 国家/地区区号，MVP 固定显示 `+86`。
- 手机号输入框。
- 验证码输入框。
- “获取验证码”按钮。
- 60 秒重发倒计时。
- 登录/注册按钮。
- 用户协议和隐私政策勾选框。
- 行为验证码容器，按风控策略展示。
- 错误提示区域。

交互规则：

- 手机号格式不合法时，不允许请求短信。
- 未勾选协议时，不允许完成首次注册。
- 验证码输入满 6 位后可以点击登录。
- 点击发送后立即禁用按钮，等待接口返回。
- 发送失败时按 `retryAfter` 展示剩余等待时间。
- 不向用户展示“签名错误”“IP 风控”等内部安全细节，统一展示“操作过于频繁，请稍后再试”或“请求已失效，请刷新后重试”。

---

## 5. 短信验证码规则

| 项目 | 默认值 | 说明 |
|---|---:|---|
| 验证码长度 | 6 位 | 仅数字，使用密码学安全随机数生成器 |
| 有效期 | 5 分钟 | Redis TTL 300 秒 |
| 重发间隔 | 60 秒 | 同手机号同场景 |
| 单验证码最大错误次数 | 5 次 | 达到后立即失效 |
| 单手机号每小时成功发送 | 5 条 | 可配置 |
| 单手机号每日成功发送 | 10 条 | 可配置，并与腾讯云控制台限制保持一致 |
| 重发后的旧验证码 | 立即失效 | 仅最新一条有效 |
| 验证成功后的验证码 | 立即删除/标记已使用 | 不可再次登录 |
| 场景绑定 | `AUTH` | 验证码不可跨场景使用 |
| 短信请求绑定 | `smsRequestId` | 防止旧短信与新请求混用 |

短信模板建议：

> 【应用名称】验证码为 {1}，5 分钟内有效，请勿泄露。如非本人操作，请忽略本短信。

禁止在日志、异常信息、APM、数据库或腾讯云 `SessionContext` 中记录验证码明文。

---

## 6. 多维限流与风控规则

所有阈值必须配置化，不允许散落在业务代码中。上线初期使用较严格阈值，根据真实用户数据调整。

### 6.1 默认限制

| 维度 | 统计口径 | 默认阈值 | 处理 |
|---|---|---:|---|
| 手机号冷却 | 成功或已受理发送 | 1 条/60 秒 | 拒绝，返回 `retryAfter` |
| 手机号小时 | 腾讯云已受理发送 | 5 条/小时 | 拒绝 1 小时窗口内后续发送 |
| 手机号每日 | 腾讯云已受理发送 | 10 条/自然日 | 拒绝至次日 |
| IP 短窗口 | 接口尝试次数 | 10 次/10 分钟 | 超过后拒绝 |
| IP 小时 | 接口尝试次数 | 30 次/小时 | 超过后拒绝 |
| IP 每日 | 接口尝试次数 | 100 次/自然日 | 超过后拒绝 |
| IP 不同手机号 | 不同手机号数量 | 5 个/10 分钟为高风险，10 个/10 分钟硬拦截 | 高风险先加强行为验证，再硬拦截 |
| 设备短窗口 | 接口尝试次数 | 5 次/10 分钟 | 超过后拒绝 |
| 设备每日 | 接口尝试次数 | 20 次/自然日 | 超过后拒绝 |
| 验证码错误 | 单手机号/单验证码 | 5 次 | 当前验证码失效 |
| 验证错误 IP | 错误次数 | 50 次/小时 | 暂时封禁验证码校验 |
| 全局发送量 | 腾讯云已受理发送 | 初始 1000 条/日，可配置 | 达到阈值关闭发送并告警 |
| 全局突发量 | 腾讯云调用次数 | 100 次/分钟，可配置 | 触发熔断或加强验证码 |

### 6.2 计数规则

- IP、设备和全局“尝试次数”在调用腾讯云之前计数，防止攻击者通过失败请求持续消耗后端和云 API。
- 手机号小时/每日“成功发送次数”仅在腾讯云明确返回受理成功后计数。
- 同手机号发送冷却锁在调用腾讯云前通过 Redis `SET NX` 抢占，防止并发请求同时发送。
- 腾讯云明确失败时，可将冷却时间缩短到 10 秒；网络超时且发送结果不确定时，不立即释放锁，避免盲目重试造成重复短信。
- Redis 不可用时发送接口必须“失败关闭”，返回服务暂不可用，不能绕过限流直接调用腾讯云。
- IPv4 按完整地址统计；IPv6 建议按 `/64` 前缀聚合，防止攻击者轮换 IPv6 地址绕过限制。
- 服务端只信任来自已配置 CDN、WAF 或负载均衡器的 `X-Forwarded-For`，不能直接信任客户端自行传入的 IP 请求头。

### 6.3 风控动作分级

- 低风险：允许发送。
- 中风险：要求完成腾讯行为验证码。
- 高风险：拒绝发送，并写入风控日志。
- 极高风险：临时封禁 IP 前缀、设备或手机号摘要。
- 全局异常：触发短信熔断开关，暂停所有匿名短信发送。

---

## 7. 请求签名方案

### 7.1 目标

请求签名主要防止：

- 抓包后原样重放。
- 修改手机号、场景或请求体。
- 直接使用普通 HTTP 工具低成本批量调用。
- Web 签名逻辑直接复制到移动端，或反向使用。
- 过期请求继续生效。

请求签名不能防止：

- 完整逆向前端或 App 后重新实现算法。
- 使用真实浏览器、自动化设备或代理池。
- 绕过行为验证码的专业攻击。
- 大规模真实手机号或设备农场。

因此签名必须和限流、Captcha、一次性 challenge、全局预算共同使用。

### 7.2 签名请求头

发送验证码接口必须携带：

```http
X-Client-Platform: web | android | ios
X-Client-Version: 1.0.0
X-Sign-Version: web-v1 | mobile-v1
X-Request-Id: UUIDv4
X-Timestamp: 13位毫秒时间戳
X-Nonce: Base64URL编码的16字节随机数
X-Challenge-Id: ch_xxxxxxxxx
X-Signature: Base64URL签名值
```

请求体示例：

```json
{
  "phone": "+8613800138000",
  "scene": "AUTH",
  "captchaTicket": "captcha_ticket",
  "deviceId": "客户端安装标识的摘要值"
}
```

要求：

- `nonce` 必须由安全随机数生成器产生，不得使用 `Math.random()`。
- `requestId` 每次业务请求唯一。
- `timestamp` 优先根据 challenge 返回的 `serverTime` 修正客户端时钟偏差。
- `deviceId` 只能是安装标识或设备标识的摘要，不得直接上传敏感硬件标识。
- `X-Signature`、`nonce`、challenge 均不得作为长期身份凭证。

### 7.3 一次性 challenge

接口：

```http
POST /api/v1/auth/sms/challenge
```

请求：

```json
{
  "platform": "web",
  "deviceId": "device_hash"
}
```

响应：

```json
{
  "code": "OK",
  "data": {
    "challengeId": "ch_01H...",
    "seed": "Base64URL随机值",
    "signVersion": "web-v1",
    "serverTime": 1786089600123,
    "expiresIn": 600
  }
}
```

Redis 保存：

- challengeId
- seed
- platform
- signVersion
- 签发时间
- 过期时间
- 请求 IP 前缀摘要
- 是否已使用

规则：

- challenge 有效期 10 分钟。
- challenge 只允许成功使用一次。
- challenge 与平台、签名版本绑定。
- challenge 接口本身按 IP 和设备限流，但不产生短信成本。
- 可以允许同一 IP 获取少量未使用 challenge，超过阈值拒绝。

### 7.4 规范化请求串

请求体先转为规范 JSON：

1. 字段名按字典序排列。
2. 使用 UTF-8。
3. 删除无意义空格。
4. 不包含未定义字段。
5. `null` 字段按协议统一保留或统一删除，前后端必须一致。
6. 手机号先转换为 E.164 格式。

计算：

```text
bodyHash = SHA256(canonicalJson(body))
```

规范串：

```text
SMS_SEND
POST
/api/v1/auth/sms/send
{platform}
{signVersion}
{timestamp}
{requestId}
{nonce}
{challengeId}
{bodyHash}
```

每一项使用换行符 `\n` 拼接，路径不包含域名和查询参数。

### 7.5 Web 与移动端算法版本

底层使用标准 SHA-256/HMAC-SHA256，独特性放在规范化方式、一次性 seed、派生顺序、字节变换和版本常量上。不要自行发明替代密码学哈希的算法。

示例伪代码：

```text
web-v1:
  keyMaterial = seed + "|" + reverse(nonce) + "|W1|" + publicAppId
  derivedKey  = SHA256(keyMaterial)
  signature   = BASE64URL(HMAC_SHA256(derivedKey, canonicalString))

mobile-v1:
  keyMaterial = rotateLeft(seed, 7) + "|" + deviceIdHash
                + "|" + reverse(requestId) + "|M1|" + publicAppId
  derivedKey  = SHA256(keyMaterial)
  signature   = BASE64URL(HMAC_SHA256(derivedKey, canonicalString))
```

实现要求：

- 后端维护 `signVersion -> verifier` 映射。
- `web` 只接受 `web-v1`；Android/iOS 只接受 `mobile-v1`。
- Web 可将关键混合逻辑拆分并放入 WASM，再进行构建混淆。
- Android/iOS 可将关键混合逻辑放入原生层并开启代码混淆。
- 客户端不得内置腾讯云 SecretId、SecretKey、JWT 密钥或任何真正的服务端密钥。
- 版本常量可定期轮换；后端在灰度期间同时支持旧版本和新版本。
- 服务端必须使用常量时间比较签名，避免普通字符串比较。
- 服务端日志只记录签名摘要前 8 位，不记录完整签名。

### 7.6 时间戳校验

- 允许客户端时间与服务端时间相差正负 10 分钟。
- 校验条件：

```text
abs(serverNow - requestTimestamp) <= 600000 ms
```

- 时间戳超出范围时返回 `AUTH_REQUEST_EXPIRED`。
- challenge 的 `serverTime` 用于客户端校时。
- 时间戳校验必须在调用腾讯云之前完成。

### 7.7 防重放与幂等

防重放摘要：

```text
replayDigest = SHA256(
  platform + "|" + signVersion + "|" + requestId + "|"
  + nonce + "|" + challengeId + "|" + signature
)
```

Redis 原子写入：

```text
SET auth:sms:replay:{replayDigest} 1 NX EX {ttl}
```

TTL 规则：

- 请求允许正负 10 分钟时，固定 10 分钟 TTL 并不覆盖所有未来时间戳请求。
- 推荐 TTL 设置为：

```text
ttl = max(1, requestTimestamp + 600秒 - serverNow)
```

- 最大可能约 20 分钟。
- 若实现必须使用固定值，使用 20 分钟。

幂等规则：

- `X-Request-Id` 相同且请求体摘要相同：不再次发送短信，返回第一次请求的结果。
- `X-Request-Id` 相同但请求体摘要不同：返回 `AUTH_REQUEST_ID_CONFLICT`。
- challenge、nonce 或 replayDigest 已经使用：不产生新的短信发送。
- Redis 中幂等结果保存到该请求完全离开时间戳有效窗口。

建议通过 Lua 脚本一次完成：

1. 校验 challenge 存在且未使用。
2. 校验 nonce/replayDigest 不存在。
3. 写入 replay key。
4. 标记 challenge 已使用。
5. 写入幂等处理中状态。

避免两个并发请求都通过校验。

---

## 8. 后端校验顺序

发送验证码接口必须按以下顺序处理：

1. 生成服务端 traceId。
2. 获取可信客户端 IP，并归一化 IPv6 前缀。
3. 校验 Content-Type、请求体大小和字段白名单。
4. 校验手机号格式并转换为 E.164。
5. 校验请求头是否齐全、格式是否合法。
6. 校验平台与签名版本是否匹配。
7. 校验时间戳正负 10 分钟。
8. 读取并校验 challenge。
9. 重新计算签名并使用常量时间比较。
10. 校验 requestId、nonce 和 replayDigest，执行防重放/幂等。
11. 校验腾讯行为验证码票据。
12. 执行 IP、设备、不同手机号数量和全局尝试限流。
13. 获取同手机号发送冷却锁。
14. 检查手机号小时和每日成功发送额度。
15. 生成 6 位验证码及验证码摘要。
16. 调用阿里云 PNVS `SendSmsVerifyCode`。
17. 腾讯云明确受理后，保存验证码、增加成功发送计数并写发送日志。
18. 返回 `smsRequestId`、`expiresIn`、`retryAfter`。
19. 腾讯云失败时写失败日志，并按错误类型决定是否缩短冷却锁。

任何前置校验失败都不得调用腾讯云。

---

## 9. API 设计

统一响应结构：

```json
{
  "code": "OK",
  "message": "success",
  "data": {},
  "requestId": "server_trace_id"
}
```

错误响应应携带 HTTP 状态码和业务码。限流响应同时返回 `Retry-After` 响应头。

### 9.1 获取签名 challenge

```http
POST /api/v1/auth/sms/challenge
```

请求：

```json
{
  "platform": "web",
  "deviceId": "device_hash"
}
```

成功响应见 7.3。

### 9.2 发送验证码

```http
POST /api/v1/auth/sms/send
```

请求头见 7.2。

请求体：

```json
{
  "phone": "+8613800138000",
  "scene": "AUTH",
  "captchaTicket": "ticket",
  "deviceId": "device_hash"
}
```

成功响应：

```json
{
  "code": "OK",
  "message": "验证码已发送",
  "data": {
    "smsRequestId": "sms_01H...",
    "expiresIn": 300,
    "retryAfter": 60
  },
  "requestId": "trace_01H..."
}
```

注意：

- 响应不返回验证码。
- 同一 requestId 的合法重试返回同一个 `smsRequestId`，不重新发送。
- 不返回手机号是否已经注册。

### 9.3 验证码登录/注册

```http
POST /api/v1/auth/sms/login
```

请求：

```json
{
  "phone": "+8613800138000",
  "smsRequestId": "sms_01H...",
  "code": "123456",
  "agreementVersion": "privacy-2026-08-01",
  "device": {
    "platform": "web",
    "deviceId": "device_hash",
    "appVersion": "1.0.0"
  }
}
```

成功响应：

```json
{
  "code": "OK",
  "message": "登录成功",
  "data": {
    "isNewUser": true,
    "user": {
      "id": "usr_01H...",
      "nickname": "用户8000",
      "avatarUrl": null,
      "status": "ACTIVE"
    },
    "accessToken": "仅移动端返回或按既定认证方案处理",
    "expiresIn": 7200
  },
  "requestId": "trace_01H..."
}
```

Web 推荐通过 `HttpOnly + Secure + SameSite` Cookie 保存 Refresh Token；移动端将 Token 放入 Keychain/Keystore，不使用普通本地存储明文保存长期 Token。

业务规则：

- 验证码必须与 phone、scene、smsRequestId 绑定。
- 首次认证必须有有效的协议版本。
- 用户不存在时使用数据库事务创建。
- `phone_hash` 唯一索引保证并发请求不会创建两个用户。
- 用户状态为 `DISABLED` 时不签发会话。
- 登录成功后更新最后登录时间和 IP 摘要。
- 同一认证请求重试必须幂等。

### 9.4 刷新 Token

```http
POST /api/v1/auth/token/refresh
```

规则：

- Refresh Token 默认有效期 30 天。
- 每次刷新进行 Token Rotation，旧 Refresh Token 立即失效。
- 检测到已使用旧 Token 再次出现时，可撤销该会话族。
- Access Token 默认有效期 2 小时，可配置。

### 9.5 退出登录

```http
POST /api/v1/auth/logout
```

规则：

- 撤销当前会话的 Refresh Token。
- 支持“退出当前设备”。
- 后续可扩展“退出所有设备”。

### 9.6 当前用户

```http
GET /api/v1/auth/me
```

返回当前用户基础资料和账号状态，不返回手机号明文；需要展示时仅返回脱敏号码。

---

## 10. 验证码存储与原子校验

验证码仅保存在 Redis，不保存在数据库。

生成验证码后计算：

```text
codeHash = HMAC_SHA256(
  serverCodePepper,
  scene + "|" + phoneE164 + "|" + smsRequestId + "|" + code
)
```

Redis Hash 示例：

```text
Key: auth:sms:code:{scene}:{phoneHash}

Fields:
  codeHash
  smsRequestId
  sentAt
  attempts
  providerRequestId
  status
TTL: 300秒
```

校验验证码必须使用 Lua 或等价原子操作：

1. Key 不存在：返回过期或不存在。
2. `smsRequestId` 不匹配：返回验证码无效。
3. `attempts >= 5`：删除 Key，返回次数超限。
4. 计算提交验证码的 HMAC。
5. HMAC 不匹配：`attempts + 1`；达到上限时删除。
6. HMAC 匹配：删除验证码 Key，创建短期认证成功票据或幂等状态。
7. 返回成功。

这样可以防止两个并发登录请求同时使用同一个验证码。

---

## 11. Redis Key 设计

手机号、IP 和设备标识在 Key 中使用服务端 HMAC 摘要，不直接使用明文。

| Key | 类型 | TTL | 用途 |
|---|---|---:|---|
| `auth:sms:challenge:{challengeId}` | Hash | 10 分钟 | 一次性签名 challenge |
| `auth:sms:replay:{digest}` | String | 最长 20 分钟 | 防重放 |
| `auth:sms:idempotency:{requestId}` | Hash/String | 最长 20 分钟 | 缓存首次发送结果 |
| `auth:sms:nonce:{platform}:{nonceHash}` | String | 最长 20 分钟 | nonce 唯一性 |
| `auth:sms:cooldown:{scene}:{phoneHash}` | String | 60 秒 | 手机号发送锁 |
| `auth:sms:phone:hour:{phoneHash}:{yyyyMMddHH}` | Counter | 2 小时 | 手机号小时成功发送 |
| `auth:sms:phone:day:{phoneHash}:{yyyyMMdd}` | Counter | 2 天 | 手机号每日成功发送 |
| `auth:sms:ip:10m:{ipHash}:{bucket}` | Counter | 20 分钟 | IP 短窗口尝试 |
| `auth:sms:ip:hour:{ipHash}:{yyyyMMddHH}` | Counter | 2 小时 | IP 小时尝试 |
| `auth:sms:ip:day:{ipHash}:{yyyyMMdd}` | Counter | 2 天 | IP 每日尝试 |
| `auth:sms:ip:phones:{ipHash}:{bucket}` | Set | 20 分钟 | 单 IP 不同手机号数量 |
| `auth:sms:device:10m:{deviceHash}:{bucket}` | Counter | 20 分钟 | 设备短窗口 |
| `auth:sms:global:minute:{bucket}` | Counter | 5 分钟 | 全局突发流量 |
| `auth:sms:global:day:{yyyyMMdd}` | Counter | 2 天 | 全局每日额度 |
| `auth:sms:code:{scene}:{phoneHash}` | Hash | 5 分钟 | 验证码摘要和错误次数 |
| `auth:sms:verifyfail:ip:{ipHash}:{hour}` | Counter | 2 小时 | 验证错误 IP 风控 |
| `auth:session:revoked:{sessionId}` | String | Token 剩余期限 | 会话撤销 |

窗口计数必须使用 Lua 脚本或成熟的 Redis Rate Limiter，确保首次 `INCR` 时原子设置过期时间，避免无 TTL 的永久 Key。

---

## 12. 数据库设计

### 12.1 users

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID/BIGINT | 用户主键 |
| nickname | varchar | 默认昵称 |
| avatar_url | varchar/null | 头像 |
| status | enum | `ACTIVE`、`DISABLED` |
| register_source | varchar | web/android/ios |
| registered_at | datetime | 注册时间 |
| last_login_at | datetime/null | 最后登录时间 |
| last_login_ip_hash | varchar/null | 最后登录 IP 摘要 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 12.2 user_identities

为后续微信、Apple 等登录方式预留身份表：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID/BIGINT | 主键 |
| user_id | FK | 用户 ID |
| provider | enum | 当前为 `PHONE` |
| identifier_hash | char(64) | 手机号 HMAC 摘要 |
| identifier_ciphertext | text | 手机号加密密文 |
| identifier_last4 | char(4) | 后四位，仅用于展示 |
| verified_at | datetime | 验证时间 |
| created_at | datetime | 创建时间 |

索引：

- `UNIQUE(provider, identifier_hash)`
- `INDEX(user_id)`

手机号不能只保存普通 SHA-256，因为手机号取值空间较小，容易被字典碰撞。建议使用服务端密钥参与的 HMAC 作为查询摘要，并使用 AES-GCM 或云密钥服务加密保存可恢复手机号。

### 12.3 user_sessions

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 会话 ID |
| user_id | FK | 用户 ID |
| refresh_token_hash | char(64) | Refresh Token 摘要 |
| token_family_id | UUID | Token Rotation 会话族 |
| platform | varchar | web/android/ios |
| device_id_hash | varchar/null | 设备摘要 |
| ip_hash | varchar | IP 摘要 |
| expires_at | datetime | 过期时间 |
| revoked_at | datetime/null | 撤销时间 |
| last_used_at | datetime | 最后使用时间 |
| created_at | datetime | 创建时间 |

### 12.4 sms_send_logs

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID/BIGINT | 主键 |
| request_id | varchar | 客户端请求 ID |
| trace_id | varchar | 服务端链路 ID |
| sms_request_id | varchar | 业务短信请求 ID |
| phone_hash | char(64) | 手机号摘要 |
| phone_masked | varchar | 例如 `138****8000` |
| ip_hash | varchar | IP 摘要 |
| platform | varchar | 客户端平台 |
| sign_version | varchar | 签名版本 |
| scene | varchar | `AUTH` |
| risk_result | varchar | PASS/CAPTCHA/BLOCK |
| risk_reason | varchar/null | 命中规则 |
| provider_request_id | varchar/null | 阿里云 PNVS 请求标识 |
| provider_code | varchar/null | 阿里云 PNVS 返回码 |
| result | varchar | ACCEPTED/REJECTED/FAILED/UNKNOWN |
| latency_ms | int | 调用耗时 |
| created_at | datetime | 创建时间 |

不得保存：

- 验证码明文。
- 完整 Access/Refresh Token。
- 腾讯云 SecretKey。
- 完整行为验证码票据。
- 完整客户端签名。

### 12.5 user_agreement_acceptances

记录首次注册时接受的协议版本、时间、IP 摘要和客户端平台，满足后续协议审计需求。

---

## 13. 阿里云 PNVS 短信认证接入

服务端调用阿里云 PNVS `SendSmsVerifyCode` 和 `CheckSmsVerifyCode` 接口，客户端不得直接访问阿里云 API。PNVS 负责验证码的生成、生命周期和远程核验；Redis 仍负责本地请求凭证的一次性原子消费。

配置项：

```text
ALIYUN_PNVS_ACCESS_KEY_ID
ALIYUN_PNVS_ACCESS_KEY_SECRET
ALIYUN_PNVS_SCHEME_NAME
ALIYUN_PNVS_SIGN_NAME
ALIYUN_PNVS_TEMPLATE_CODE
ALIYUN_PNVS_TEMPLATE_PARAM
```

要求：

- SecretId、SecretKey 放入环境变量或密钥管理服务。
- 使用最小权限子账号，不使用主账号永久密钥。
- 短信签名和验证码模板提前审核通过。
- 腾讯云控制台的手机号频率限制与应用层限制保持一致。
- 开启发送量告警、费用告警、异常增长告警和告警联系人。
- 设置每日最大预算或应用级熔断阈值。
- 使用内部 `smsRequestId` 关联腾讯云上下文和发送日志。
- 对腾讯云明确的手机号频控错误转换为统一业务错误。
- 不对“响应超时、是否已发送不确定”的请求进行无条件自动重试。
- 可接入发送状态回调，用于监控送达率，但回调不改变验证码已经创建的业务事实。

发送成功定义：

- 腾讯云接口返回该手机号发送状态为受理成功。
- 只有受理成功后才保存验证码为可用状态。
- 若批量接口返回多号码结果，本业务仍只允许单手机号发送，避免滥用批量能力。

---

## 14. 认证凭证与会话安全

### 14.1 Access Token

- 默认有效期 2 小时。
- 包含 userId、sessionId、签发时间、过期时间和必要权限。
- 不包含手机号明文。
- 使用服务端私钥/密钥签名。
- 后端必须校验用户状态，禁用用户不得继续访问敏感接口。

### 14.2 Refresh Token

- 默认有效期 30 天。
- 数据库只保存摘要。
- 每次刷新轮换。
- 退出登录时撤销。
- 检测到旧 Refresh Token 重用时撤销整个 token family。

### 14.3 客户端存储

Web/H5：

- 优先使用 `HttpOnly`、`Secure`、`SameSite=Lax/Strict` Cookie 保存 Refresh Token。
- 不在 `localStorage` 保存长期 Refresh Token。
- 使用 Cookie 认证时，对状态变更接口增加 CSRF 防护。

Android/iOS：

- Android 使用 Keystore 支持的安全存储。
- iOS 使用 Keychain。
- 不在普通 SharedPreferences/UserDefaults 明文保存长期 Token。

---

## 15. 后台管理需求

### 15.1 用户列表

字段：

- 用户 ID。
- 脱敏手机号。
- 昵称。
- 注册来源。
- 用户状态。
- 注册时间。
- 最后登录时间。
- 最后登录平台。

筛选：

- 精确手机号搜索，后端转换成 `identifier_hash` 查询。
- 用户 ID。
- 状态。
- 注册时间范围。
- 最后登录时间范围。
- 注册来源。

### 15.2 用户状态管理

- 管理员可启用或禁用用户。
- 禁用时必须填写原因。
- 禁用后撤销所有 Refresh Token。
- 禁用用户再次验证码登录时返回统一的账号不可用提示。
- 所有状态变更写管理员审计日志。

### 15.3 短信日志

可按以下条件查询：

- 时间范围。
- 脱敏手机号/手机号精确检索。
- IP 摘要。
- 平台。
- 发送结果。
- 腾讯云错误码。
- 风控拦截原因。
- requestId/traceId。

后台不得显示验证码。

### 15.4 风控配置

建议通过配置中心或受权限保护的后台配置：

- 手机号冷却、小时、每日阈值。
- IP、设备阈值。
- 不同手机号数量阈值。
- 验证码有效期和最大错误次数。
- 全局每日额度。
- 短信总开关。
- 是否强制行为验证码。
- 支持的签名版本。
- 风险 IP/设备黑白名单。

关键阈值变更必须记录操作人、修改前后值和时间。

---

## 16. 错误码

| HTTP | 业务码 | 前端提示 |
|---:|---|---|
| 400 | `AUTH_PHONE_INVALID` | 请输入正确的手机号 |
| 400 | `AUTH_REQUEST_INVALID` | 请求无效，请刷新后重试 |
| 400 | `AUTH_REQUEST_EXPIRED` | 请求已失效，请重新获取 |
| 409 | `AUTH_REQUEST_REPLAYED` | 请求已处理，请勿重复提交 |
| 409 | `AUTH_REQUEST_ID_CONFLICT` | 请求冲突，请重新操作 |
| 400 | `AUTH_CAPTCHA_INVALID` | 请重新完成人机验证 |
| 429 | `AUTH_PHONE_COOLDOWN` | 操作过于频繁，请稍后再试 |
| 429 | `AUTH_PHONE_HOURLY_LIMIT` | 获取次数过多，请稍后再试 |
| 429 | `AUTH_PHONE_DAILY_LIMIT` | 今日获取次数已达上限 |
| 429 | `AUTH_IP_LIMIT` | 操作过于频繁，请稍后再试 |
| 429 | `AUTH_DEVICE_LIMIT` | 操作过于频繁，请稍后再试 |
| 429 | `AUTH_GLOBAL_LIMIT` | 短信服务繁忙，请稍后再试 |
| 400 | `AUTH_CODE_INVALID` | 验证码错误 |
| 400 | `AUTH_CODE_EXPIRED` | 验证码已过期，请重新获取 |
| 429 | `AUTH_CODE_ATTEMPTS_EXCEEDED` | 验证次数过多，请重新获取验证码 |
| 403 | `AUTH_USER_DISABLED` | 当前账号暂不可用 |
| 503 | `AUTH_SMS_PROVIDER_UNAVAILABLE` | 短信服务暂不可用，请稍后再试 |
| 503 | `AUTH_RISK_SERVICE_UNAVAILABLE` | 服务暂不可用，请稍后再试 |

安全日志记录更详细的内部原因，对前端只返回必要信息。

---

## 17. 日志、监控与告警

### 17.1 指标

- `sms_send_attempt_total`
- `sms_send_accepted_total`
- `sms_send_provider_failed_total`
- `sms_send_blocked_phone_total`
- `sms_send_blocked_ip_total`
- `sms_send_blocked_device_total`
- `sms_send_blocked_signature_total`
- `sms_send_blocked_replay_total`
- `sms_send_captcha_failed_total`
- `sms_verify_success_total`
- `sms_verify_failed_total`
- `auth_new_user_total`
- `auth_login_success_total`
- `auth_login_failed_total`
- 腾讯云调用延迟 P50/P95/P99
- 单位时间不同手机号数量
- 每日短信费用和剩余额度

### 17.2 告警建议

- 5 分钟短信量超过过去 7 天同时间段均值的 3 倍。
- 5 分钟发送量超过固定阈值。
- 同一 IP 命中不同手机号阈值。
- 签名失败率持续超过 20%。
- 腾讯云失败率持续超过 10%。
- Redis 不可用。
- 每日短信额度达到 70%、90%、100%。
- 单一手机号、IP 或设备出现异常高频。
- 全局熔断被触发。

### 17.3 日志脱敏

- 手机号：`138****8000`。
- IP：保存 HMAC 摘要；排障日志如需明文，必须限制权限和保留期限。
- Token：只记录 tokenId/sessionId，不记录 Token。
- 签名：最多记录摘要前 8 位。
- 验证码：任何情况下不记录。
- SecretId/SecretKey：任何情况下不记录。

---

## 18. 异常与降级策略

| 异常 | 处理 |
|---|---|
| Redis 不可用 | 发送验证码失败关闭，不调用腾讯云 |
| 数据库不可用 | 不创建用户；保留短期认证幂等状态，允许相同 requestId 重试 |
| 腾讯云明确拒绝 | 不保存可用验证码；返回统一错误 |
| 腾讯云网络超时、结果未知 | 不盲目重发；保留发送锁并记录 UNKNOWN |
| Captcha 服务不可用 | 默认失败关闭；可通过受控开关切换为严格限流模式 |
| 客户端时钟错误 | 使用 challenge 的 serverTime 修正后重新签名 |
| 用户连续点击 | 前端禁用按钮，后端 requestId 幂等和手机号锁兜底 |
| 多实例并发 | Redis Lua + 数据库唯一索引保证一致性 |
| 用户被禁用 | 撤销会话，不再签发新 Token |
| 短信额度用尽 | 触发熔断并向运维告警 |

---

## 19. 安全要求

- 全链路 HTTPS。
- API CORS 仅允许正式域名。
- 请求体大小限制，例如 8KB。
- 字段白名单和严格类型校验。
- 手机号使用标准库校验，不用简单正则作为唯一判断。
- 腾讯云密钥不得进入 Git、前端包、日志、错误页或监控事件。
- 管理后台启用强认证和权限分级。
- 风控规则、用户状态变更和短信开关操作写审计日志。
- 对 Redis Lua、签名规范化、Token Rotation、并发注册进行专项单元测试。
- 前端混淆只作为增加逆向成本的措施，不作为密钥保护方案。
- 生产环境与测试环境使用不同短信应用、模板和密钥。
- 测试环境使用白名单手机号或固定测试验证码，禁止误发真实短信。
- 固定测试验证码只能在非生产环境生效，并由环境变量显式开启。

---

## 20. 验收标准

### 20.1 功能

- 未注册手机号验证码正确时只创建一个用户并成功登录。
- 已注册手机号验证码正确时直接登录，不重复创建用户。
- 首次注册未勾选协议时不能创建用户。
- 禁用用户不能登录。
- 刷新 Token 后旧 Refresh Token 失效。
- 退出登录后 Refresh Token 不可继续使用。

### 20.2 发送限流

- 同手机号 60 秒内并发 20 个请求，最多产生 1 条短信。
- 同手机号第 6 次小时发送被拒绝。
- 同手机号第 11 次每日发送被拒绝。
- 同 IP 超过配置阈值后不再调用腾讯云。
- 同 IP 短时间请求多个不同手机号时触发高风险或硬拦截。
- 达到全局每日阈值后所有匿名短信发送被关闭并告警。
- Redis 不可用时不会绕过限制发送短信。

### 20.3 签名与防重放

- 修改手机号后原签名校验失败。
- 修改请求体任意字段后原签名校验失败。
- Web 签名版本不能用于 Android/iOS。
- 移动端签名版本不能用于 Web。
- 时间戳超出正负 10 分钟时拒绝。
- challenge 过期或已使用时拒绝。
- 相同 requestId、相同请求重试不会重复发短信。
- 相同 requestId、不同请求体被拒绝。
- 同 nonce/challenge 的重放请求不会产生第二次业务效果。
- 两个并发请求不能同时消费同一个 challenge 或验证码。

### 20.4 验证码

- 验证码 5 分钟后失效。
- 重发后旧验证码立即失效。
- 错误 5 次后当前验证码失效。
- 验证成功后不能再次使用。
- 验证码不出现在数据库、日志和监控事件中。

### 20.5 数据安全

- 数据库不存在手机号明文唯一索引，使用 HMAC 摘要查询。
- 手机号可恢复字段使用加密存储。
- 后台默认只显示脱敏手机号。
- 客户端包中不存在腾讯云 SecretId/SecretKey。
- Web 长期 Refresh Token 不保存于 localStorage。
- 管理员禁用用户和修改风控规则均有审计记录。

---

## 21. 开发任务拆分

### 后端

1. 用户、身份、会话、协议接受、短信日志表迁移。
2. Redis Key 和 Lua 原子限流组件。
3. challenge 生成和消费接口。
4. Web/mobile 签名校验中间件。
5. 时间戳、nonce、防重放和幂等组件。
6. 腾讯行为验证码服务端校验。
7. 腾讯云 SMS SDK 封装。
8. 验证码生成、HMAC 存储和原子消费。
9. 登录/自动注册事务。
10. Access/Refresh Token 和 Token Rotation。
11. 退出登录和禁用用户会话撤销。
12. 管理后台用户与短信日志接口。
13. 指标、日志、告警和全局熔断。
14. 单元测试、并发测试和安全测试。

### Web/H5

1. 登录/注册页面。
2. 手机号格式校验和协议勾选。
3. challenge 获取。
4. 腾讯行为验证码接入。
5. `web-v1` 签名模块。
6. 安全随机 nonce、UUID requestId 和服务端时间校正。
7. 发送按钮 60 秒倒计时。
8. 错误码与 `retryAfter` 交互。
9. 登录态 Cookie/Token 处理。
10. 构建混淆、WASM 或代码拆分。

### Android/iOS

1. 登录/注册页面。
2. challenge 和行为验证。
3. `mobile-v1` 原生签名模块。
4. 安全随机数。
5. Token 安全存储。
6. 设备安装标识摘要。
7. 错误码、倒计时和会话刷新。

### 运维

1. 开通阿里云 PNVS 短信认证并在控制台选择系统签名和系统模板。
2. 申请短信签名和验证码模板。
3. 创建最小权限子账号和密钥。
4. 配置腾讯云发送频率、费用和异常告警。
5. 配置 Redis 高可用和内存告警。
6. 配置应用层全局短信开关。
7. 建立短信发送量和成本看板。
8. 准备生产事故时的一键熔断方案。

---

## 22. 建议上线顺序

### 阶段一：可用且安全的 MVP

- 统一验证码登录/注册。
- 阿里云 PNVS 短信认证。
- 手机号/IP/设备限流。
- Captcha。
- challenge、timestamp、nonce、签名、防重放。
- Redis 原子验证码校验。
- 用户和会话模块。
- 短信全局日限额和告警。

### 阶段二：运营与风控增强

- 动态风险评分。
- 黑白名单。
- IP 不同手机号图谱。
- 发送状态回调。
- 风险运营后台。
- 签名版本远程切换。
- 移动端设备完整性证明。
- 更细粒度成本控制和异常检测。

---

## 23. 最终推荐默认配置

```yaml
sms:
  code_length: 6
  code_ttl_seconds: 300
  resend_cooldown_seconds: 60
  max_verify_attempts: 5

  phone:
    max_per_hour: 5
    max_per_day: 10

  ip:
    max_per_10_minutes: 10
    max_per_hour: 30
    max_per_day: 100
    soft_distinct_phones_per_10_minutes: 5
    hard_distinct_phones_per_10_minutes: 10

  device:
    max_per_10_minutes: 5
    max_per_day: 20

  global:
    max_per_minute: 100
    max_per_day: 1000
    emergency_switch: true

request_security:
  timestamp_skew_seconds: 600
  challenge_ttl_seconds: 600
  fixed_replay_ttl_seconds: 1200
  nonce_bytes: 16
  supported_sign_versions:
    - web-v1
    - mobile-v1

session:
  access_token_ttl_seconds: 7200
  refresh_token_ttl_days: 30
  rotate_refresh_token: true
```

所有数值均应由配置中心或环境变量覆盖，正式上线前根据预计 DAU、登录频率、共享网络比例和腾讯云控制台限频进行压测和调整。
