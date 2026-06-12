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
9. Unified business error codes and frontend error copy must exist for common failures: invalid input, missing data, inventory shortage, upload rejected, idempotency conflict, provider unavailable, compensation pending.

## P0 closure matrix

| Dimension | Must close | Impact |
| --- | --- | --- |
| Business loop | PostgreSQL-verified worker compensation, batch inventory operations, formal stock alerts, and complete cross-border product operations | Operators cannot manage the full order and inventory lifecycle |
| Data consistency | Catalog admin -> storefront real-data loop must be fully closed, and Redis invalidation must be verified | Storefront may read stale or non-authoritative admin data |
| Media capability | `media-service` must complete catalog binding compensation, responsive variants, GIF-to-video conversion, video poster/duration extraction, audit logs, and cleanup/quarantine jobs | Product images and videos can be uploaded, but production media lifecycle is not complete |
| Audit and compliance | Order actions, inventory actions, product writes, and configuration writes must create audit events; DLQ action audit is first-usable complete | Production incidents cannot be traced to an operator or decision |
| Failure drills | PostgreSQL failure must be used to verify compensation task creation, worker retry, and DLQ insertion | Distributed failure recovery remains unproven |
| Error system | Unified business error codes and user-facing copy must replace random service `message` strings | Frontend and admin cannot reliably distinguish validation, inventory, provider, or system failures |

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
