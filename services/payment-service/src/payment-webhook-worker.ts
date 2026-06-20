import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import type { PaymentWebhookResult } from "@commerce/provider-contracts";
import { PaymentWebhookInboxRepository, type PaymentWebhookTask } from "./payment-webhook-inbox.js";
import { PaymentTransactionRepository, type PaidPaymentTransaction } from "./payment-transaction.js";
import { PaymentRefundRepository } from "./payment-refund.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function processPaymentWebhookTask(
  task: PaymentWebhookTask,
  options: {
    orderServiceUrl: string;
    fetchFn?: FetchLike;
    markTransactionPaid: (input: PaidPaymentTransaction) => Promise<void>;
    reconcileRefund?: (input: {
      storeId: string;
      providerRefundId: string;
      status: "pending" | "completed" | "failed";
      amountMinor: number;
      currency: string;
      eventId: string;
    }) => Promise<void>;
  }
) {
  const payload = task.payload as PaymentWebhookResult;
  if (payload.status === "refund_completed" || payload.status === "refund_pending" || payload.status === "refund_failed") {
    if (!options.reconcileRefund) throw new Error("refund webhook reconciliation is unavailable");
    await options.reconcileRefund({
      storeId: task.storeId,
      providerRefundId: payload.providerRefundId,
      status: payload.status === "refund_completed" ? "completed" : payload.status === "refund_pending" ? "pending" : "failed",
      amountMinor: payload.amount.amountMinor,
      currency: payload.amount.currency,
      eventId: task.eventId
    });
    return;
  }
  if (payload.status !== "paid") throw new Error("payment webhook payload is not a completed payment");
  if (!task.orderId) throw new Error("completed payment webhook order ID is missing");
  if (task.provider === "paypal" && !payload.providerCaptureId) throw new Error("PayPal capture ID is missing");
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.orderServiceUrl.replace(/\/+$/, "");
  const detailResponse = await fetchFn(`${baseUrl}/orders/${encodeURIComponent(task.orderId)}`, {
    headers: { "x-correlation-id": task.correlationId }
  });
  const detail = await detailResponse.json().catch(() => ({})) as { totalMinor?: number; currency?: string; message?: string };
  if (!detailResponse.ok) throw new Error(`order lookup failed: ${detail.message ?? detailResponse.status}`);
  if (detail.totalMinor !== payload.amount.amountMinor || detail.currency !== payload.amount.currency) {
    throw new Error("signed payment amount or currency does not match the local order");
  }

  const confirmResponse = await fetchFn(`${baseUrl}/payments/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": task.correlationId,
      "idempotency-key": `paypal-webhook:${task.eventId}`
    },
    body: JSON.stringify({ orderId: task.orderId })
  });
  if (!confirmResponse.ok) {
    const body = await confirmResponse.json().catch(() => ({})) as { message?: string };
    throw new Error(`order payment confirmation failed: ${body.message ?? confirmResponse.status}`);
  }
  await options.markTransactionPaid({
    storeId: task.storeId,
    orderId: task.orderId,
    provider: task.provider,
    providerPaymentId: task.providerPaymentId,
    providerCaptureId: payload.providerCaptureId,
    eventId: task.eventId,
    amountMinor: payload.amount.amountMinor,
    currency: payload.amount.currency
  });
}

@Injectable()
export class PaymentWebhookWorker implements OnModuleInit, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly enabled = (process.env.PAYMENT_PROVIDER ?? "mock").trim().toLowerCase() === "paypal";
  private readonly pollIntervalMs = Number(process.env.PAYMENT_WEBHOOK_POLL_INTERVAL_MS ?? 1000);
  private readonly batchSize = Number(process.env.PAYMENT_WEBHOOK_BATCH_SIZE ?? 5);
  private readonly leaseMs = Number(process.env.PAYMENT_WEBHOOK_LEASE_MS ?? 30000);
  private readonly orderServiceUrl = process.env.ORDER_SERVICE_URL ?? "http://localhost:4105";

  constructor(
    @Inject(PaymentWebhookInboxRepository)
    private readonly repository: PaymentWebhookInboxRepository,
    @Inject(PaymentTransactionRepository)
    private readonly transactions: PaymentTransactionRepository,
    @Inject(PaymentRefundRepository)
    private readonly refunds: PaymentRefundRepository
  ) {}

  onModuleInit() {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.runOnce(), this.pollIntervalMs);
    void this.runOnce();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const tasks = await this.repository.claimDue(this.batchSize, this.leaseMs);
      for (const task of tasks) {
        try {
          await processPaymentWebhookTask(task, {
            orderServiceUrl: this.orderServiceUrl,
            markTransactionPaid: (input) => this.transactions.markPaid(input),
            reconcileRefund: (input) => this.refunds.applyProviderEvent(input)
          });
          await this.repository.markProcessed(task.storeId, task.provider, task.eventId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "payment webhook processing failed";
          await this.repository.markProcessingFailure(task, message);
        }
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "payment_webhook_worker_failed",
        message: error instanceof Error ? error.message : "unknown error"
      }));
    } finally {
      this.running = false;
    }
  }
}
