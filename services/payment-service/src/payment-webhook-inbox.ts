import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Pool } from "pg";

export type PaymentWebhookStatus = "processing" | "processed" | "failed";
export type WebhookClaimDecision =
  | "claim_new"
  | "claim_retry"
  | "duplicate_processing"
  | "duplicate_processed"
  | "payload_conflict";

type ExistingWebhook = {
  status: PaymentWebhookStatus;
  payloadHash: string;
};

type WebhookRow = {
  store_id: string;
  provider: string;
  event_id: string;
  provider_payment_id: string;
  order_id: string | null;
  event_type: string;
  payload: unknown;
  status: PaymentWebhookStatus;
  payload_hash: string;
  attempt_count: number;
  max_attempts: number;
  correlation_id: string;
  last_error: string | null;
  received_at: Date;
  processed_at: Date | null;
  updated_at: Date;
};

export type PaymentWebhookClaimInput = {
  storeId: string;
  provider: string;
  eventId: string;
  providerPaymentId: string;
  orderId?: string;
  eventType: string;
  payload: unknown;
  correlationId?: string;
  maxAttempts?: number;
};

export type PaymentWebhookTask = {
  storeId: string;
  provider: string;
  eventId: string;
  providerPaymentId: string;
  orderId: string | null;
  eventType: string;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  correlationId: string;
};

export type PaymentWebhookClaimResult = {
  decision: Exclude<WebhookClaimDecision, "payload_conflict">;
  status: PaymentWebhookStatus;
  attemptCount: number;
};

export class PaymentWebhookPayloadConflictError extends Error {}
export class PaymentWebhookStateConflictError extends Error {}

export function webhookPayloadHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function decideWebhookClaim(existing: ExistingWebhook | null, payloadHash: string): WebhookClaimDecision {
  if (!existing) return "claim_new";
  if (existing.payloadHash !== payloadHash) return "payload_conflict";
  if (existing.status === "failed") return "claim_retry";
  return existing.status === "processed" ? "duplicate_processed" : "duplicate_processing";
}

export function nextWebhookFailure(attemptCount: number, maxAttempts: number) {
  if (attemptCount >= maxAttempts) return { status: "failed" as const, attemptCount: maxAttempts };
  return { status: "processing" as const, attemptCount: attemptCount + 1 };
}

export function retryWebhookAttemptCount() {
  return 1;
}

@Injectable()
export class PaymentWebhookInboxRepository implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.ORDER_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/order_db",
    connectionTimeoutMillis: 800
  });

  async claim(input: PaymentWebhookClaimInput): Promise<PaymentWebhookClaimResult> {
    const payloadHash = webhookPayloadHash(input.payload);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<WebhookRow>(
        `INSERT INTO payment_webhook_events (
           store_id, provider, event_id, provider_payment_id, order_id,
           event_type, status, payload, payload_hash, attempt_count, max_attempts, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7::jsonb, $8, 1, $9, $10)
         ON CONFLICT (store_id, provider, event_id) DO NOTHING
         RETURNING store_id, provider, event_id, provider_payment_id, order_id,
                   event_type, payload, status, payload_hash, attempt_count, max_attempts, correlation_id, last_error,
                   received_at, processed_at, updated_at`,
        [input.storeId, input.provider, input.eventId, input.providerPaymentId, input.orderId ?? null,
          input.eventType, JSON.stringify(input.payload), payloadHash, input.maxAttempts ?? 8, input.correlationId ?? "unknown"]
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return { decision: "claim_new", status: "processing", attemptCount: 1 };
      }

      const selected = await client.query<WebhookRow>(
        `SELECT store_id, provider, event_id, provider_payment_id, order_id,
                event_type, payload, status, payload_hash, attempt_count, max_attempts, correlation_id, last_error,
                received_at, processed_at, updated_at
         FROM payment_webhook_events
         WHERE store_id = $1 AND provider = $2 AND event_id = $3
         FOR UPDATE`,
        [input.storeId, input.provider, input.eventId]
      );
      const existing = selected.rows[0];
      if (!existing) throw new PaymentWebhookStateConflictError("payment webhook event disappeared during claim");
      const decision = decideWebhookClaim({ status: existing.status, payloadHash: existing.payload_hash }, payloadHash);
      if (decision === "payload_conflict") {
        throw new PaymentWebhookPayloadConflictError("payment webhook event ID was reused with different payload content");
      }
      if (decision === "claim_retry") {
        const retried = await client.query<WebhookRow>(
          `UPDATE payment_webhook_events
           SET status = 'processing', attempt_count = $4,
               next_attempt_at = now(), last_error = NULL, updated_at = now()
           WHERE store_id = $1 AND provider = $2 AND event_id = $3 AND status = 'failed'
           RETURNING store_id, provider, event_id, provider_payment_id, order_id,
                     event_type, payload, status, payload_hash, attempt_count, max_attempts, correlation_id, last_error,
                     received_at, processed_at, updated_at`,
          [input.storeId, input.provider, input.eventId, retryWebhookAttemptCount()]
        );
        const row = retried.rows[0];
        if (!row) throw new PaymentWebhookStateConflictError("failed payment webhook event could not be reclaimed");
        await client.query("COMMIT");
        return { decision, status: row.status, attemptCount: row.attempt_count };
      }

      await client.query("COMMIT");
      return { decision, status: existing.status, attemptCount: existing.attempt_count };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listRecent(storeId: string, limit = 100) {
    const result = await this.pool.query<WebhookRow>(
      `SELECT store_id, provider, event_id, provider_payment_id, order_id, event_type, payload,
              status, payload_hash, attempt_count, max_attempts, correlation_id, last_error,
              received_at, processed_at, updated_at
       FROM payment_webhook_events
       WHERE store_id = $1
       ORDER BY received_at DESC
       LIMIT $2`,
      [storeId, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      providerPaymentId: row.provider_payment_id,
      orderId: row.order_id ?? undefined,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      correlationId: row.correlation_id,
      lastError: row.last_error ?? undefined,
      receivedAt: row.received_at.toISOString(),
      processedAt: row.processed_at?.toISOString()
    }));
  }

  async claimDue(limit: number, leaseMs: number): Promise<PaymentWebhookTask[]> {
    const result = await this.pool.query<WebhookRow>(
      `WITH due AS (
         SELECT store_id, provider, event_id
         FROM payment_webhook_events
         WHERE status = 'processing' AND next_attempt_at <= now()
         ORDER BY next_attempt_at, received_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE payment_webhook_events event
       SET next_attempt_at = now() + ($2::double precision * interval '1 millisecond'), updated_at = now()
       FROM due
       WHERE event.store_id = due.store_id AND event.provider = due.provider AND event.event_id = due.event_id
       RETURNING event.store_id, event.provider, event.event_id, event.provider_payment_id,
                 event.order_id, event.event_type, event.payload, event.status, event.payload_hash,
                 event.attempt_count, event.max_attempts, event.correlation_id, event.last_error,
                 event.received_at, event.processed_at, event.updated_at`,
      [limit, leaseMs]
    );
    return result.rows.map((row) => ({
      storeId: row.store_id,
      provider: row.provider,
      eventId: row.event_id,
      providerPaymentId: row.provider_payment_id,
      orderId: row.order_id,
      eventType: row.event_type,
      payload: row.payload,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      correlationId: row.correlation_id
    }));
  }

  async markProcessed(storeId: string, provider: string, eventId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE payment_webhook_events
       SET status = 'processed', processed_at = now(), last_error = NULL, updated_at = now()
       WHERE store_id = $1 AND provider = $2 AND event_id = $3 AND status = 'processing'`,
      [storeId, provider, eventId]
    );
    if (result.rowCount !== 1) throw new PaymentWebhookStateConflictError("payment webhook event is not processing");
  }

  async markFailed(storeId: string, provider: string, eventId: string, error: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE payment_webhook_events
       SET status = 'failed', last_error = $4, updated_at = now()
       WHERE store_id = $1 AND provider = $2 AND event_id = $3 AND status = 'processing'`,
      [storeId, provider, eventId, error.slice(0, 1000)]
    );
    if (result.rowCount !== 1) throw new PaymentWebhookStateConflictError("payment webhook event is not processing");
  }

  async markProcessingFailure(task: PaymentWebhookTask, error: string): Promise<PaymentWebhookStatus> {
    const failure = nextWebhookFailure(task.attemptCount, task.maxAttempts);
    const delayMs = Math.min(60000, 1000 * 2 ** Math.min(task.attemptCount - 1, 6));
    const result = await this.pool.query(
      `UPDATE payment_webhook_events
       SET status = $4, attempt_count = $5, last_error = $6,
           next_attempt_at = now() + ($7::double precision * interval '1 millisecond'), updated_at = now()
       WHERE store_id = $1 AND provider = $2 AND event_id = $3 AND status = 'processing'`,
      [task.storeId, task.provider, task.eventId, failure.status, failure.attemptCount, error.slice(0, 1000), delayMs]
    );
    if (result.rowCount !== 1) throw new PaymentWebhookStateConflictError("payment webhook event is not processing");
    return failure.status;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
