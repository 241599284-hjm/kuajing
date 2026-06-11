# Catalog + Media Contract

本文件是第二阶段 `catalog-service + media-service` 的执行契约。项目是单店铺独立部署，不使用 `tenant_id`，所有上下文使用 `StoreContext / DeploymentContext`。

## 数据库 Schema

权威迁移文件：

- `infra/db/migrations/005-catalog-storefront-content.sql`
- `infra/db/migrations/006-product-detail-media-performance.sql`

核心表：

- `categories`：商品分类，含 `slug`、图片、启停、排序。
- `category_translations`：分类中英文名称。
- `regions`：地域分类，含地标图、矢量图标类型、首页展示开关、排序。
- `region_translations`：地域中英文名称、地标、标题、介绍、more 文案。
- `products`：商品主表，扩展 `category_id`、`region_id`、主图、原价、本月销量、库存展示、累计销量。
- `product_translations`：商品中英文标题、标签、短描述、长描述、亮点、材质、容量、产地、HS Code。
- `product_story_blocks`：商品详情图文块，按商品、语言、排序维护。
- `product_assets`：商品图片资源，为后续 `media-service` 上传和多尺寸图片预留。

商品详情媒体字段要求：

- `product_story_blocks.media_kind`：`image | gif | video`。
- `product_story_blocks.image_url`：媒体源 URL，只允许 URL，不允许 base64 或二进制内容。
- `product_story_blocks.poster_url`：视频或 GIF 的静态封面图。
- `product_story_blocks.width` / `height`：用于前台固定比例，减少页面滑动跳动。
- `product_story_blocks.mime_type` / `byte_size` / `duration_seconds`：用于前台轻量渲染、后台校验和性能治理。
- `product_assets.variants` / `responsive_sources`：保存移动端、平板、桌面、原图、多格式地址，前台按屏幕加载合适资源。

## OpenAPI 契约

### `catalog-service`

`GET /health`

返回：

```json
{ "service": "catalog-service", "status": "ok" }
```

`GET /ready`

用途：业务就绪检查，区分进程存活和依赖可用。

规则：

- PostgreSQL 必须可用，否则返回 503。
- Redis 是 catalog 读取优化，不是强依赖；Redis 不可用时返回 `degraded`，读请求继续走 PostgreSQL。
- 网关后续可以根据 `/ready` 做熔断和运维告警。

返回：

```json
{
  "service": "catalog-service",
  "status": "ready",
  "dependencies": {
    "postgres": "ok",
    "redis": "ok"
  },
  "cacheRequired": false
}
```

`GET /storefront`

用途：前台商城一次性读取商品、分类、地域快照。

缓存要求：

- `catalog-service` 使用 Redis 缓存 storefront 快照。
- 缓存 key 必须包含 store scope，例如 `store:{storeId}:catalog:storefront:v2`；配置 `CACHE_KEY_PREFIX` 时还必须包含环境前缀。
- 缓存按维度拆分：`catalog:storefront:v2`、`catalog:categories:v1`、`catalog:regions:v1`、`catalog:product-summaries:v1`、`catalog:storefront-products:v2`。
- TTL 必须带随机偏移，避免大量 key 同时失效。
- Redis 不可用时降级读 PostgreSQL，不得让缓存故障拖垮 catalog。
- 后台写商品、分类、地域时必须先提交 PostgreSQL，再删除对应维度缓存和 storefront 聚合缓存。
- 空结果也允许短 TTL 缓存，防止恶意不存在 slug 穿透 DB。
- 静态兜底数据只允许本地开发演示，生产和客户交付环境不得作为业务数据源；兜底数据不得写入 Redis。

返回：

```json
{
  "storeId": "00000000-0000-4000-8000-000000000001",
  "generatedAt": "2026-06-10T00:00:00.000Z",
  "categories": [],
  "regions": [],
  "products": []
}
```

`GET /categories`

返回 `CatalogCategory[]`。

`GET /regions`

返回 `CatalogRegion[]`。

`GET /products`

兼容旧接口，返回 `CatalogProductSummary[]`。

### `api-gateway`

前台只允许调用网关：

- `GET /catalog/storefront`
- `GET /catalog/ready`
- `GET /catalog/categories`
- `GET /catalog/regions`
- `GET /catalog/products`

网关必须透传：

- `x-correlation-id`
- `accept-language`
- `x-client-type`
- `authorization`
- `idempotency-key`
- `x-idempotency-key`
- `user-agent`

### `admin-gateway`

后台只允许调用后台网关：

- `GET /catalog/storefront`
- `GET /catalog/ready`
- `GET /catalog/categories`
- `GET /catalog/regions`
- `GET /catalog/products`

后续保存接口必须从 `admin-gateway` 进入，再转发到 `catalog-service`，后台不得直连数据库。

写入语义：

- `PUT /categories`、`PUT /regions`、`PUT /products` 当前按批量全量字段校验处理；未修改字段必须由后台原样回传。
- 后续如果增加 `PATCH`，必须单独定义补丁契约，不能和 `PUT` 混用。
- HS Code、材质、原产地、容量、双语字段、状态、排序、媒体 sort order 属于核心字段，不得在后台隐藏成不可维护字段。
- 后台写入失败必须显示明确失败状态，不允许展示“已保存”。
- 写接口后续必须加入 `idempotency_key/request_id` 幂等校验，不能只接收字段不落库或不查重。

### `media-service`

当前已建立服务边界：

- `GET /health`
- `POST /media/product-assets`
- `GET /files/:storeId/:scope/:kind/:yyyyMm/:fileName` for local development provider

`POST /media/product-assets` 当前第一版已实现：

- multipart field: `file`
- allowed public media types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`
- validates MIME and file signature; mismatch fails.
- default max size: `MEDIA_MAX_UPLOAD_BYTES=8388608`.
- stores to `OBJECT_STORAGE_PROVIDER=local|minio`.
- `minio` provider is S3/R2-compatible through MinIO SDK and requires endpoint, access key, secret, bucket, and CDN URL.
- response contains `assetId`, `storeId`, `provider`, `kind`, `objectKey`, `url`, `originalName`, `mimeType`, `byteSize`, `width`, `height`.

后续生产完善仍必须满足：

- 商品图片走 R2/MinIO 兼容对象存储。
- 售后私有附件走 S3/R2 signed URL。
- 商品详情图片必须生成移动端、平板、桌面多尺寸版本。
- GIF 可以作为源文件保存，但优先生成 MP4/WebM 短视频变体和 poster，前台避免大 GIF 首屏阻塞。
- 短视频必须返回 poster、duration、mime type、byte size，前台只允许 `preload="metadata"`。
- 商品详情 JSON 只能保存 URL 和轻量元数据，不允许保存 base64、HTML 大字段或二进制。
- 商品主图和详情图必须有中英文 alt 文本来源。
- 媒体上传接口必须校验 MIME 和文件头；产品公开媒体仅允许 jpg、png、webp、gif、mp4，禁止 svg、html、xml 和可执行内容。
- media-service 启用上传时必须在启动阶段校验对象存储 endpoint、bucket、CDN 域名和凭据，配置缺失必须明确失败。
- 不允许前台或后台假上传。

## 后台保存流程

后续后台保存必须走：

```text
apps/admin
  -> admin-gateway
  -> catalog-service
  -> PostgreSQL app_db
```

商品图片流程：

```text
apps/admin 本地压缩预览
  -> media-service
  -> MinIO/R2/S3
  -> assetId/CDN URL
  -> catalog-service 绑定 product_assets/product_story_blocks
```

上传后清理要求：

- 替换图片时先保存新资源并绑定，再异步清理无引用旧资源。
- 删除商品或图文块时不得立即物理删除共享资源，必须依据引用计数或孤儿资源清理任务处理。
- 上传成功但 catalog 绑定失败时，TCC/Saga 必须删除或隔离已上传对象。
- 多张详情图必须使用 `sort_order` 保存和渲染顺序，前台不得按 URL 或上传完成时间猜顺序。
- 商品公开图与售后私密附件必须分桶或分权限策略管理。
- 对象存储 Endpoint、Bucket、CDN 域名必须来自环境变量或后台配置，禁止硬编码客户环境。

## 前台读取流程

后续前台读取必须走：

```text
apps/storefront
  -> api-gateway GET /catalog/storefront
  -> catalog-service GET /storefront
  -> PostgreSQL app_db
```

开发环境如果 PostgreSQL 未启动，可以临时使用 `storefront-content.ts` 作为兜底演示数据；生产和交付环境不得依赖该兜底作为业务数据来源。

## 商品详情性能契约

- 首屏主图可以 eager 加载，详情图文块必须 lazy 加载。
- 详情页视频必须使用 poster，并只预加载 metadata。
- 图文块必须有 width/height 或固定 aspect ratio，避免移动端滑动时布局跳动。
- 长详情页块级内容使用延迟渲染策略，屏幕外内容不得阻塞首屏。
- 后台上传原图后，前台不得直接使用原图作为列表图或移动端详情图。
- 前台搜索、列表、分类页和地域页必须分页或分批加载，禁止商品多时一次性全量渲染。
- 图片加载失败必须保留版面并显示可访问 alt 文本，不得撑破布局。

## 测试清单

- `catalog-service` typecheck 通过。
- `api-gateway` typecheck 通过。
- `admin-gateway` typecheck 通过。
- `media-service` typecheck 通过。
- fresh Docker PostgreSQL 初始化后存在 catalog 新表。
- `GET /catalog/storefront` 返回分类、地域、商品、图文详情。
- Redis 启动时，`GET /catalog/storefront` 命中缓存；后台修改商品、分类、地域后缓存被删除并重新生成。
- 后台新增/修改分类后，前台分类入口可更新。
- 后台新增/修改地域后，首页地域模块可更新。
- 后台新增/修改商品图文后，商品详情页可更新。
- 商品详情页大图、GIF、短视频不会一次性全部 eager 加载。
- 商品详情媒体 JSON 不包含 base64 或二进制内容。
- 商品买家侧内容必须至少包含 `en` 和 `zh`。
- HS Code、材质、原产地缺失时商品不得进入可上架状态。
