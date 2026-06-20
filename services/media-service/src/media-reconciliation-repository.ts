import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { manualReconciliationTarget, type ManualReconciliationAction } from "./media-reconciliation.js";

export type MediaReconciliationStatus = "pending" | "processing" | "resolved_bound" | "cleaned" | "failed" | "discarded";

export type MediaReconciliationAuditEvent = {
  id: string;
  taskId: string;
  action: ManualReconciliationAction;
  actorId: string;
  decisionNote: string;
  oldStatus: string;
  newStatus: string;
  idempotencyKey: string;
  correlationId: string;
  clientIp: string | null;
  createdAt: string;
};

export type MediaReconciliationTask = {
  id: string;
  storeId: string;
  assetId: string;
  objectKeys: string[];
  status: MediaReconciliationStatus;
  unboundObservations: number;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: string;
  lastError: string | null;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  handledBy: string | null;
  decisionNote: string | null;
  handledAt: string | null;
};

type TaskRow = {
  id: string;
  store_id: string;
  asset_id: string;
  object_keys: unknown;
  status: MediaReconciliationStatus;
  unbound_observations: number;
  attempt_count: number;
  max_attempts: number;
  next_run_at: Date;
  last_error: string | null;
  correlation_id: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  handled_by: string | null;
  decision_note: string | null;
  handled_at: Date | null;
};

type AuditRow = {
  id: string;
  task_id: string;
  action: ManualReconciliationAction;
  actor_id: string;
  decision_note: string;
  old_status: string;
  new_status: string;
  idempotency_key: string;
  correlation_id: string;
  client_ip: string | null;
  created_at: Date;
};

function toTask(row: TaskRow): MediaReconciliationTask {
  return {
    id: row.id,
    storeId: row.store_id,
    assetId: row.asset_id,
    objectKeys: Array.isArray(row.object_keys) ? row.object_keys.filter((value): value is string => typeof value === "string") : [],
    status: row.status,
    unboundObservations: row.unbound_observations,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRunAt: row.next_run_at.toISOString(),
    lastError: row.last_error,
    correlationId: row.correlation_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    handledBy: row.handled_by,
    decisionNote: row.decision_note,
    handledAt: row.handled_at?.toISOString() ?? null
  };
}

function toAuditEvent(row: AuditRow): MediaReconciliationAuditEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    action: row.action,
    actorId: row.actor_id,
    decisionNote: row.decision_note,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    clientIp: row.client_ip,
    createdAt: row.created_at.toISOString()
  };
}

const returningColumns = `id, store_id, asset_id, object_keys, status, unbound_observations,
  attempt_count, max_attempts, next_run_at, last_error, correlation_id,
  created_at, updated_at, completed_at, handled_by, decision_note, handled_at`;
const returningClaimedColumns = `task.id, task.store_id, task.asset_id, task.object_keys, task.status, task.unbound_observations,
  task.attempt_count, task.max_attempts, task.next_run_at, task.last_error, task.correlation_id,
  task.created_at, task.updated_at, task.completed_at, task.handled_by, task.decision_note, task.handled_at`;

export class MediaReconciliationTaskNotFoundError extends Error {}
export class MediaReconciliationTaskConflictError extends Error {}

@Injectable()
export class MediaReconciliationRepository implements OnApplicationShutdown {
  private readonly pool = process.env.MEDIA_DATABASE_URL
    ? new Pool({ connectionString: process.env.MEDIA_DATABASE_URL })
    : null;

  async enqueue(input: {
    storeId: string;
    assetId: string;
    objectKeys: string[];
    correlationId: string;
    initialDelayMs: number;
    maxAttempts: number;
  }): Promise<MediaReconciliationTask> {
    const pool = this.requirePool();
    const result = await pool.query<TaskRow>(
      `INSERT INTO media_reconciliation_tasks (
         id, store_id, asset_id, object_keys, status, unbound_observations,
         attempt_count, max_attempts, next_run_at, correlation_id
       ) VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, 0, $5,
         now() + ($6::double precision * interval '1 millisecond'), $7)
       ON CONFLICT (store_id, asset_id) DO UPDATE SET
         object_keys = EXCLUDED.object_keys,
         correlation_id = EXCLUDED.correlation_id,
         status = CASE WHEN media_reconciliation_tasks.status = 'failed' THEN 'pending' ELSE media_reconciliation_tasks.status END,
         next_run_at = CASE WHEN media_reconciliation_tasks.status = 'failed' THEN EXCLUDED.next_run_at ELSE media_reconciliation_tasks.next_run_at END,
         last_error = CASE WHEN media_reconciliation_tasks.status = 'failed' THEN NULL ELSE media_reconciliation_tasks.last_error END,
         updated_at = now()
       RETURNING ${returningColumns}`,
      [randomUUID(), input.storeId, input.assetId, JSON.stringify(input.objectKeys), input.maxAttempts, input.initialDelayMs, input.correlationId]
    );
    return toTask(result.rows[0]);
  }

  async claimDue(limit: number): Promise<MediaReconciliationTask[]> {
    const pool = this.requirePool();
    const result = await pool.query<TaskRow>(
      `WITH due AS (
         SELECT id
         FROM media_reconciliation_tasks
         WHERE (status = 'pending' AND next_run_at <= now())
            OR (status = 'processing' AND updated_at < now() - interval '5 minutes')
         ORDER BY next_run_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE media_reconciliation_tasks task
       SET status = 'processing', updated_at = now()
       FROM due
       WHERE task.id = due.id
       RETURNING ${returningClaimedColumns}`,
      [limit]
    );
    return result.rows.map(toTask);
  }

  async markResolvedBound(id: string): Promise<void> {
    await this.complete(id, "resolved_bound");
  }

  async markCleaned(id: string): Promise<void> {
    await this.complete(id, "cleaned");
  }

  async confirmUnbound(id: string, delayMs: number): Promise<void> {
    await this.requirePool().query(
      `UPDATE media_reconciliation_tasks
       SET status = 'pending', unbound_observations = unbound_observations + 1,
           next_run_at = now() + ($2::double precision * interval '1 millisecond'), updated_at = now()
       WHERE id = $1`,
      [id, delayMs]
    );
  }

  async markFailure(task: MediaReconciliationTask, message: string, delayMs: number): Promise<MediaReconciliationStatus> {
    const attemptCount = task.attemptCount + 1;
    const status: MediaReconciliationStatus = attemptCount >= task.maxAttempts ? "failed" : "pending";
    await this.requirePool().query(
      `UPDATE media_reconciliation_tasks
       SET status = $2, attempt_count = $3, last_error = $4,
           next_run_at = now() + ($5::double precision * interval '1 millisecond'),
           completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END,
           updated_at = now()
       WHERE id = $1`,
      [task.id, status, attemptCount, message.slice(0, 2000), delayMs]
    );
    return status;
  }

  async list(storeId: string): Promise<MediaReconciliationTask[]> {
    const result = await this.requirePool().query<TaskRow>(
      `SELECT ${returningColumns}
       FROM media_reconciliation_tasks
       WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [storeId]
    );
    return result.rows.map(toTask);
  }

  async listAudit(storeId: string): Promise<MediaReconciliationAuditEvent[]> {
    const result = await this.requirePool().query<AuditRow>(
      `SELECT id, task_id, action, actor_id, decision_note, old_status, new_status,
              idempotency_key, correlation_id, client_ip, created_at
       FROM media_reconciliation_audit_events
       WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [storeId]
    );
    return result.rows.map(toAuditEvent);
  }

  async handleFailed(input: {
    storeId: string;
    taskId: string;
    action: ManualReconciliationAction;
    actorId: string;
    decisionNote: string;
    idempotencyKey: string;
    correlationId: string;
    clientIp: string | null;
  }): Promise<{ task: MediaReconciliationTask; auditEvent: MediaReconciliationAuditEvent; replayed: boolean }> {
    const client = await this.requirePool().connect();
    try {
      await client.query("BEGIN");
      const existingAudit = await client.query<AuditRow>(
        `SELECT id, task_id, action, actor_id, decision_note, old_status, new_status,
                idempotency_key, correlation_id, client_ip, created_at
         FROM media_reconciliation_audit_events
         WHERE store_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [input.storeId, input.idempotencyKey]
      );

      if (existingAudit.rows[0]) {
        const auditEvent = existingAudit.rows[0];
        if (auditEvent.task_id !== input.taskId || auditEvent.action !== input.action) {
          throw new MediaReconciliationTaskConflictError("idempotency key was already used for another media reconciliation action");
        }
        const current = await client.query<TaskRow>(
          `SELECT ${returningColumns} FROM media_reconciliation_tasks WHERE store_id = $1 AND id = $2`,
          [input.storeId, input.taskId]
        );
        await client.query("COMMIT");
        return { task: toTask(current.rows[0]), auditEvent: toAuditEvent(auditEvent), replayed: true };
      }

      const selected = await client.query<TaskRow>(
        `SELECT ${returningColumns}
         FROM media_reconciliation_tasks
         WHERE store_id = $1 AND id = $2
         FOR UPDATE`,
        [input.storeId, input.taskId]
      );
      const task = selected.rows[0];
      if (!task) throw new MediaReconciliationTaskNotFoundError("media reconciliation task was not found");

      const targetStatus = manualReconciliationTarget(task.status, input.action);
      const updated = await client.query<TaskRow>(
        `UPDATE media_reconciliation_tasks
         SET status = $3,
             attempt_count = CASE WHEN $3 = 'pending' THEN 0 ELSE attempt_count END,
             next_run_at = CASE WHEN $3 = 'pending' THEN now() ELSE next_run_at END,
             last_error = CASE WHEN $3 = 'pending' THEN NULL ELSE last_error END,
             completed_at = CASE WHEN $3 = 'discarded' THEN now() ELSE NULL END,
             handled_by = $4, decision_note = $5, handled_at = now(), updated_at = now()
         WHERE store_id = $1 AND id = $2
         RETURNING ${returningColumns}`,
        [input.storeId, input.taskId, targetStatus, input.actorId, input.decisionNote]
      );
      const audit = await client.query<AuditRow>(
        `INSERT INTO media_reconciliation_audit_events (
           id, store_id, task_id, action, actor_id, decision_note, old_status,
           new_status, idempotency_key, correlation_id, client_ip
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, task_id, action, actor_id, decision_note, old_status, new_status,
                   idempotency_key, correlation_id, client_ip, created_at`,
        [randomUUID(), input.storeId, input.taskId, input.action, input.actorId, input.decisionNote,
          task.status, targetStatus, input.idempotencyKey, input.correlationId, input.clientIp]
      );
      await client.query("COMMIT");
      return { task: toTask(updated.rows[0]), auditEvent: toAuditEvent(audit.rows[0]), replayed: false };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof MediaReconciliationTaskNotFoundError || error instanceof MediaReconciliationTaskConflictError) throw error;
      if (error instanceof Error && error.message === "only failed media reconciliation tasks can be handled manually") {
        throw new MediaReconciliationTaskConflictError(error.message);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async ready(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query("SELECT 1 FROM media_reconciliation_tasks LIMIT 1");
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }

  private async complete(id: string, status: "resolved_bound" | "cleaned"): Promise<void> {
    await this.requirePool().query(
      `UPDATE media_reconciliation_tasks
       SET status = $2, completed_at = now(), last_error = NULL, updated_at = now()
       WHERE id = $1`,
      [id, status]
    );
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error("media reconciliation database is not configured");
    return this.pool;
  }
}
