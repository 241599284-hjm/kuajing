# Local Acceptance Checklist

This checklist defines the minimum standard for the first local engineering foundation.

## Environment

- [ ] `pnpm install` succeeds.
- [ ] `pnpm typecheck` succeeds.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm docker:up` starts local dependencies.
- [ ] `docker compose --profile app up -d --build` starts the full local application stack.
- [ ] `docker compose --profile observability up -d` starts Loki and Grafana.
- [ ] `.\scripts\init-private-deployment.ps1` can initialize a fresh checkout without source edits.
- [ ] PostgreSQL creates `app_db`, `order_db`, `inventory_db`, and `ledger_db`.
- [ ] Redis health check passes.
- [ ] OpenSearch health check passes.
- [ ] MinIO health check passes.
- [ ] Mailpit web UI opens.
- [ ] Grafana opens on `http://localhost:3002` and includes a Loki datasource.

## Apps

- [ ] Storefront opens on `http://localhost:3000`.
- [ ] Admin opens on `http://localhost:3001`.
- [ ] Storefront includes a responsive support entry.
- [ ] Admin includes a Support module entry.
- [ ] Storefront pages follow `docs/premium-minimal-visual-system.md`.
- [ ] Admin pages follow the shared admin layout, form, button, card, and status patterns.
- [ ] New pages choose a template from `docs/module-visual-templates.md` before implementation.
- [ ] Mobile, tablet, and desktop screenshots show no horizontal overflow or overlapping text.

## Services

- [ ] API Gateway health check returns `ok`.
- [ ] Admin Gateway health check returns `ok`.
- [ ] Store service health check returns `ok`.
- [ ] Auth service health check returns `ok`.
- [ ] Catalog service health check returns `ok`.
- [ ] Catalog service readiness checks PostgreSQL and reports Redis as `ready` or `degraded`.
- [ ] API/Admin gateways expose `/catalog/ready`.
- [ ] Inventory service health check returns `ok`.
- [ ] Order service health check returns `ok`.
- [ ] Payment service health check returns `ok`.
- [ ] Support service health check returns `ok`.
- [ ] Media service health check returns `ok`.
- [ ] Media service accepts a real multipart product image upload and returns URL, object key, MIME, byte size, and dimensions.
- [ ] Media service rejects disallowed media by MIME/file-signature validation instead of trusting file extension.
- [ ] Worker service health check returns `ok`.
- [ ] Worker service exposes DLQ list, retry, and discard endpoints through Admin Gateway.

## Guardrails

- [ ] Store check resolves the deployment default store without requiring a public store header.
- [ ] Money package rejects non-integer minor units.
- [ ] Provider contracts expose mockable payment, logistics, tax, FX, and risk interfaces.
- [ ] PII helper redacts email, phone, and address fields.
- [ ] Catalog storefront reads use Redis cache when Redis is available.
- [ ] Catalog writes delete storefront cache after PostgreSQL commit.
- [ ] API/Admin gateways forward correlation, language, client type, auth, idempotency, and user-agent headers.
- [ ] A request correlation ID can be searched across service logs in Loki/Grafana.
- [ ] Product detail story media uses URL metadata only, not base64 or binary JSON payloads.
- [ ] Admin product image upload calls `admin-gateway -> media-service` and stores the returned URL in the product form.
- [ ] Admin product form exposes HS Code, material, origin, origin country, capacity, package dimensions, weight, and customs declaration.
- [ ] Admin category, region, and product pages initialize from `admin-gateway -> catalog-service` real APIs, with static fallback only when the API is unavailable.
- [ ] Admin product initialization includes inactive/draft products and cross-border fields, not only active storefront product summaries.
- [ ] `catalog-service PUT /products` rejects missing cross-border required fields instead of replacing them with temporary defaults.
- [ ] Product detail below-fold images lazy-load and videos preload metadata only.
- [ ] Growable storefront/admin lists have pagination rules before production use.
- [ ] Admin write failures are shown as explicit failure states, not fake success states.
- [ ] TCC confirm/cancel failures enqueue a durable compensation task instead of depending on one synchronous HTTP call.
- [ ] Compensation tasks exceeding retries enter DLQ with retry/discard/handler/decision-note requirements.
- [ ] Admin DLQ page shows failure count, last error summary, correlation ID, retry, discard, and decision note.
- [ ] Admin DLQ retry/discard writes `dead_letter_audit_events` and the DLQ page shows recent audit records.
- [ ] Admin order list shows red exception labels for `compensating` / `compensation_pending` orders and exposes the latest failure reason.
- [ ] Admin order detail reads `admin-gateway -> order-service /orders/:id` and displays order line snapshots, inventory versions, and reservation keys.
- [ ] Admin Mock payment confirm/cancel actions call `admin-gateway -> order-service` and never show fake success when the API fails.
- [ ] Admin inventory list shows human-readable stock fields: available, reserved, locked, sellable, and safety stock.
- [ ] Admin inventory reservation ledger reads `admin-gateway -> inventory-service /inventory/reservations` and shows reservation status, quantity, order, SKU, warehouse, and idempotency key.
- [ ] Admin manual reservation release calls `admin-gateway -> inventory-service /inventory/reservations/:id/release` and refuses to fake success when the API fails.
- [ ] Slow request logs emit structured `slow_request` records for order create > 2s, inventory reserve > 1s, and catalog reads > 500ms or configured thresholds.
- [ ] Mock payment webhook `paid` confirms inventory and marks the order paid.
- [ ] Mock payment webhook `cancelled` releases inventory and marks the order cancelled.
- [ ] Replayed `paid` webhooks do not confirm inventory twice.
- [ ] Invalid order transitions, such as paid -> cancelled from a late payment callback, are rejected.
- [ ] `daily_reconciliation` exists in the ledger database for future order/payment/inventory reconciliation jobs.
- [ ] Fresh init SQL creates `compensation_tasks` and `dead_letter_tasks`, not only later migrations.
- [ ] `docs/production-gap-register.md` is reviewed before declaring a customer-ready build.
- [ ] New UI work reuses shared primitives instead of creating page-specific visual systems.
- [ ] No real payment, logistics, tax, cloud, or email secret exists in local files.

## First mainline to build next

后台创建商品 -> 创建 SKU -> 录入库存 -> 前台浏览 -> 加购物车 -> Guest Checkout -> 创建订单 -> 库存预留 -> Mock 支付 webhook -> 订单 paid -> 库存确认扣减 -> 后台可查订单和库存流水。

## Cloud handoff rule

- [ ] Before cloud deployment, PostgreSQL must move to RDS or equivalent managed database.
- [ ] Before cloud deployment, Redis must move to managed Redis.
- [ ] Before cloud deployment, object storage must move to R2/S3/OSS or equivalent.
- [ ] Kubernetes/Helm work must not start until the Compose business loop, compensation retry loop, centralized logs, and backup/restore path are proven.
