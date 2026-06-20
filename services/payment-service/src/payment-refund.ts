import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { IPaymentProvider } from "@commerce/provider-contracts";
import type { StoreContext } from "@commerce/store-context";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

export type PaymentRefundInput = {
  store: StoreContext;
  orderId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  actorId: string;
  reason: string;
};

type RefundStatus = "processing" | "pending" | "completed" | "failed";
type ProviderRefundStatus = "pending" | "completed" | "failed";
type RefundClaim = {
  decision: "claim_new" | "resume" | "completed";
  refundId: string;
  provider: string;
  providerCaptureId: string;
  providerRefundId?: string;
  status?: RefundStatus;
};

type RefundRepository = {
  claim(input: PaymentRefundInput): Promise<RefundClaim>;
  recordProviderResult(input: { refundId: string; providerRefundId: string; status: "completed" | "pending" }): Promise<void>;
};

type RefundProvider = Pick<IPaymentProvider, "name" | "refundPayment">;

export class PaymentRefundConflictError extends Error {}
export class PaymentRefundStateError extends Error {}

export function decideProviderRefundTransition(current: RefundStatus, incoming: ProviderRefundStatus) {
  if (current === incoming) return "replay" as const;
  if (current === "completed" || current === "failed") return "conflict" as const;
  return "apply" as const;
}

export async function processPaymentRefund(
  input: PaymentRefundInput,
  dependencies: { repository: RefundRepository; provider: RefundProvider }
) {
  const claim = await dependencies.repository.claim(input);
  if (claim.decision === "completed") {
    return { refundId: claim.refundId, providerRefundId: claim.providerRefundId, status: "completed" as const };
  }
  if (claim.provider !== dependencies.provider.name) {
    throw new PaymentRefundStateError(`payment provider ${claim.provider} is not enabled`);
  }
  const result = await dependencies.provider.refundPayment({
    store: input.store,
    paymentId: claim.providerCaptureId,
    amount: { amountMinor: input.amountMinor, currency: input.currency },
    idempotencyKey: input.idempotencyKey
  });
  if (result.status === "failed") throw new PaymentRefundStateError("payment provider rejected the refund");
  await dependencies.repository.recordProviderResult({
    refundId: claim.refundId,
    providerRefundId: result.providerRefundId,
    status: result.status
  });
  return { refundId: claim.refundId, providerRefundId: result.providerRefundId, status: result.status };
}

type TransactionRow = { id: string; provider: string; provider_capture_id: string | null; amount_minor: string; currency: string; status: string };
type RefundRow = { id: string; order_id: string; provider: string; amount_minor: string; currency: string; status: RefundStatus; provider_refund_id: string | null };

export type PaymentRefundSummaryTransactionRow = {
  id: string;
  order_id: string;
  provider: string;
  amount_minor: string;
  currency: string;
  status: string;
};

export type PaymentRefundSummaryRow = {
  id: string;
  provider_refund_id: string | null;
  amount_minor: string;
  currency: string;
  status: RefundStatus;
  reason: string;
  actor_id: string;
  correlation_id: string;
  created_at: Date;
  completed_at: Date | null;
};

export function buildPaymentRefundSummary(
  transaction: PaymentRefundSummaryTransactionRow,
  refunds: PaymentRefundSummaryRow[]
) {
  const refundedMinor = refunds
    .filter((refund) => refund.status === "completed")
    .reduce((total, refund) => total + Number(refund.amount_minor), 0);
  const reservedRefundMinor = refunds
    .filter((refund) => ["processing", "pending", "completed"].includes(refund.status))
    .reduce((total, refund) => total + Number(refund.amount_minor), 0);

  return {
    orderId: transaction.order_id,
    paymentStatus: transaction.status,
    provider: transaction.provider,
    amountMinor: Number(transaction.amount_minor),
    currency: transaction.currency,
    refundedMinor,
    reservedRefundMinor,
    refundableMinor: Math.max(0, Number(transaction.amount_minor) - reservedRefundMinor),
    refunds: refunds.map((refund) => ({
      refundId: refund.id,
      providerRefundId: refund.provider_refund_id ?? undefined,
      amountMinor: Number(refund.amount_minor),
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      actorId: refund.actor_id,
      correlationId: refund.correlation_id,
      createdAt: refund.created_at.toISOString(),
      completedAt: refund.completed_at?.toISOString()
    }))
  };
}

@Injectable()
export class PaymentRefundRepository implements RefundRepository, OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.ORDER_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/order_db",
    connectionTimeoutMillis: 800
  });

  async claim(input: PaymentRefundInput): Promise<RefundClaim> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transaction = (await client.query<TransactionRow>(
        `SELECT id, provider, provider_capture_id, amount_minor, currency, status
         FROM payment_transactions
         WHERE store_id = $1 AND order_id = $2 AND status IN ('paid', 'partially_refunded')
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [input.store.storeId, input.orderId]
      )).rows[0];
      if (!transaction || !transaction.provider_capture_id || !["paid", "partially_refunded"].includes(transaction.status)) {
        throw new PaymentRefundStateError("order does not have a refundable captured payment");
      }
      if (transaction.currency !== input.currency) throw new PaymentRefundConflictError("refund currency does not match payment currency");

      const existing = (await client.query<RefundRow>(
        `SELECT id, order_id, provider, amount_minor, currency, status, provider_refund_id
         FROM payment_refunds WHERE store_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [input.store.storeId, input.idempotencyKey]
      )).rows[0];
      if (existing) {
        if (existing.order_id !== input.orderId || Number(existing.amount_minor) !== input.amountMinor || existing.currency !== input.currency) {
          throw new PaymentRefundConflictError("refund idempotency key was reused with different data");
        }
        if (existing.status === "failed") throw new PaymentRefundStateError("refund has failed and cannot be resumed");
        await client.query("COMMIT");
        return {
          decision: existing.status === "completed" ? "completed" : "resume",
          refundId: existing.id,
          provider: existing.provider,
          providerCaptureId: transaction.provider_capture_id,
          providerRefundId: existing.provider_refund_id ?? undefined,
          status: existing.status
        };
      }

      const reserved = Number((await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount_minor), 0)::text AS total FROM payment_refunds
         WHERE payment_transaction_id = $1 AND status IN ('processing', 'pending', 'completed')`,
        [transaction.id]
      )).rows[0]?.total ?? 0);
      if (input.amountMinor > Number(transaction.amount_minor) - reserved) {
        throw new PaymentRefundConflictError("refund amount exceeds the remaining refundable amount");
      }

      const refundId = randomUUID();
      await client.query(
        `INSERT INTO payment_refunds (
           id, payment_transaction_id, store_id, order_id, provider, amount_minor, currency,
           status, idempotency_key, reason, actor_id, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8, $9, $10, $11)`,
        [refundId, transaction.id, input.store.storeId, input.orderId, transaction.provider,
          input.amountMinor, input.currency, input.idempotencyKey, input.reason, input.actorId, input.store.correlationId]
      );
      await client.query("COMMIT");
      return { decision: "claim_new", refundId, provider: transaction.provider, providerCaptureId: transaction.provider_capture_id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderSummary(storeId: string, orderId: string) {
    const transaction = (await this.pool.query<PaymentRefundSummaryTransactionRow>(
      `SELECT id, order_id, provider, amount_minor, currency, status
       FROM payment_transactions
       WHERE store_id = $1 AND order_id = $2 AND status IN ('paid', 'partially_refunded', 'refunded')
       ORDER BY created_at DESC LIMIT 1`,
      [storeId, orderId]
    )).rows[0];
    if (!transaction) return null;

    const refunds = (await this.pool.query<PaymentRefundSummaryRow>(
      `SELECT id, provider_refund_id, amount_minor, currency, status, reason, actor_id,
              correlation_id, created_at, completed_at
       FROM payment_refunds
       WHERE payment_transaction_id = $1
       ORDER BY created_at DESC`,
      [transaction.id]
    )).rows;

    return buildPaymentRefundSummary(transaction, refunds);
  }

  async listRecent(storeId: string, limit = 100) {
    const result = await this.pool.query<PaymentRefundSummaryRow & { order_id: string; provider: string }>(
      `SELECT id, order_id, provider, provider_refund_id, amount_minor, currency, status, reason,
              actor_id, correlation_id, created_at, completed_at
       FROM payment_refunds
       WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [storeId, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map((row) => ({
      refundId: row.id,
      orderId: row.order_id,
      provider: row.provider,
      providerRefundId: row.provider_refund_id ?? undefined,
      amountMinor: Number(row.amount_minor),
      currency: row.currency,
      status: row.status,
      reason: row.reason,
      actorId: row.actor_id,
      correlationId: row.correlation_id,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString()
    }));
  }

  async recordProviderResult(input: { refundId: string; providerRefundId: string; status: "completed" | "pending" }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const refund = (await client.query<{ payment_transaction_id: string; amount_minor: string }>(
        `UPDATE payment_refunds SET provider_refund_id = $2, status = $3,
           completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
           updated_at = now()
         WHERE id = $1 AND status IN ('processing', 'pending', 'completed')
         RETURNING payment_transaction_id, amount_minor`,
        [input.refundId, input.providerRefundId, input.status]
      )).rows[0];
      if (!refund) throw new PaymentRefundStateError("refund is not resumable");
      if (input.status === "completed") await this.recalculateTransactionRefundStatus(client, refund.payment_transaction_id);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyProviderEvent(input: {
    storeId: string;
    providerRefundId: string;
    status: ProviderRefundStatus;
    amountMinor: number;
    currency: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const refund = (await client.query<RefundRow & { payment_transaction_id: string }>(
        `SELECT id, order_id, provider, amount_minor, currency, status, provider_refund_id, payment_transaction_id
         FROM payment_refunds
         WHERE store_id = $1 AND provider_refund_id = $2
         FOR UPDATE`,
        [input.storeId, input.providerRefundId]
      )).rows[0];
      if (!refund) throw new PaymentRefundStateError("provider refund is not recorded yet");
      if (Number(refund.amount_minor) !== input.amountMinor || refund.currency !== input.currency) {
        throw new PaymentRefundConflictError("provider refund amount or currency does not match the local refund");
      }
      const decision = decideProviderRefundTransition(refund.status, input.status);
      if (decision === "conflict") throw new PaymentRefundStateError("provider refund terminal status conflicts with the local status");
      if (decision === "apply") {
        await client.query(
          `UPDATE payment_refunds
           SET status = $3,
               completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
               updated_at = now()
           WHERE store_id = $1 AND provider_refund_id = $2`,
          [input.storeId, input.providerRefundId, input.status]
        );
        await this.recalculateTransactionRefundStatus(client, refund.payment_transaction_id);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recalculateTransactionRefundStatus(client: PoolClient, transactionId: string) {
    await client.query(
      `UPDATE payment_transactions payment
       SET status = CASE
             WHEN refunds.total >= payment.amount_minor THEN 'refunded'
             WHEN refunds.total > 0 THEN 'partially_refunded'
             ELSE 'paid'
           END,
           updated_at = now()
       FROM (SELECT COALESCE(SUM(amount_minor), 0) AS total FROM payment_refunds
             WHERE payment_transaction_id = $1 AND status = 'completed') refunds
       WHERE payment.id = $1`,
      [transactionId]
    );
  }

  async onApplicationShutdown() { await this.pool.end(); }
}
