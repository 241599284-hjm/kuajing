# Module Visual Templates

本文件规定后续所有模块的页面模板。新增页面前必须先选择一个模板；如果没有合适模板，先补模板，再写页面。

## 通用原则

- 前台买家页面使用 `premium-minimal`，后台运营页面使用中文工具型布局。
- 页面只能组合公共组件，不允许为单页自造视觉系统。
- 后台默认使用 `AdminPanel`、`AdminListCard`、`AdminField`、`AdminPrimaryButton`、`AdminSecondaryButton`、`AdminToggleButton`、`AdminInlineStatus`。
- 新模块开发前必须先查“模块到模板映射表”；映射表没有覆盖时，先补模板，再写业务页。
- 每个模板都必须覆盖：加载、空数据、失败、保存中、已保存、API 未连接状态。
- 每个 growable 列表都必须分页；排序和筛选必须固定在列表上方，不占过高空间。
- 移动端优先保证可操作，不把表格硬塞进窄屏。窄屏使用卡片列表，桌面可用表格。

## 模块到模板映射表

后续所有微服务和业务模块都按下表选择页面模板。不能因为赶进度临时做一套页面。

| 模块 | 前台模板 | 后台模板 | 状态/异常模板 | 关键公共组件 |
| --- | --- | --- | --- | --- |
| `catalog-service` 商品/分类/地域/标签 | 首页模板、分类/地域列表页、商品详情页、状态页 | 基础资料维护页、商品编辑页 | 商品不存在、商品下架、API 不可用 | Storefront Header、Product Card、AdminPanel、AdminListCard、AdminField |
| `media-service` 图片/视频/详情媒体 | 商品详情页、状态页 | 商品编辑页、配置表单页、DLQ 页 | 上传失败、绑定失败、媒体不可访问 | Media Gallery、Story Block、AdminFileInput、AdminInlineStatus |
| `inventory-service` 库存/多仓/批次/预留 | 商品详情库存展示、购物车/结账页 | 订单/库存列表页、详情审核页 | 库存不足、预留失败、补偿失败 | Status Badge、AdminListCard、Detail Timeline |
| `cart-service` 购物车 | 购物车/结账页、状态页 | 订单/库存列表页的购物车诊断视图 | 商品下架、价格变化、库存变化 | Line Item、Order Summary、Inline Error |
| `order-service` 订单/订单行/Saga | 购物车/结账页、用户中心页、状态页 | 订单/库存列表页、详情审核页、DLQ 页 | 创建失败、重复提交、Saga 补偿失败 | Order Summary、AdminPanel、Timeline、DLQ Actions |
| `payment-service` 支付/退款/拒付 | 购物车/结账页、状态页、用户中心页 | Provider 配置页、详情审核页、DLQ 页、报表页 | 支付不可用、支付失败、退款失败、拒付 | Provider Card、Masked Secret Field、Status Badge |
| `logistics-service` 物流/履约/轨迹 | 用户中心订单详情、状态页 | Provider 配置页、订单/库存列表页、详情审核页、DLQ 页 | 物流不可达、轨迹同步失败、人工履约 | Tracking Timeline、Provider Card、Action Row |
| `aftersales-service` 售后/退换货/Keep Item | 用户中心页、状态页 | 详情审核页、订单/库存列表页、DLQ 页 | 售后提交失败、质检失败、退款补偿失败 | Review Panel、Timeline、Evidence Media |
| `auth-service` 买家账号/后台账号/RBAC | 登录、注册、忘记密码、用户中心页、状态页 | 配置表单页、详情审核页的账号审计区 | 邮件验证失败、重置链接过期、权限不足 | Auth Form、AdminField、Inline Status |
| `support-service` 在线客服/工单 | 用户中心页、状态页、客服入口 | 详情审核页、订单/库存列表页 | 工单提交失败、客服离线 | Chat Entry、Ticket Card、Timeline |
| `promotion-service` 折扣/优惠券/礼品卡 | 首页模板、分类列表页、购物车/结账页 | 基础资料维护页、配置表单页、订单/库存列表页 | 优惠失效、优惠库存不足 | Price Display、AdminListCard、AdminToggleButton |
| `risk-service` 风控/黑名单/高危订单 | 结账页状态提示、状态页 | Provider 配置页、详情审核页、DLQ 页、报表页 | 高危拦截、人工审核、风控服务降级 | Risk Badge、Review Actions、Provider Card |
| `finance-service` Ledger/对账/汇兑损益 | 用户中心订单详情金额展示 | 报表页、详情审核页 | 对账异常、汇率不可用、导出失败 | KPI Strip、Paginated Table、Masked Export |
| `tax-service` 税费/关税/VAT | 购物车/结账页、商品详情税费提示 | Provider 配置页、配置表单页、报表页 | 计税不可用、税费缓存兜底 | Provider Card、Order Summary、Config Form |
| `fx-service` 汇率/多币种 | 首页模板、列表页、详情页、结账页 | Provider 配置页、配置表单页、报表页 | 汇率源不可用、缓存汇率兜底 | Currency Switcher、Price Display、Provider Card |
| `notification-service` 邮件/短信/站内通知 | 状态页、用户中心通知区 | Provider 配置页、配置表单页、DLQ 页 | 邮件发送失败、模板缺失 | Template Editor、Test Connection、DLQ Actions |
| `content-service` Blog/Guide/FAQ/政策页/SEO | 首页模板、状态页、文章/政策页 | 基础资料维护页、配置表单页 | 内容不存在、草稿未发布 | Content Card、AdminTextarea、SEO Fieldset |
| `search-service` 搜索/排序/推荐 | 分类/地域列表页、搜索结果页、首页推荐区 | 配置表单页、报表页 | 无结果、搜索服务降级 | Search Bar、Sort Bar、Empty State |
| `theme-service` 主题/OpenDesign 转译 | 全部前台模板 | 配置表单页、基础资料维护页 | 主题配置无效、预览失败 | Token Form、Preview Frame、AdminField |
| `reporting-service` BI/导出/运营报表 | 用户中心简版数据 | 报表页、DLQ 页 | 报表生成失败、导出脱敏失败 | KPI Strip、Chart Panel、Paginated Table |

## 新模块开工检查

新增任何页面前，先回答下面 8 项，答不出来就不能开写：

- 这个模块归属哪个微服务，是否需要前台、后台或两者都有。
- 前台页面选择了哪个模板，是否需要双语。
- 后台页面选择了哪个模板，是否默认中文。
- growable 数据是否分页，排序和筛选放在哪里。
- 加载、空数据、失败、API 不可用、保存中、保存成功怎么展示。
- 是否复用现有公共组件；如果不够，先补公共组件。
- 是否有移动端、iPad、桌面三档布局。
- 是否有截图/e2e 验收点。

## 后台模板

### 1. 基础资料维护页

适用：

- 商品分类
- 地域分类
- 标签
- 材质字典
- HS Code 字典
- 仓库字典
- 物流渠道字典

结构：

```text
AdminPanel
  header: eyebrow + title + status
  action row: 新增按钮 + 简短说明
  list: AdminListCard[]
    title: 中文 / 英文
    description: slug / 编码 / 说明
    action: 启用/停用
    fields: slug、中文、英文、排序、状态、必要配置
  footer: 保存按钮 + status
```

规则：

- 中英文 buyer-facing 字段必须成对出现。
- 排序字段必须可维护。
- 启停开关必须在列表项右侧。
- 删除动作默认不做；后续需要删除时必须二次确认和审计。

### 2. 商品编辑页

适用：

- 商品 SPU
- SKU
- 套装 SKU
- 商品图文详情
- 商品 SEO

结构：

```text
AdminPanel
  header
  product list card
    status toggle: 上架/下架
    basic fields: 中英文名、分类、地域、价格、SKU
    cross-border fields: HS Code、材质、原产地、容量、重量、体积
    media group: 主图、详情媒体、poster、alt、sort_order
    story group: 中文详情、英文详情、亮点、SEO
  footer: 保存
```

规则：

- 不得隐藏 HS Code、材质、原产地、容量等跨境核心字段。
- 价格输入展示给运营可以是正常金额，但接口/数据库必须是整数最小单位。
- 媒体上传必须明确“已压缩待上传”或“已真实上传”，不能假上传。
- 图文详情 JSON 只存 URL 和轻量元数据，不存 base64。

### 3. 配置表单页

适用：

- 邮箱设置
- 外贸站设置
- 店铺基础信息
- CDN / 存储公开配置
- 主题配置
- Cookie / 隐私配置

结构：

```text
AdminPanel
  header
  grouped fieldsets
    group title + help text
    fields: input/select/checkbox
  footer: 保存 + 测试连接按钮 + status
```

规则：

- 密钥只显示 masked 状态，不回显明文。
- 第三方连接必须有“测试连接”动作。
- 配置保存失败必须明确显示，不允许假成功。
- 线上域名、bucket、endpoint 不能写死在代码里。

### 4. 订单/库存列表页

适用：

- 订单管理
- 订单行
- 库存流水
- 库存预留
- 批次库存
- 采购单
- 入库单

结构：

```text
AdminPanel
  header
  compact filter bar
    keyword、状态、时间范围、排序
  desktop table / mobile cards
  pagination
  detail drawer or detail page link
```

规则：

- 必须分页。
- 状态用统一 badge。
- 金额、数量、时间格式统一。
- 移动端不能横向滚动整张表，改为卡片。
- 批量操作必须二次确认。

### 5. 详情审核页

适用：

- 订单详情
- 支付记录详情
- 退款详情
- 售后工单详情
- 拒付详情
- 风控高危订单

结构：

```text
AdminPanel
  header: 编号 + 状态 + 主操作
  summary band: 金额、用户、渠道、时间
  timeline: 状态流转
  sections: 商品、地址、支付、物流、售后、审计
  right/desktop actions: 通过、拒绝、重试、冻结、释放
```

规则：

- 危险动作必须二次确认。
- 每个动作必须写审计日志。
- 失败状态要给出可操作的下一步，不只显示错误。

### 6. Provider 配置页

适用：

- 支付 Provider
- 物流 Provider
- 税费 Provider
- 汇率 Provider
- 风控 Provider
- 邮件 Provider

结构：

```text
AdminPanel
  provider cards
    provider name + status + priority
    enable switch
    sandbox/prod mode
    credential status masked
    test connection
    circuit breaker status
  fallback order section
```

规则：

- Provider 参数不得硬编码。
- 新 Provider 默认不开全量流量。
- 必须显示启用状态、健康状态、失败次数和手动恢复入口。
- 密钥只允许环境变量/secret manager 或后台安全配置，不回显明文。

### 7. DLQ / 异常队列页

适用：

- 支付回调失败
- 库存补偿失败
- 物流同步失败
- 媒体绑定失败
- 邮件发送失败

结构：

```text
AdminPanel
  filter bar: 类型、状态、时间、重试次数
  queue item cards/table
    error summary
    payload summary, redacted
    attempts
    next action
  actions: 重试、作废、标记人工处理
```

规则：

- 必须有重试、作废、处理人、处理备注。
- PII 必须脱敏。
- 操作必须写审计日志。
- 不能只是只读列表。

### 8. 报表页

适用：

- 销售报表
- 库存周转
- 退款率
- 复购率
- LTV
- 汇兑损益
- 渠道手续费

结构：

```text
AdminPanel
  date range + currency + dimension filters
  KPI strip
  chart area
  paginated detail table
  export action
```

规则：

- 报表不得直接在业务主库跑重 SQL。
- 数据来源要用只读模型、预聚合、物化视图或离线分析。
- 导出文件里的 PII 必须脱敏。

## 前台模板

### 1. 首页模板

结构：

```text
PremiumStorefrontHeader
Hero
Service strip
Category module
Featured products with pagination
Region module
About / story
Support entry
Footer
```

规则：

- 第一屏必须看到品牌/商品视觉。
- 商品、分类、地域都从 catalog/store 配置读取。
- 移动端模块长度要可控，产品多时分页。

### 2. 分类/地域列表页

结构：

```text
Header
Back link
Title + description
Sort bar
Product grid
Pagination
```

规则：

- 分类页不再显示分类下拉。
- 排序横向极简，不用高大的筛选卡。
- 产品多时分页，不能无限长。

### 3. 商品详情页

结构：

```text
Header
Back link
Gallery / main media
Product summary
Price + original price
Sales + stock
Add to cart / Buy now
Overview
Story media blocks
Specifications
Shipping / aftersales hints
```

规则：

- 中英文切换必须覆盖详情文字。
- 详情媒体 lazy load，视频 metadata preload。
- 原价划线、折扣价、销量、库存必须统一格式。

### 4. 购物车/结账页

结构：

```text
Header
Cart/checkout title
Line items
Address/payment form
Order summary
Primary action
Failure/status message
```

规则：

- 支持 Guest Checkout。
- 地址国家/省份选择，城市/街道/邮编手写。
- 订单金额用统一格式化。
- 支付未接真实 Provider 时必须明确 mock/不可用状态。

### 5. 用户中心页

结构：

```text
Header
Account title
Sidebar/tab navigation
Profile
Address book
Payment methods placeholder
Order history
Security/password
```

规则：

- 支付卡信息不得保存明文卡号。
- 地址、订单历史后续必须接真实服务，不长期用本地假数据。
- 移动端使用 tabs/segmented sections，不挤压成表格。

### 6. 状态页

适用：

- 404
- 商品不存在
- 商品下架
- 支付成功/失败
- 离线/接口不可用

结构：

```text
Header
Short title
Clear explanation
Primary action back home/shop
Secondary action contact support
```

规则：

- 中英文双语。
- 不白屏。
- 不泄露内部错误栈。

## 截图验收矩阵

每个新增模板页至少验收：

- 390 x 844 mobile
- 768 x 1024 tablet
- 1440 x 1000 desktop

必须检查：

- 无横向溢出。
- 文字不重叠。
- 触控区域不小于 44px。
- Header/按钮/输入框/卡片/状态样式一致。
- 加载、空数据、失败状态存在。
