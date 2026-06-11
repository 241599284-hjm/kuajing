# $茶具站继续开发

把下面整段复制到新对话开头，即可继续开发当前项目。

```text
$茶具站继续开发

项目路径：D:\crossborder-commerce-kit
前台地址：http://localhost:3000
后台地址：http://localhost:3001

项目定位：
这是一个自营跨境茶具独立站底座。单个部署实例不做运行时多租户，但项目必须可复制部署给不同客户使用。
前台面向海外买家，后台面向中文运营人员。前台保持欧美极简风，后台默认中文。
不要引入运行时 `tenant-service` 或跨租户查询模型。需要的是 `StoreContext / DeploymentContext`：同一套代码可复制交付给不同客户，每个客户独立部署、独立数据库、独立配置、独立密钥。
最新硬规则：
- 没有租户概念，不做 `tenant-service`，不做 `tenant_id`，不做跨租户测试。
- 后续如果看到 SaaS 多租户方案，必须改写成单店铺独立部署方案。
- 可复制交付不是多租户 SaaS，而是同一套源码可给不同客户单独部署。
- 客户差异通过后台配置、环境变量、密钥管理、独立数据库、独立对象存储和独立域名解决。
- 业务上下文统一叫 `StoreContext / DeploymentContext`，只表示当前部署站点，不表示多商户隔离。

当前技术栈：
- pnpm monorepo
- Next.js storefront
- Next.js admin
- NestJS 微服务
- PostgreSQL / Redis / Docker Compose 本地底座
- Playwright e2e
- Loki + Grafana 本地/测试服务器观测底座

部署路线：
- 阶段一只用 Docker Compose，在本地和第一台测试服务器跑通业务闭环、补偿重试、集中日志和备份恢复。
- 阶段二上云时使用托管状态服务：PostgreSQL 用 RDS/等价托管库，Redis 用托管 Redis，对象存储用 R2/S3/OSS，K8s 只跑无状态 Node.js 服务和 worker。
- 阶段三再把无状态服务做成 Helm 包，支持批量复制交付。当前阶段不做裸机 K8s，不把生产数据库或 Redis 放进 K8s。

当前验证状态：
最近全套 `pnpm -s e2e` 已通过 34 个测试。

生产缺口登记：
- `docs/production-gap-register.md` 是当前 P0/P1/P2 缺口清单。
- 客户生产交付前，P0 项必须关闭或写明例外接受。

每次改完必须跑：
- `pnpm --filter @commerce/storefront -s typecheck`
- `pnpm --filter @commerce/admin -s typecheck`
- `pnpm -s e2e`

不允许：
- 不允许假按钮、假保存、假上传不说明
- 不允许把自营站改成运行时多租户 SaaS
- 不允许新增 `tenant_id` 作为运行时多租户主线
- 不允许把支付、物流、图片上传、订单逻辑硬编码在前台
- 不允许只做页面不接后续微服务边界
- 不允许改完不验证
- 不允许把本应后台维护的业务内容写死在前台代码里
- 不允许买家侧内容只支持单语言
- 不允许只做桌面端，不验证手机和 iPad
- 不允许新增页面偏离 `premium-minimal` 视觉规范；视觉标准见 `docs/premium-minimal-visual-system.md`，模块页面模板见 `docs/module-visual-templates.md`
- 不允许新页面各自写一套按钮、输入框、卡片、弹窗、状态提示样式；必须先复用或补公共组件
- 不允许用行内样式做普通视觉；仅媒体尺寸、性能提示等有明确原因的场景例外
- 不允许前台内容长期写死代码；商品、分类、地域、图文详情、SEO 和媒体资源必须优先走 catalog/media 动态接口
- 不允许金额、库存、数量使用浮点类型；必须使用整数最小单位或固定精度规则
- 不允许持久化本地时区业务时间；数据库、事件、日志、缓存时间统一 UTC
- 不允许 Saga/TCC 补偿只写日志；必须真实回滚数据、库存、支付状态或上传文件绑定
- 不允许 DLQ 没有后台人工处理入口
- 不允许 TCC confirm/cancel 失败只靠一次同步 HTTP，必须写入 durable compensation task 并可进入 DLQ
- 不允许私有化交付靠人工一个个终端启动，Compose/后续 Helm 必须可重复
- 不允许生产 PostgreSQL/Redis 跑在 K8s 内部
- 不允许事故无法按 correlation ID 跨服务检索日志
- 不允许商品详情媒体把 base64、二进制、大段 HTML 塞进 JSON
- 不允许商品详情大图、GIF、短视频全部 eager 加载导致移动端卡顿
- 不允许生产/客户交付环境依赖静态兜底数据
- 不允许 growable 列表接口全量返回；商品、订单、日志、DLQ、媒体列表必须分页
- 不允许后台写操作、上传、订单、退款、库存预留缺少幂等 Key
- 不允许对象存储、CDN、支付、物流、汇率、税费、邮件配置硬编码在源码里
- 不允许后台写操作缺少审计日志

执行标准：
每个新功能必须包含：
1. 微服务归属
2. 数据模型或配置模型
3. API 契约
4. 后台维护入口
5. 前台联动
6. 异常处理
7. 测试
8. 响应式验证
9. 中英文买家侧内容
10. 可复制交付配置说明
11. 不硬编码客户业务资料
12. 不绕过微服务边界
13. 列表分页和排序规则
14. 缓存策略和失效规则
15. 幂等 Key 和统一错误码
16. 审计日志
17. 备份/恢复影响说明

通用性原则：
- 底座必须全局考虑，可扩展、可维护、可新增。
- 所有前台展示内容都应有后台维护来源，不能长期写死。
- 能选择的字段必须做成后台可维护选项，例如分类、地域、标签、材质、釉色、仓库、物流、支付方式、税费模板。
- 后台维护结构化字段时优先使用下拉、单选、多选、排序、开关、上传控件，不让运营人员手打自由文本。
- 买家侧文案、商品名、分类名、地域名、详情图文、SEO 必须支持多语言，当前至少中英文。
- 每个功能都要同时考虑前台展示、后台支撑、API、数据库、测试和交付文档。
- 项目整体要可复制交付给其他客户，客户部署后能自己维护商品、内容、支付、物流、邮箱和基础设置。
- 单个客户实例是自营站，不做运行时多租户；可复制交付通过独立部署、独立数据库、独立配置实现。

必须纳入的新增底座细节：

- 视觉系统：全站按 `premium-minimal` 执行，白底、细线、Serif 大标题、黑色主按钮、统一 Header、统一卡片/表单/弹窗/状态；手机触控目标不小于 44px；所有新增模块先选择 `docs/module-visual-templates.md` 中的页面模板。
- 模块模板矩阵：后续所有微服务模块必须先查 `docs/module-visual-templates.md` 的“模块到模板映射表”，明确前台模板、后台模板、状态/异常模板和关键公共组件后才能开发。
- 公共组件先行：新增页面前先抽取或复用布局、按钮、卡片、输入框、状态提示、弹窗组件，业务页只组合组件，不各写一套视觉。
- 契约对齐：OpenAPI、数据库、service DTO、admin 表单、storefront 渲染必须字段名、类型、必填规则一致；联调前做契约自检。
- 缓存体系：catalog 高频读走 Redis，空结果短 TTL，TTL 加随机偏移，DB 提交后删除缓存；本地、测试、生产缓存实例或 key 前缀隔离。
- 缓存粒度：缓存按 storefront 聚合、分类、地域、商品摘要、商品详情/投影拆 Key；写入后精准删除维度缓存和聚合缓存；静态兜底不入缓存。
- 媒体性能：商品详情图、GIF、短视频由 media-service 生成多尺寸、多格式、poster 和元数据；前台 lazy load，视频只加载 metadata。
- 媒体闭环：上传成功后必须绑定 catalog；绑定失败要补偿删除/隔离对象；多图按 sort_order 渲染；存储配置启动时校验。
- 前台体验：商品列表、分类、地域、搜索必须分页；核心加载态要有骨架屏或明确 loading；非法路由、商品不存在、下架商品要友好提示。
- 商品业务：规格/款式联动价格、库存、图片；组合套装支持子 SKU 关系；定时上下架使用 UTC；购物车过滤下架商品。
- 搜索：中英文混合检索、输入防抖、后台可配置排序规则；后期接 OpenSearch，不允许长期用 `%like%` 扛大数据。
- SEO：每个商品、分类、地域页面的 title、description、keywords、alt、slug、hreflang 由后台内容驱动。
- 网关/API：必要请求头透传，统一错误码，写接口幂等，服务地址走配置，不硬编码端口/IP；健康检查区分进程存活和依赖可用。
- 后台权限：RBAC、操作审计、批量操作二次确认，大批量任务异步化。
- 后台安全：登录防暴力破解；生产可配置 VPN/IP 白名单作为强化项；文件上传禁止 svg/html/xml/exe。
- 备份运维：一客户一独立部署，数据库、对象存储、配置都要备份和恢复演练。
- 交付升级：新客户初始化基础分类、地域、默认配置；迁移只增不破坏；新增 API 字段保持可选兼容老版本。
- 测试：弱网、断网重连、接口宕机、移动端横竖屏、iPad、超长文本、库存 0、中英文空值都要纳入验收。

全量开发路径：
1. 本地工程底座：monorepo、Docker Compose、本地依赖、健康检查、启动文档。
2. 店铺上下文、权限、基础安全：StoreContext、Auth、RBAC、Admin Gateway、API Gateway、审计、密钥读取规范。
3. 商品、SKU、供应链：分类、SPU/SKU、套装、图片、多语言、HS Code、材质、供应商、采购、入库批次、质检、采购成本。
4. 库存核心：独立库存库、多仓、批次、安全库存、预留、释放、确认扣减、TCC、Redis Lua、套装依赖、inventory_version。
5. 购物车、结账、订单：Guest Cart、用户购物车、地址、运费税费占位、订单快照、订单状态机、Outbox/Inbox、Saga、DLQ。
6. Mock 支付闭环：IPaymentProvider、Mock Provider、webhook、验签模拟、支付成功扣库存、支付失败释放库存。
7. 后台运营基础：Dashboard、商品、SKU、库存、订单、支付记录、DLQ、审计、系统设置、品牌、语言、币种。
8. 前台商城体验：首页、分类、搜索、详情、购物车、结账、结果页、订单详情、用户中心、多语言、多币种、响应式。
9. OpenDesign 主题系统：theme tokens、Tailwind token mapping、模块配置、品牌色、字体、Logo、默认欧美极简主题、视觉验收。
10. 真实支付与跨境交易：Airwallex、连连、PayPal、Stripe 预留、FX、Tax、汇率快照、税费快照、退款、部分退款、拒付。
11. 物流、履约、售后：物流 provider、多仓履约、拆单合单、头程尾程、轨迹、退换货、Keep Item、质检、库存返还、退款 Saga。
12. 营销、风控、财务台账：优惠券、满减、礼品卡、预售、Promotion TCC、Risk Provider、黑名单、Chargeback Saga、Ledger、对账。
13. 报表、内容、通知、SEO：Blog、Guide、FAQ、政策页、评价、Q&A、邮件、弃单召回、GA4/GTM、Athena、sitemap、hreflang。
14. 服务器部署与交付：staging、production、Cloudflare、HTTPS、ECS/Fargate 或 Docker Compose、RDS、Redis、OpenSearch、Secrets、备份、Runbook。
15. 严苛验收：库存压测、webhook 重放、Saga 补偿、DLQ 人工重试、PII 扫描、secret scanning、视觉截图、移动端、Restore Test、熔断演练。
```

## 当前已完成

### 前台商城

- 首页欧美极简风，真实茶具图片。
- 前台已统一为 `premium-minimal` 精品电商风格，参考 CERAFAN 的白底、细线、Serif 大标题、黑色主按钮、产品摄影陈列方向。
- 首页、分类页、地域页、全部地域页、商品详情页、购物车、结账页、个人中心共用统一前台 Header。
- 中英文切换。
- 手机、平板、电脑响应式。
- 手机菜单左上角抽屉。
- 手机菜单中地域分类、商品分类默认显示 4 个，可展开/收回。
- 首页按分类浏览，点击进入分类页，不再锚点滚动。
- 分类页 `/categories/[slug]`。
- 分类页不显示搜索框和分类下拉，只显示横向极简排序。
- 分类页有返回上级按钮。
- 地域首页模块默认显示 4 个地域。
- 主页地域模块支持原地展开全部和收回。
- 全部地域页 `/regions`。
- 地域详情页 `/regions/[slug]`。
- 商品详情页 `/products/[slug]`。
- 商品详情页支持图文介绍。
- 商品详情页显示折扣价、原价划线、本月销量、库存。
- 商品搜索框可按系统内商品名称提示。
- 顶部搜索、手机菜单搜索、商品列表搜索均有商品名提示。
- 购物车 `/cart`。
- 加入购物车，本地购物车数量同步。
- 立即购买进入 `/checkout?buyNow=商品slug`。
- 结算页 `/checkout`，含邮箱、国际地址、支付方式、订单摘要。
- 结算页提交已接入 `api-gateway -> order-service` 的服务端 Mock 订单接口，当前返回 Mock 订单号、Mock payment redirect、`inventoryMode`、`storageMode` 和 `paymentMode`；`order-service` 先调用 `inventory-service` 预留库存，再创建订单，订单行保存 `skuId` 和 `inventory_version` 快照；`order-service` 优先写 PostgreSQL `order_db.orders/order_lines`，数据库不可用且库存也是内存模式时显式降级到内存 Mock；订单创建后调用 `payment-service POST /payments/mock-intents`，支付服务不可用时显式降级到本地 fallback，前台不假装真实支付成功。
- 注册、登录、忘记密码、重置密码、个人主页。
- 登录后首页右上角显示用户名，点击进入个人主页。
- 个人主页有账户资料、地址管理、支付方式、历史订单、安全与密码。
- 在线客服入口占位。

### 后台管理

- 后台默认中文。
- 左侧菜单分模块。
- 商品管理。
- 商品分类管理。
- 地域分类管理。
- 折扣管理。
- 邮箱设置。
- 外贸站设置。
- 商品上架、下架、改价格。
- 商品分类可新增、排序、启停、中英文维护。
- 地域分类可新增、排序、启停、中英文、地标、矢量样式、首页展示开关。
- 折扣可维护金额、比例、排序、中英文内容、启停。
- 邮箱 SMTP 设置入口。
- 商品、分类、地域、折扣、邮箱设置、外贸设置已迁入公共后台 UI primitives，后续后台模块必须继续复用同一套组件。
- 商品详情图文维护入口。
- 商品详情图片选择后自动压缩为 WebP，并通过 `admin-gateway -> media-service` 上传到 local/MinIO/R2/S3 兼容对象存储。

### 当前仍是本地或页面壳的部分

- 购物车现在是 localStorage，本地可用，尚未接 `cart-service`。
- 结算页已接入 `order-service` 的服务端 Mock 订单边界，订单服务已具备库存 TCC 预留、PostgreSQL 优先落库和内存显式降级，并已通过 `payment-service` 创建 Mock payment intent；Mock 支付 webhook 已能回调 `order-service` 执行库存 confirm/cancel；真实支付 Provider、退款和真实支付状态机仍未完成。
- 支付方式是页面选择，当前只有 Mock Provider 闭环，尚未接真实支付渠道。
- 图片压缩和第一版真实 `media-service` 上传已接通；还缺 catalog 绑定失败补偿、响应式多尺寸变体、GIF 转视频、视频 poster/时长提取、上传审计日志。
- 后台商品、分类、地域已从 `admin-gateway -> catalog-service` 初始化读取真实数据，保存链路也已接入 catalog-service；仍需在 Docker/PostgreSQL 环境验证完整“保存 -> 落库 -> 缓存失效 -> 前台读取”闭环。
- 用户地址、支付方式、订单历史目前是页面结构，尚未接真实接口。
- `catalog-service` 已新增前台快照读取接口，contracts、SQL 迁移、api/admin gateway 转发已完成 typecheck。
- `media-service` 已新增第一版真实上传，不做假上传；支持 local 和 MinIO/R2/S3 兼容存储。
- 第二步契约文档见 `docs/catalog-media-contract.md`。
- 前台已新增 `StorefrontCatalogProvider`，首页、搜索、手机菜单、地域模块优先读取 `api-gateway /catalog/storefront`，开发环境 API 不可用时才 fallback 到静态演示数据。
- 后台分类、地域、商品基础读取和保存已接入 `admin-gateway -> catalog-service` 链路；本地 PostgreSQL 未启动时后台会明确提示 API 未连接，不冒充真实保存。

## 第二步优先开发

第二步不要先做支付。先做基础资料服务，否则后面订单、库存、支付都会缺数据来源。

建议第二步顺序：

1. `catalog-service`
2. `media-service`
3. `admin-gateway` 对接 catalog/media
4. 前台从 catalog API 读取商品、分类、地域
5. 后台商品、分类、地域读取/保存到数据库

第二步目标：

- 商品、分类、地域不再写死在前台配置文件里。
- 后台新增/修改/上下架后，前台实时读取。
- 商品详情图文可后台维护。
- 图片可压缩上传到对象存储，并生成可访问 URL；后续补 catalog 绑定失败补偿和媒体审计。

## 全量开发路径（无租户版）

这条路径要作为后续主线。附件里的 SaaS 多租户写法不采用，所有 `tenant-service`、`tenant_id`、跨租户越权测试都改成单店铺独立部署语义。

核心定义：

- 单个部署实例就是一个自营站。
- 不存在多个商户共用一套运行时数据库的情况。
- 可复制交付靠独立部署实现：独立域名、独立数据库、独立缓存、独立对象存储、独立密钥、独立后台配置。
- 代码里需要上下文时使用 `StoreContext / DeploymentContext`，表示当前部署站点和环境，不表示租户隔离。
- Provider 配置按当前店铺部署保存，例如支付、物流、税费、汇率、邮箱、对象存储、客服配置。

### 阶段 1：本地工程底座

目标：项目能本地一键启动。

范围：
- `apps/storefront`
- `apps/admin`
- `services/*`
- `packages/*`
- `infra/*`
- `docs/*`
- TypeScript、lint、test、Dockerfile、环境变量校验
- `docker-compose.yml`
- PostgreSQL、Redis、OpenSearch、MinIO、Mailpit
- `.env.example`
- 本地启动文档

验收：
- 一条命令启动本地环境。
- 前台、后台、API 健康检查可访问。
- 本地依赖不需要真实云资源。

### 阶段 2：店铺上下文、权限、基础安全

目标：后台可登录，前后台 API 有统一上下文和安全边界。

范围：
- `store-service`
- `auth-service`
- `api-gateway`
- `admin-gateway`
- RBAC
- 2FA 预留
- `StoreContext / DeploymentContext`
- audit log
- secret/config 读取规范
- 管理后台访问控制和操作审计

明确不做：
- 不做 `tenant-service`
- 不做 `tenant_id`
- 不做跨租户查询模型

验收：
- 后台管理员能登录。
- 未授权后台 API 请求失败。
- 前台 API 不直连内部微服务。
- 后台操作有审计日志。

### 阶段 3：商品、SKU、供应链

目标：后台能维护商品，前台能浏览商品。

范围：
- 类目
- 地域分类
- 标签
- SPU/SKU
- 套装 SKU
- 商品图片
- 图文详情
- 多语言标题/描述/SEO
- HS Code、材质、原产地、重量、体积
- 供应商
- 采购单
- 入库批次
- 质检
- 采购成本

验收：
- 后台创建商品、SKU、分类、地域、供应商、批次库存。
- 前台商品列表、分类页、地域页、详情页展示真实数据。
- 买家侧内容至少支持中文和英文。

### 阶段 4：库存核心

目标：库存可预留、确认扣减、释放，不超卖。

范围：
- `inventory-service` 独立库
- 多仓模型
- 批次库存
- 安全库存
- 锁定库存
- 预售库存
- 库存流水
- 库存 TCC
- Redis Lua 原子预留
- 套装 SKU dependency index
- `inventory_version`

验收：
- 并发下单不超卖。
- 订单失败库存释放。
- 支付成功库存确认扣减。
- 套装 SKU 可售量正确。

### 阶段 5：购物车、结账、订单

目标：跑通商品到订单的核心链路。

范围：
- Guest Cart
- 注册用户购物车
- 登录后购物车合并
- 地址管理
- 运费占位
- 税费占位
- 订单创建
- 订单行快照
- 价格、币种、汇率、库存版本快照
- 订单状态机
- Outbox/Inbox
- Saga/TCC 框架
- DLQ

验收：
- 前台可加购、结账、生成订单。
- 重复提交不重复建单。
- 失败可补偿。
- 用户中心可查看订单。

### 阶段 6：Mock 支付闭环

目标：不接真实支付，先验证支付架构。

范围：
- `IPaymentProvider`
- Mock Payment Provider
- 创建支付
- 支付 webhook
- webhook 验签模拟
- 支付成功确认订单
- 库存确认扣减
- 支付失败释放库存
- DLQ 重试

验收：
- Mock webhook 成功后订单变 `paid`。
- 库存确认扣减。
- Mock webhook 失败后订单状态和库存预留可回滚。
- 重复 webhook 不重复扣库存。

### 阶段 7：后台运营基础

目标：客户可以通过后台运营站点。

范围：
- Dashboard
- 商品管理
- SKU 管理
- 库存管理
- 订单管理
- 支付记录
- DLQ 管理
- 审计日志
- 基础系统设置
- 品牌、Logo、语言、币种配置
- 邮箱配置
- 客服配置

验收：
- 不用改代码即可维护商品、库存、订单和基础配置。
- 后台默认中文。
- 结构化字段优先使用选择、排序、开关、上传控件。

### 阶段 8：前台商城体验

目标：形成可演示、可测试的完整前台。

范围：
- 首页
- 分类页
- 地域页
- 搜索页
- 商品详情页
- 购物车
- 结账页
- 支付结果页
- 订单详情
- 用户中心
- 多语言
- 多币种展示
- 在线客服入口
- 手机、iPad、电脑响应式

验收：
- 用户可完整完成浏览、搜索、加购、结账、查看订单。
- 所有买家侧页面中英文可切换。
- 关键页面通过移动端和桌面端截图验收。

### 阶段 9：OpenDesign 主题系统

目标：形成可复制建站的主题能力。

范围：
- `theme-system`
- theme tokens
- Tailwind token mapping
- 首页模块配置
- 商品卡样式配置
- 品牌色、字体、Logo
- OpenDesign pack 参考规范
- 默认欧美极简主题
- 视觉验收脚本

规则：
- OpenDesign 作为设计规范和主题参考，不直接复制第三方品牌资产。
- 第一版不强依赖桌面 OpenDesign 自动生成，先做可控的 theme token 系统。

验收：
- 后台可切换主题配置。
- 前台视觉统一。
- 不复制第三方素材、Logo、文案。

### 阶段 10：真实支付与跨境交易

目标：接入真实沙箱支付和跨境规则。

范围：
- Airwallex provider
- LianLian provider
- PayPal provider
- Stripe provider 预留
- 本地支付 provider 预留
- FX provider
- Tax provider
- 订单汇率快照
- 税费快照
- 支付 webhook
- 退款
- 部分退款
- 拒付事件

规则：
- 支付、税费、汇率都必须 provider 插件化。
- 后端调用支付 API 强制 IPv4 出站。
- 金额使用整数最小货币单位。
- 税率、汇率、provider 逻辑不得硬编码。

验收：
- 沙箱支付、退款、重复 webhook、金额篡改、币种不一致测试通过。

### 阶段 11：物流、履约、售后

目标：订单可发货、可追踪、可售后。

范围：
- 物流 provider
- Mock Logistics
- AfterShip/EasyPost
- DHL/FedEx/UPS 预留
- 多仓履约
- 拆单/合单
- 头程/尾程模型
- 退货
- 换货
- Keep Item
- 售后凭证
- 质检
- 库存返还
- 退款 Saga

验收：
- 订单可发货、查物流、申请售后、退款或重发。
- 易碎品支持仅退款不退货策略。

### 阶段 12：营销、风控、财务台账

目标：进入商用运营能力。

范围：
- 优惠券
- 满减
- 折扣排序
- 礼品卡
- 捆绑销售
- 预售名额
- Promotion TCC
- Risk provider
- 黑名单
- 高危订单 hold
- Chargeback Saga
- Ledger
- 对账报表
- 汇兑损益
- 渠道手续费

验收：
- 优惠不超发。
- 高危订单拦截。
- ledger 可对账。
- 拒付事件能触发逆向 Saga。

### 阶段 13：报表、内容、通知、SEO

目标：提升运营和增长能力。

范围：
- Blog
- Guide
- FAQ
- 政策页
- 商品评价
- Q&A
- 邮件通知
- 弃单召回
- GA4/GTM
- S3 + Glue + Athena
- 预聚合报表
- sitemap
- hreflang
- structured data

验收：
- 内容可管理。
- 邮件可发送。
- 报表不压业务主库。
- SEO 基础完整。

### 阶段 14：服务器部署与交付

目标：从本地迁移到服务器。

范围：
- staging 环境
- production 环境
- Cloudflare
- HTTPS
- ECS/Fargate 或单机 Docker Compose
- RDS/Redis/OpenSearch
- Secrets Manager
- 备份恢复
- 灰度/蓝绿
- Runbook
- 客户部署文档
- 运维文档
- 上线 checklist

验收：
- 服务器环境可部署。
- 真实域名可访问。
- 沙箱支付和物流通过。
- 客户能按文档配置自己的商品、支付、物流、邮箱和品牌。

### 阶段 15：严苛验收

目标：达到可复制交付标准。

范围：
- 并发库存压测
- 支付 webhook 重放测试
- Saga 补偿测试
- DLQ 人工重试测试
- PII 泄露扫描
- secret scanning
- 单店铺部署隔离检查
- 视觉截图验收
- 移动端验收
- Restore Test
- provider 熔断演练

验收：
- 无超卖。
- 无支付丢单。
- 无明文 PII 泄露。
- 无密钥入库。
- 可备份恢复。
- 本地和服务器部署文档完整。

## 微服务拆分计划

所有微服务必须遵守：

- 前台展示：服务负责的数据必须能被前台读取并正确展示。
- 后台支撑：服务负责的数据必须有后台维护入口。
- 选择优先：结构化字段必须后台可维护，并在后台以选择控件使用。
- 多语言：买家可见内容必须有中英文结构，并保留扩展更多语言的能力。
- 可交付：不能依赖开发者改源码才能让客户维护日常业务。
- 可复制部署：客户私有配置走环境变量、后台设置或密钥管理，不写死源码。
- 上下文：使用 `StoreContext / DeploymentContext`，不使用运行时多租户 `TenantContext`。

### 1. `store-service`

负责：
- 店铺基础配置
- 语言、币种、站点名称、Logo
- 首页模块配置
- SEO 基础配置
- 客服入口配置
- 隐私条款、Terms、售后政策链接

后台：
- 站点设置
- 首页模块排序
- 客服联系方式
- SEO 标题和描述

前台：
- 首页从 store-service 读取模块显示规则
- Header、Footer、客服入口从配置读取

验收：
- 后台修改站点名，前台刷新后变化
- 中英文配置可分别维护

### 2. `catalog-service`

负责：
- 商品
- SKU
- 商品分类
- 地域分类
- 标签
- 商品详情图文
- 规格参数
- HS Code
- 材质、产地、容量、釉色
- 上架/下架

数据库重点表：
- `products`
- `product_translations`
- `skus`
- `categories`
- `category_translations`
- `regions`
- `region_translations`
- `product_story_blocks`
- `product_assets`
- `product_attributes`

后台：
- 商品 CRUD
- 分类 CRUD
- 地域 CRUD
- 图文详情维护
- 商品上下架
- 商品绑定分类、地域、标签

前台：
- 首页商品
- 分类页
- 地域页
- 商品详情页
- 搜索提示数据源

验收：
- 后台新增分类，前台分类入口可看到
- 后台新增地域，主页可按配置显示
- 后台修改商品详情图文，前台商品页展示
- 下架商品前台不可访问或显示下架状态

### 3. `media-service`

负责：
- 图片上传
- 自动压缩
- WebP / AVIF
- 多尺寸图
- 对象存储上传
- Cloudflare R2 商品图
- S3 售后附件

后台：
- 商品主图上传
- 商品详情图上传
- 地域图上传
- 分类图上传

接口：
- `POST /media/images`
- `POST /media/files`
- `GET /media/:id`

处理要求：
- 原图不直接给前台用
- 生成移动端、平板、桌面多尺寸
- 返回 `assetId` 和 CDN URL

验收：
- 上传大图后自动压缩
- 前台使用 CDN URL
- 后台能预览图片

### 4. `inventory-service`

负责：
- SKU 库存
- 多仓库存
- 安全库存
- 预售库存
- 库存预留
- 库存释放
- 套装 SKU 可售量

数据库重点表：
- `warehouses`
- `inventory_items`
- `inventory_reservations`
- `inventory_movements`
- `bundle_components`

规则：
- 扣库存必须幂等
- 下单先预留库存
- 支付失败释放库存
- 支付成功确认扣减
- Redis 锁必须有持久化和兜底

验收：
- 加购不能超过库存
- 下单并发不超卖
- 支付失败库存释放

### 5. `pricing-service`

负责：
- 价格
- 多币种
- 汇率
- 订单价格快照
- 原价、折扣价、会员价

数据库重点表：
- `prices`
- `exchange_rates`
- `price_snapshots`

规则：
- 金额用整数最小单位存储
- 下单瞬间快照币种和汇率
- 前台只展示，汇率由后端控制

验收：
- 商品支持 USD/EUR/GBP
- 下单后价格不受汇率变化影响

### 6. `promotion-service`

负责：
- 折扣码
- 满减
- 百分比折扣
- 固定金额折扣
- 活动排序
- 适用分类/商品
- 优惠占用和释放

数据库重点表：
- `promotions`
- `promotion_translations`
- `promotion_rules`
- `coupon_redemptions`

验收：
- 后台新增折扣，前台商品展示原价划线和折扣价
- 优惠码可在购物车/结算使用
- 优惠不可超发

### 7. `cart-service`

负责：
- 服务端购物车
- 游客购物车
- 登录后合并购物车
- 数量修改
- 删除商品
- 库存校验
- 优惠码应用

当前替换点：
- 替换前台 localStorage cart

验收：
- 未登录可加购
- 登录后购物车合并
- 跨设备登录后购物车一致

### 8. `order-service`

负责：
- 创建订单
- 订单行快照
- 订单状态
- 订单历史
- 取消订单
- 超时关单
- Saga 编排

数据库重点表：
- `orders`
- `order_lines`
- `order_status_events`
- `order_address_snapshots`
- `order_price_snapshots`

规则：
- 创建订单必须有幂等键
- 订单行保存商品名、SKU、价格、币种、汇率、库存版本快照
- 不依赖商品后续改名改价

验收：
- 结算页提交后创建真实订单
- 用户中心看到订单
- 订单状态可流转

### 9. `payment-service`

负责：
- Stripe
- PayPal
- Airwallex / 连连
- 支付意图
- Webhook
- 退款
- 支付失败重试
- Provider 熔断和降级

接口模式：
- `IPaymentProvider`
- 每个支付渠道独立插件
- 不允许把渠道逻辑硬编码在业务流程里

规则：
- 后端调用支付 API 强制 IPv4 出站
- Webhook 验签
- 幂等处理
- DLQ 人工重试

验收：
- 支付成功订单变已支付
- 支付失败订单保持待支付或失败
- Webhook 重放不重复改状态

### 10. `tax-service`

可独立，也可先并入 `pricing-service`。

负责：
- VAT
- IOSS
- Sales Tax
- 关税估算
- HS Code 税费
- 税费快照

规则：
- 税率不可硬编码
- 税费 Provider 插件化
- 订单保存税费快照

验收：
- 不同国家地址返回不同税费
- 订单保存税费明细

### 11. `logistics-service`

负责：
- 物流商配置
- 运费试算
- 面单
- 物流追踪
- 国内仓、海外仓
- 拆单、合单

数据库重点表：
- `shipping_methods`
- `shipping_rates`
- `shipments`
- `tracking_events`

验收：
- 结算页可返回运费
- 发货后用户中心可查物流
- 物流 API 失败进入 DLQ

### 12. `aftersales-service`

负责：
- 退款
- 退货
- 换货
- 仅退款不退货
- 售后凭证
- 质检
- 逆向物流

验收：
- 用户中心可申请售后
- 后台可审核
- 退款触发 payment-service
- 退货入库触发 inventory-service

### 13. `support-service`

负责：
- 在线客服入口
- 工单
- 买家留言
- 售后沟通

验收：
- 前台可提交工单
- 后台可回复
- 邮件通知可触发

### 14. `notification-service`

负责：
- 注册邮件
- 重置密码邮件
- 订单邮件
- 支付邮件
- 物流提醒
- 售后邮件
- 弃单召回

Provider：
- SMTP
- Amazon SES
- SendGrid

验收：
- 邮件模板后台可维护
- 邮件发送失败进入 DLQ
- DKIM/SPF/DMARC 文档齐全

### 15. `risk-service`

负责：
- IP 风险
- 支付失败次数
- 黑名单地址
- 收货/账单地址异地
- 拒付事件
- 高危订单拦截发货

验收：
- 高危订单自动标记
- 后台能人工放行或拒绝

### 16. `search-service`

负责：
- 商品搜索
- 搜索建议
- 分类筛选
- 地域筛选
- 销量排序
- 中文茶具术语分词

可选技术：
- Meilisearch
- OpenSearch

验收：
- 搜索提示来自搜索索引
- 后台商品修改后索引更新

### 17. `analytics-service`

负责：
- 销售报表
- 转化漏斗
- 库存周转
- 退款率
- 复购率
- LTV

规则：
- 不在业务主库跑复杂报表
- 后续用 CDC / S3 / Athena 或独立 reporting DB

验收：
- 后台报表不影响下单性能

### 18. `supplier-service`

负责：
- 供应商
- 采购单
- 入库批次
- 采购成本
- 质检
- 残次品

验收：
- 商品可追溯供应商和批次
- 售后可关联批次成本

### 19. `admin-gateway`

负责：
- 后台统一入口
- 后台鉴权
- 聚合各微服务
- 避免后台直接调用每个服务

验收：
- 后台所有保存都走 admin-gateway

### 20. `api-gateway`

负责：
- 前台统一 API
- 限流
- 鉴权
- 聚合商品、价格、库存、促销

验收：
- 前台不直连内部微服务

### 21. `worker-service`

负责：
- Outbox
- Inbox
- DLQ
- 邮件发送
- Webhook 处理
- 物流同步
- 人工重试

验收：
- 失败任务可查、可重试、可人工处理

## 推荐开发节奏

### 当前阶段：页面壳和交互闭环

状态：基本完成。

已完成：
- 前台页面和基础交互
- 后台基础维护页面
- 本地购物车
- 模拟结算
- 搜索提示
- 响应式测试

### 第二步：基础资料真实落库

优先做：
1. `catalog-service`
2. `media-service`
3. `admin-gateway`
4. 前台读取 catalog API

目标：
- 商品、分类、地域、图文详情、图片不再写死
- 后台保存后前台展示
- 图片上传压缩后进入对象存储

### 第三步：库存、价格、购物车

优先做：
1. `inventory-service`
2. `pricing-service`
3. `promotion-service`
4. `cart-service`

目标：
- 购物车不再 localStorage 为主
- 商品库存真实校验
- 折扣价从后端计算
- 多币种价格可控

当前进展：
- `inventory-service` 已完成 TCC 基础接口：try 预留、confirm 扣减、cancel 释放。
- `inventory-service` 已提供 `GET /inventory/items` 库存快照，后台库存管理已接入该接口。
- `order-service` 创建 Mock 订单前已调用库存 try，并把 `inventory_version` 快照写入订单行。
- Mock 支付成功/失败事件已接回 `order-service`，分别触发库存 confirm/cancel；后台订单详情和 Mock 支付确认/取消操作已有第一版；后台库存预留流水和人工释放 reserved 预留已有第一版。

### 第四步：真实订单

优先做：
1. `order-service`
2. `worker-service`

目标：
- 结算页创建真实订单
- 订单行快照
- Saga 状态机
- 用户中心显示真实订单

当前进展：
- `order-service` 已支持服务端 Mock 订单边界、幂等 key、库存预留、PostgreSQL 优先落库、内存显式降级和 Mock Payment Provider 创建。
- `order-service` 已提供 `GET /orders` 最新订单列表，后台订单管理已接入该接口。
- `order-service` 已提供 `GET /orders/:id` 订单详情，后台订单管理已接入详情区和 Mock 支付确认/取消按钮。
- `inventory-service` 已提供 `GET /inventory/reservations` 和 `POST /inventory/reservations/:id/release`，后台库存管理已接入预留流水和人工释放按钮。
- DLQ 人工重试/作废审计日志已有第一版，`dead_letter_audit_events` 已进入迁移和初始化脚本，后台死信队列会展示最近审计记录。
- 后台异常订单人工补偿、订单操作审计、库存操作审计还未完成。

### 第五步：支付

优先做：
1. `payment-service`
2. Provider 插件
3. Webhook

目标：
- Stripe / PayPal / Airwallex 至少跑通一个沙箱
- 支付成功更新订单
- 支付失败可恢复

### 第六步：物流、售后、客服、通知

优先做：
1. `logistics-service`
2. `aftersales-service`
3. `support-service`
4. `notification-service`

目标：
- 运费试算
- 发货追踪
- 售后申请
- 邮件通知

### 第七步：风控、搜索、报表、采购

优先做：
1. `risk-service`
2. `search-service`
3. `analytics-service`
4. `supplier-service`

目标：
- 风控拦截
- 搜索索引
- 报表
- 采购入库批次

## Definition of Done

任意功能没有满足以下条件，不算完成：

- 有明确微服务归属
- 有数据库迁移或明确说明无需迁移
- 有 API 契约
- 有后台维护入口
- 有前台联动
- 有空状态
- 有错误状态
- 有移动端样式
- 有桌面端样式
- 有测试
- typecheck 通过
- e2e 通过
- 没有假保存、假上传、假支付未说明

## 下一步建议任务

从这里开始：

```text
请继续补 P0 生产缺口。
优先顺序：订单异常人工补偿 -> 库存操作审计/盘点/告警 -> PostgreSQL/Redis/Worker 故障演练 -> media-service catalog 绑定补偿 -> 统一业务错误码。
每次改完必须更新 `docs/production-gap-register.md` 和 `docs/local-acceptance-checklist.md`，并运行 typecheck/e2e。
```
