"use client";

import { createRequestId } from "../lib/request-id.js";

import { localizedErrorMessage } from "@commerce/error-codes";
import { useEffect, useMemo, useState } from "react";
import {
  AdminActionRow,
  AdminHelpText,
  AdminInlineStatus,
  AdminListCard,
  AdminPanel,
  AdminSecondaryButton,
  AdminTextarea
} from "./admin-ui.js";

const adminGatewayUrl = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL ?? "http://localhost:4001";

type AuditEvent = {
  id: string;
  action: "retry" | "discard";
  actorId: string;
  decisionNote: string;
  oldStatus: string;
  newStatus: string;
  correlationId: string;
  createdAt: string;
};

type ReconciliationTask = {
  id: string;
  assetId: string;
  objectKeys: string[];
  status: string;
  unboundObservations: number;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  correlationId: string;
  createdAt: string;
  handledBy: string | null;
  decisionNote: string | null;
  handledAt: string | null;
  auditTrail: AuditEvent[];
};

function shortId(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDate(value: string | null) {
  if (!value) return "未处理";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

const statusLabels: Record<string, string> = {
  pending: "等待对账",
  processing: "处理中",
  resolved_bound: "已确认绑定",
  cleaned: "已清理",
  failed: "等待人工处理",
  discarded: "已作废"
};

export function MediaReconciliationManagementPanel() {
  const [tasks, setTasks] = useState<ReconciliationTask[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("等待加载");
  const [isLoading, setIsLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function loadTasks() {
    setIsLoading(true);
    try {
      const response = await fetch(`${adminGatewayUrl}/media/reconciliation-tasks`, {
        headers: { "x-correlation-id": createRequestId() }
      });
      const payload = await response.json().catch(() => ({})) as { items?: ReconciliationTask[] };
      if (!response.ok || !Array.isArray(payload.items)) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setTasks(payload.items);
      setStatus(payload.items.length ? `已读取 ${payload.items.length} 条媒体对账任务` : "暂无媒体对账任务");
    } catch (error) {
      setTasks([]);
      setStatus(error instanceof Error ? error.message : "媒体对账 API 未连接");
    } finally {
      setIsLoading(false);
    }
  }

  async function act(task: ReconciliationTask, action: "retry" | "discard") {
    const decisionNote = notes[task.id]?.trim() ?? "";
    if (decisionNote.length < 3) {
      setStatus("请填写至少 3 个字的处理意见");
      return;
    }
    setActingId(task.id);
    try {
      const response = await fetch(`${adminGatewayUrl}/media/reconciliation-tasks/${task.id}/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-actor": "admin-ui",
          "x-correlation-id": createRequestId(),
          "idempotency-key": `${action}-${createRequestId()}`
        },
        body: JSON.stringify({ decisionNote })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizedErrorMessage(payload, response.status, "zh"));
      setStatus(action === "retry" ? "已提交人工重试" : "已作废媒体对账任务");
      await loadTasks();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "媒体对账人工操作失败");
    } finally {
      setActingId(null);
    }
  }

  useEffect(() => { void loadTasks(); }, []);

  const failedCount = useMemo(() => tasks.filter((task) => task.status === "failed").length, [tasks]);

  return (
    <AdminPanel id="media-reconciliation-title" eyebrow="媒体生命周期" title="媒体对账" status={status}>
      <AdminHelpText>
        Catalog 结果不确定时，系统会持久化对账任务。绑定对象会保留，连续两次未绑定才清理；只有重试耗尽的任务需要人工处理。
      </AdminHelpText>
      <AdminActionRow className="mt-5">
        <AdminSecondaryButton disabled={isLoading} onClick={loadTasks} type="button">{isLoading ? "刷新中" : "刷新任务"}</AdminSecondaryButton>
        <AdminInlineStatus>任务 {tasks.length}，待人工处理 {failedCount}</AdminInlineStatus>
      </AdminActionRow>
      <div className="mt-5 grid gap-4">
        {tasks.length === 0 ? <p className="rounded-md border border-dashed border-[var(--line)] p-5 text-sm text-[var(--ink-soft)]">暂无真实媒体对账任务。</p> : null}
        {tasks.map((task) => (
          <AdminListCard
            key={task.id}
            eyebrow={`媒体对象 ${task.objectKeys.length} 个`}
            title={`${statusLabels[task.status] ?? task.status} · ${shortId(task.id)}`}
            description={`asset ${shortId(task.assetId)} · trace ${shortId(task.correlationId)}`}
          >
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-[var(--ink-soft)]">尝试次数</dt><dd className="mt-1 font-semibold">{task.attemptCount} / {task.maxAttempts}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">未绑定观察</dt><dd className="mt-1 font-semibold">{task.unboundObservations}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">创建时间 UTC</dt><dd className="mt-1 font-semibold">{formatDate(task.createdAt)}</dd></div>
              <div><dt className="text-[var(--ink-soft)]">处理人</dt><dd className="mt-1 font-semibold">{task.handledBy ?? "未处理"}</dd></div>
            </dl>
            {task.lastError ? <p className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">最后错误：{task.lastError}</p> : null}
            {task.auditTrail.length ? (
              <ul className="mt-4 grid gap-2 text-sm">
                {task.auditTrail.map((event) => (
                  <li className="rounded-md bg-[var(--bg)] p-3" key={event.id}>
                    <strong>{event.action === "retry" ? "人工重试" : "人工作废"}</strong> · {event.actorId} · {event.oldStatus} → {event.newStatus}
                    <p className="mt-1">{event.decisionNote}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {task.status === "failed" ? (
              <div className="mt-4 grid gap-3">
                <AdminTextarea
                  aria-label="媒体对账处理意见"
                  onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))}
                  placeholder="填写处理意见，例如：确认 Catalog 已恢复，重新执行对账"
                  value={notes[task.id] ?? ""}
                />
                <AdminActionRow>
                  <AdminSecondaryButton disabled={actingId === task.id || (notes[task.id]?.trim().length ?? 0) < 3} onClick={() => void act(task, "retry")} type="button">人工重试</AdminSecondaryButton>
                  <AdminSecondaryButton disabled={actingId === task.id || (notes[task.id]?.trim().length ?? 0) < 3} onClick={() => void act(task, "discard")} type="button">人工作废</AdminSecondaryButton>
                </AdminActionRow>
              </div>
            ) : null}
          </AdminListCard>
        ))}
      </div>
    </AdminPanel>
  );
}
