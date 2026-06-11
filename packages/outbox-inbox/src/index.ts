import type { StoreContext } from "@commerce/store-context";

export type DomainEvent<TPayload = unknown> = {
  store: StoreContext;
  eventId: string;
  eventType: string;
  eventSchemaVersion: string;
  aggregateId: string;
  idempotencyKey: string;
  occurredAt: string;
  payload: TPayload;
};

export type InboxStatus = "received" | "processing" | "processed" | "failed";
export type OutboxStatus = "pending" | "published" | "failed" | "archived";
export type CompensationTaskStatus = "pending" | "processing" | "completed" | "retrying" | "dead_lettered";
export type DeadLetterStatus = "open" | "retry_requested" | "discarded" | "resolved";

export type CompensationTask<TPayload = unknown> = {
  store: StoreContext;
  taskId: string;
  taskType: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  status: CompensationTaskStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: string;
  correlationId: string;
  payload: TPayload;
  lastError?: string;
};

export type DeadLetterTask<TPayload = unknown> = {
  store: StoreContext;
  deadLetterId: string;
  sourceTaskId?: string;
  taskType: string;
  aggregateType: string;
  aggregateId: string;
  status: DeadLetterStatus;
  failureReason: string;
  correlationId: string;
  payload: TPayload;
  handlerId?: string;
  decisionNote?: string;
};

export function assertDomainEvent(event: DomainEvent): DomainEvent {
  if (!event.store?.storeId) throw new Error("event store_id is required");
  if (!event.eventId) throw new Error("event_id is required");
  if (!event.idempotencyKey) throw new Error("idempotency_key is required");
  if (!event.eventSchemaVersion) throw new Error("event_schema_version is required");
  return event;
}

export function assertCompensationTask(task: CompensationTask): CompensationTask {
  if (!task.store?.storeId) throw new Error("task store_id is required");
  if (!task.taskId) throw new Error("task_id is required");
  if (!task.taskType) throw new Error("task_type is required");
  if (!task.aggregateType) throw new Error("aggregate_type is required");
  if (!task.aggregateId) throw new Error("aggregate_id is required");
  if (!task.idempotencyKey) throw new Error("idempotency_key is required");
  if (!task.correlationId) throw new Error("correlation_id is required");
  if (!Number.isInteger(task.attemptCount) || task.attemptCount < 0) {
    throw new Error("attempt_count must be a non-negative integer");
  }
  if (!Number.isInteger(task.maxAttempts) || task.maxAttempts <= 0) {
    throw new Error("max_attempts must be a positive integer");
  }
  return task;
}

export function nextRetryAt(attemptCount: number, now = new Date()): string {
  if (!Number.isInteger(attemptCount) || attemptCount < 0) {
    throw new Error("attempt_count must be a non-negative integer");
  }

  const delaySeconds = Math.min(900, 2 ** attemptCount * 5);
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}
