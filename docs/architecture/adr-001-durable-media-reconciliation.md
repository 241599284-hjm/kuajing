# ADR-001: Durable media reconciliation after uncertain Catalog writes

## Status

Accepted

## Context

An uploaded product asset may reach Catalog while the Admin Gateway receives a timeout or 5xx response. Deleting immediately can break a committed product binding; keeping every object indefinitely leaks storage. The current delivery stage uses Docker Compose and PostgreSQL and explicitly avoids introducing infrastructure without a proven need.

## Decision

Persist one reconciliation task per store and asset in `media_db`. `media-service` polls due tasks, queries Catalog as the binding authority, and applies this policy:

- bound: keep every object and mark `resolved_bound`;
- first unbound observation: keep objects and schedule a confirmation;
- second consecutive unbound observation: delete the original and responsive variants, then mark `cleaned`;
- dependency or storage failure: retry with bounded exponential backoff, then mark `failed` after the configured maximum attempts.

Catalog 4xx responses remain deterministic and use immediate compensation. Only 5xx or dependency failures enqueue reconciliation.

## Rationale

PostgreSQL is already required, gives durable state and `FOR UPDATE SKIP LOCKED`, and keeps the first-server deployment repeatable. Two unbound observations prevent a delayed Catalog commit from racing object cleanup.

## Trade-offs

- Polling adds bounded latency compared with a message broker.
- Catalog must expose an authoritative asset-binding query.
- A `failed` task still needs an operator retry/discard workflow before production handoff.

These costs are accepted to avoid adding RabbitMQ/Kafka during the Compose phase. Revisit when task volume or latency requires event-driven delivery.
