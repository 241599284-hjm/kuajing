# 茶具跨境独立站上下文压缩版

新开对话时优先粘贴这份摘要，必要时再让 agent 读取 `$茶具站继续开发.md` 和 `docs/dollar-teaware-continuation-plan.md`。

## 项目定位

- 路径：`D:\crossborder-commerce-kit`
- 前台：`http://localhost:3000`
- 后台：`http://localhost:3001`
- 自营跨境茶具独立站底座。
- 单个部署实例没有租户概念，不做 `tenant-service`，不做 `tenant_id`。
- 可复制交付方式：同一套源码给不同客户独立部署，每个客户独立域名、数据库、缓存、对象存储、密钥和后台配置。
- 前台面向海外买家，中英文双语，欧美极简精品电商风。
- 后台面向中文运营人员，默认中文。

## 技术栈

- pnpm monorepo
- Next.js storefront
- Next.js admin
- NestJS 微服务
- PostgreSQL
- Redis
- Docker Compose 本地底座
- Playwright e2e

## 当前硬规则

- 后续所有模块必须先查 `docs/module-visual-templates.md` 的“模块到模板映射表”。
- 全站视觉遵守 `docs/premium-minimal-visual-system.md`。
- 前台不能长期写死商品、分类、地域、详情图文、SEO、媒体资源，必须走 catalog/media 动态接口。
- 后台能维护的业务字段都要后台维护。
- 买家侧内容必须中英文。
- PC、iPad、手机都要响应式验收。
- 一个业务模块一个微服务边界。
- 支付、物流、税费、汇率、风控必须 Provider 插件化。
- 金额、库存、数量必须使用整数最小单位或固定精度规则。
- 时间统一 UTC。
- Saga/TCC 补偿必须真实改数据，不能只写日志。
- DLQ 必须有后台人工处理入口。
- 所有写操作失败必须显性提示，不允许假保存、假上传、假支付。
- 所有列表必须分页，不能全量返回。
- 写接口、上传、订单、退款、库存预留必须有幂等 Key。
- 后台写操作必须记录审计日志。
- 对象存储、CDN、支付、物流、汇率、税费、邮件配置不得硬编码。
- 私有化交付分三阶段：Docker Compose 先跑通本地和第一台测试服务器；上云后使用 RDS/托管 Redis/R2 或 S3 等托管状态服务；业务闭环稳定后再做 Helm。当前阶段不做裸机 K8s，不把生产数据库放进 K8s。
- 本地和测试服务器必须能用 Loki/Grafana 按 `x-correlation-id` 查跨服务日志。
- TCC confirm/cancel 失败必须进入 durable compensation task，由 worker 重试；超过次数进入 DLQ，不能只靠一次同步 HTTP。

## 已完成

- 前台首页、分类页、地域页、全部地域页、商品详情页、购物车、结账页、登录、注册、忘记密码、个人中心。
- 前台已统一到 `premium-minimal` 视觉方向：白底、细线、Serif 标题、黑色主按钮、真实产品摄影、统一 Header。
- 首页、分类、地域、商品详情、购物车、结账、个人中心共用前台 Header。
- 手机菜单左上角抽屉，分类/地域默认显示 4 个，可展开/收起。
- 分类页点击进入新页面，横向极简排序，有返回上级。
- 商品详情页显示折扣价、原价划线、本月销量、库存，并支持图文详情。
- 商品详情媒体已支持轻量模型：图片、GIF、短视频 URL 与元数据；图片 lazy load，视频 `preload="metadata"`。
- 购物车 localStorage 可用，立即购买进入结账页。
- 结账页提交已接入 `api-gateway -> order-service` 的服务端 Mock 订单接口：`POST /checkout/mock-order`，含幂等 key、订单号、Mock payment redirect；`order-service` 会先调用 `inventory-service` 预留库存，再创建订单，订单行保存 `skuId` 和 `inventory_version` 快照；`order-service` 优先写 PostgreSQL `order_db.orders/order_lines`，数据库不可用时仅在库存也为内存模式时返回 `storageMode: "memory"`；订单创建后会调用 `payment-service POST /payments/mock-intents`，返回 `paymentMode: "provider"`，支付服务不可用时显式降级为 `local-fallback`。
- 后台已有中文壳：商品、分类、地域、折扣、邮箱、外贸设置。
- 后台商品管理已补第一版跨境核心字段维护：HS Code、材质、产地、原产国代码、容量、包装尺寸、重量、海关说明。
- 后台公共组件：`apps/admin/app/components/admin-ui.tsx`。
- 后台商品、分类、地域、折扣、邮箱设置、外贸设置已迁入公共 admin-ui 组件。
- `docs/premium-minimal-visual-system.md` 已建立。
- `docs/module-visual-templates.md` 已建立并补充“模块到模板映射表”。
- 微服务目录已存在：`store-service`、`catalog-service`、`inventory-service`、`order-service`、`payment-service`、`auth-service`、`api-gateway`、`admin-gateway`、`support-service`、`media-service`。
- `catalog-service` 已有前台快照接口：`GET /storefront`、`GET /categories`、`GET /regions`。
- `catalog-service` 已有后台写入接口：`PUT /categories`、`PUT /regions`、`PUT /products`。
- `catalog-service PUT /products` 已校验并保存跨境商品字段，不再硬编码 HS Code、材质、产地和容量；`skus` 和 `product_translations` 已落地包装尺寸、重量和海关说明字段。
- `catalog-service` 已新增后台专用商品读取接口：`GET /admin/products?page=1&size=100`，返回 active/draft 商品和跨境字段；`admin-gateway` 已转发为 `/catalog/admin-products`。
- `api-gateway` / `admin-gateway` 已转发 catalog 读取与写入，并透传 trace、语言、客户端类型、鉴权、幂等头。
- `catalog-service` 已开始接 Redis 缓存，按 storefront、分类、地域、商品摘要、商品投影拆 Key；后台写入后删除缓存。
- `catalog-service` 已有 `/ready`：PostgreSQL 不可用返回 503，Redis 不可用显示 degraded。
- `inventory-service` 已实现库存 TCC HTTP 接口：`POST /reservations/try`、`POST /reservations/confirm`、`POST /reservations/cancel`；PostgreSQL 可用时锁行写 `inventory_items` / `inventory_reservations`，不可用时明确返回 `storageMode: "memory"`，并支持幂等 try、真实确认扣减、真实取消释放。
- `inventory-service` 已新增 `GET /inventory/items`，后台可读取库存快照：available、reserved、safety、sellable、inventory_version、storageMode。
- `inventory-service` 后台库存快照已新增 lockedQty，并按可用、预留、锁定、安全、可售的运营口径展示。
- `inventory-service` 已新增 `GET /inventory/reservations` 和 `POST /inventory/reservations/:id/release`，后台可读取预留流水并人工释放 reserved 预留；confirmed 预留不能被反向释放。
- `order-service` 已新增 `GET /orders`，后台可读取最新订单；PostgreSQL 不可用时只返回当前进程内存订单。
- `order-service GET /orders` 已新增异常订单摘要：isException、failureCount、lastFailureReason；后台订单列表会显示异常红标和最近失败原因。
- `order-service` 已新增 `GET /orders/:id`，后台可读取订单详情、订单行快照、库存版本快照和库存预留 key；`admin-gateway` 已转发为 `/orders/:id`。
- `admin-gateway` 已转发 `/orders` 和 `/inventory/items`。
- `worker-service` 已提供 DLQ 读取、人工重试、人工作废接口；`admin-gateway` 已转发；后台“死信队列”已从占位改为真实面板。
- `worker-service` 已新增 DLQ 操作审计轨迹：`dead_letter_audit_events` 记录 retry/discard、处理人、处理意见、状态变化、correlation ID、IP 和时间；`GET /dead-letter-tasks` 返回最近审计记录。
- 后台“订单管理”和“库存管理”已从占位改为真实面板，API 未连接时明确提示，不展示假数据。
- 后台“订单管理”已新增订单详情区和 Mock 支付确认/取消按钮；失败时显性提示，不伪造成功。异常订单人工补偿和审计日志仍未完成。
- 后台“库存管理”已新增库存预留流水区和人工释放按钮；失败时显性提示，不伪造成功。库存操作审计、盘点/调整和安全库存告警仍未完成。
- 后台“死信队列”已展示最近审计记录；仍需 PostgreSQL 故障演练验证 worker 重试和 DLQ 入库。
- `order-service`、`inventory-service`、`catalog-service` 已加入 slow_request 结构化日志，阈值来自 `.env`。
- Docker Compose 已新增 `app` profile 用于一键拉起 Node.js 应用栈，新增 `observability` profile 用于 Loki、Promtail、Grafana。
- 新增 `docs/private-deployment-runbook.md`，明确 Compose -> 托管状态服务 -> Helm 的上云交付路线。
- 新增 `infra/db/migrations/007-compensation-tasks-dlq.sql`，包含 `compensation_tasks` 和 `dead_letter_tasks`。
- `media-service` 已有第一版真实上传：`POST /media/product-assets` 接 multipart 文件，校验大小、MIME、文件头，支持 `OBJECT_STORAGE_PROVIDER=local|minio`，MinIO provider 兼容 R2/S3，返回 URL、objectKey、mime、大小、宽高等轻量元数据；`admin-gateway` 已转发；后台商品页会压缩 WebP 后上传并写入商品表单 URL。
- 后台商品、分类、地域页面已从 `admin-gateway -> catalog-service` 初始化读取真实数据；API 未连接时才显示本地演示兜底。

## 当前未完成/不能假装完成

- Docker Desktop 当前有配置错误，本地 PostgreSQL/服务完整联调受阻。
- “后台初始化读取真实 catalog 数据”已有第一版；还需要在 Docker/PostgreSQL 环境验证“后台保存 → catalog-service → PostgreSQL → Redis 精准失效 → 前台读取”的完整闭环。
- 图片压缩和第一版真实上传已接通，但还没做 catalog 绑定失败补偿、响应式多尺寸变体、GIF 转视频、视频 poster/时长提取、上传审计日志。
- 购物车仍是 localStorage，未接 `cart-service`。
- 结账已接入 `order-service` 的 Mock 订单边界，订单服务已具备库存 TCC 预留、PostgreSQL 优先落库、内存显式降级，并已通过 `payment-service` 创建 Mock payment intent；还未接支付成功 webhook 后的库存 confirm、支付失败/超时 cancel 和真实支付状态机。
- 支付方式是页面选择，未接 `payment-service`。
- 用户地址、支付方式、订单历史目前是页面结构，未接真实服务。
- 后台 DLQ 已有真实页面、人工重试/作废和审计记录；还缺 PostgreSQL 故障演练。
- 后台列表/详情/弹窗/分页 primitives 还需要继续补齐，供后续订单、库存、Provider 页面复用。
- 生产缺口登记见 `docs/production-gap-register.md`，P0 项不能在客户生产交付前遗漏。

## 下一步优先级

先不要做真实支付。下一步优先补订单、库存、后台运营的可视化闭环：

1. 后台订单管理补异常订单人工补偿入口和操作审计日志。
2. 后台库存管理补操作审计、盘点/调整、安全库存告警。
3. 修复/启动本地 PostgreSQL Docker 依赖，验证 PostgreSQL 模式下库存锁行、订单落库、worker 重试、DLQ 入库和缓存失效。
4. 后台商品管理继续补 image alt、多图排序和批量校验；跨境核心字段和真实初始化第一版已接入。
5. 完善 `media-service` 的 catalog 绑定补偿、响应式多尺寸变体、GIF 转视频、视频 poster/时长提取、上传审计日志。
6. 建立统一业务错误码和错误文案表。

## 每次改完验证

优先运行：

```bash
pnpm --filter @commerce/storefront -s typecheck
pnpm --filter @commerce/admin -s typecheck
pnpm -s typecheck
pnpm -s e2e
```

如果 Docker/PG 未恢复，API-backed 保存测试会失败，必须明确说明，不允许报假成功。

## 最近验证

- 2026-06-11：后台商品真实初始化、`catalog-service GET /admin/products`、`admin-gateway /catalog/admin-products`、后台商品初始化竞态修复已完成。
- 2026-06-11：后台订单详情、`order-service GET /orders/:id`、`admin-gateway /orders/:id`、后台 Mock 支付确认/取消操作第一版已完成。
- 2026-06-11：本轮订单详情/支付操作后，`pnpm -s typecheck` 通过，22 个包全部成功。
- 2026-06-11：本轮订单详情/支付操作后，`pnpm -s e2e` 通过，36 条 Playwright 用例全部成功。
- 2026-06-11：本轮订单详情/支付操作后，`docker compose config --quiet` 通过。
- 2026-06-11：后台库存预留流水、`inventory-service GET /inventory/reservations`、`POST /inventory/reservations/:id/release`、`admin-gateway` 转发和后台人工释放第一版已完成。
- 2026-06-11：本轮库存预留流水/人工释放后，`pnpm -s typecheck` 通过，22 个包全部成功。
- 2026-06-11：本轮库存预留流水/人工释放后，`pnpm -s e2e` 通过，36 条 Playwright 用例全部成功。
- 2026-06-11：本轮库存预留流水/人工释放后，`docker compose config --quiet` 通过。
- 2026-06-11：DLQ 人工重试/作废审计日志第一版已完成，新增 `dead_letter_audit_events` 迁移和初始化脚本，后台死信队列展示最近审计记录。
- 2026-06-11：本轮 DLQ 审计后，`pnpm -s typecheck` 通过，22 个包全部成功。
- 2026-06-11：本轮 DLQ 审计后，`pnpm -s e2e` 通过，37 条 Playwright 用例全部成功。
- 2026-06-11：本轮 DLQ 审计后，`docker compose config --quiet` 通过。
- 2026-06-11：`pnpm -s typecheck` 通过，22 个包全部成功。
- 2026-06-11：`pnpm -s e2e` 通过，36 条 Playwright 用例全部成功。
- 2026-06-11：`docker compose config --quiet` 通过。

## 关键文档

- `$茶具站继续开发.md`
- `docs/dollar-teaware-continuation-plan.md`
- `docs/premium-minimal-visual-system.md`
- `docs/module-visual-templates.md`
- `docs/catalog-media-contract.md`
- `docs/engineering-guardrails.md`
- `docs/local-acceptance-checklist.md`
