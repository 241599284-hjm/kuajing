# Product Import AI Workflow

This document records the current product import workflow and the production gaps that must not be hidden.

## Current Scope

- Admin imports one or more external product URLs.
- `product-import-service` stores import tasks in `product_import_db`.
- Admin can maintain AI copywriting and image provider configuration.
- Admin can edit the generated draft fields manually.
- Publish action runs required-field validation, calls `catalog-service PUT /products`, verifies the returned SKU, and only then marks the import task as published.
- Audit events are recorded for configuration updates, imports, draft edits, generation requests, and publish actions.

## Non-Fake Completion Rule

The current recovery block does not implement real crawling, real AI copywriting, real AI image generation, media localization, asynchronous queue workers, inventory initialization, or content risk providers. The catalog publish adapter is implemented and must not be replaced with direct database writes.

When providers are not configured, tasks must use `blocked_missing_provider`. The UI must say that generation is blocked. It must never fill fake AI copy or pretend that images were generated.

## Production Requirements

1. Add source-site fetcher adapters with timeout, retry, and robots/legal review.
2. Store fetched source data separately from editable product drafts.
3. Add AI copy provider adapters with request IDs, retry limits, and prompt version snapshots.
4. Add AI image provider adapters with generated-asset metadata and media-service upload binding.
5. Queue crawling, copywriting, image generation, and publishing as durable tasks.
6. Localize all remote media into MinIO/R2/S3-compatible object storage before publish.
7. Add content risk checks for prohibited words, unsafe imagery, missing HS Code, missing material, missing origin, and missing package dimensions.
8. Keep the existing `catalog-service` publish adapter covered by integration tests and add inventory initialization so a published product can become sellable.
9. Record audit logs for every configuration change, generation request, draft edit, publish, discard, and retry.

## Admin Acceptance

- Importing duplicate URLs must update the existing task, not create duplicates.
- Missing Provider configuration must be visible in task status and failure reason.
- Publish must fail when required cross-border fields are missing.
- Publish must fail without changing task status when `catalog-service` rejects the product or is unavailable.
- All prices must be stored as integer minor units.
- The import screen must use shared admin UI components only.
