# Engineering Guardrails

## Contract first

Implementation must follow this order:

1. Database schema
2. OpenAPI contract
3. Event contract
4. Provider contract
5. Tests
6. Business implementation

All service and frontend DTOs must match the contract document and OpenAPI schema before integration. Field names, types, required flags, bilingual copy shape, media metadata, and integer minor-unit fields must be checked end to end. Adding a field in one layer without updating contracts, migrations, API mapping, admin forms, and storefront rendering is a delivery failure.

## Deployment boundary

This kit is sold as a private single-store deployment, not as a shared SaaS runtime.

Each customer deployment gets its own domain, database set, object storage buckets, secrets, payment accounts, logistics accounts, and email settings. The storefront buyer account is a customer account only.

Internal store scope fields may exist for compatibility, but they must not be exposed in customer-facing UI, admin copy, or setup docs.

Deployment evolves in three stages:

1. Docker Compose first. Local development and the first test server must use Compose to validate the business and operations loop before Kubernetes work begins.
2. Managed state services next. Cloud deployments must move PostgreSQL, Redis, object storage, secrets, and logs to managed services. Do not run production databases inside Kubernetes.
3. Helm last. Kubernetes manifests and Helm charts are introduced only after the Compose business loop, compensation retry loop, logging, and backup/restore path are proven.

## Service boundaries

- `catalog-service` does not reserve stock.
- `catalog-service` owns product bilingual content, category, region tags, listing status, base price metadata, HS Code metadata, and product search projection.
- `catalog-service` owns catalog read caching for storefront snapshots, category lists, region lists, and product listing projections. Writes must commit to PostgreSQL first, then delete affected cache keys.
- `media-service` owns product image, detail media, GIF source handling, short video poster metadata, responsive variants, object storage URLs, and media garbage collection.
- `inventory-service` does not create orders.
- `inventory-service` owns stock, reservations, warehouse availability, bundle availability, and stock release.
- `order-service` does not write inventory tables directly.
- `order-service` owns carts, checkout order state, order line snapshots, buyer-facing order history, and order lifecycle orchestration.
- `payment-service` does not mutate order core tables directly.
- `payment-service` owns provider adapters, payment attempts, refunds, webhook verification, and payment event inbox.
- `promotion-service` owns discount codes, discount amount/percent rules, coupon ordering, eligibility, campaign status, and promotion redemption reservations. It must not live inside `catalog-service` or `order-service`.
- `pricing-service` owns currency conversion, exchange-rate snapshots, tax provider contracts, and final price calculation inputs. It must not hardcode country tax rates inside app UI.
- `store-service` owns single-store deployment configuration, regional storefront settings, locale defaults, provider priority configuration, and foreign-trade settings that are not payment secrets.
- `auth-service` owns buyer registration, login, email verification, and registration email configuration until a dedicated notification service is introduced.
- `support-service` owns tickets, after-sales conversations, uploaded evidence metadata, and customer service handoff.
- Apps never connect directly to databases.
- Admin UI modules must call the service that owns the module through the admin gateway. A new admin menu item must name its backing service before implementation.
- `support-service` does not promise refunds, delivery dates, or tax outcomes without backing order data.

## Data and cache rules

- Money, stock, quantity, tax, discount, fee, and exchange snapshots must use integer minor units or fixed precision decimal rules. Floating point storage is a delivery failure.
- Persisted timestamps must be UTC. Store or buyer timezone conversion happens at API presentation or frontend display boundaries.
- Admin date/time inputs must convert to UTC before submission. API responses carrying time must include timezone information.
- Catalog/media JSON must store URLs and metadata only. Base64 images, raw binary, oversized HTML blobs, or embedded video payloads are forbidden.
- Catalog hotspot reads must use Redis where available. Empty results get short TTL caching to reduce penetration. TTLs must include jitter to avoid synchronized expiry.
- Cache keys must be split by business dimension where practical: storefront aggregate, category list, region list, product summaries, product detail/projection. Writes delete the affected dimension keys plus aggregate keys.
- Cache keys must include the deployment store scope and environment prefix when configured.
- Cache invalidation uses DB-first, delete-cache-second. Do not write DB and cache in parallel as two sources of truth.
- Static fallback data must never be written into Redis or persisted as if it came from the API. It is a single-request local development fallback only.
- Production and customer deployments must not use static storefront fallback data as the business data source.
- Every list endpoint that can grow with operations data must paginate. Full-table product, order, log, DLQ, and media list responses are forbidden.
- Full update and patch update semantics must not be mixed. If an API uses full update, unchanged fields must be sent back and validated. If it uses patch update, omitted fields must never be overwritten.

## Frontend and content rules

- Visual implementation must follow `docs/premium-minimal-visual-system.md` and choose a page template from `docs/module-visual-templates.md`. New pages must reuse shared layout, header, button, card, form, modal, status, and empty-state patterns before adding page-specific styling.
- Buyer-facing text, product copy, category names, region names, SEO title/description, image alt text, and detail story content must support at least English and Chinese.
- Storefront routes must handle invalid slugs, deleted products, and delisted products with friendly pages instead of white screens.
- Product detail media must lazy-load below the hero. Video must use `preload="metadata"` and a poster. GIF should be accepted as source, but media-service should generate video variants where practical.
- PC, tablet, and phone layouts must be verified for every buyer-facing page. Mobile tap targets must be at least 44px for primary actions.
- Browser features with limited compatibility need a graceful fallback before production use.
- Language selection must persist across navigation and refresh, and the selected language should be forwarded as an API request header.
- Search, category, region, and product listing pages need debounce, pagination, and deterministic sort rules before production scale.
- SEO metadata, image alt text, friendly slugs, and hreflang must be driven by catalog/store content, not hardcoded page files.
- Business pages should not introduce one-off visual systems. If a style repeats or affects layout, add or reuse a shared component/class first.
- Inline styles are forbidden for normal visual styling. They are allowed only for data-driven media dimensions or browser performance hints with a clear reason.

## Admin and write-path rules

- All admin write actions must go through the admin gateway and the owning microservice.
- Writes, uploads, order creation, refund creation, inventory reservation, and compensation endpoints must require idempotency keys.
- Idempotency keys must be enforced by Redis or a database table. A request field that is never checked does not count as idempotency.
- Admin write failures must be explicit. Fake save, fake upload, and fake payment states are allowed only as labelled mock/demo states.
- Admin forms must expose and validate cross-border fields such as HS Code, material, origin, capacity, bilingual copy, status, and media sort order. Hidden or read-only cross-border fields are not acceptable for catalog operations.
- Product admin must expose package dimensions, weight, customs declaration notes, image alt text, and media metadata before production use.
- Admin write actions must record audit events with actor, IP, correlation ID, operation, changed business identifiers, old values, and new values.
- Bulk destructive actions require confirmation and should run as asynchronous jobs when large.
- DLQ admin screens must include retry, discard, assignee/handler, decision note, and audit logging. A read-only DLQ list does not satisfy the DLQ requirement.
- Order and inventory admin screens must show operator-readable exception states. Abnormal orders need a red label and latest failure reason. Inventory must distinguish available, reserved, locked, safety, and sellable quantities.

## Provider and external dependency rules

- Payment, logistics, tax, FX, risk, email, and object storage integrations must use Provider interfaces.
- Provider credentials, endpoints, webhook secrets, bucket names, and CDN domains must come from environment variables or admin-managed configuration, not source code.
- External calls must define timeout, retry, circuit breaker, downgrade, and manual recovery behavior before production use.
- TCC confirm/cancel operations must be idempotent and durable. A failed synchronous compensation call must enqueue a compensation task for worker retry; it must not leave business state dependent on a single HTTP attempt.
- Webhooks must verify signatures and idempotency before changing business state.
- Payment webhooks must be idempotent at the order and inventory boundaries. Replayed `paid` callbacks must not confirm inventory more than once, and replayed `cancelled` callbacks must not release inventory more than once.
- Order lifecycle changes must pass a finite-state-machine guard. Allowed core transitions are `pending_payment -> paid`, `pending_payment -> cancelled`, and compensation transitions through `compensating`; paid orders must not be cancelled by a payment-cancel callback, and cancelled orders must not be paid by a late payment callback.
- Media upload must be a closed flow: upload file, return asset metadata, bind it in catalog. If binding fails after upload, compensation must delete or quarantine the uploaded object.
- Object storage configuration must be validated at service startup for environments where upload is enabled. Missing endpoint, bucket, CDN domain, or credential must produce a clear failure.

## Backup and delivery rules

- Each customer gets an isolated deployment: domain, database, cache, object storage, secrets, payment account, logistics account, and email configuration.
- Database, object storage, and operational configuration need scheduled backups and restore tests.
- Migrations must be forward compatible. Avoid destructive production DDL; use expand-and-contract migrations when removal is unavoidable.
- Deployment scripts must be repeatable for a new customer without editing source code.
- New customer deployments must seed required baseline data such as categories, regions, default store settings, email defaults, and theme defaults.
- New customer deployments must use a repeatable initialization script or equivalent automation to create `.env`, validate Compose, start dependencies, and surface post-install credential tasks. Manual terminal-by-terminal setup is a delivery failure.
- Configuration layers are fixed: secrets and infrastructure endpoints come from environment/secret manager; business display settings come from admin configuration; source code must not contain customer-specific settings.
- Old clients and old frontend builds must tolerate newly added optional API fields during upgrades.

## Gateway and operations rules

- API gateway and admin gateway routes must stay prefix-isolated and documented. Frontend traffic must not accidentally reach admin routes.
- Gateways must forward correlation ID, language, client type, user agent where needed, auth context, and idempotency keys.
- Local and test-server deployments must include a centralized log path. The default is Loki + Grafana under the Compose `observability` profile, and incidents must be searchable by correlation ID.
- Health endpoints must distinguish process liveness from dependency readiness. Services that need PostgreSQL, Redis, MinIO/R2, or third-party providers must expose business readiness before a gateway sends traffic.
- CORS rules are environment-specific: localhost may be open in development, production must allow only configured customer domains.
- Local startup should follow middleware, services, gateways, apps order with readiness waits.
- Admin login must have brute-force protection. Production admin surfaces should support VPN/IP allowlist as a hardening option.
- Upload validation must inspect MIME and file headers. SVG, HTML, XML, and executable content are forbidden for product media; allowed public media types are limited to jpg, png, webp, gif, and mp4 unless the media contract expands.
- Slow business paths must emit structured JSON logs before full APM exists. Default thresholds are order create 2000ms, inventory reserve 1000ms, and catalog read 500ms.
- Unified business error codes must be introduced before production handoff. Random service-specific `message` strings are insufficient for admin UX and support diagnostics.

## Production gap tracking

`docs/production-gap-register.md` is the active register for unresolved production blockers. A customer-ready build cannot be declared while a P0 item in that register remains open without an explicit written exception.

## Failure criteria

The delivery fails if any of these happen:

- Sharing one production database across unrelated customer deployments
- Provider logic hardcoded into order core
- Floating point money
- Floating point stock or quantity
- Non-UTC persisted business timestamps
- Buyer-facing content only available in one language
- Page visual style diverges from `premium-minimal` without a theme-level decision
- New page duplicates button/input/card/modal/status styling instead of using shared primitives
- Mobile, tablet, or desktop layout has horizontal overflow or overlapping text
- Storefront business data only available from hardcoded frontend files
- Contract, OpenAPI, database, service DTO, admin form, and storefront field names do not align
- Static fallback data is cached or used in production
- Cache keys are so coarse that routine catalog edits require avoidable full cache flushes
- Unpaginated production list endpoints for growable data
- Product detail media stored as base64 or raw binary in catalog JSON
- Product/detail media loads all large images or videos eagerly
- Admin write action reports success when the backing API failed
- Empty Saga compensation
- Compensation only writes a log and does not undo data, inventory, payment, or uploaded file state
- Compensation depends only on one synchronous HTTP call and has no durable retry task or DLQ path
- DLQ exists without a human admin handling screen, retry/discard actions, handler, and audit trail
- A private deployment requires manual terminal-by-terminal startup instead of a repeatable Compose or later Helm path
- Production PostgreSQL or Redis is deployed inside Kubernetes instead of managed state services
- Incidents cannot be searched by correlation ID across service logs
- Inventory oversell
- Payment webhook replay vulnerability
- Repeated payment webhook causes duplicate inventory confirm/cancel
- Order state can jump arbitrarily without finite-state-machine guards
- Idempotency keys are accepted but not enforced
- Gateway drops trace, language, auth, or idempotency headers
- Media upload succeeds but catalog binding failure leaves orphan public files without compensation
- Secrets committed to Git
- Plain PII in logs, DLQ, CSV, or object storage
- Missing backup and restore path for a customer deployment
