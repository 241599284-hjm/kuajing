# Production Gap Register

This file records gaps that block or weaken a real private cross-border deployment. Items here are not optional decoration. They must be closed or explicitly accepted before a customer production handoff.

## P0 blocking

1. `media-service` must finish production media handling beyond the first upload path: catalog binding compensation, responsive variants, GIF-to-video conversion, short-video poster/duration extraction, upload audit logs, and object cleanup/quarantine jobs.
2. DLQ is operational in admin at first usable level: list dead-letter tasks, show failure count and last error, retry, discard, handler, decision note, and audit trail. PostgreSQL failure drill is still required before production handoff.
3. Admin order operations now include order detail, payment confirm/cancel in mock mode, exception tag, latest failure reason, manual inventory compensation requeue, and order action audit trail at first usable level. PostgreSQL failure drill is still required before production handoff.
4. Admin inventory operations now include reservation ledger, confirm/cancel status lookup, human-readable stock fields, manual release, stock adjustment, stocktaking-style available quantity setting, safety-stock updates, low-stock indicators, and inventory action audit at first usable level. PostgreSQL failure drill, batch stocktaking, formal alert rules, and aftersales locked-stock writes are still required before production handoff.
5. Product admin must finish remaining cross-border operations: image alt text per media asset, bulk validation, multi-image ordering, scheduled status controls, and catalog/media binding compensation. HS Code, material composition, origin country, capacity, package dimensions, weight, customs declaration notes, bilingual detail content, and real initialization now have first usable admin/service fields.
6. Category, region, and product admin pages now initialize from `admin-gateway` real catalog APIs at first usable level. Static fallback is allowed only as an explicit local-development fallback and must not be cached.
7. `worker-service` compensation retry and DLQ insertion must be verified against PostgreSQL, not only typechecked.
8. Catalog Redis invalidation must be tested by dimension: storefront aggregate, categories, regions, product summaries, product detail/projection.
9. Unified business error codes now exist as a first usable package and gateway normalizer. Core service exceptions and frontend/admin copy still must be migrated to standard codes for common failures: invalid input, missing data, inventory shortage, upload rejected, idempotency conflict, provider unavailable, compensation pending.
10. Transactional email is restored at first usable level, but production email delivery still needs the real Tencent SES/account-pool provider, provider health/failover, quota counters, recipient throttling persistence, and admin audit coverage before production handoff.
11. Logistics tracking is restored at first usable level, but real 17TRACK/TrackingMore/Ship24 adapters, durable quota reset jobs, external timeout/failover tests, anti-abuse request limiting, and admin audit coverage are still required before production handoff.
12. Product reviews are restored at first usable level, but production review handling still needs real order-purchase verification, media-service image upload binding, persistent IP/account throttling, CSRF/reCAPTCHA, abuse-word filtering, bulk moderation, and admin audit coverage before production handoff.
13. Legal/compliance storefront pages are restored at first usable level, but production handoff still needs backend-managed legal content, real store contact placeholders, cookie consent controls, and final legal review by the merchant before payment-provider submission.
14. Storefront preference and consent components are restored at first usable level, but production handoff still needs backend-managed market/currency rules, GeoIP defaulting, third-party script blocking tied to consent, and address/phone validation providers.
15. Operations management is restored at first usable level, but production handoff still needs real Let's Encrypt automation, Cloudflare API integration, GA4/GSC verification, alert emails, and operator permission/audit hardening.
16. Product import and AI workflow is restored at first usable level, but production handoff still needs real source-site fetchers, AI copy/image provider adapters, media-service image localization, queue workers, and catalog publish adapter wiring.

## P0 closure matrix

| Dimension | Must close | Impact |
| --- | --- | --- |
| Business loop | PostgreSQL-verified worker compensation, batch inventory operations, formal stock alerts, and complete cross-border product operations | Operators cannot manage the full order and inventory lifecycle |
| Data consistency | Catalog admin -> storefront real-data loop must be fully closed, and Redis invalidation must be verified | Storefront may read stale or non-authoritative admin data |
| Media capability | `media-service` must complete catalog binding compensation, responsive variants, GIF-to-video conversion, video poster/duration extraction, audit logs, and cleanup/quarantine jobs | Product images and videos can be uploaded, but production media lifecycle is not complete |
| Audit and compliance | Order actions, inventory actions, product writes, and configuration writes must create audit events; DLQ action audit and the unified admin audit viewer are first-usable complete | Production incidents cannot be traced to an operator or decision |
| Failure drills | PostgreSQL failure must be used to verify compensation task creation, worker retry, and DLQ insertion | Distributed failure recovery remains unproven |
| Error system | Unified business error codes and user-facing copy must replace random service `message` strings | Frontend and admin cannot reliably distinguish validation, inventory, provider, or system failures |
| Notification | Real SES provider/account pool, durable quota counters, throttling, template audit, and send-point verification must be completed | Transactional emails have templates and service boundaries, but production delivery remains provider-incomplete |
| Logistics | Real provider adapters, durable quota resets, request throttling, failure drills, and tracking-email verification must be completed | Tracking UI and cache exist, but production logistics data is not yet connected to live aggregators |
| Reviews | Order-purchase verification, media upload binding, persistent throttling, anti-spam controls, moderation audit, and bulk actions must be completed | Review display and moderation exist, but production anti-abuse and proof-of-purchase controls are incomplete |
| Legal pages | Backend-managed policy content, real merchant details, cookie consent controls, and legal review must be completed | PayPal-facing policy routes exist, but customer-specific legal content is not yet configured |
| Storefront preferences | GeoIP market defaulting, backend market/currency configuration, consent-script gating, and phone/address validation must be completed | Cookie, market, and phone UI exist, but production data controls are not wired |
| Operations | Real certificate renewal, CDN cache purge, HTTP-resource scanning, analytics verification, alert emails, and role-gated operations must be completed | Admin can save config and record actions, but real cloud execution is not connected |
| Product import | Real crawler/fetcher adapters, AI copy/image providers, media localization, queue execution, publish-to-catalog adapter, and content risk checks must be completed | Admin can import links, edit drafts, save AI config, and run publish validation, but real AI/crawler execution is not connected |

## P1 reliability and security

1. Health checks must distinguish process liveness from dependency readiness for PostgreSQL, Redis, MinIO/R2/S3, and critical downstream services.
2. Admin login must include brute-force protection: failure count, temporary lockout, and optional captcha/verification challenge.
3. Production admin access should support VPN/IP allowlist. If disabled, the customer must explicitly accept the risk in the runbook.
4. All admin write actions must enforce idempotency keys and audit logs with actor, IP, correlation ID, old value, new value, and affected business ID.
5. PUT and PATCH semantics must be separated. Full updates must validate and send the full object; partial updates must not clear omitted fields.
6. Gateways must propagate `x-correlation-id`, language, client type, auth, user-agent, and idempotency headers in every service call.
7. Logs for slow requests, compensation failures, DLQ actions, provider failures, and admin writes must be structured JSON.
8. Slow request thresholds:
   - order creation: `SLOW_ORDER_CREATE_MS`, default 2000 ms
   - inventory reservation: `SLOW_INVENTORY_RESERVE_MS`, default 1000 ms
   - catalog read: `SLOW_CATALOG_READ_MS`, default 500 ms
9. Alerts must be added for inventory below safety stock, order creation error rate, compensation backlog, DLQ growth, and upload failure rate.

## P2 scale and delivery

1. Growable endpoints must paginate consistently. Use one pagination style per API version and document it.
2. OpenAPI contracts must be generated or checked against service DTOs before integration.
3. Database migrations should be grouped by service ownership and include rollback or recovery instructions.
4. Backup and restore scripts must cover PostgreSQL, object storage, and exported customer configuration.
5. Environment files must be layered by deployment target and validated at service startup.
6. API versioning must be defined before external customer integrations depend on endpoints.
7. ADRs must record load-bearing decisions such as TCC/Saga, Redis caching, Docker Compose first, managed state services, and Provider interfaces.

## Current closure status

- Media upload: implemented at first usable level through `media-service`, `admin-gateway`, and admin product UI. It validates size, MIME/file signatures, saves to local storage or MinIO/R2/S3-compatible storage, and returns URL/metadata. Catalog binding compensation, responsive variants, GIF-to-video conversion, and audit logging are still pending.
- Catalog admin initialization: category, region, and product admin pages now read real catalog data through `admin-gateway`. Product admin uses the backend-only `catalog-service GET /admin/products` endpoint so inactive/draft products and cross-border fields are visible to operators. PostgreSQL-backed end-to-end verification is still pending.
- DLQ admin list/retry/discard/audit trail: implemented at first usable level through `worker-service`, `admin-gateway`, PostgreSQL `dead_letter_audit_events`, and admin UI. PostgreSQL failure drill is still pending.
- Admin order operations: order list, exception red tag, latest failure reason, order detail, order line snapshots, Mock payment confirm/cancel, manual inventory compensation requeue, and order action audit trail are implemented at first usable level through `order-service`, `admin-gateway`, PostgreSQL `order_audit_events`, and admin UI. PostgreSQL failure drill is still pending.
- Inventory operations: human-readable fields, reservation ledger, confirm/cancel status lookup, manual release for reserved reservations, stock adjustment, stocktaking-style available quantity setting, safety-stock update, low-stock indicator, and inventory action audit are implemented at first usable level through `inventory-service`, `admin-gateway`, PostgreSQL `inventory_audit_events`, and admin UI. PostgreSQL failure drill, batch stocktaking, formal alert rules, and aftersales locked-stock writes are still pending.
- Slow request structured logs: implemented for order create, inventory reserve, and catalog reads. Grafana alert rules are still pending.
- Compensation failure drill: `scripts/run-compensation-drill.ps1` and Runbook steps are implemented. The drill is not yet closed because the current workstation Docker daemon is unavailable; it must pass on repaired local Docker or the first test server before production handoff.
- Transactional notification: `notification-service` has been restored with PostgreSQL-backed templates/logs, admin template editing, auth registration/password emails, payment success emails, and review invitation emails. Real Tencent SES account-pool delivery, persistent quota/rate-limit counters, template operation audit, and end-to-end SMTP/API sandbox verification are still pending.
- Logistics tracking: `logistics-service` has been restored with API-account pool shape, tracking cache, call logs, Mock Provider, admin account/log panel, storefront `/track-order` page, gateway routes, and logistics-update email send endpoint. Real 17TRACK/TrackingMore/Ship24 adapters, monthly quota reset, external provider circuit breaking, and anti-abuse throttling are still pending.
- Product reviews: `review-service` has been restored with PostgreSQL-backed pending/approved/hidden/deleted reviews, storefront product review display/submission, admin moderation/reply/pin controls, gateway routes, and pending-review admin email notification. Real order-purchase verification, media upload binding for review photos, persistent throttling, CSRF/reCAPTCHA, abuse-word filtering, bulk moderation, and moderation audit logs are still pending.
- Error system: `@commerce/error-codes` has been restored with standard codes, default messages, HTTP-status mapping, and gateway error payload normalization. Core services still need direct standard-code exceptions, and frontend/admin still need centralized copy rendering instead of page-local error strings.
- Storefront legal and payment result pages: `/privacy-policy`, `/refund-return-policy`, `/terms-of-service`, `/contact-us`, `/payment-result`, and the shared storefront footer have been restored using the premium minimal visual system. The content uses merchant placeholders and must be connected to backend site settings before customer handoff.
- Storefront preference/consent UI: cookie consent, international phone field, market preference selector, line-art teaware loading overlay, and simplified language toggle have been restored. Cookie category management, third-party script gating, GeoIP defaults, backend market rules, and phone/address validation are still pending.
- Operations service: `ops-service` has been restored with PostgreSQL-backed SSL/CDN/GA4/GSC settings, audit events, action recording, admin-gateway routes, Docker Compose wiring, and an admin operations panel. Real Let's Encrypt renewal, Cloudflare cache purge/rules API, HTTP mixed-content scanning, analytics verification, alert email dispatch, and RBAC/IP allowlist enforcement are still pending.
- Product import workflow: `product-import-service` has been restored with PostgreSQL-backed AI configuration, link import tasks, editable draft records, publish-field validation, audit events, admin-gateway routes, Docker Compose wiring, and an admin product import panel. Real crawler/fetcher adapters, AI copy/image adapters, media-service image localization, asynchronous queue workers, catalog publish adapter wiring, and risk checks are still pending.
- Unified audit viewer: the admin `审计日志` page has been restored and aggregates real inventory, operations, and product-import audit sources through `admin-gateway`. Order detail and DLQ audit trails remain module-local, and product/catalog/media write audits still need broader coverage before production handoff.
