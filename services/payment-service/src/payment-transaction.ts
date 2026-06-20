import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { IPaymentProvider, PaymentIntentRequest, PaymentIntentResult } from "@commerce/provider-contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type CreatedPaymentTransaction = {
  storeId: string;
  orderId: string;
  provider: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  correlationId: string;
};

export type PaidPaymentTransaction = Omit<CreatedPaymentTransaction, "idempotencyKey" | "correlationId"> & {
  eventId: string;
  providerCaptureId?: string;
};

type PaymentTransactionWriter = {
  recordCreated(input: CreatedPaymentTransaction): Promise<void>;
};

type PaymentCreator = Pick<IPaymentProvider, "createPayment">;

export class PaymentTransactionPersistenceError extends Error {}

export async function createTrackedPayment(
  provider: PaymentCreator,
  repository: PaymentTransactionWriter,
  request: PaymentIntentRequest
): Promise<PaymentIntentResult> {
  const result = await provider.createPayment(request);
  try {
    await repository.recordCreated({
      storeId: request.store.storeId,
      orderId: request.orderId,
      provider: result.provider,
      providerPaymentId: result.providerPaymentId,
      amountMinor: request.amount.amountMinor,
      currency: request.amount.currency,
      idempotencyKey: request.idempotencyKey,
      correlationId: request.store.correlationId
    });
  } catch (error) {
    throw new PaymentTransactionPersistenceError(
      `payment transaction persistence failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
  return result;
}

@Injectable()
export class PaymentTransactionRepository implements PaymentTransactionWriter, OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.ORDER_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/order_db",
    connectionTimeoutMillis: 800
  });

  async recordCreated(input: CreatedPaymentTransaction): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO payment_transactions (
         id, store_id, order_id, provider, provider_payment_id, status,
         amount_minor, currency, idempotency_key, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, 'created', $6, $7, $8, $9)
       ON CONFLICT (store_id, provider, idempotency_key) DO UPDATE
       SET updated_at = payment_transactions.updated_at
       WHERE payment_transactions.order_id = EXCLUDED.order_id
         AND payment_transactions.provider_payment_id = EXCLUDED.provider_payment_id
         AND payment_transactions.amount_minor = EXCLUDED.amount_minor
         AND payment_transactions.currency = EXCLUDED.currency
       RETURNING id`,
      [randomUUID(), input.storeId, input.orderId, input.provider, input.providerPaymentId,
        input.amountMinor, input.currency, input.idempotencyKey, input.correlationId]
    );
    if (result.rowCount !== 1) throw new Error("payment idempotency key was reused with different transaction data");
  }

  async markPaid(input: PaidPaymentTransaction): Promise<void> {
    const result = await this.pool.query(
      `UPDATE payment_transactions
       SET status = 'paid', latest_event_id = $6, provider_capture_id = COALESCE(provider_capture_id, $8),
           paid_at = COALESCE(paid_at, now()), updated_at = now()
       WHERE store_id = $1
         AND provider = $2
         AND provider_payment_id = $3
         AND order_id = $4
         AND amount_minor = $5
         AND currency = $7
         AND status IN ('created', 'paid')
       RETURNING id`,
      [input.storeId, input.provider, input.providerPaymentId, input.orderId,
        input.amountMinor, input.eventId, input.currency, input.providerCaptureId ?? null]
    );
    if (result.rowCount !== 1) throw new Error("payment transaction does not match the completed provider payment");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
