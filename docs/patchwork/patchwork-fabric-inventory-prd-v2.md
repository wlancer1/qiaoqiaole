# 巧巧乐 · 拼布布料仓库、缺料预警与裁剪扣库 PRD / 技术设计 V2.0

> 状态：待开发 / 实施基线；编写日期：2026-10-19\
> 适用范围：巧巧乐 H5 拼布编辑器、个人布料仓库、项目服务端 API、库存台账\
> 性质：产品需求 + UI 交互 + 数据模型 + 接口契约 + 计算规则 + 迁移 + 测试验收

**配套 UI 设计稿（已保存项目）：** **主版本** [V3 完整 H5 交互设计稿（13 移动端 + 1 桌面端）](./ui/inventory-v3/index.html) · [V3 页面与开发说明](./ui/inventory-v3/README.md) · [V3 总览 PNG](./ui/inventory-v3/screenshots/00-all-screens.png)。**基础版本** [V2 八屏设计稿](./ui/index.html) · [V2 设计说明与截图](./ui/README.md)。设计稿均为静态原型，不代表布料仓库或扣库 API 已经开发完成。

> 实现更新（2026-10-20）：当前选布器统一展示个人布料与内置花色，不按来源分栏；未录入库存也可设计。每行 4 个、每批 16 个，上拉加载服务端下一页。补录库存沿用同一布料身份，花纹校准与实际库存分开保存；保存作品不扣库存，仅明确确认裁剪时扣库。下文及静态设计稿保留早期方案供参考，以此更新和代码为准。

## 0. 一页结论

在「我的」中新建/完善「我的布料仓库」：上传实物布料、录入尺寸和库存；拼布编辑器的统一选布器只显示该用户拥有的有效布料；项目所需但库存缺少或不足时以红色标记且保留原作品纹理；根据每个实际裁片的毫米多边形估算用布面积，支持缝份与损耗；只有用户明确进入「已裁剪/确认耗料」并核对数量时，才在服务端原子扣减库存，生成不可随意删除的流水。保存设计、完成设计不扣库。估算不等于真实可裁剪排版。

**最高优先级不变量**
1. 「样例布料/项目配色」≠「用户实际拥有」；布片未指定、缺失、库存不足、未知均有不同状态。
2. 选择布料、保存草稿、导出作品、完成设计，均不得触发扣库。
3. 单次裁剪确认最多扣一次；幂等、用户隔离、余额校验、台账、操作快照同一服务端事务提交。
4. 仓库删除或离线无法访问，不得抹除已保存作品的纹理与设计。
5. 库存足够「面积」不保证实体布块放得下剪裁形状；V1 对此明确提示并要求人工核对。

## 1. 背景及现有代码基线

已确认的现有能力（不要重复造轮子）：
- H5: apps/h5/src/patchwork/PatchworkPage.tsx、FabricPicker.tsx（统一布料选择器）、model.ts（Point/Piece/Material/Project，坐标毫米）、export.ts（cutList、outwardOffset）。
- Piece 通过项目局部 materialId 引用 Project.materials；Material 现有 id/name/color/assetId/assetPath/sampleWidthMm 等；A–H 内置颜色属于示例，不代表个人仓库有货。
- API: apps/api/src/server.mjs 已提供 GET/POST /api/fabrics、PATCH/DELETE /api/fabrics/:id；fabric_items 表已有 user_id、name、color、image、width_mm、height_mm、quantity、note。
- 注意：现有 fabric_items.quantity 默认值为 1，语义不是面积库存，不能直接做「面积扣料」，也不能推断历史数据的真实单位。
- 已有 /uploads/projects 及图片持久化/腾讯 COS 路径可研究复用；已有账号鉴权和项目数据服务端保存。
- 拼豆已有 beadingSessionService.mjs 的「库存校验 + 幂等键 + 事务扣减 + 流水」，可复用模式，但不复用拼豆的颜色库存表或拼豆会话状态。

**与现状差距**：目前项目级材料和个人 fabric_items 尚未形成稳定的外键关系；布料面积余额、批次、流水、裁剪完成业务均缺失。必须先补齐服务端数据契约，再改变选布器的来源。

## 2. 目标、非目标、版本

### 2.1 P0/P1（上线最小完整闭环）
- 我的布料：登录后按用户独立上传、查看、编辑、软删除、查询库存、入库/调整库存。
- 统一选布：项目底布、布片属性、底部快速选布共用库存数据源；仅显示可选的自有库存布料。
- 缺料：项目清单、画布布片、属性栏、裁剪预览识别「缺少/不足/未指定/未知」；支持换成已拥有布料。
- 用布估算：多边形面积、按布料聚合、缝份、损耗率、底布可选、编辑实际用量。
- 确认裁剪：保存最新项目修订 → 服务端重新计算 → 用户确认实际耗料 → 事务扣减 + 流水 + 幂等。
- 查询历史：裁剪记录、库存变更、误操作冲正。
- 缺料时不允许默认自动扣减；允许仅标记「设计完成、不扣库存」。

### 2.2 P2
- 按完整布幅/多个实物余布做裁片嵌套排版（nesting）、对纹对花、缝份合理性优化。
- 扫描余布形状、真实可剪区域可视化、二维码标签、采购清单/缺料推荐、批量照片去重。

### 2.3 不做
- 以图片颜色自动认定用户有这种布；以颜色名称作为仓库匹配主键。
- 仅因点击「保存/完成设计」自动扣库。
- 将分散碎布「剩余面积之和」声称为能剪出一块大型布片。
- 自动修改已经确认裁剪的历史库存流水或随意恢复实际已消耗的材料。

## 3. 名词与业务实体

| 概念 | 定义 |
| --- | --- |
| 个人布料（Fabric） | 用户拥有的一种布料 SKU/花纹，唯一 fabricId；可对应多次购买、多块余布 |
| 入库批次（Fabric Lot） | 一次购入或一块实物布的库存来源，记录可用面积、尺寸和状态 |
| 项目材料（Project Material） | 项目局部材质 ID、原图快照和可选的 inventoryFabricId；与 Fabric 是不同层次 |
| 布片（Piece） | 画布中一块需要单独裁剪的多边形；位置重叠不代表重复裁剪可省掉 |
| 底布（Base） | 整张作品背景，可单独决定是否需要实际剪裁扣库 |
| 预计耗料（Estimate） | 由轮廓、缝份、损耗率算出的建议面积，单位 mm² |
| 实际耗料（Actual） | 用户确认现实中已剪下/耗掉的面积，不一定等于预计耗料 |
| 裁剪记录（Cut Record） | 一次已确认的实物裁剪/使用事件；绑定项目修订和库存流水 |

状态含义：
- unassigned：布片尚未指定真实布料；不是「缺料」。
- available：当前有仓库关联，且存在明确的正库存余额（数量够用需另判断）。
- insufficient：已关联但实际可用面积低于本次预计/实际耗料。
- missing：原本指定的实物布料已下架/删除、余额为零、或明确需求不在仓库内。
- unknown：数据未加载、网络失败、库存尺寸未知或当前只能按块计数，不能做可信的面积判断。网络失败绝不可误报 missing。
- sample：历史 A–H 示例配色或未关联的项目花纹快照；只作视觉方案，不算拥有。

### 3.1 需求方与用户价值
- 低频用户：上传少量实物布，画布只显示自己有的布。
- 高频拼布爱好者：用仓库花纹做拼布、缺料提醒、减轻手工统计。
- 多端用户：同账号 H5/iPhone/桌面同步仓库及裁剪流水。
- 历史作品：即使布料库存耗尽，仍能查看和复用原设计；缺料只影响再制作。

## 4. 关键用户流程

### F01 首次建立仓库
「我的 → 我的布料 → 上传图片（直接调系统选图/拍照） → 裁剪纹理 → 填名称、数量/长宽、库存模式 → 保存」。
上传图片不等于已测量库存；尺寸缺失则 stockMeasure=unknown，仍可当作自有布料设计，但裁剪扣库必须先补录可用量或人工确认。
无登录则提供登录引导；服务端不存匿名假用户的共享库存。

### F02 创建拼布
「拼布编辑器 → 添加形状/我的形状/导入线稿 → 点击形状直接落画布 → 选择形状 → 底部仅展示我的可用布料 → 一点填充」。
底布设置与布片属性调用同一个 FabricPicker 数据源，不弹多一层「下一步」。上传新布后仓库列表即时刷新并可直接选中。

### F03 缺料提示与替换
「项目所需布料 → 缺料清单」能显示需求缩略图、布片数量、关联状态、理论面积、缺口面积；缺料红边 + 文字 + 图标（不能只有颜色）。
点击「从我的布料替换」→ 选择当前拥有的布 → 选择替换当前布片/项目所有同材料布片 → 一次可撤销的项目修改。既有纹理快照保留至替换确认。
当项目从社区复制、历史样例或原仓库删除时，要允许「保持原设计的待采购需求」，而不是强迫删除布片。

### F04 完成设计但未裁剪
「保存作品 → 标记设计完成」仅改变作品设计状态，不触发库存变化。仍可以打印、修改、分享、创建制作计划。
允许用户选择「稍后再裁剪」。

### F05 已裁剪并扣库
「已裁剪/记录用布 → 用量预览 → 选择是否包含底布/隐藏片 → 修改损耗率与实际用量 → 对每种布确认来源批次 → 检查缺料 → 明确确认扣减」。
必须显示面积计算依据与警告；用户可选择「完成记录但不扣库」（如库存未知/作品是赠送的/仅记手工用量），不能假装已扣。
后端成功后返回库存最新余额和裁剪记录编号。刷新/重复点击不能重复扣。

### F06 误操作与后续改稿
可查看「本次裁剪记录 → 冲正错误记录」，冲正产生反向流水并记录原因；仅适用于误扣/记账错误。实物已经裁剪却改变作品时，不能无条件将已剪布面积自动加回。
V1 已扣过的项目修改后默认进入「新修订待确认」，若要再次制作需创建新的裁剪批次并独立确认；不能因修改而自动再次扣整件作品。

## 5. 页面与 UI/交互规格

### 5.1 我的布料仓库
入口：「我的 → 我的布料」；顶部搜索、排序（最新/最近使用/库存不足）、上传按钮；下方每行三列自有布料纹理方形卡片。
卡片：纹理缩略图、名称、已有/数量未知/无库存状态、剩余约多少 cm²；点击进入详情。
详情：图片、主色、分类、备注、布料样本实际宽度（纹理校准）、实物库存形态（整块/按米/散块）、实物尺寸及剩余面积、批次、库存流水、编辑/入库/调整/软删除。
上传：直接文件选择（PNG/JPG/WebP）；最大 20MB（沿用现有 H5 识别图片限制，可据服务端上传限制收紧）；图片处理后显示预览；服务端验证文件真实 MIME/体积。支持更换图片。
空状态：「还没有布料。上传你实际拥有的布料，选布时将优先展示它们」；加载失败：「无法获取库存，重试」，不当作零库存。

### 5.2 统一选择布料
改造现有 FabricPicker 与底布/布片/底部快速栏，仓库为默认唯一可选来源。
筛选：库存存在、用户拥有、当前可选，搜索名称/编号；最近使用、收藏可后续扩展。
仍在使用的「缺料/示例/历史材料」不混入普通选布网格，在「项目所需布料」区域单独列出。
仓库为空：显示「还没有可选的自有布料」+「上传布料」；新增布料保存后立即可填充。
「只显示拥有」的判定：stock_status=positive 或 stock_status=unknown 且 owner 已确认拥有；库存为 0 或已软删除的布不可选。unknown 需标注「未测量，扣库前需录入用量」。

### 5.3 项目用料清单与缺料标记
入口放在编辑器「图层/项目布料」的固定分区，并可在「已裁剪」流程再次出现。
每行：布料图片、名称、布片数、理论面积、预估需用、可用面积、状态；同一仓库布料按 fabricId 聚合。颜色相似但 ID 不同不得合并。
画布对应缺料布片显示红细描边和角标「!」，仍渲染原图；点击说明缺多少以及替换入口。
未指定用中性虚线/问号，未知库存用灰色提示；库存不足是红色「不足 xx cm²」，有但面积排版风险提示「需人工确认裁得下」。
底布若勾选「参与裁剪」也进入需求清单；未勾选仅展示，不扣库。

### 5.4 预估与扣库确认界面
三段式信息：
1. 预计：理论面积、含缝份面积、损耗率、建议用量；可勾选底布和隐藏布片。
2. 实际：每个仓库布料的实际裁剪面积（默认建议值，可修改），来源批次；修改时显示和建议值差异。不能提交负数/NaN/0（无用量项不提交）。
3. 最终确认：「本次将扣减以下库存」的明细 + 库存余额对比 + 「确认已裁剪并扣库存」明确按钮；旁边「完成设计，不扣库存」。
高风险条件（未知、不足、修改超出容量、几何无效）阻止自动扣库并给出解决路径；选择「只记录不扣库」仍可完成操作记录。

## 6. 几何面积与耗料规则

基础单位始终为 mm、mm²，UI 转 cm²，1 cm² = 100 mm²；数据库建议整数 mm²，写入时向上取整，显示时做统一格式化。面积计算必须在服务端对保存的项目快照重算，前端只用于即时预览。

### 6.1 面积定义
- 原始布片面积 A_design = |Σ(x_i y_(i+1) − x_(i+1) y_i)| / 2，单位 mm²。可复用 model.ts/area()。
- 缝份外扩 A_cut = area(outwardOffset(points, seamMm))，仅对本次真实裁剪包含的缝份执行。当前 export.ts 的 outwardOffset 可作为几何基线，但尖角/凹角/重合节点可能失败；失败时不得悄悄用零缝份值提交库存。
- 非折边工艺（raw/pieced）依实际裁法和 seamMm 配置计算，不能无条件给所有工艺加缝份。须在计算配置中明确是否计入。
- 底布面积 A_base = widthMm × heightMm；只有勾选底布实际参与裁剪时计入，若另需边缘余量，由用户设置独立裁剪宽高/损耗。
- 隐藏布片默认不参与本次耗料，可单独勾选；锁定布片只是不允许编辑，不影响是否裁剪。
- 不同布片即使重叠也应分别计耗料；组合中的每个物理裁片单独计算；不得通过屏幕投影图形做 union 去掉重叠。
- 若导入线稿有洞、轮廓自交、重复节点、异常超界导致计算不可靠，需标记待修整，不能自动确认扣库。

### 6.2 按布料归集、损耗和数量
对同一个 inventoryFabricId：
1. A_sum = Σ 每个实际需裁剪布片的 A_cut + 需裁的底布。
2. 预计用量 A_estimated = ceil(A_sum × (1 + wasteRate))。
3. 用户可填写 A_actual（本次实际拿走/耗掉的面积），默认 A_estimated。若修改，要显示警告并支持可选原因。
4. 计算损耗率是可配置预估参数，不作为「已自动浪费的实测数量」；已经录入真实面积时不得再次乘损耗。
5. 按 fabricId 和选择的批次 lotId 扣减，不按 color 或 materialId 扣减。

示例（假设已计入相应缝份）：某碎花布 3 片，各 100×100mm → 总理论面积 30,000 mm² = 300 cm²；损耗率 15%，建议 34,500 mm² = 345 cm²；仓库可用 500 cm²，确认实际用量 345 cm² 后余额 155 cm²。示例只是面积账，不保证实际剪裁排版可行。

### 6.3 库存模式与现实限制
- measure=known_area：仓库拥有可用面积，可以比较面积余额。
- measure=unknown：有实体布但尺寸或面积未知；可以设计和填充，扣库前需先确认库存计量。
- 购入整块：原始宽×高×块数可作为初始入库面积，但不代表余布的剩余几何形状。
- 按米购买：需布幅宽度×剩余长度，转换成 mm²；变化应同步更新账本而非直接改数量语义。
- 散碎布：面积总和只能是统计；对于长条、大片或对花裁剪要人工确认可放得下。
- P2 再做精确排版与实物余布轮廓保存，不在 V1 做虚假的自动「最优裁剪」承诺。

## 7. 服务端状态机与扣库安全

项目状态建议：draft（草稿）→ design_complete（设计完成，仅标记）→ cut_recorded（存在裁剪记录）；实际可保留草稿版本，裁剪记录是独立事件而非不可变的整个项目。
CutRecord：prepared（仅预览，不落账）/ deducted（已扣库存）/ recorded_only（只记实际裁剪，未扣库存）/ reversed（该扣库记录已冲正）。
V1 每个项目修订默认只能有一次全项目扣库记录；再做一件同款作品需使用「再做一件」新 batchId 或复制为新项目，明确提示，不得把旧裁剪自动重复扣减。

服务端完整事务：
1. 登录态 userId 关联项目与布料及批次；客户端传 idempotencyKey、projectId、expectedRevision、expectedInventoryVersions、batchId、各布料确认的 actualAreaMm2。
2. 查询幂等键：同键同请求指纹直接返回第一次结果；同键不同请求指纹返回 409。
3. 锁定当前数据库写事务（SQLite 可采用 BEGIN IMMEDIATE 或项目已有等效 withTransaction）；验证项目最新修订与库存版本，重新读取、校验提交面积/材料来源和库存余额。
4. 原子写入 cut_records、cut_record_lines、fabric_stock_movements(out)、批次剩余余额；不允许已知面积余额透支；库存不足则整单回滚、返回 409 + 每种布缺口。
5. 提交成功返回记录、库存新余额、项目状态；刷新或重试使用同一幂等键绝不能重复扣减。
6. 用户点击「取消」或网络超时，先查请求状态：不能直接以「超时」判断未提交。
7. 冲正必须创建反向流水，备注原因、操作者、时间与原记录引用；如果布料已经实体裁掉，则提示「冲正仅为账务纠错，不能恢复完整布料」。
8. 修改已裁剪作品：不自动补扣/退款；如需要追加制作，需新批次确认具体选中的裁片，或复制作品，避免整单重复扣。

服务端绝不信任前端传来的 user_id、仓库余额、缺料状态、客户端计算 A_estimated。真实计算、合法性与授权在服务端重复检查。

## 8. 数据库演进（建议 SQL 逻辑结构）

### 8.1 复用 fabric_items
现有列 id,user_id,name,color,image,width_mm,height_mm,quantity,note,created_at,updated_at 保留；向后兼容新增：
- thumbnail_path TEXT；image_path TEXT：推荐复用受控 COS/项目图片资源，不能只信任客户端图片 URL。
- category TEXT；stock_measure TEXT NOT NULL DEFAULT 'unknown'；is_archived INTEGER NOT NULL DEFAULT 0；deleted_at TEXT；last_used_at TEXT。
- version INTEGER NOT NULL DEFAULT 1（乐观并发）、sample_width_mm REAL（仅用于纹理比例，不能混为实物宽）。
- 原 quantity 为遗留数字，不直接改为余额；新增批次是库存唯一权威，后续逐步废弃 quantity 业务含义。

### 8.2 fabric_stock_lots（新表）
id PK；user_id；fabric_id FK；label；source_type(purchase/manual/scrap/import)；original_width_mm、original_height_mm、piece_count（可空）；stock_measure(known_area/unknown)；initial_area_mm2 INTEGER；remaining_area_mm2 INTEGER；version INTEGER；created_at、updated_at；archived_at。
约束：known_area 时余额非负且非空；unknown 时余额必须 NULL；任何库存修改写流水；同时保存实物数量/批次来源便于后续余布排版。

### 8.3 fabric_stock_movements（新表）
id PK；user_id；fabric_id；lot_id；cut_record_id（可空）；movement_type(in/out/adjust_in/adjust_out/reversal)；area_delta_mm2（有符号整数）；reason；idempotency_key；created_at。
不可硬删除台账；按 user_id 和时间分页查询；每次修改的余额与台账差额需可审计。

### 8.4 patchwork_cut_records / patchwork_cut_record_lines（新表）
records：id、user_id、project_id、project_revision、batch_id、snapshot_hash、status、deduct_inventory、waste_rate、include_base、include_hidden、idempotency_key、request_fingerprint、created_at、reversed_at、reason。唯一索引 user_id+idempotency_key；user_id+project_id+batch_id 防同批次重复。
lines：id、cut_record_id、fabric_id、lot_id、material_snapshot_json、piece_ids_json、design_area_mm2、cut_area_mm2、estimated_area_mm2、actual_area_mm2、area_delta_mm2。
项目快照冻结本次面积基础，使后续改稿和仓库更名不改写历史。

### 8.5 项目 JSON（兼容升级）
保持 Piece.materialId 为「项目材料 ID」，不要直接塞入仓库 ID。
扩展 Material：
- inventoryFabricId?: string（关联用户自有布）
- sourceType?: 'sample' | 'owned' | 'desired' | 'historical'
- 快照沿用 name/color/assetId/assetPath；缺料实时从服务端库存推导，不把 isMissing 布尔值持久写死。
未指定的新形状可引用「未指定」的项目占位 materialId，同时状态为 unassigned；历史 A–H 材料默认 sample，不能迁移成已拥有。建议 schemaVersion 由 1 升至 2，提供双版本读取和显式迁移测试。

索引：fabric_items(user_id,is_archived,updated_at)；lots(user_id,fabric_id)；movements(user_id,fabric_id,created_at)；cut_records(user_id,project_id,created_at)、唯一幂等键。

## 9. API 契约（优先扩展既有路径）

全部登录授权、服务端 user_id 隔离，失败返回统一 error/code/message/details，不把 500 误当「缺料」。

### 9.1 现有路径扩展，不新造 /api/my/fabrics
- GET /api/fabrics?q=&page=&pageSize=&status=available：列表，含可用摘要、图像、分页、unknown 状态；兼容旧客户端可保留原 fabrics 字段。
- POST /api/fabrics：新增主档与图片路径，不要把没有尺寸的旧 quantity=1 当有面积。
- PATCH /api/fabrics/:id：改名称、主色、图片等元数据，带版本检查。
- DELETE /api/fabrics/:id：改软删除/归档；如果仍被项目引用给出影响提示，历史作品快照保留。
- 图片上传：优先复用当前受控上传能力；需要时扩展 kind=fabric，不接受任意外链抓取。

### 9.2 新增库存
- GET /api/fabrics/:id/lots：查看实物批次、余额和记录可用状态。
- POST /api/fabrics/:id/lots：新增有计量/未计量库存批次。
- POST /api/fabrics/:id/adjustments：入库或人工盘点调整，必填原因和幂等键；不提供直接 PATCH 余额。
- GET /api/fabrics/:id/movements?page=&pageSize=：查询不可变库存流水。

### 9.3 新增项目材料检查与裁剪
- GET /api/patchwork/projects/:projectId/fabric-requirements?revision=：每个项目材料的 inventoryFabricId、available/insufficient/missing/unassigned/unknown、布片数及缺口；项目材料只识别当前用户拥有的 ID。
- POST /api/patchwork/projects/:projectId/cut-estimate：只预览，不落账；请求 includeBase、includeHidden、wasteRate、selectedPieceIds（可选），返回按布料汇总的几何信息、风险/待补项和库存版本。
- POST /api/patchwork/projects/:projectId/cut-records：确认裁剪；请求 idempotencyKey、expectedRevision、batchId、deductInventory、每项实际面积与 lotId、库存版本；服务端重算并事务扣减，响应记录 ID/最终余额。
- GET /api/patchwork/projects/:projectId/cut-records：裁剪历史。
- POST /api/patchwork/cut-records/:id/reverse：冲正错误扣库，需原因、幂等键、权限校验，不破坏历史记录。

重点 HTTP 语义：400 无效面积/缝份；401 未登录；403 不属于本人；404 不存在；409 项目版本变化、库存不足、同批次重复或幂等指纹冲突；503 暂不可用。客户端不得在 409 时静默重试扣库，应显示更新后的对账数据。

## 10. 集成与研发拆分

前端：
- 新建 MyFabricWarehousePage、FabricDetail、FabricUploadCrop、FabricStockEditor、ProjectFabricRequirements、CutEstimateSheet、CutRecordHistory。
- 改造现有 FabricPicker.tsx：支持 warehouse-only、empty/unknown/insufficient 状态、bottom/base/props 共用数据源；用户选择后写入项目 Material.inventoryFabricId 和外观快照。
- PatchworkPage.tsx：只改接入层；分离 Hooks：useMyFabrics、useFabricRequirements、useCutEstimate，避免将大量库存流程继续堆入单页。
- canvas.ts：缺料红边 + 感叹号，不覆盖原纹理；项目数据变化后异步请求状态并做缓存失效。
- export.ts：几何估算复用 area/outwardOffset；正式扣减计算迁移/复用服务端纯函数，由客户端提供一致性测试样本。
- 项目保存：必须先保存/同步最新修订再允许真实扣库存；未同步草稿不允许提交消费。

后端：
- SQLite 迁移与数据回填策略（见第 11 节）；FabricService、FabricStockService、PatchworkCutService；route 添加至 server.mjs，检查与现有 /api/projects 路由优先级。
- 以 existing beadingSessionService 的事务/幂等模式作为参考；布料事务、流水和用户隔离完全独立。
- 所有面积使用整数 mm²、金额/图片等独立字段，批次余额条件更新防超扣。
- 操作日志和错误监控：扣料成功率、冲突率、重复请求、负余额阻断、图片失败和迁移数据异常。

## 11. 迁移、兼容与失败恢复

1. 增量迁移，不删除旧 fabric_items、不改变现有 API 的基本字段；新增索引与新表。
2. 旧记录已有 width_mm、height_mm、quantity 但未确认单位：默认 unknown；提供「一键核实库存尺寸/块数」引导，用户确认后创建 lot。绝不能自动把 quantity=1 当 1 平方米或 1 块已知尺寸。
3. 旧项目 Material 没有 inventoryFabricId：保留外观；标记 sample/historical，不强制全部变成红色「缺料」；用户可手动关联仓库布料。
4. 老项目中 materialId='A' 等保持原样，不与新仓库布料 id 混用；迁移必须有前向/回滚测试，重复运行幂等。
5. 网络失败显示 unknown/加载失败；允许继续绘制，禁用需要精确库存的操作，不能误判空仓库。
6. 图片软删除不能导致历史项目封面/纹理 404；纹理快照有独立持久化/引用计数或安全保留策略。
7. 未登录直接引导登录，不把不同用户的缓存/仓库数据混在一起；退出账号清理个人缓存。
8. 两端同时裁剪同一种布：服务器事务与库存版本保证不超扣；其中一个成功后另一笔提示余额变化并重新确认。
9. 用户误点连续提交/请求超时：用相同幂等键重放；查询记录判断最终状态，不产生第二次扣料。
10. 正确区分「库存记录损坏」与「库存量不足」；所有非法负库存先阻断并告警。

## 12. 验收与测试矩阵

| 编号 | 操作/边界 | 期望 |
| --- | --- | --- |
| AC01 | 新用户首次打开仓库 | 空状态及上传入口；无示例布料冒充库存 |
| AC02 | 上传 PNG/JPG/WebP、裁剪、填写名称 | 上传成功、服务端记录可读 |
| AC03 | 同账号另一个设备登录 | 能看到相同布料与余额 |
| AC04 | 切换账号/伪造别人的 fabricId | 不能读取/修改/扣除他人库存 |
| AC05 | 选布器开启 | 仅显示本人可选布料，搜索及底部快速栏一致 |
| AC06 | 选中形状后点仓库布 | 一步填充；关联 fabricId 和材质快照；支持编辑器撤销 |
| AC07 | 上传彩色图片提取线稿 | 生成形状不自动声明有同色实物布料 |
| AC08 | 项目布料被仓库归档 | 旧作品不变，缺料红边和项目清单可见 |
| AC09 | 库存未知/网络失败 | 明确标记 unknown，不误报 missing |
| AC10 | 某种库存为 0 | 普通选布器不显示，项目需要则标红 |
| AC11 | 缺料点击替换 | 可选自有布料，批量替换一次撤销 |
| AC12 | 3 个 100mm 正方形同布 | 总理论面积 30,000mm² (=300cm²)，不重复/漏算 |
| AC13 | 设置 15% 损耗 | 推荐 34,500mm² (=345cm²)，损耗只算一次 |
| AC14 | 同布片重叠或被锁定 | 每个实际裁片依然计入，不按画面可见面积合并 |
| AC15 | 隐藏布片/底布选项 | 只按用户勾选配置汇总，不悄悄多扣 |
| AC16 | 凹角/自交/偏移失败 | 阻止自动扣库并给出修整或手工核实路径 |
| AC17 | 仅保存/标记设计完成/导出 PDF | 库存余额和流水均不变 |
| AC18 | 用户确认已裁剪与实际用量 | 单个服务端事务扣库、流水与快照一致 |
| AC19 | 双击确认/网络超时重试同一键 | 返回既有裁剪记录，绝不重复扣 |
| AC20 | 同键但请求参数不同 | 409 幂等冲突，余额无变化 |
| AC21 | 两设备同时扣最后一块布 | 仅有一笔成功，余额不负数 |
| AC22 | 部分布料库存不足 | 整笔扣减回滚；返回具体缺口明细 |
| AC23 | 扣料后修改设计再点完成 | 不自动重复扣；新批次需再次明确确认 |
| AC24 | 冲正误扣 | 追加反向流水并恢复账面余额、历史不删除 |
| AC25 | 散碎布总面积虽够但单块太小 | 明确显示「仅面积估算，需确认排版」 |
| AC26 | 旧数据 quantity=1，尺寸不完整 | 迁移后状态 unknown，不自动填充数值 |
| AC27 | 删除/归档已有作品引用的布料 | 作品外观快照仍可显示，出现缺料状态 |
| AC28 | 关闭裁剪确认界面 | 不提交扣库记录，余额不变 |

补充测试：服务端库存不足/事务回滚/幂等集成测试；属性路由登录校验；接口限流和上传格式；Canvas/手机端红边可访问性；端到端跨用户测试；重复迁移测试；实物裁剪样例与前后端面积误差一致性测试。

## 13. 研发里程碑与依赖

| 阶段 | 范围 | 依赖/交付 |
| --- | --- | --- |
| M0 基础与迁移 | 状态规范、数据库迁移、V1 API 向后兼容、布料上传/账号隔离 | 可独立运行的服务端/数据库集成测试 |
| M1 仓库 | 我的布料页、图片、尺寸、批次和流水、编辑及归档 | 实物库存可被服务端查询 |
| M2 编辑器联动 | warehouse-only 选布、底布/布片统一、项目材料关联、缺料提示、替换 | 缺料状态准确且历史作品不丢外观 |
| M3 面积耗料 | 几何纯函数、缝份/损耗、含底布选项、风险提示、裁剪预览 | 前后端面积一致的测试样本 |
| M4 事务扣库 | 保存最新修订、实际耗料核对、裁剪事件、幂等、冲正 | 完整端到端扣料验收 |
| M5 发布 | 旧数据迁移验证、错误监控、灰度/回滚 | 不影响原有拼布保存、分享、形状库与拼豆仓库 |

**建议先实现 M0→M2 后开放个人仓库，再上线 M3/M4 的裁剪扣库。** 没有库存版本和事务保护前，禁止把面积预估结果直接用于真实扣库。

## 14. 产品决定（默认建议，开发前锁定）

1. 「完成」含义：保存/完成设计不扣料；只有「确认已裁剪并扣库」扣料。
2. V1 库存计量：先支持 known_area 和 unknown，两类都可上传布料；只有已知余额可自动扣面积。
3. V1 精确性：支持面积估算、可选缝份与用户损耗；不承诺实体排版。
4. 可选布来源：只有登录用户的有效库存，历史缺料和样例在「项目所需布料」显示。
5. 历史项目：未关联的内置材料默认 sample，提示「未绑定真实布料」而非全部标红。
6. 软删除：仓库物料归档但项目快照保留；历史裁剪记录永不硬删除。
7. V1 再制作：显式新裁剪批次或复制作品，不按项目 revision 自动重复扣。
8. 库存单位：存 mm² 整数，UI 显示 cm²；实物长度输入必须记录布幅，以免把「米」误认为面积。

**最终验收标准**：用户能从上传实物布料开始，用自己已有的布完成可编辑拼布；画布红色识别缺料；能查看理论和预计面积；明确确认实际裁剪后同步扣库存且产生台账；重复请求不重复扣、旧作品不丢失、遇到未知或不足绝不静默扣减。

---
## 15. 开发数据契约示例（供实现时落地）

以下是**建议 DTO**，并非已存在的接口。示例中库存金额不用浮点米数表示；所有计量面积字段统一使用整数 mm²。

### 15.1 TypeScript 客户端模型

    type StockMeasure = 'known_area' | 'unknown';
    type FabricAvailability = 'sample' | 'unassigned' | 'available' |
      'insufficient' | 'missing' | 'unknown';

    type MyFabric = {
      id: string;
      name: string;
      imagePath?: string;
      thumbnailPath?: string;
      color?: string;
      category?: string;
      stockMeasure: StockMeasure;
      availableAreaMm2: number | null; // null=不可判断，不是零
      archived: boolean;
      version: number;
      updatedAt: string;
    };

    type FabricStockLot = {
      id: string;
      fabricId: string;
      label: string;
      stockMeasure: StockMeasure;
      widthMm?: number;
      heightMm?: number;
      remainingAreaMm2: number | null;
      version: number;
    };

    type ProjectFabricRequirement = {
      projectMaterialId: string;
      inventoryFabricId?: string;
      nameSnapshot: string;
      pieceIds: string[];
      includeBase: boolean;
      status: FabricAvailability;
      designAreaMm2: number;
      estimatedAreaMm2: number;
      availableAreaMm2: number | null;
      shortageAreaMm2: number | null;
      warnings: string[];
    };

    type CutEstimateOptions = {
      expectedRevision: number;
      includeBase: boolean;
      includeHidden: boolean;
      wasteRate: number; // 例如 0.15 = 15%
      selectedPieceIds?: string[]; // 仅追加裁剪时使用
    };

    type CutLineToConfirm = {
      inventoryFabricId: string;
      lotId: string;
      actualAreaMm2: number;
      lotVersion: number;
      adjustmentReason?: string;
    };

    type ConfirmCutRequest = CutEstimateOptions & {
      idempotencyKey: string;
      batchId: string;
      deductInventory: boolean;
      estimateFingerprint: string;
      lines: CutLineToConfirm[];
    };

### 15.2 请求与响应样例

准备估算（只读）：

    POST /api/patchwork/projects/p_123/cut-estimate
    {
      "expectedRevision": 5,
      "includeBase": false,
      "includeHidden": false,
      "wasteRate": 0.15
    }

建议响应：

    {
      "projectId": "p_123",
      "revision": 5,
      "estimateFingerprint": "sha256:...",
      "canDeduct": true,
      "warnings": ["面积充足不等于物理布块可完整裁出"],
      "requirements": [
        {
          "inventoryFabricId": "fabric_a",
          "nameSnapshot": "粉色碎花",
          "pieceIds": ["piece_1","piece_2","piece_3"],
          "status": "available",
          "designAreaMm2": 30000,
          "estimatedAreaMm2": 34500,
          "availableAreaMm2": 50000,
          "shortageAreaMm2": 0,
          "lots": [
            {"id":"lot_a","remainingAreaMm2":50000,"version":2}
          ]
        }
      ]
    }

确认裁剪（写入事务）：

    POST /api/patchwork/projects/p_123/cut-records
    {
      "idempotencyKey": "cut-uuid-001",
      "batchId": "batch-uuid-001",
      "expectedRevision": 5,
      "estimateFingerprint": "sha256:...",
      "includeBase": false,
      "includeHidden": false,
      "wasteRate": 0.15,
      "deductInventory": true,
      "lines": [
        {
          "inventoryFabricId": "fabric_a",
          "lotId": "lot_a",
          "actualAreaMm2": 34500,
          "lotVersion": 2
        }
      ]
    }

成功响应：

    {
      "recordId": "cut_001",
      "status": "deducted",
      "deducted": true,
      "balances": [
        {"fabricId": "fabric_a", "lotId": "lot_a",
         "remainingAreaMm2": 15500, "version": 3}
      ]
    }

重要：estimateFingerprint 应绑定项目修订、选中的实际布片、材料映射、底布选项、缝份、损耗参数和报价算法版本。服务端确认时重新计算并验证，指纹不一致要求重做预览，不得直接根据客户端上传的面积扣减。

### 15.3 关键数据库约束

- fabric_stock_lots.remaining_area_mm2：已知面积库存必须 CHECK >= 0；未知为 NULL。
- cut_records(user_id,idempotency_key) 唯一；cut_records(user_id,project_id,batch_id) 唯一。
- fabric_stock_movements(cut_record_id,lot_id,movement_type) 在同一次裁剪扣减中不可重复插入相同耗料行；调整/冲正有独立业务键。
- SQLite 开始写事务后重新核对 lot.version + remaining_area_mm2，使用条件更新防止超扣；更新影响行为 0 视为版本冲突或库存不足，所有数据回滚。
- 消费中止、校验失败、积分网络重试等情况下不得留下只写流水没改库存或只扣库存没写裁剪记录的半成功数据。
- 服务端返回库存列表中的缺口或状态必须以当前登录的 user_id 限制查询，不能靠仅有 fabricId 的资源路径授权。

### 15.4 前端缓存策略

- 仓库布料数据按账号 userId 隔离缓存；登录、退出、切换账号时清除。
- 上传、入库、扣库、冲正、软删除后，刷新 GET /api/fabrics 列表、项目缺料清单与 FabricPicker。
- 作品材料外观是快照，库存状态是实时查询；加载失败仅显示「状态暂不可用」，不把缓存中旧余额作为确认扣库依据。
- 不要继续使用项目里默认 A–H 的 color 或名称判断库存；唯一可靠绑定是 inventoryFabricId。
- API 新字段向后兼容，老 H5 端不能通过 PATCH /api/fabrics 的 quantity 直接绕过流水修改新库存余额。

## 16. 交付清单与完成定义

后端交付：SQLite migration 脚本、带用户隔离的仓库/批次/流水 CRUD、项目用料预估纯函数、事务扣库/幂等/冲正实现、接口集成测试及数据库回滚测试。

前端交付：我的布料页面、上传/裁剪/详情、统一仓库选布器、项目缺料标红与替换、面积预览、实际耗料确认、库存流水页、跨设备刷新及 H5 移动端交互测试。

上线门槛：28 项验收场景通过；未迁移用户仍可打开旧作品；不存在账户串库/同一批次双扣/负库存；保存设计零扣库；服务端暂不可用时不能制造假缺料或假成功。

---
此文档是待开发规范，并不表示功能已经实现。
