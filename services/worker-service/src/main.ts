import "reflect-metadata";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
  Param,
  Post
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ERROR_CODES, normalizeErrorPayload } from "@commerce/error-codes";
import { nextRetryAt } from "@commerce/outbox-inbox";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

type CompensationTaskRow = {
  id: string;
  store_id: string;
  task_type: "inventory_confirm" | "inventory_cancel";
  aggregate_type: string;
  aggregate_id: string;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  correlation_id: string;
  payload: {
    orderId?: string;
    action?: "confirm" | "cancel";
    reservation?: {
      skuId?: string;
      warehouseId?: string;
      qty?: number;
      idempotencyKey?: string;
    };
  };
};

type WorkerStats = {
  processed: number;
  retried: number;
  deadLettered: number;
  lastRunAt?: string;
  lastError?: string;
};

type DeadLetterTaskSummary = {
  id: string;
  sourceTaskId: string | null;
  taskType: string;
  aggregateType: string;
  aggregateId: string;
  status: string;
  failureCount: number;
  lastErrorSummary: string;
  correlationId: string;
  createdAt: string;
  handledAt: string | null;
  handlerId: string | null;
  decisionNote: string | null;
  auditTrail: DeadLetterAuditEvent[];
};

type DeadLetterAuditEvent = {
  id: string;
  action: string;
  actorId: string;
  decisionNote: string;
  oldStatus: string;
  newStatus: string;
  correlationId: string;
  clientIp: string | null;
  createdAt: string;
};

type RetryDecisionInput = {
  handlerId?: string;
  decisionNote?: string;
};

const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL ?? "http://localhost:4104";
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 5);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.VALIDATION_FAILED,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function notFound(message: string, details?: unknown): NotFoundException {
  return new NotFoundException({
    code: ERROR_CODES.NOT_FOUND,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function stateConflict(message: string, details?: unknown): ConflictException {
  return new ConflictException({
    code: ERROR_CODES.CONFLICT,
    message,
    ...(details === undefined ? {} : { details })
  });
}

function normalizeTaskId(value: string): string {
  const taskId = value.trim();

  if (!uuidPattern.test(taskId)) {
    throw validationFailed("dead letter task id must be a UUID");
  }

  return taskId;
}

function normalizeDecision(input: RetryDecisionInput) {
  return {
    handlerId: input.handlerId?.trim().slice(0, 120) || "admin",
    decisionNote: input.decisionNote?.trim().slice(0, 1000) || "manual retry from admin"
  };
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeAuditTrail(value: DeadLetterAuditEvent[] | null): DeadLetterAuditEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((event) => ({
    ...event,
    createdAt: new Date(event.createdAt).toISOString()
  }));
}

@Injectable()
class CompensationWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.ORDER_DATABASE_URL ?? "postgres://commerce:commerce@localhost:5432/order_db",
    connectionTimeoutMillis: 800
  });
  private timer: NodeJS.Timeout | undefined;
  private isRunning = false;
  private readonly stats: WorkerStats = {
    processed: 0,
    retried: 0,
    deadLettered: 0
  };

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runOnce();
    }, pollIntervalMs);
    void this.runOnce();
  }

  getStats() {
    return this.stats;
  }

  async listDeadLetterTasks(): Promise<DeadLetterTaskSummary[]> {
    const result = await this.pool.query<{
      id: string;
      source_task_id: string | null;
      task_type: string;
      aggregate_type: string;
      aggregate_id: string;
      status: string;
      failure_count: number;
      failure_reason: string;
      correlation_id: string;
      created_at: Date;
      handled_at: Date | null;
      handler_id: string | null;
      decision_note: string | null;
      audit_trail: DeadLetterAuditEvent[] | null;
    }>(
      `
        SELECT
          dlt.id,
          dlt.source_task_id,
          dlt.task_type,
          dlt.aggregate_type,
          dlt.aggregate_id,
          dlt.status,
          COALESCE(ct.attempt_count, 0)::int AS failure_count,
          dlt.failure_reason,
          dlt.correlation_id,
          dlt.created_at,
          dlt.handled_at,
          dlt.handler_id,
          dlt.decision_note,
          COALESCE(audit.audit_trail, '[]'::jsonb) AS audit_trail
        FROM dead_letter_tasks dlt
        LEFT JOIN compensation_tasks ct ON ct.id = dlt.source_task_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ae.id,
              'action', ae.action,
              'actorId', ae.actor_id,
              'decisionNote', ae.decision_note,
              'oldStatus', ae.old_status,
              'newStatus', ae.new_status,
              'correlationId', ae.correlation_id,
              'clientIp', ae.client_ip,
              'createdAt', ae.created_at
            )
            ORDER BY ae.created_at DESC
          ) AS audit_trail
          FROM (
            SELECT *
            FROM dead_letter_audit_events ae
            WHERE ae.dead_letter_task_id = dlt.id
            ORDER BY ae.created_at DESC
            LIMIT 5
          ) ae
        ) audit ON true
        ORDER BY dlt.created_at DESC
        LIMIT 100
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      sourceTaskId: row.source_task_id,
      taskType: row.task_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      status: row.status,
      failureCount: row.failure_count,
      lastErrorSummary: row.failure_reason,
      correlationId: row.correlation_id,
      createdAt: row.created_at.toISOString(),
      handledAt: row.handled_at?.toISOString() ?? null,
      handlerId: row.handler_id,
      decisionNote: row.decision_note,
      auditTrail: normalizeAuditTrail(row.audit_trail)
    }));
  }

  async retryDeadLetterTask(
    taskId: string,
    input: RetryDecisionInput,
    meta: { correlationId: string; clientIp?: string }
  ): Promise<DeadLetterTaskSummary> {
    const decision = normalizeDecision(input);

    return this.withTransaction(async (client) => {
      const existing = await client.query<{
        id: string;
        source_task_id: string | null;
        status: string;
        store_id: string;
      }>(
        `
          SELECT id, source_task_id, status, store_id
          FROM dead_letter_tasks
          WHERE id = $1
          FOR UPDATE
        `,
        [taskId]
      );
      const deadLetterTask = existing.rows[0];

      if (!deadLetterTask) {
        throw notFound("dead letter task does not exist");
      }

      if (deadLetterTask.status !== "open") {
        throw stateConflict("only open dead letter tasks can be retried", {
          currentStatus: deadLetterTask.status
        });
      }

      if (!deadLetterTask.source_task_id) {
        throw stateConflict("dead letter task has no source compensation task");
      }

      await client.query(
        `
          UPDATE compensation_tasks
          SET status = 'pending',
              attempt_count = 0,
              next_run_at = now(),
              last_error = NULL,
              updated_at = now()
          WHERE id = $1
        `,
        [deadLetterTask.source_task_id]
      );
      await client.query(
        `
          UPDATE dead_letter_tasks
          SET status = 'retrying',
              handler_id = $2,
              decision_note = $3,
              handled_at = now()
          WHERE id = $1
        `,
        [taskId, decision.handlerId, decision.decisionNote]
      );
      await this.insertDeadLetterAuditEvent(client, {
        storeId: deadLetterTask.store_id,
        taskId,
        action: "retry",
        actorId: decision.handlerId,
        decisionNote: decision.decisionNote,
        oldStatus: deadLetterTask.status,
        newStatus: "retrying",
        correlationId: meta.correlationId,
        clientIp: meta.clientIp
      });

      return this.getDeadLetterTaskSummary(client, taskId);
    });
  }

  async discardDeadLetterTask(
    taskId: string,
    input: RetryDecisionInput,
    meta: { correlationId: string; clientIp?: string }
  ): Promise<DeadLetterTaskSummary> {
    const decision = normalizeDecision(input);

    return this.withTransaction(async (client) => {
      const result = await client.query<{
        id: string;
        source_task_id: string | null;
        task_type: string;
        aggregate_type: string;
        aggregate_id: string;
        status: string;
        store_id: string;
        failure_count: number;
        failure_reason: string;
        correlation_id: string;
        created_at: Date;
        handled_at: Date | null;
      }>(
        `
          UPDATE dead_letter_tasks dlt
          SET status = 'discarded',
              handler_id = $2,
              decision_note = $3,
              handled_at = now()
          FROM compensation_tasks ct
          WHERE dlt.id = $1
            AND dlt.source_task_id = ct.id
            AND dlt.status = 'open'
          RETURNING
            dlt.id,
            dlt.source_task_id,
            dlt.task_type,
            dlt.aggregate_type,
            dlt.aggregate_id,
            dlt.status,
            dlt.store_id,
            COALESCE(ct.attempt_count, 0)::int AS failure_count,
            dlt.failure_reason,
            dlt.correlation_id,
            dlt.created_at,
            dlt.handled_at
        `,
        [taskId, decision.handlerId, decision.decisionNote]
      );
      const updated = result.rows[0];

      if (!updated) {
        throw notFound("open dead letter task does not exist");
      }

      await this.insertDeadLetterAuditEvent(client, {
        storeId: updated.store_id,
        taskId,
        action: "discard",
        actorId: decision.handlerId,
        decisionNote: decision.decisionNote,
        oldStatus: "open",
        newStatus: "discarded",
        correlationId: meta.correlationId,
        clientIp: meta.clientIp
      });

      return this.getDeadLetterTaskSummary(client, taskId);
    });
  }

  async runOnce() {
    if (this.isRunning) return;

    this.isRunning = true;

    try {
      const tasks = await this.claimDueTasks();

      for (const task of tasks) {
        await this.processTask(task);
      }

      this.stats.lastRunAt = new Date().toISOString();
    } catch (error) {
      this.stats.lastError = error instanceof Error ? error.message : "worker run failed";
    } finally {
      this.isRunning = false;
    }
  }

  private async claimDueTasks(): Promise<CompensationTaskRow[]> {
    return this.withTransaction(async (client) => {
      const result = await client.query<CompensationTaskRow>(
        `
          SELECT id, store_id, task_type, aggregate_type, aggregate_id, idempotency_key,
                 attempt_count, max_attempts, correlation_id, payload
          FROM compensation_tasks
          WHERE status IN ('pending', 'retrying')
            AND next_run_at <= now()
          ORDER BY next_run_at ASC, created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [batchSize]
      );
      const ids = result.rows.map((task) => task.id);

      if (ids.length > 0) {
        await client.query(
          `
            UPDATE compensation_tasks
            SET status = 'processing',
                updated_at = now()
            WHERE id = ANY($1::uuid[])
          `,
          [ids]
        );
      }

      return result.rows;
    });
  }

  private async processTask(task: CompensationTaskRow) {
    try {
      await this.callInventory(task);
      await this.pool.query(
        `
          UPDATE compensation_tasks
          SET status = 'completed',
              updated_at = now(),
              last_error = NULL
          WHERE id = $1
        `,
        [task.id]
      );
      this.stats.processed += 1;
    } catch (error) {
      await this.recordFailure(task, error instanceof Error ? error.message : "compensation task failed");
    }
  }

  private async callInventory(task: CompensationTaskRow) {
    const reservation = task.payload.reservation;

    if (!reservation?.skuId || !reservation.qty || !reservation.idempotencyKey) {
      throw new Error("compensation task payload missing reservation data");
    }

    const path = task.task_type === "inventory_confirm" ? "/reservations/confirm" : "/reservations/cancel";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    try {
      const response = await fetch(`${inventoryServiceUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": task.correlation_id,
          "x-idempotency-key": reservation.idempotencyKey
        },
        body: JSON.stringify({
          skuId: reservation.skuId,
          warehouseId: reservation.warehouseId,
          qty: reservation.qty,
          idempotencyKey: reservation.idempotencyKey
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const normalized = normalizeErrorPayload(payload, response.status, task.correlation_id);
        throw new Error(`${normalized.code}: ${normalized.message}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async recordFailure(task: CompensationTaskRow, message: string) {
    const nextAttempt = task.attempt_count + 1;

    if (nextAttempt >= task.max_attempts) {
      await this.withTransaction(async (client) => {
        await client.query(
          `
            UPDATE compensation_tasks
            SET status = 'dead_lettered',
                attempt_count = $2,
                last_error = $3,
                updated_at = now()
            WHERE id = $1
          `,
          [task.id, nextAttempt, message.slice(0, 2000)]
        );
        await client.query(
          `
            INSERT INTO dead_letter_tasks (
              id,
              store_id,
              source_task_id,
              task_type,
              aggregate_type,
              aggregate_id,
              status,
              failure_reason,
              correlation_id,
              payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9)
          `,
          [
            randomUUID(),
            task.store_id,
            task.id,
            task.task_type,
            task.aggregate_type,
            task.aggregate_id,
            message.slice(0, 2000),
            task.correlation_id,
            JSON.stringify(task.payload)
          ]
        );
      });
      this.stats.deadLettered += 1;
      return;
    }

    await this.pool.query(
      `
        UPDATE compensation_tasks
        SET status = 'retrying',
            attempt_count = $2,
            next_run_at = $3,
            last_error = $4,
            updated_at = now()
        WHERE id = $1
      `,
      [task.id, nextAttempt, nextRetryAt(nextAttempt), message.slice(0, 2000)]
    );
    this.stats.retried += 1;
  }

  private async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertDeadLetterAuditEvent(
    client: PoolClient,
    input: {
      storeId: string;
      taskId: string;
      action: "retry" | "discard";
      actorId: string;
      decisionNote: string;
      oldStatus: string;
      newStatus: string;
      correlationId: string;
      clientIp?: string;
    }
  ) {
    await client.query(
      `
        INSERT INTO dead_letter_audit_events (
          id,
          store_id,
          dead_letter_task_id,
          action,
          actor_id,
          decision_note,
          old_status,
          new_status,
          correlation_id,
          client_ip
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        randomUUID(),
        input.storeId,
        input.taskId,
        input.action,
        input.actorId,
        input.decisionNote,
        input.oldStatus,
        input.newStatus,
        input.correlationId,
        input.clientIp ?? null
      ]
    );
  }

  private async getDeadLetterTaskSummary(client: PoolClient, taskId: string): Promise<DeadLetterTaskSummary> {
    const result = await client.query<{
      id: string;
      source_task_id: string | null;
      task_type: string;
      aggregate_type: string;
      aggregate_id: string;
      status: string;
      failure_count: number;
      failure_reason: string;
      correlation_id: string;
      created_at: Date;
      handled_at: Date | null;
      handler_id: string | null;
      decision_note: string | null;
      audit_trail: DeadLetterAuditEvent[] | null;
    }>(
      `
        SELECT
          dlt.id,
          dlt.source_task_id,
          dlt.task_type,
          dlt.aggregate_type,
          dlt.aggregate_id,
          dlt.status,
          COALESCE(ct.attempt_count, 0)::int AS failure_count,
          dlt.failure_reason,
          dlt.correlation_id,
          dlt.created_at,
          dlt.handled_at,
          dlt.handler_id,
          dlt.decision_note,
          COALESCE(audit.audit_trail, '[]'::jsonb) AS audit_trail
        FROM dead_letter_tasks dlt
        LEFT JOIN compensation_tasks ct ON ct.id = dlt.source_task_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ae.id,
              'action', ae.action,
              'actorId', ae.actor_id,
              'decisionNote', ae.decision_note,
              'oldStatus', ae.old_status,
              'newStatus', ae.new_status,
              'correlationId', ae.correlation_id,
              'clientIp', ae.client_ip,
              'createdAt', ae.created_at
            )
            ORDER BY ae.created_at DESC
          ) AS audit_trail
          FROM (
            SELECT *
            FROM dead_letter_audit_events ae
            WHERE ae.dead_letter_task_id = dlt.id
            ORDER BY ae.created_at DESC
            LIMIT 5
          ) ae
        ) audit ON true
        WHERE dlt.id = $1
      `,
      [taskId]
    );
    const row = result.rows[0];

    if (!row) {
      throw notFound("dead letter task does not exist");
    }

    return {
      id: row.id,
      sourceTaskId: row.source_task_id,
      taskType: row.task_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      status: row.status,
      failureCount: row.failure_count,
      lastErrorSummary: row.failure_reason,
      correlationId: row.correlation_id,
      createdAt: row.created_at.toISOString(),
      handledAt: row.handled_at?.toISOString() ?? null,
      handlerId: row.handler_id,
      decisionNote: row.decision_note,
      auditTrail: normalizeAuditTrail(row.audit_trail)
    };
  }

  async onApplicationShutdown() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    await this.pool.end();
  }
}

@Controller()
class WorkerController {
  constructor(@Inject(CompensationWorker) private readonly worker: CompensationWorker) {}

  @Get("/health")
  health() {
    return {
      service: "worker-service",
      status: "ok",
      compensationWorker: this.worker.getStats()
    };
  }

  @Get("/dead-letter-tasks")
  deadLetterTasks() {
    return this.worker.listDeadLetterTasks();
  }

  @Post("/dead-letter-tasks/:id/retry")
  retryDeadLetterTask(
    @Param("id") id: string,
    @Body() body: RetryDecisionInput,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.worker.retryDeadLetterTask(normalizeTaskId(id), body ?? {}, {
      correlationId: headerValue(headers, "x-correlation-id") ?? randomUUID(),
      clientIp: headerValue(headers, "x-forwarded-for")
    });
  }

  @Post("/dead-letter-tasks/:id/discard")
  discardDeadLetterTask(
    @Param("id") id: string,
    @Body() body: RetryDecisionInput,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.worker.discardDeadLetterTask(normalizeTaskId(id), body ?? {}, {
      correlationId: headerValue(headers, "x-correlation-id") ?? randomUUID(),
      clientIp: headerValue(headers, "x-forwarded-for")
    });
  }
}

@Module({ controllers: [WorkerController], providers: [CompensationWorker] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(Number(process.env.PORT ?? 4109), "0.0.0.0");
}

void bootstrap();
